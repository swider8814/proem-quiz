import { hash, verify } from '@node-rs/argon2';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import { and, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db, schema } from '../db/index.js';
import { decrypt, encrypt, newId, randomToken, sha256 } from './crypto.js';

export type User = typeof schema.users.$inferSelect;
export type Session = typeof schema.sessions.$inferSelect;

export const SESSION_COOKIE = 'pq_session';
const SESSION_DAYS = 30;
const PENDING_MINUTES = 10;
const DAY = 24 * 60 * 60 * 1000;

// ── Ograniczenie współbieżności kosztownych operacji (Argon2) ───────────────

const MAX_HASH_CONCURRENCY = 2;
const MAX_HASH_QUEUE = 50;
let hashActive = 0;
const hashQueue: (() => void)[] = [];

export class BusyError extends Error {}

/** Kolejka dla Argon2 – zalew żądań nie zablokuje procesu ani nie wyczerpie pamięci. */
async function withHashSlot<T>(fn: () => Promise<T>): Promise<T> {
	if (hashActive >= MAX_HASH_CONCURRENCY) {
		if (hashQueue.length >= MAX_HASH_QUEUE) throw new BusyError('busy');
		await new Promise<void>((r) => hashQueue.push(r));
	}
	hashActive++;
	try {
		return await fn();
	} finally {
		hashActive--;
		hashQueue.shift()?.();
	}
}

/** Ciasteczka „Secure”, gdy aplikacja działa pod https (ORIGIN). Próba w sieci lokalnej po http też działa. */
export const secureCookies = () => {
	const origin = process.env.ORIGIN;
	return origin ? origin.startsWith('https://') : process.env.NODE_ENV === 'production';
};

// ── Hasła ────────────────────────────────────────────────────────────────

export const hashPassword = (pw: string) => withHashSlot(() => hash(pw, { memoryCost: 19456, timeCost: 2 }));
export const verifyPassword = (hashStr: string, pw: string) =>
	withHashSlot(() => verify(hashStr, pw).catch(() => false));

/** Zwraca klucz błędu (src/lib/i18n/panel.ts → err) albo null. */
export function passwordProblem(pw: string): 'passwordShort' | 'passwordLong' | null {
	if (pw.length < 10) return 'passwordShort';
	if (pw.length > 200) return 'passwordLong';
	return null;
}

// Zawsze liczymy hash, nawet gdy konta nie ma – czas odpowiedzi nie zdradza, czy e-mail istnieje.
let dummyHash: Promise<string> | null = null;

export async function checkCredentials(email: string, password: string): Promise<User | null> {
	if (password.length > 200) return null;
	const user = db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase().trim())).get();
	if (!user?.passwordHash || user.disabled) {
		dummyHash ??= hashPassword('dummy-password-for-timing');
		await verifyPassword(await dummyHash, password);
		return null;
	}
	if (!(await verifyPassword(user.passwordHash, password))) return null;
	// Weryfikacja hasła jest asynchroniczna – w tym czasie mógł się skończyć reset hasła, włączenie 2FA,
	// zmiana roli albo blokada konta. Sesję wystawiamy na podstawie ŚWIEŻEGO stanu, a jeśli zmienił się
	// hash hasła lub konto zablokowano – odrzucamy logowanie. Wywołujący tworzy sesję synchronicznie
	// (bez `await` po tej funkcji), więc stan nie zmieni się już do zapisu sesji.
	const fresh = getUser(user.id);
	if (!fresh || fresh.disabled || fresh.passwordHash !== user.passwordHash) return null;
	return fresh;
}

export const getUser = (id: string) => db.select().from(schema.users).where(eq(schema.users.id, id)).get() ?? null;

// ── Sesje ────────────────────────────────────────────────────────────────
//
// mfaPassed = sesja w pełni uwierzytelniona. Sesja z mfaPassed=false to stan pośredni:
//   – konto ma TOTP → trzeba podać kod (/login/2fa),
//   – admin bez TOTP → wolno tylko skonfigurować TOTP (/panel/2fa-setup).
// Pełną sesję adminowi daje dopiero ukończona konfiguracja (nowy token, pozostałe sesje usunięte).

/** Czy po haśle sesja jest od razu pełna. */
export function fullAfterPassword(user: User): boolean {
	if (user.totpEnabled) return false;
	if (user.role === 'admin') return false; // najpierw konfiguracja TOTP
	return true;
}

export function createSession(
	user: User,
	opts: { mfaPassed: boolean; ip?: string; userAgent?: string }
): { token: string; session: Session } {
	const token = randomToken();
	const ttl = opts.mfaPassed ? SESSION_DAYS * DAY : PENDING_MINUTES * 60 * 1000;
	const session = db
		.insert(schema.sessions)
		.values({
			id: sha256(token),
			userId: user.id,
			mfaPassed: opts.mfaPassed,
			expiresAt: new Date(Date.now() + ttl),
			ip: opts.ip,
			userAgent: opts.userAgent?.slice(0, 300)
		})
		.returning()
		.get();
	return { token, session };
}

/** Zwraca też refreshed=true, gdy termin sesji został przedłużony (trzeba odświeżyć ciasteczko). */
export function validateSession(token: string): { user: User; session: Session; refreshed: boolean } | null {
	if (typeof token !== 'string' || token.length > 100) return null;
	const row = db
		.select({ user: schema.users, session: schema.sessions })
		.from(schema.sessions)
		.innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
		.where(eq(schema.sessions.id, sha256(token)))
		.get();
	if (!row) return null;
	if (row.session.expiresAt.getTime() < Date.now() || row.user.disabled) {
		db.delete(schema.sessions).where(eq(schema.sessions.id, row.session.id)).run();
		return null;
	}
	let refreshed = false;
	if (row.session.mfaPassed && row.session.expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * DAY) {
		const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
		db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.id, row.session.id)).run();
		row.session.expiresAt = expiresAt;
		refreshed = true;
	}
	return { ...row, refreshed };
}

