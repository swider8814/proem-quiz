import { z } from 'zod';
import { and, asc, count, desc, eq, inArray, or } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { newId } from './auth/crypto.js';
import { MediaError, cutClip, mediaUrl } from './media.js';
import { canUseMedia } from './media-access.js';
import type { User } from './auth/index.js';
import type { ErrKey } from '#lib/i18n/panel.js';
import { DEFAULT_QUIZ_SETTINGS, LEGACY_MUSIC, MUSIC_KINDS, PODIUM_SOUNDS, type MusicKind, type QuestionData, type QuizSettings } from './db/schema.js';

// ── Uprawnienia ──────────────────────────────────────────────────────────

export type Access = 'owner' | 'edit' | 'host' | null;

export function quizAccess(user: User, quizId: string): Access {
	const q = db.select({ ownerId: schema.quizzes.ownerId }).from(schema.quizzes).where(eq(schema.quizzes.id, quizId)).get();
	if (!q) return null;
	if (q.ownerId === user.id) return 'owner';
	// Admin widzi i może edytować wszystko (np. gdy autor odszedł) – udostępnienie nie może tego obniżyć.
	if (user.role === 'admin') return 'edit';
	const share = db
		.select()
		.from(schema.quizShares)
		.where(and(eq(schema.quizShares.quizId, quizId), eq(schema.quizShares.userId, user.id)))
		.get();
	return share ? share.permission : null;
}

export const canEdit = (a: Access) => a === 'owner' || a === 'edit';
export const canHost = (a: Access) => a !== null;

// ── Udostępnianie ────────────────────────────────────────────────────────

export type SharePermission = 'host' | 'edit';

/** Kto zarządza udostępnianiem: właściciel quizu albo administrator. */
export function canManageShares(user: User, access: Access) {
	return access === 'owner' || (access !== null && user.role === 'admin');
}

export function listShares(quizId: string) {
	return db
		.select({ userId: schema.quizShares.userId, permission: schema.quizShares.permission, name: schema.users.name, email: schema.users.email })
		.from(schema.quizShares)
		.innerJoin(schema.users, eq(schema.quizShares.userId, schema.users.id))
		.where(eq(schema.quizShares.quizId, quizId))
		.orderBy(asc(schema.users.name))
		.all();
}

/** Ustawia (albo usuwa, gdy permission = null) dostęp innej osoby do quizu. Zwraca komunikat błędu lub null. */
export function setShare(actor: User, quizId: string, targetId: string, permission: SharePermission | null): ErrKey | null {
	const access = quizAccess(actor, quizId);
	if (!canManageShares(actor, access)) return 'shareNoRights';
	const quiz = db.select({ ownerId: schema.quizzes.ownerId }).from(schema.quizzes).where(eq(schema.quizzes.id, quizId)).get();
	if (!quiz) return 'quizNotFound';
	const target = db.select({ id: schema.users.id, disabled: schema.users.disabled }).from(schema.users).where(eq(schema.users.id, targetId)).get();
	if (!target) return 'accountNotFound';
	if (target.id === quiz.ownerId) return 'ownerAlways';
	const where = and(eq(schema.quizShares.quizId, quizId), eq(schema.quizShares.userId, target.id));
	if (permission === null) {
		db.delete(schema.quizShares).where(where).run();
		return null;
	}
	if (target.disabled) return 'accountBlocked';
	db.insert(schema.quizShares)
		.values({ quizId, userId: target.id, permission })
		.onConflictDoUpdate({ target: [schema.quizShares.quizId, schema.quizShares.userId], set: { permission } })
		.run();
	return null;
}

