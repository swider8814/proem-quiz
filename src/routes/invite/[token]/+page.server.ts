import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { createSession, deleteUserSessions, hashPassword, passwordProblem, setSessionCookie } from '#lib/server/auth/index.js';
import { findInvite } from '#lib/server/users.js';

export const load: PageServerLoad = ({ params }) => {
	const found = findInvite(params.token);
	if (!found) error(404, 'Ten link zaproszenia jest nieważny albo wygasł. Poproś administratora o nowy.');
	return { name: found.user.name, email: found.user.email, role: found.user.role };
};

export const actions: Actions = {
	default: async ({ params, request, cookies, getClientAddress }) => {
		const found = findInvite(params.token);
		if (!found) error(404, 'Ten link zaproszenia jest nieważny albo wygasł.');

		const f = await request.formData();
		const password = String(f.get('password') ?? '');
		const repeat = String(f.get('repeat') ?? '');
		const problem = passwordProblem(password) ?? (password !== repeat ? 'Hasła się różnią.' : null);
		if (problem) return fail(400, { error: problem });

		const passwordHash = await hashPassword(password);
		db.transaction((tx) => {
			tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, found.user.id)).run();
			tx.update(schema.invites).set({ usedAt: new Date() }).where(eq(schema.invites.id, found.invite.id)).run();
		});
		deleteUserSessions(found.user.id);

		const user = { ...found.user, passwordHash };
		// Po ustawieniu hasła od razu logujemy. Admin zostanie przekierowany do konfiguracji TOTP.
		const { token, session } = createSession(user, {
			mfaPassed: !user.totpEnabled,
			ip: getClientAddress(),
			userAgent: request.headers.get('user-agent') ?? undefined
		});
		setSessionCookie(cookies, token, session.expiresAt);
		redirect(303, user.totpEnabled ? '/login/2fa' : '/panel');
	}
};