/**
 * Po udanym drugim składniku: stara (pośrednia) sesja jest usuwana i powstaje nowa, z nowym tokenem.
 * Zwraca null, jeśli stara sesja już nie istnieje (np. zużyta równolegle).
 */
export function upgradeSession(old: Session, user: User, meta: { ip?: string; userAgent?: string }) {
	return db.transaction(() => {
		const del = db
			.delete(schema.sessions)
			.where(and(eq(schema.sessions.id, old.id), eq(schema.sessions.mfaPassed, false)))
			.run();
		if (del.changes !== 1) return null;
		return createSession(user, { mfaPassed: true, ...meta });
	});
}

export const deleteSession = (sessionId: string) =>
	db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run();

export const deleteUserSessions = (userId: string) =>
	db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();

export const deleteOtherSessions = (userId: string, keepSessionId: string) =>
	db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, keepSessionId))).run();

export const purgeExpiredSessions = () =>
	db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date())).run();

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookies(),
		expires: expiresAt
	});
}

export const clearSessionCookie = (cookies: Cookies) => cookies.delete(SESSION_COOKIE, { path: '/' });

// ── TOTP ─────────────────────────────────────────────────────────────────

const ISSUER = 'Proem Quiz';
const PERIOD = 30;

export const totpUri = (email: string, secret: string) => generateURI({ issuer: ISSUER, label: email, secret });

export function newTotpSecret(user: User) {
	const secret = generateSecret();
	return { secret, uri: totpUri(user.email, secret) };
}

/** Sprawdza kod (tolerancja ±30 s). Zwraca krok czasu podany przez bibliotekę albo null. */
export async function checkTotp(secret: string, code: string): Promise<number | null> {
	const token = code.replace(/\s/g, '');
	if (!/^\d{6}$/.test(token)) return null;
	const res = await verifyTotp({ secret, token, epochTolerance: PERIOD });
	return res.valid && 'timeStep' in res && typeof res.timeStep === 'number' ? res.timeStep : null;
}

/** Atomowe zużycie kroku czasu: ten sam kod przechodzi dokładnie raz, także przy równoległych próbach. */
function claimStep(userId: string, step: number): boolean {
	const res = db
		.update(schema.users)
		.set({ totpLastStep: step })
		.where(and(eq(schema.users.id, userId), or(isNull(schema.users.totpLastStep), lt(schema.users.totpLastStep, step))))
		.run();
	return res.changes === 1;
}

export async function verifyUserTotp(user: User, code: string): Promise<boolean> {
	if (!user.totpSecret) return false;
	const step = await checkTotp(decrypt(user.totpSecret), code);
	return step !== null && claimStep(user.id, step);
}

/**
 * Włącza (lub zmienia) TOTP po poprawnym kodzie. Wszystkie sesje użytkownika są usuwane,
 * a osoba kończąca konfigurację dostaje nową, pełną sesję. Zwraca kody zapasowe (pokazywane raz).
 */
export async function enableTotp(user: User, secret: string, code: string, meta: { ip?: string; userAgent?: string }) {
	const step = await checkTotp(secret, code);
	if (step === null) return null;
	const codes = Array.from({ length: 10 }, () => {
		const raw = randomToken(12).replace(/[^A-Za-z0-9]/g, '').toUpperCase().padEnd(10, 'X').slice(0, 10);
		return `${raw.slice(0, 5)}-${raw.slice(5)}`;
	});
	return db.transaction(() => {
		const fresh = getUser(user.id);
		if (!fresh || fresh.disabled) return null;
		db.update(schema.users)
			.set({ totpSecret: encrypt(secret), totpEnabled: true, totpLastStep: step })
			.where(eq(schema.users.id, user.id))
			.run();
		db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, user.id)).run();
		for (const c of codes) {
			db.insert(schema.recoveryCodes).values({ id: newId('rc'), userId: user.id, codeHash: sha256(normalizeRecovery(c)) }).run();
		}
		db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id)).run();
		const session = createSession({ ...fresh, totpEnabled: true }, { mfaPassed: true, ...meta });
		return { codes, ...session };
	});
}

const normalizeRecovery = (c: string) => c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** Atomowe zużycie kodu zapasowego. */
export function useRecoveryCode(user: User, code: string): boolean {
	if (code.length > 40) return false;
	const res = db
		.update(schema.recoveryCodes)
		.set({ usedAt: new Date() })
		.where(
			and(
				eq(schema.recoveryCodes.userId, user.id),
				eq(schema.recoveryCodes.codeHash, sha256(normalizeRecovery(code))),
				isNull(schema.recoveryCodes.usedAt)
			)
		)
		.run();
	return res.changes === 1;
}

export function remainingRecoveryCodes(userId: string): number {
	return db
		.select({ n: sql<number>`count(*)` })
		.from(schema.recoveryCodes)
		.where(and(eq(schema.recoveryCodes.userId, userId), isNull(schema.recoveryCodes.usedAt)))
		.get()!.n;
}

/** Reset TOTP (przez innego admina). Wszystkie sesje tej osoby wygasają. */
export function resetTotp(userId: string) {
	db.transaction(() => {
		db.update(schema.users).set({ totpSecret: null, totpEnabled: false, totpLastStep: null }).where(eq(schema.users.id, userId)).run();
		db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId)).run();
		db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();
	});
}
