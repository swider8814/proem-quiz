import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from './db/index.js';
import { newId, randomToken, sha256 } from './auth/crypto.js';

const INVITE_DAYS = 7;

export function createInvite(userId: string): string {
	const token = randomToken();
	db.transaction((tx) => {
		// Stare, nieużyte zaproszenia tej osoby przestają działać.
		tx.delete(schema.invites)
			.where(and(eq(schema.invites.userId, userId), isNull(schema.invites.usedAt)))
			.run();
		tx.insert(schema.invites)
			.values({
				id: sha256(token),
				userId,
				expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000)
			})
			.run();
	});
	return token;
}

export function inviteUser(input: { email: string; name: string; role: 'admin' | 'author' }) {
	const email = input.email.toLowerCase().trim();
	const existing = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
	if (existing) return { error: 'Konto z tym adresem już istnieje.' as const };
	const user = db
		.insert(schema.users)
		.values({ id: newId('usr'), email, name: input.name.trim(), role: input.role })
		.returning()
		.get();
	return { user, token: createInvite(user.id) };
}

export function findInvite(token: string) {
	return (
		db
			.select({ invite: schema.invites, user: schema.users })
			.from(schema.invites)
			.innerJoin(schema.users, eq(schema.invites.userId, schema.users.id))
			.where(
				and(
					eq(schema.invites.id, sha256(token)),
					isNull(schema.invites.usedAt),
					gt(schema.invites.expiresAt, new Date())
				)
			)
			.get() ?? null
	);
}

export const inviteUrl = (origin: string, token: string) => `${origin}/invite/${token}`;

export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
