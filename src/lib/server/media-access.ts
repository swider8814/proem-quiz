import fs from 'node:fs/promises';
import path from 'node:path';
import { eq, lt, or, sql } from 'drizzle-orm';
import { db, mediaDir, schema } from './db/index.js';
import { quizAccess } from './quizzes.js';
import { thumbPath } from './media.js';
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
				sql`json_extract(${schema.quizzes.settings}, '$.podiumAudio.clipMediaId') = ${mediaId}`,
				sql`json_extract(${schema.quizzes.settings}, '$.musicAudio.mediaId') = ${mediaId}`,
				sql`json_extract(${schema.quizzes.settings}, '$.musicAudio.clipMediaId') = ${mediaId}`
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
				sql`json_extract(${schema.questions.data}, '$.clipMediaId') = ${mediaId}`,
				sql`EXISTS (SELECT 1 FROM json_each(${schema.questions.data}, '$.images') WHERE json_each.value = ${mediaId})`
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
		const d = q.data as { audioMediaId?: string; clipMediaId?: string; images?: (string | null)[] };
		if (d.audioMediaId) ids.add(d.audioMediaId);
		for (const im of d.images ?? []) if (im) ids.add(im);
		if (d.clipMediaId) ids.add(d.clipMediaId);
	}
	for (const q of db.select({ s: schema.quizzes.settings }).from(schema.quizzes).all()) {
		for (const a of [q.s?.podiumAudio, q.s?.musicAudio]) {
			if (a?.mediaId) ids.add(a.mediaId);
			if (a?.clipMediaId) ids.add(a.clipMediaId);
		}
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

/**
 * Usuwa media nieużywane od co najmniej doby. Zwraca liczbę usuniętych.
 *
 * Decyzja (lista używanych + usunięcie wierszy) zapada SYNCHRONICZNIE, bez `await` po drodze – żaden zapis
 * quizu nie wejdzie między ustalenie listy a usunięcie wiersza. Wcześniej pętla oddawała sterowanie przy
 * każdej operacji plikowej, więc quiz zapisany w trakcie sprzątania mógł wskazać plik, który za chwilę
 * znikał na podstawie nieaktualnej listy. Pliki usuwamy dopiero potem.
 */
export async function sweepOrphanMedia(): Promise<number> {
	const doomed = db.transaction(() => {
		const used = referencedIds();
		const old = db
			.select()
			.from(schema.media)
			.where(lt(schema.media.createdAt, new Date(Date.now() - GRACE_MS)))
			.all()
			.filter((m) => !used.has(m.id));
		for (const m of old) db.delete(schema.media).where(eq(schema.media.id, m.id)).run();
		return old;
	});
	for (const m of doomed) {
		await fs.rm(path.join(mediaDir, path.basename(m.file)), { force: true });
		await fs.rm(thumbPath(m.file), { force: true });
	}
	await sweepStrayFiles();
	return doomed.length;
}

/** Nazwa pliku w katalogu mediów → id media (plik główny, miniatura, pliki robocze uploadu i konwersji). */
// Id ma zawsze 14 znaków base64url (newId: 10 bajtów) – stała długość, bo id może zawierać „_t”.
const MEDIA_FILE = /^(med_[A-Za-z0-9_-]{14})(?:_t\.webp|\.[a-z0-9]{2,4}(?:\.part(?:\.palette\.png)?)?|\.upload)$/;
const WORK_FILE = /\.(?:part|upload|palette\.png)$/;

/**
 * Pliki poza ewidencją: restart kontenera w trakcie konwersji albo między `rename` a zapisem w bazie
 * zostawiał na dysku plik bez wiersza w `media` – poza kwotą i poza zwykłym sprzątaniem. Usuwamy pliki
 * mediów bez wiersza oraz pliki robocze, starsze niż okres ochronny (świeże mogą należeć do trwającego
 * uploadu). Inne pliki w katalogu nie są ruszane. Zwraca liczbę usuniętych plików.
 */
export async function sweepStrayFiles(): Promise<number> {
	let names: string[];
	try {
		names = await fs.readdir(mediaDir);
	} catch {
		return 0;
	}
	const cutoff = Date.now() - GRACE_MS;
	let removed = 0;
	for (const name of names) {
		const id = MEDIA_FILE.exec(name)?.[1];
		if (!id) continue;
		let st;
		try {
			st = await fs.stat(path.join(mediaDir, name));
		} catch {
			continue;
		}
		if (!st.isFile() || st.mtimeMs > cutoff) continue;
		// Sprawdzenie bazy tuż przed usunięciem (bez `await` pomiędzy).
		const known = !!db.select({ id: schema.media.id }).from(schema.media).where(eq(schema.media.id, id)).get();
		if (known && !WORK_FILE.test(name)) continue;
		await fs.rm(path.join(mediaDir, name), { force: true });
		removed++;
	}
	return removed;
}
