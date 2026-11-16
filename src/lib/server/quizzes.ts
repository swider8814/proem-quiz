import { z } from 'zod';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { newId } from './auth/crypto.js';
import { cutClip, mediaUrl } from './media.js';
import type { User } from './auth/index.js';
import { DEFAULT_QUIZ_SETTINGS, type QuestionData, type QuizSettings } from './db/schema.js';

// ── Uprawnienia ──────────────────────────────────────────────────────────

export type Access = 'owner' | 'edit' | 'host' | null;

export function quizAccess(user: User, quizId: string): Access {
	const q = db.select({ ownerId: schema.quizzes.ownerId }).from(schema.quizzes).where(eq(schema.quizzes.id, quizId)).get();
	if (!q) return null;
	if (q.ownerId === user.id) return 'owner';
	const share = db
		.select()
		.from(schema.quizShares)
		.where(and(eq(schema.quizShares.quizId, quizId), eq(schema.quizShares.userId, user.id)))
		.get();
	if (share) return share.permission;
	// Admin widzi i może edytować wszystko (np. gdy autor odszedł).
	if (user.role === 'admin') return 'edit';
	return null;
}

export const canEdit = (a: Access) => a === 'owner' || a === 'edit';
export const canHost = (a: Access) => a !== null;

export function listQuizzes(user: User) {
	const shared = db.select({ quizId: schema.quizShares.quizId }).from(schema.quizShares).where(eq(schema.quizShares.userId, user.id)).all().map((s) => s.quizId);
	const where = user.role === 'admin' ? undefined : or(eq(schema.quizzes.ownerId, user.id), shared.length ? inArray(schema.quizzes.id, shared) : undefined);
	const rows = db
		.select({
			id: schema.quizzes.id,
			title: schema.quizzes.title,
			ownerId: schema.quizzes.ownerId,
			ownerName: schema.users.name,
			updatedAt: schema.quizzes.updatedAt,
			themeName: schema.themes.name
		})
		.from(schema.quizzes)
		.innerJoin(schema.users, eq(schema.quizzes.ownerId, schema.users.id))
		.leftJoin(schema.themes, eq(schema.quizzes.themeId, schema.themes.id))
		.where(where)
		.orderBy(asc(schema.quizzes.title))
		.all();
	const counts = new Map<string, number>();
	for (const q of db.select({ quizId: schema.questions.quizId }).from(schema.questions).all()) {
		counts.set(q.quizId, (counts.get(q.quizId) ?? 0) + 1);
	}
	return rows.map((r) => ({ ...r, questionCount: counts.get(r.id) ?? 0, mine: r.ownerId === user.id }));
}

export function defaultThemeId() {
	return db.select({ id: schema.themes.id }).from(schema.themes).where(eq(schema.themes.isDefault, true)).get()?.id ?? null;
}

export function createQuiz(user: User, title: string) {
	const id = newId('quiz');
	db.insert(schema.quizzes)
		.values({ id, ownerId: user.id, title: title.slice(0, 120) || 'Nowy quiz', themeId: defaultThemeId(), locale: user.locale, settings: DEFAULT_QUIZ_SETTINGS })
		.run();
	return id;
}

export function duplicateQuiz(user: User, quizId: string) {
	const src = db.select().from(schema.quizzes).where(eq(schema.quizzes.id, quizId)).get();
	if (!src) return null;
	const id = newId('quiz');
	db.transaction((tx) => {
		tx.insert(schema.quizzes).values({ ...src, id, ownerId: user.id, title: `${src.title} (kopia)`.slice(0, 120), createdAt: new Date(), updatedAt: new Date() }).run();
		for (const q of tx.select().from(schema.questions).where(eq(schema.questions.quizId, quizId)).all()) {
			tx.insert(schema.questions).values({ ...q, id: newId('qst'), quizId: id }).run();
		}
	});
	return id;
}

// ── Walidacja zapisu z edytora ───────────────────────────────────────────

const str = (max: number) => z.string().trim().max(max);
const answerList = z.array(str(80).min(1, 'Pusta odpowiedź')).min(2).max(4);
const correctList = z.array(z.number().int().min(0).max(3)).min(1, 'Zaznacz poprawną odpowiedź').max(4);
const mediaId = z.string().regex(/^med_[A-Za-z0-9_-]{10,20}$/);

