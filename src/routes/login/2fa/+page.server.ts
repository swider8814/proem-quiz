import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { markMfaPassed, useRecoveryCode, verifyUserTotp, deleteSession, clearSessionCookie } from '#lib/server/auth/index.js';
import { MFA_LIMIT, hit, isLimited } from '#lib/server/auth/rate-limit.js';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.session) redirect(303, '/login');
	if (locals.session.mfaPassed) redirect(303, '/panel');
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const { user, session } = locals;
		if (!user || !session || session.mfaPassed) redirect(303, '/login');

		const key = `mfa:${user.id}`;
		const wait = isLimited(key, MFA_LIMIT.max, MFA_LIMIT.windowMs);
		if (wait) {
			// Po wyczerpaniu prób wylogowujemy – trzeba zacząć od hasła.
			deleteSession(session.id);
			clearSessionCookie(cookies);
			return fail(429, { error: `Za dużo błędnych kodów. Zaloguj się ponownie za ${Math.ceil(wait / 60)} min.`, recovery: false });
		}

		const form = await request.formData();
		const recovery = form.get('mode') === 'recovery';
		const code = String(form.get('code') ?? '');

		const ok = recovery ? useRecoveryCode(user, code) : await verifyUserTotp(user, code);
		if (!ok) {
			hit(key, MFA_LIMIT.windowMs);
			return fail(400, { error: recovery ? 'Nieprawidłowy lub zużyty kod zapasowy.' : 'Nieprawidłowy kod.', recovery });
		}
		markMfaPassed(session.id);
		redirect(303, recovery ? '/panel/security?recovery-used=1' : '/panel');
	}
};
