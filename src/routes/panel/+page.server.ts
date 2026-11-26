import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { canEdit, createQuiz, duplicateQuiz, listQuizzes, quizAccess, quizCardDetails } from '#lib/server/quizzes.js';
import { createFolder, deleteFolder, folderOfQuizzes, listFolders, moveQuiz, renameFolder } from '#lib/server/folders.js';
import { sweepOrphanMedia } from '#lib/server/media-access.js';
import { panelDict } from '#lib/i18n/panel.js';

const PAGE_SIZE = 20;

/** Wyszukiwanie bez wielkości liter i polskich znaków („kolede” znajdzie „Kolędę”). */
const fold = (s: string) =>
	s
		.toLocaleLowerCase('pl')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ł/g, 'l')
		.trim();

export const load: PageServerLoad = ({ locals, url }) => {
	const user = locals.user!;
	const folders = listFolders(user);
	const ids = new Set(folders.map((f) => f.id));
	const where = folderOfQuizzes(user);
	const all = listQuizzes(user).map((q) => {
		const f = where.get(q.id);
		return { ...q, folderId: f && ids.has(f) ? f : null };
	});

	// „Moje” ma sens tylko, gdy na liście są też cudze quizy (udostępnione) albo dla admina.
	const mineFilter = user.role === 'admin' || all.some((q) => !q.mine);
	// Filtr: all | mine | none | <id folderu użytkownika>; nieznany folder = wszystkie.
	const fParam = url.searchParams.get('f') ?? 'all';
	const folder = fParam === 'none' ? 'none' : fParam === 'mine' && mineFilter ? 'mine' : ids.has(fParam) ? fParam : 'all';
	const query = (url.searchParams.get('q') ?? '').slice(0, 100);
	// Szukamy w tytule i w imieniu i nazwisku autora („Kostia” pokaże jego quizy).
	const needle = fold(query);
	const filtered = all.filter(
		(q) => (folder === 'all' || (folder === 'mine' ? q.mine : folder === 'none' ? q.folderId === null : q.folderId === folder)) && (!needle || fold(q.title).includes(needle) || fold(q.ownerName ?? '').includes(needle))
	);
	const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const page = Math.min(Math.max(1, Math.floor(Number(url.searchParams.get('p')) || 1)), pages);

	const counts = new Map<string, number>();
	for (const q of all) if (q.folderId) counts.set(q.folderId, (counts.get(q.folderId) ?? 0) + 1);
	return {
		// Okładki i liczba pytań tylko dla bieżącej strony (nie dla całej bazy).
		quizzes: quizCardDetails(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)),
		total: all.length,
		found: filtered.length,
		page,
		pages,
		folder,
		query,
		folders: folders.map((f) => ({ ...f, count: counts.get(f.id) ?? 0 })),
		noFolderCount: all.filter((q) => !q.folderId).length,
		mineCount: mineFilter ? all.filter((q) => q.mine).length : null
	};
};

const field = async (request: Request, ...names: string[]) => {
	const fd = await request.formData();
	return names.map((n) => String(fd.get(n) ?? ''));
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const [title, folderId] = await field(request, 'title', 'folder');
		if (!title.trim()) return fail(400, { error: panelDict(locals.lang).err.giveTitle });
		const id = createQuiz(locals.user!, title.trim());
		// Nowy quiz w folderze, który jest właśnie otwarty.
		if (folderId) moveQuiz(locals.user!, id, folderId);
		redirect(303, `/panel/quizzes/${id}`);
	},
	duplicate: async ({ request, locals }) => {
		const [id] = await field(request, 'id');
		const access = quizAccess(locals.user!, id);
		if (!access) error(404);
		// Kopia = pełna, edytowalna treść quizu – tylko dla osób, które mogą go edytować (nie „prowadzenie”).
		if (!canEdit(access)) error(403);
		const copy = duplicateQuiz(locals.user!, id);
		if (!copy) error(404);
		const folderId = folderOfQuizzes(locals.user!).get(id);
		if (folderId) moveQuiz(locals.user!, copy, folderId);
		redirect(303, `/panel/quizzes/${copy}`);
	},
	delete: async ({ request, locals }) => {
		const [id] = await field(request, 'id');
		const access = quizAccess(locals.user!, id);
		if (access !== 'owner' && locals.user!.role !== 'admin') return fail(403, { error: panelDict(locals.lang).err.onlyOwnQuizzes });
		db.delete(schema.quizzes).where(eq(schema.quizzes.id, id)).run();
		// Pliki usuniętego quizu znikną przy sprzątaniu (po dobie od wgrania, o ile nic ich nie używa).
		sweepOrphanMedia().catch(() => {});
		return { message: panelDict(locals.lang).list.deleted };
	},
	move: async ({ request, locals }) => {
		const [id, folderId] = await field(request, 'id', 'folder');
		const r = moveQuiz(locals.user!, id, folderId);
		if (!r.ok) return fail(404, { error: panelDict(locals.lang).err.quizNotFound });
		return { message: panelDict(locals.lang).list.moved };
	},
	folderCreate: async ({ request, locals }) => {
		const [name] = await field(request, 'name');
		const r = createFolder(locals.user!, name);
		const t = panelDict(locals.lang).list;
		if (!r.ok) return fail(400, { error: r.error === 'folderLimit' ? t.folderLimit : t.folderName });
		redirect(303, `/panel?f=${r.id}`);
	},
	folderRename: async ({ request, locals }) => {
		const [id, name] = await field(request, 'id', 'name');
		const r = renameFolder(locals.user!, id, name);
		const t = panelDict(locals.lang).list;
		if (!r.ok) return fail(r.error === 'notFound' ? 404 : 400, { error: r.error === 'notFound' ? t.folderMissing : t.folderName });
		return { message: t.folderRenamed };
	},
	folderDelete: async ({ request, locals }) => {
		const [id] = await field(request, 'id');
		const r = deleteFolder(locals.user!, id);
		if (!r.ok) return fail(404, { error: panelDict(locals.lang).list.folderMissing });
		redirect(303, '/panel');
	}
};