const questionSchema = z
	.object({
		id: z.string().max(40).optional(),
		type: z.enum(['choice', 'truefalse', 'audio', 'text', 'order']),
		prompt: str(200).min(1, 'Wpisz treść pytania'),
		promptTranslation: str(200).nullable().optional(),
		imageMediaId: mediaId.nullable().optional(),
		timeLimit: z.number().int().min(5).max(240),
		pointsMultiplier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
		data: z.discriminatedUnion('type', [
			z.object({ type: z.literal('choice'), answers: answerList, correct: correctList }),
			z.object({ type: z.literal('truefalse'), correct: z.boolean() }),
			z.object({
				type: z.literal('audio'),
				answers: answerList,
				correct: correctList,
				audioMediaId: mediaId,
				startMs: z.number().int().min(0).max(3 * 60 * 60 * 1000),
				endMs: z.number().int().min(0).max(3 * 60 * 60 * 1000),
				loop: z.boolean(),
				revealEndMs: z.number().int().min(0).max(3 * 60 * 60 * 1000).nullable().optional()
			}),
			z.object({ type: z.literal('text'), accepted: z.array(str(80).min(1)).min(1).max(10), typoTolerance: z.union([z.literal(0), z.literal(1), z.literal(2)]) }),
			z.object({ type: z.literal('order'), items: z.array(str(60).min(1)).min(3).max(6), partialCredit: z.boolean() })
		])
	})
	.superRefine((q, ctx) => {
		if (q.type !== q.data.type) ctx.addIssue({ code: 'custom', message: 'Niespójny typ pytania' });
		const d = q.data;
		if ((d.type === 'choice' || d.type === 'audio') && d.correct.some((c) => c >= d.answers.length)) {
			ctx.addIssue({ code: 'custom', message: 'Poprawna odpowiedź poza listą' });
		}
		if (q.data.type === 'audio') {
			const len = q.data.endMs - q.data.startMs;
			if (len < 1000 || len > 60_000) ctx.addIssue({ code: 'custom', message: 'Fragment audio musi mieć od 1 do 60 sekund' });
			if (q.data.revealEndMs != null && q.data.revealEndMs <= q.data.endMs) {
				ctx.addIssue({ code: 'custom', message: 'Dłuższy fragment musi kończyć się po głównym' });
			}
		}
	});

export const quizSaveSchema = z.object({
	title: str(120).min(1, 'Podaj tytuł'),
	description: str(500).nullable().optional(),
	themeId: z.string().max(40).nullable(),
	locale: z.enum(['pl', 'en', 'uk']),
	settings: z.object({
		defaultTimeLimit: z.number().int().min(5).max(240),
		streakBonus: z.boolean(),
		nicknameMode: z.enum(['random-or-custom', 'random-only']),
		teamMode: z.boolean(),
		lateJoin: z.boolean(),
		phoneAnswerText: z.boolean()
	}),
	questions: z.array(questionSchema).max(100)
});

export type QuizSave = z.infer<typeof quizSaveSchema>;