export function listQuizzes(user: User) {
	const shares = db.select({ quizId: schema.quizShares.quizId, permission: schema.quizShares.permission }).from(schema.quizShares).where(eq(schema.quizShares.userId, user.id)).all();
	const shared = shares.map((s) => s.quizId);
	const editShared = new Set(shares.filter((s) => s.permission === 'edit').map((s) => s.quizId));
	const where = user.role === 'admin' ? undefined : or(eq(schema.quizzes.ownerId, user.id), shared.length ? inArray(schema.quizzes.id, shared) : undefined);
	const rows = db
		.select({
			id: schema.quizzes.id,
			title: schema.quizzes.title,
			ownerId: schema.quizzes.ownerId,
			ownerName: schema.users.name,
			updatedAt: schema.quizzes.updatedAt,
			themeName: schema.themes.name,
			themeColors: schema.themes.colors
		})
		.from(schema.quizzes)
		.innerJoin(schema.users, eq(schema.quizzes.ownerId, schema.users.id))
		.leftJoin(schema.themes, eq(schema.quizzes.themeId, schema.themes.id))
		.where(where)
		.orderBy(desc(schema.quizzes.updatedAt))
		.all();
	const counts = new Map<string, number>();
	for (const q of db.select({ quizId: schema.questions.quizId, n: count() }).from(schema.questions).groupBy(schema.questions.quizId).all()) {
		counts.set(q.quizId, q.n);
	}
	// Okładka karty na liście: kolory motywu quizu (quiz bez motywu gra w motywie domyślnym).
	const fallback = db.select({ colors: schema.themes.colors }).from(schema.themes).where(eq(schema.themes.isDefault, true)).get()?.colors ?? null;
	return rows.map(({ themeColors, ...r }) => ({
		...r,
		cover: (themeColors ?? fallback) ? { background: (themeColors ?? fallback)!.background, answers: (themeColors ?? fallback)!.answers } : null,
		questionCount: counts.get(r.id) ?? 0,
		mine: r.ownerId === user.id,
		canEdit: r.ownerId === user.id || user.role === 'admin' || editShared.has(r.id)
	}));
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
const answerList = z.array(str(80).min(1, 'emptyAnswer')).min(2).max(4);
const correctList = z.array(z.number().int().min(0).max(3)).min(1, 'markCorrect').max(4);
const mediaId = z.string().regex(/^med_[A-Za-z0-9_-]{10,20}$/);

const sliderNum = z.number().finite().min(-1_000_000).max(1_000_000);
export const QUESTION_TYPES = ['choice', 'truefalse', 'audio', 'text', 'order', 'poll', 'slider', 'slide'] as const;

const questionSchema = z
	.object({
		id: z.string().max(40).optional(),
		type: z.enum(QUESTION_TYPES),
		prompt: str(200).min(1, 'writePrompt'),
		promptTranslation: str(200).nullable().optional(),
		imageMediaId: mediaId.nullable().optional(),
		timeLimit: z.number().int().min(5).max(240),
		pointsMultiplier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
		data: z.discriminatedUnion('type', [
			z.object({
				type: z.literal('choice'),
				answers: z.array(str(80)).min(2).max(4),
				correct: correctList,
				images: z.array(mediaId.nullable()).max(4).optional()
			}),
			z.object({ type: z.literal('truefalse'), correct: z.boolean(), thumbs: z.boolean().optional() }),
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
			z.object({ type: z.literal('order'), items: z.array(str(60).min(1)).min(3).max(6), partialCredit: z.boolean() }),
			z.object({
				type: z.literal('poll'),
				answers: z.array(str(80)).min(2).max(4),
				images: z.array(mediaId.nullable()).max(4).optional()
			}),
			z.object({
				type: z.literal('slider'),
				min: sliderNum,
				max: sliderNum,
				step: z.number().finite().positive().max(1_000_000),
				correct: sliderNum,
				margin: z.enum(['none', 'low', 'medium', 'high']),
				unit: str(12).optional()
			}),
			z.object({ type: z.literal('slide'), text: str(500) })
		])
	})
	.superRefine((q, ctx) => {
		if (q.type !== q.data.type) ctx.addIssue({ code: 'custom', message: 'typeMismatch' });
		const d = q.data;
		if ((d.type === 'choice' || d.type === 'audio') && d.correct.some((c) => c >= d.answers.length)) {
			ctx.addIssue({ code: 'custom', message: 'correctOutOfRange' });
		}
		if (d.type === 'slider') {
			const steps = (d.max - d.min) / d.step;
			const onStep = (v: number) => Math.abs((v - d.min) / d.step - Math.round((v - d.min) / d.step)) < 1e-6;
			if (!(d.max > d.min) || steps > 10_000 || !Number.isInteger(Math.round(steps * 1e6) / 1e6)) ctx.addIssue({ code: 'custom', message: 'sliderRange' });
			else if (d.correct < d.min || d.correct > d.max || !onStep(d.correct)) ctx.addIssue({ code: 'custom', message: 'sliderCorrect' });
		}
		if (d.type === 'choice' || d.type === 'poll') {
			if (d.images && d.images.length !== d.answers.length) ctx.addIssue({ code: 'custom', message: 'emptyAnswer' });
			// Odpowiedź = podpis albo obrazek (albo oba).
			if (d.answers.some((a, i) => !a.trim() && !d.images?.[i])) ctx.addIssue({ code: 'custom', message: 'emptyAnswer' });
		}
		if (q.data.type === 'audio') {
			const len = q.data.endMs - q.data.startMs;
			if (len < 1000 || len > 60_000) ctx.addIssue({ code: 'custom', message: 'clipLength' });
			if (q.data.revealEndMs != null && q.data.revealEndMs <= q.data.endMs) {
				ctx.addIssue({ code: 'custom', message: 'revealAfter' });
			}
		}
	});

const customAudio = z
	.object({ mediaId, startMs: z.number().int().min(0).max(3 * 60 * 60 * 1000), endMs: z.number().int().min(0).max(3 * 60 * 60 * 1000) })
	.nullable()
	.default(null);

export const quizSaveSchema = z.object({
	title: str(120).min(1, 'giveTitleShort'),
	description: str(500).nullable().optional(),
	themeId: z.string().max(40).nullable(),
	locale: z.enum(['pl', 'en', 'uk']),
	settings: z.object({
		defaultTimeLimit: z.number().int().min(5).max(240),
		countdown: z.number().int().min(0).max(10).default(5),
		podiumSound: z.enum(PODIUM_SOUNDS).default('fanfare'),
		podiumAudio: customAudio,
		music: z.preprocess((v) => (typeof v === 'string' && v in LEGACY_MUSIC ? LEGACY_MUSIC[v] : v), z.enum(MUSIC_KINDS)).default('background'),
		musicAudio: customAudio,
		musicLobby: z.boolean().default(true),
		musicQuestions: z.boolean().default(true),
		streakBonus: z.boolean(),
		nicknameMode: z.enum(['random-or-custom', 'random-only']),
		teamMode: z.boolean(),
		teamTalk: z.number().int().min(0).max(30).default(10),
		shuffleQuestions: z.boolean().default(false),
		shuffleAnswers: z.boolean().default(false),
		avatars: z.boolean().default(true),
		lateJoin: z.boolean(),
		phoneAnswerText: z.boolean()
	}),
	questions: z.array(questionSchema).max(100)
}).superRefine((q, ctx) => {
	const a = q.settings.podiumAudio;
	if (q.settings.podiumSound === 'custom' && !a) ctx.addIssue({ code: 'custom', message: 'podiumNoFile' });
	if (a && (a.endMs - a.startMs < 1000 || a.endMs - a.startMs > PODIUM_MAX_MS)) ctx.addIssue({ code: 'custom', message: 'podiumLength' });
	const mu = q.settings.musicAudio;
	if (q.settings.music === 'custom' && !mu) ctx.addIssue({ code: 'custom', message: 'musicNoFile' });
	if (mu && (mu.endMs - mu.startMs < 5000 || mu.endMs - mu.startMs > 60_000)) ctx.addIssue({ code: 'custom', message: 'musicLength' });
});

/** Najdłuższy własny dźwięk na podium. */
export const PODIUM_MAX_MS = 20_000;

export type QuizSave = z.infer<typeof quizSaveSchema>;

/** Zapis całego quizu. Wycina fragmenty audio, gdy zmienił się zakres. */
export async function saveQuiz(user: User, quizId: string, input: QuizSave): Promise<{ error: ErrKey; detail?: string } | { ok: true; questionIds: string[] }> {
	if (input.themeId && !db.select().from(schema.themes).where(eq(schema.themes.id, input.themeId)).get()) {
		return { error: 'themeNotFound' as ErrKey };
	}
	// Media muszą istnieć (i nie mogą być cudzymi plikami audio spoza dostępnych – sprawdzamy istnienie i typ).
	const ids = new Set<string>();
	for (const q of input.questions) {
		if (q.imageMediaId) ids.add(q.imageMediaId);
		if (q.data.type === 'audio') ids.add(q.data.audioMediaId);
		if (q.data.type === 'choice' || q.data.type === 'poll') for (const im of q.data.images ?? []) if (im) ids.add(im);
	}
	for (const a of [input.settings.podiumAudio, input.settings.musicAudio]) if (a) ids.add(a.mediaId);
	const media = ids.size ? db.select().from(schema.media).where(inArray(schema.media.id, [...ids])).all() : [];
	const byId = new Map(media.map((m) => [m.id, m]));
	// Wolno używać tylko plików, do których ma się dostęp (własne, admin, albo z dostępnego quizu).
	for (const m of media) if (!canUseMedia(user, m)) return { error: 'mediaAccess' as ErrKey };
	for (const q of input.questions) {
		if (q.imageMediaId && byId.get(q.imageMediaId)?.kind !== 'image') return { error: 'badImage' as ErrKey };
		if ((q.data.type === 'choice' || q.data.type === 'poll') && (q.data.images ?? []).some((im) => im && byId.get(im)?.kind !== 'image')) return { error: 'badImage' as ErrKey };
		if (q.data.type === 'audio') {
			const m = byId.get(q.data.audioMediaId);
			if (m?.kind !== 'audio') return { error: 'badAudio' as ErrKey };
			if (m.durationMs && q.data.endMs > m.durationMs + 500) return { error: 'clipBeyond' as ErrKey, detail: q.prompt };
		}
	}
	let settings = input.settings as QuizSettings;
	// Własne dźwięki (podium, muzyka): wycięcie fragmentu z wyrównaniem głośności; bez zmian = ten sam plik.
	const prevSettings = db.select({ settings: schema.quizzes.settings }).from(schema.quizzes).where(eq(schema.quizzes.id, quizId)).get()?.settings;
	for (const key of ['podiumAudio', 'musicAudio'] as const) {
		const a = input.settings[key];
		if (!a) continue;
		const m = byId.get(a.mediaId);
		if (m?.kind !== 'audio') return { error: 'badAudio' as ErrKey };
		if (m.durationMs && a.endMs > m.durationMs + 500) return { error: 'clipBeyond' as ErrKey };
		const prev = prevSettings?.[key];
		const reuse = prev && prev.mediaId === a.mediaId && prev.startMs === a.startMs && prev.endMs === a.endMs && prev.clipMediaId;
		let clipMediaId: string | null | undefined;
		try {
			clipMediaId = reuse ? prev.clipMediaId : await cutClip(user.id, a.mediaId, a.startMs, a.endMs, { normalize: true });
		} catch (e) {
			if (e instanceof MediaError) return { error: e.key };
			throw e;
		}
		if (!clipMediaId) return { error: 'clipCut' as ErrKey };
		settings = { ...settings, [key]: { ...a, clipMediaId } };
	}

	const old = new Map(db.select().from(schema.questions).where(eq(schema.questions.quizId, quizId)).all().map((q) => [q.id, q]));
	const rows: (typeof schema.questions.$inferInsert)[] = [];
	for (const [position, q] of input.questions.entries()) {
		let data = q.data as QuestionData;
		if (data.type === 'audio') {
			const prev = q.id ? old.get(q.id)?.data : undefined;
			const reuse = prev?.type === 'audio' && prev.audioMediaId === data.audioMediaId && prev.startMs === data.startMs && prev.endMs === data.endMs && prev.clipMediaId;
			let clipMediaId: string | null | undefined;
			try {
				clipMediaId = reuse ? prev.clipMediaId : await cutClip(user.id, data.audioMediaId, data.startMs, data.endMs);
			} catch (e) {
				if (e instanceof MediaError) return { error: e.key };
				throw e;
			}
			if (!clipMediaId) return { error: 'clipCut' as ErrKey, detail: q.prompt };
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
			.set({ title: input.title, description: input.description ?? null, themeId: input.themeId, locale: input.locale, settings, updatedAt: new Date() })
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

/** Do gry: zamiast identyfikatorów plików tylko adresy gotowych fragmentów (podium, muzyka). */
function podiumSettings(s: QuizSettings) {
	const { podiumAudio, musicAudio, ...rest } = s;
	const podiumUrl = s.podiumSound === 'custom' ? mediaUrl(podiumAudio?.clipMediaId ?? null) : null;
	const musicUrl = s.music === 'custom' ? mediaUrl(musicAudio?.clipMediaId ?? null) : null;
	return {
		...rest,
		podiumSound: s.podiumSound === 'custom' && !podiumUrl ? 'fanfare' : s.podiumSound,
		podiumUrl,
		music: s.music === 'custom' && !musicUrl ? 'background' : ((LEGACY_MUSIC[s.music as string] ?? s.music) as MusicKind),
		musicUrl
	};
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
		settings: podiumSettings({ ...DEFAULT_QUIZ_SETTINGS, ...quiz.settings }),
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
