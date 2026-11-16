import { hash, verify } from '@node-rs/argon2';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db, schema } from '../db/index.js';
import { decrypt, encrypt, newId, randomToken, sha256 } from './crypto.js';

export type User = typeof schema.users.$inferSelect;
export type Session = typeof schema.sessions.$inferSelect;

export const SESSION_COOKIE = 'pq_session';
const SESSION_DAYS = 30;
const PENDING_MFA_MINUTES = 10;
const DAY = 24 * 60 * 60 * 1000;

// ── Hasła ────────────────────────────────────────────────────────────────

export const hashPassword = (pw: string) => hash(pw, { memoryCost: 19456, timeCost: 2 });
export const verifyPassword = (hashStr: string, pw: string) => verify(hashStr, pw).catch(() => false);

export function passwordProblem(pw: string): string | null {
	if (pw.length < 10) return 'Hasło musi mieć co najmniej 10 znaków.';
	if (pw.length > 200) return 'Hasło jest za długie.';
	return null;
}

// Zawsze liczymy hash, nawet gdy konta nie ma – żeby czas odpowiedzi nie zdradzał, czy e-mail istnieje.
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

export async function checkCredentials(email: string, password: string): Promise<User | null> {
	const user = db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase().trim())).get();
	if (!user?.passwordHash || user.disabled) {
		await verifyPassword(await DUMMY_HASH, password);
		return null;
	}
	return (await verifyPassword(user.passwordHash, password)) ? user : null;
}

// ── Sesje ────────────────────────────────────────────────────────────────

/** Czy użytkownik musi podać kod TOTP przy logowaniu. */
export const needsMfa = (user: User) => user.totpEnabled;

export function createSession(
	user: User,
	opts: { mfaPassed: boolean; ip?: string; userAgent?: string }
): { token: string; session: Session } {
	const token = randomToken();
	const ttl = opts.mfaPassed ? SESSION_DAYS * DAY : PENDING_MFA_MINUTES * 60 * 1000;
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

export function validateSession(token: string): { user: User; session: Session } | null {
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
	// Przedłużanie aktywnej sesji (gdy zostało mniej niż połowa czasu).
	if (row.session.mfaPassed && row.session.expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * DAY) {
		const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
		db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.id, row.session.id)).run();
		row.session.expiresAt = expiresAt;
	}
	return row;
}

export function markMfaPassed(sessionId: string) {
	db.update(schema.sessions)
		.set({ mfaPassed: true, expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) })
		.where(eq(schema.sessions.id, sessionId))
		.run();
}

export const deleteSession = (sessionId: string) =>
	db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run();

export const deleteUserSessions = (userId: string) =>
	db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();

export const purgeExpiredSessions = () =>
	db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date())).run();

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
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

/** Sprawdza kod; tolerancja ±30 s; ten sam kod nie przejdzie dwa razy. */
export async function checkTotp(secret: string, code: string, lastStep: number | null): Promise<number | null> {
	const token = code.replace(/\s/g, '');
	if (!/^\d{6}$/.test(token)) return null;
	const res = await verifyTotp({ secret, token, epochTolerance: PERIOD });
	if (!res.valid) return null;
	const step = Math.floor(Date.now() / 1000 / PERIOD) + (res.delta ?? 0);
	if (lastStep !== null && step <= lastStep) return null;
	return step;
}

export async function verifyUserTotp(user: User, code: string): Promise<boolean> {
	if (!user.totpSecret) return false;
	const step = await checkTotp(decrypt(user.totpSecret), code, user.totpLastStep);
	if (step === null) return false;
	db.update(schema.users).set({ totpLastStep: step }).where(eq(schema.users.id, user.id)).run();
	return true;
}

/** Włącza TOTP po poprawnym kodzie i zwraca nowe kody zapasowe (pokazywane raz). */
export async function enableTotp(user: User, secret: string, code: string): Promise<string[] | null> {
	const step = await checkTotp(secret, code, null);
	if (step === null) return null;
	const codes = Array.from({ length: 10 }, () => {
		const raw = randomToken(8).replace(/[^A-Za-z0-9]/g, '').toUpperCase().padEnd(10, 'X').slice(0, 10);
		return `${raw.slice(0, 5)}-${raw.slice(5)}`;
	});
	db.transaction((tx) => {
		tx.update(schema.users)
			.set({ totpSecret: encrypt(secret), totpEnabled: true, totpLastStep: step })
			.where(eq(schema.users.id, user.id))
			.run();
		tx.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, user.id)).run();
		for (const c of codes) {
			tx.insert(schema.recoveryCodes)
				.values({ id: newId('rc'), userId: user.id, codeHash: sha256(normalizeRecovery(c)) })
				.run();
		}
	});
	return codes;
}

const normalizeRecovery = (c: string) => c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export function useRecoveryCode(user: User, code: string): boolean {
	const row = db
		.select()
		.from(schema.recoveryCodes)
		.where(
			and(
				eq(schema.recoveryCodes.userId, user.id),
				eq(schema.recoveryCodes.codeHash, sha256(normalizeRecovery(code))),
				isNull(schema.recoveryCodes.usedAt)
			)
		)
		.get();
	if (!row) return false;
	db.update(schema.recoveryCodes).set({ usedAt: new Date() }).where(eq(schema.recoveryCodes.id, row.id)).run();
	return true;
}

export function remainingRecoveryCodes(userId: string): number {
	return db
		.select()
		.from(schema.recoveryCodes)
		.where(and(eq(schema.recoveryCodes.userId, userId), isNull(schema.recoveryCodes.usedAt)))
		.all().length;
}

/** Wyłączenie TOTP (reset przez innego admina). Admin będzie musiał skonfigurować je od nowa. */
export function resetTotp(userId: string) {
	db.transaction((tx) => {
		tx.update(schema.users)
			.set({ totpSecret: null, totpEnabled: false, totpLastStep: null })
			.where(eq(schema.users.id, userId))
			.run();
		tx.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId)).run();
		tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();
	});
}
