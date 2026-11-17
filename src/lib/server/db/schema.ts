import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const now = sql`(unixepoch() * 1000)`;
const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now);

// ── Konta ────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	passwordHash: text('password_hash'), // null = zaproszenie jeszcze nie przyjęte
	role: text('role', { enum: ['admin', 'author'] }).notNull().default('author'),
	locale: text('locale', { enum: ['pl', 'en', 'uk'] }).notNull().default('pl'),
	totpSecret: text('totp_secret'), // szyfrowany AES-GCM kluczem z env
	totpEnabled: integer('totp_enabled', { mode: 'boolean' }).notNull().default(false),
	totpLastStep: integer('totp_last_step'), // ochrona przed ponownym użyciem tego samego kodu
	disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
	createdAt: createdAt()
});

export const recoveryCodes = sqliteTable(
	'recovery_codes',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		codeHash: text('code_hash').notNull(),
		usedAt: integer('used_at', { mode: 'timestamp_ms' })
	},
	(t) => [index('recovery_user_idx').on(t.userId)]
);

export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(), // sha256 tokenu z ciasteczka
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// false = hasło OK, ale czeka na kod TOTP
		mfaPassed: integer('mfa_passed', { mode: 'boolean' }).notNull().default(false),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		ip: text('ip'),
		userAgent: text('user_agent'),
		createdAt: createdAt()
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

export const invites = sqliteTable('invites', {
	id: text('id').primaryKey(), // sha256 tokenu z linku
	// invite = aktywacja konta (link od admina), reset = reset hasła (link z e-maila, ważny 1 h)
	purpose: text('purpose', { enum: ['invite', 'reset'] }).notNull().default('invite'),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	usedAt: integer('used_at', { mode: 'timestamp_ms' })
});

// ── Motywy ───────────────────────────────────────────────────────────────

export type ThemeColors = {
	background: string;
	surface: string;
	text: string;
	accent: string;
	answers: [string, string, string, string];
};

export const THEME_STYLES = ['poster', 'vivid', 'calm'] as const;
export type ThemeStyle = (typeof THEME_STYLES)[number];

export const themes = sqliteTable('themes', {
	id: text('id').primaryKey(),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	// Styl = układ i charakter ekranów (C plakatowy / A kolorowy / B jasny). Kolory/logo nadpisują go.
	style: text('style', { enum: THEME_STYLES }).notNull().default('poster'),
	logoLight: text('logo_light'), // media id
	logoDark: text('logo_dark'),
	colors: text('colors', { mode: 'json' }).$type<ThemeColors>().notNull(),
	headingFont: text('heading_font').notNull().default('Inter'),
	background: text('background'), // media id lub CSS gradient
	jingleMediaId: text('jingle_media_id'),
	lobbyMusicMediaId: text('lobby_music_media_id'),
	isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
	createdAt: createdAt()
});

// ── Quizy ────────────────────────────────────────────────────────────────

export const PODIUM_SOUNDS = ['fanfare', 'triumph', 'drumroll', 'custom', 'none'] as const;
export type PodiumSound = (typeof PODIUM_SOUNDS)[number];

export type QuizSettings = {
	defaultTimeLimit: number; // sekundy
	countdown: number; // odliczanie przed każdym pytaniem w sekundach, 0 = bez odliczania
	podiumSound: PodiumSound; // dźwięk przy 1. miejscu na podium
	/** Własny dźwięk na podium: plik + zakres; clipMediaId = wycięty i wyrównany głośnościowo fragment. */
	podiumAudio: { mediaId: string; startMs: number; endMs: number; clipMediaId?: string } | null;
	streakBonus: boolean;
	nicknameMode: 'random-or-custom' | 'random-only';
	teamMode: boolean;
	lateJoin: boolean; // dołączanie po starcie gry
	phoneAnswerText: boolean; // tekst odpowiedzi na telefonie (nie tylko kształty)
};

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
	defaultTimeLimit: 20,
	countdown: 5,
	podiumSound: 'fanfare',
	podiumAudio: null,
	streakBonus: true,
	nicknameMode: 'random-or-custom',
	teamMode: false,
	lateJoin: true,
	phoneAnswerText: true
};

export const quizzes = sqliteTable(
	'quizzes',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id),
		title: text('title').notNull(),
		description: text('description'),
		themeId: text('theme_id').references(() => themes.id),
		locale: text('locale', { enum: ['pl', 'en', 'uk'] }).notNull().default('pl'),
		settings: text('settings', { mode: 'json' }).$type<QuizSettings>().notNull(),
		createdAt: createdAt(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now)
	},
	(t) => [index('quizzes_owner_idx').on(t.ownerId)]
);

export const quizShares = sqliteTable(
	'quiz_shares',
	{
		quizId: text('quiz_id')
			.notNull()
			.references(() => quizzes.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		permission: text('permission', { enum: ['host', 'edit'] }).notNull()
	},
	(t) => [primaryKey({ columns: [t.quizId, t.userId] })]
);

export const media = sqliteTable('media', {
	id: text('id').primaryKey(),
	ownerId: text('owner_id').references(() => users.id),
	kind: text('kind', { enum: ['audio', 'image'] }).notNull(),
	originalName: text('original_name').notNull(),
	file: text('file').notNull(), // ścieżka względna w DATA_DIR/media
	durationMs: integer('duration_ms'),
	sizeBytes: integer('size_bytes').notNull(),
	createdAt: createdAt()
});

export type QuestionType = 'choice' | 'truefalse' | 'audio' | 'text' | 'order';
// Pytanie "z obrazkiem" to dowolny typ z ustawionym imageMediaId.

export type QuestionData =
	| { type: 'choice'; answers: string[]; correct: number[]; images?: (string | null)[] } // images: obrazek odpowiedzi (podpis może być pusty)
	| { type: 'truefalse'; correct: boolean; thumbs?: boolean } // thumbs: kciuk w górę/w dół zamiast słów
	| {
			type: 'audio';
			answers: string[];
			correct: number[];
			audioMediaId: string;
			clipMediaId?: string; // wycięty fragment
			startMs: number;
			endMs: number;
			loop: boolean;
			revealEndMs?: number; // dłuższy fragment po odpowiedzi
	  }
	| { type: 'text'; accepted: string[]; typoTolerance: 0 | 1 | 2 }
	| { type: 'order'; items: string[]; partialCredit: boolean };

export const questions = sqliteTable(
	'questions',
	{
		id: text('id').primaryKey(),
		quizId: text('quiz_id')
			.notNull()
			.references(() => quizzes.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		type: text('type', { enum: ['choice', 'truefalse', 'audio', 'text', 'order'] }).notNull(),
		prompt: text('prompt').notNull(),
		promptTranslation: text('prompt_translation'), // opcjonalny 2. wiersz (np. EN + PL)
		imageMediaId: text('image_media_id').references(() => media.id),
		timeLimit: integer('time_limit').notNull().default(20),
		pointsMultiplier: integer('points_multiplier').notNull().default(1), // 0, 1, 2
		data: text('data', { mode: 'json' }).$type<QuestionData>().notNull()
	},
	(t) => [index('questions_quiz_idx').on(t.quizId, t.position)]
);

// ── Moderacja nicków ─────────────────────────────────────────────────────

export const blockedWords = sqliteTable('blocked_words', {
	word: text('word').primaryKey(),
	addedBy: text('added_by').references(() => users.id),
	createdAt: createdAt()
});

// ── Ustawienia aplikacji (klucz → wartość) ──────────────────────────────

export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(), // np. 'org_name', 'org_logo_media_id'
	value: text('value').notNull()
});
