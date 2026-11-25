import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { newId } from './auth/crypto.js';
import { quizAccess } from './quizzes.js';
import type { User } from './auth/index.js';

/** Foldery są prywatne dla użytkownika (porządek jego własnej listy). */
export const MAX_FOLDERS = 100;
export const FOLDER_NAME_MAX = 60;

const cleanName = (name: unknown) =>
	String(name ?? '')
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.trim()
		.slice(0, FOLDER_NAME_MAX);

export function listFolders(user: User) {
	return db
		.select({ id: schema.quizFolders.id, name: schema.quizFolders.name })
		.from(schema.quizFolders)
		.where(eq(schema.quizFolders.userId, user.id))
		.orderBy(asc(schema.quizFolders.name))
		.all();
}

/** Folder użytkownika albo null (cudzy lub nieistniejący folder wygląda jak brak folderu). */
export function ownFolder(user: User, folderId: string) {
	return (
		db
			.select({ id: schema.quizFolders.id, name: schema.quizFolders.name })
			.from(schema.quizFolders)
			.where(and(eq(schema.quizFolders.id, folderId), eq(schema.quizFolders.userId, user.id)))
			.get() ?? null
	);
}

/** Mapa quizId → folderId dla list quizów tego użytkownika. */
export function folderOfQuizzes(user: User) {
	const m = new Map<string, string>();
	for (const r of db.select().from(schema.quizFolderItems).where(eq(schema.quizFolderItems.userId, user.id)).all()) m.set(r.quizId, r.folderId);
	return m;
}

export type FolderResult = { ok: true; id?: string } | { ok: false; error: 'folderName' | 'folderLimit' | 'notFound' };

export function createFolder(user: User, name: unknown): FolderResult {
	const n = cleanName(name);
	if (!n) return { ok: false, error: 'folderName' };
	const count = db.select({ id: schema.quizFolders.id }).from(schema.quizFolders).where(eq(schema.quizFolders.userId, user.id)).all().length;
	if (count >= MAX_FOLDERS) return { ok: false, error: 'folderLimit' };
	const id = newId('fld');
	db.insert(schema.quizFolders).values({ id, userId: user.id, name: n }).run();
	return { ok: true, id };
}

export function renameFolder(user: User, folderId: string, name: unknown): FolderResult {
	const n = cleanName(name);
	if (!n) return { ok: false, error: 'folderName' };
	if (!ownFolder(user, folderId)) return { ok: false, error: 'notFound' };
	db.update(schema.quizFolders).set({ name: n }).where(and(eq(schema.quizFolders.id, folderId), eq(schema.quizFolders.userId, user.id))).run();
	return { ok: true };
}

/** Usuwa folder; quizy zostają (trafiają do „Bez folderu”). */
export function deleteFolder(user: User, folderId: string): FolderResult {
	if (!ownFolder(user, folderId)) return { ok: false, error: 'notFound' };
	db.delete(schema.quizFolders).where(and(eq(schema.quizFolders.id, folderId), eq(schema.quizFolders.userId, user.id))).run();
	return { ok: true };
}

/** Przenosi quiz (do którego użytkownik ma dostęp) do swojego folderu albo poza foldery (folderId = ''). */
export function moveQuiz(user: User, quizId: string, folderId: string): FolderResult {
	if (!quizAccess(user, quizId)) return { ok: false, error: 'notFound' };
	if (folderId && !ownFolder(user, folderId)) return { ok: false, error: 'notFound' };
	db.transaction((tx) => {
		tx.delete(schema.quizFolderItems).where(and(eq(schema.quizFolderItems.userId, user.id), eq(schema.quizFolderItems.quizId, quizId))).run();
		if (folderId) tx.insert(schema.quizFolderItems).values({ userId: user.id, quizId, folderId }).run();
	});
	return { ok: true };
}
