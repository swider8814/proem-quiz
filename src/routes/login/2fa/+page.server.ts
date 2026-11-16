import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	clearSessionCookie,
	deleteSession,
	setSessionCookie,
	upgradeSession,
	useRecoveryCode,
	verifyUserTotp
} from '#lib/server/auth/index.js';
import { MFA_LIMIT, consume } from '#lib/server/auth/rate-limit.js';
import { clientIp } from '#lib/server/net.js';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.session || !locals.user) redirect(303, '/login');
	if (locals.session.mfaPassed) redirect(303, '/panel');
	if (!locals.user.totpEnabled) redirect(303, '/panel/2fa-setup');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals, cookies } = event;
		const { user, session } = locals;
		if (!user || !session || session.mfaPassed || !user.totpEnabled) redirect(303, '/login');

		const form = await request.formData();
		const recovery = form.get('mode') === 'recovery';
		const code = String(form.get('code') ?? '').slice(0, 40);

		// Rezerwacja próby przed weryfikacją (równoległe żądania też się liczą).
		const wait = consume(`mfa:${user.id}`, MFA_LIMIT.max, MFA_LIMIT.windowMs);
		if (wait) {
			deleteSession(session.id);
			clearSessionCookie(cookies);
			return fail(429, { error: `Za dużo błędnych kodów. Zaloguj się ponownie za ${Math.ceil(wait / 60)} min.`, recovery: false });
		}

		const ok = recovery ? useRecoveryCode(user, code) : await verifyUserTotp(user, code);
		if (!ok) {
			return fail(400, { error: recovery ? 'Nieprawidłowy lub zużyty kod zapasowy.' : 'Nieprawidłowy kod.', recovery });
		}
		// Nowy token po drugim składniku (ochrona przed przejęciem sesji pośredniej).
		const upgraded = upgradeSession(session, user, { ip: clientIp(event), userAgent: request.headers.get('user-agent') ?? undefined });
		if (!upgraded) redirect(303, '/login');
		setSessionCookie(cookies, upgraded.token, upgraded.session.expiresAt);
		redirect(303, recovery ? '/panel/security?recovery-used=1' : '/panel');
	}
};