/** Zapis całego quizu. Wycina fragmenty audio, gdy zmienił się zakres. */
export async function saveQuiz(user: User, quizId: string, input: QuizSave) {
	if (input.themeId && !db.select().from(schema.themes).where(eq(schema.themes.id, input.themeId)).get()) {
		return { error: 'Nieznany motyw' };
	}
	// Media muszą istnieć (i nie mogą być cudzymi plikami audio spoza dostępnych – sprawdzamy istnienie i typ).
	const ids = new Set<string>();
	for (const q of input.questions) {
		if (q.imageMediaId) ids.add(q.imageMediaId);
		if (q.data.type === 'audio') ids.add(q.data.audioMediaId);
	}
	const media = ids.size ? db.select().from(schema.media).where(inArray(schema.media.id, [...ids])).all() : [];
	const byId = new Map(media.map((m) => [m.id, m]));
	for (const q of input.questions) {
		if (q.imageMediaId && byId.get(q.imageMediaId)?.kind !== 'image') return { error: 'Nieprawidłowy obrazek w pytaniu' };
		if (q.data.type === 'audio') {
			const m = byId.get(q.data.audioMediaId);
			if (m?.kind !== 'audio') return { error: 'Nieprawidłowy plik audio' };
			if (m.durationMs && q.data.endMs > m.durationMs + 500) return { error: `Fragment wykracza poza długość utworu (${q.prompt})` };
		}
	}

	const old = new Map(db.select().from(schema.questions).where(eq(schema.questions.quizId, quizId)).all().map((q) => [q.id, q]));
	const rows: (typeof schema.questions.$inferInsert)[] = [];
	for (const [position, q] of input.questions.entries()) {
		let data = q.data as QuestionData;
		if (data.type === 'audio') {
			const prev = q.id ? old.get(q.id)?.data : undefined;
			const reuse = prev?.type === 'audio' && prev.audioMediaId === data.audioMediaId && prev.startMs === data.startMs && prev.endMs === data.endMs && prev.clipMediaId;
			const clipMediaId = reuse ? prev.clipMediaId : await cutClip(user.id, data.audioMediaId, data.startMs, data.endMs);
			if (!clipMediaId) return { error: `Nie udało się wyciąć fragmentu audio (${q.prompt})` };
			data = { ...data, clipMediaId };
		}
		rows.push({
			id: q.id && old.has(q.id) ? q.id : newId('qst'),
			quizId,
			position,
			type: q.type,
			prompt: q.prompt,
			promptTranslation: q.promptTranslation || null,
			imageMediaId: q.imageMediaId ?? null,
			timeLimit: q.timeLimit,
			pointsMultiplier: q.pointsMultiplier,
			data
		});
	}
	db.transaction((tx) => {
		tx.update(schema.quizzes)
			.set({ title: input.title, description: input.description ?? null, themeId: input.themeId, locale: input.locale, settings: input.settings as QuizSettings, updatedAt: new Date() })
			.where(eq(schema.quizzes.id, quizId))
			.run();
		tx.delete(schema.questions).where(eq(schema.questions.quizId, quizId)).run();
		for (const r of rows) tx.insert(schema.questions).values(r).run();
	});
	return { ok: true, questionIds: rows.map((r) => r.id) };
}

export function loadQuiz(quizId: string) {
	const quiz = db.select().from(schema.quizzes).where(eq(schema.quizzes.id, quizId)).get();
	if (!quiz) return null;
	const questions = db.select().from(schema.questions).where(eq(schema.questions.quizId, quizId)).orderBy(asc(schema.questions.position)).all();
	return { quiz, questions };
}

// ── Migawka do gry ───────────────────────────────────────────────────────

export function themeView(themeId: string | null) {
	const t =
		(themeId && db.select().from(schema.themes).where(eq(schema.themes.id, themeId)).get()) ||
		db.select().from(schema.themes).where(eq(schema.themes.isDefault, true)).get();
	if (!t) return null;
	return { name: t.name, style: t.style, colors: t.colors, headingFont: t.headingFont, logoUrl: mediaUrl(t.logoLight), logoDarkUrl: mediaUrl(t.logoDark) };
}

export function buildSnapshot(quizId: string) {
	const loaded = loadQuiz(quizId);
	if (!loaded) return null;
	const { quiz, questions } = loaded;
	const blockedWords = db.select({ word: schema.blockedWords.word }).from(schema.blockedWords).all().map((w) => w.word);
	return {
		quizId: quiz.id,
		title: quiz.title,
		locale: quiz.locale,
		settings: { ...DEFAULT_QUIZ_SETTINGS, ...quiz.settings },
		theme: themeView(quiz.themeId),
		blockedWords,
		questions: questions.map((q) => {
			const d = q.data;
			return {
				id: q.id,
				type: q.type,
				prompt: q.prompt,
				promptTranslation: q.promptTranslation,
				imageUrl: mediaUrl(q.imageMediaId),
				timeLimit: q.timeLimit,
				multiplier: q.pointsMultiplier,
				data:
					d.type === 'audio'
						? { ...d, clipUrl: mediaUrl(d.clipMediaId ?? null), revealUrl: d.revealEndMs ? `${mediaUrl(d.audioMediaId)}#t=${d.startMs / 1000},${d.revealEndMs / 1000}` : null }
						: d
			};
		})
	};
}
