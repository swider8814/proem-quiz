import fs from 'node:fs/promises';
import path from 'node:path';
import { eq, lt, or, sql } from 'drizzle-orm';
import { db, mediaDir, schema } from './db/index.js';
import { quizAccess } from './quizzes.js';
import type { User } from './auth/index.js';

type Media = typeof schema.media.$inferSelect;

/** Quizy, których pytania (obrazek, utwór, wycięty fragment) albo dźwięk na podium używają danego pliku. */
export function quizzesUsingMedia(mediaId: string): string[] {
	const podium = db
		.select({ quizId: schema.quizzes.id })
		.from(schema.quizzes)
		.where(
			or(
				sql`json_extract(${schema.quizzes.settings}, '$.podiumAudio.mediaId') = ${mediaId}`,
				sql`json_extract(${schema.quizzes.settings}, '$.podiumAudio.clipMediaId') = ${mediaId}`
			)
		)
		.all()
		.map((r) => r.quizId);
	return [...podium, ...questionsUsing(mediaId)];
}

function questionsUsing(mediaId: string): string[] {
	return db
		.select({ quizId: schema.questions.quizId })
		.from(schema.questions)
		.where(
			or(
				eq(schema.questions.imageMediaId, mediaId),
				sql`json_extract(${schema.questions.data}, '$.audioMediaId') = ${mediaId}`,
				sql`json_extract(${schema.questions.data}, '$.clipMediaId') = ${mediaId}`
			)
		)
		.all()
		.map((r) => r.quizId);
}

/** Obrazy używane jako logo/tło motywu lub logo organizacji – jedyne media dostępne publicznie. */
export function isPublicImage(m: Media): boolean {
	if (m.kind !== 'image') return false;
	const t = db
		.select({ id: schema.themes.id })
		.from(schema.themes)
		.where(or(eq(schema.themes.logoLight, m.id), eq(schema.themes.logoDark, m.id), eq(schema.themes.background, m.id)))
		.get();
	if (t) return true;
	return !!db.select().from(schema.appSettings).where(eq(schema.appSettings.value, m.id)).get();
}

/**
 * Dostęp do pliku: właściciel, administrator albo osoba z dostępem do quizu, który go używa
 * (dzięki temu udostępnione i skopiowane quizy działają). Sama znajomość ID nie wystarcza.
 */
export function canUseMedia(user: User, m: Media): boolean {
	if (m.ownerId === user.id || user.role === 'admin') return true;
	return quizzesUsingMedia(m.id).some((quizId) => quizAccess(user, quizId) !== null);
}

/** Pełne uwierzytelnienie (2FA przejdzie / konfiguracja niewymagana). */
export function fullyAuthenticated(locals: App.Locals): locals is App.Locals & { user: User } {
	const { user, session } = locals;
	if (!user || !session?.mfaPassed) return false;
	return !(user.role === 'admin' && !user.totpEnabled);
}

// ── Sprzątanie nieużywanych plików ───────────────────────────────────────

const GRACE_MS = 24 * 60 * 60 * 1000; // świeże uploady mogą jeszcze czekać na zapis quizu

/** Wszystkie ID mediów, które są gdziekolwiek używane. */
function referencedIds(): Set<string> {
	const ids = new Set<string>();
	for (const q of db.select({ img: schema.questions.imageMediaId, data: schema.questions.data }).from(schema.questions).all()) {
		if (q.img) ids.add(q.img);
		const d = q.data as { audioMediaId?: string; clipMediaId?: string };
		if (d.audioMediaId) ids.add(d.audioMediaId);
		if (d.clipMediaId) ids.add(d.clipMediaId);
	}
	for (const q of db.select({ s: schema.quizzes.settings }).from(schema.quizzes).all()) {
		const a = q.s?.podiumAudio;
		if (a?.mediaId) ids.add(a.mediaId);
		if (a?.clipMediaId) ids.add(a.clipMediaId);
	}
	for (const t of db.select().from(schema.themes).all()) {
		for (const v of [t.logoLight, t.logoDark, t.background, t.jingleMediaId, t.lobbyMusicMediaId]) if (v) ids.add(v);
	}
	for (const s of db.select().from(schema.appSettings).all()) if (s.value.startsWith('med_')) ids.add(s.value);
	// Pliki w trakcie gry (migawka quizu w pamięci) – nie usuwamy, nawet jeśli quiz zmieniono.
	const games = (globalThis as { __proemQuizGames?: { games: Map<string, { quiz: unknown }> } }).__proemQuizGames;
	for (const g of games?.games.values() ?? []) {
		for (const m of JSON.stringify(g.quiz).matchAll(/med_[A-Za-z0-9_-]{10,20}/g)) ids.add(m[0]);
	}
	return ids;
}

/** Usuwa media nieużywane od co najmniej doby. Zwraca liczbę usuniętych. */
export async function sweepOrphanMedia(): Promise<number> {
	const used = referencedIds();
	const old = db
		.select()
		.from(schema.media)
		.where(lt(schema.media.createdAt, new Date(Date.now() - GRACE_MS)))
		.all();
	let removed = 0;
	for (const m of old) {
		if (used.has(m.id)) continue;
		db.delete(schema.media).where(eq(schema.media.id, m.id)).run();
		await fs.rm(path.join(mediaDir, path.basename(m.file)), { force: true });
		removed++;
	}
	return removed;
}
