import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { BusyError, checkCredentials, createSession, fullAfterPassword, setSessionCookie } from '#lib/server/auth/index.js';
import { IP_LIMIT, LOGIN_LIMIT, consume, refund, reset } from '#lib/server/auth/rate-limit.js';
import { clientIp } from '#lib/server/net.js';
import { panelDict } from '#lib/i18n/panel.js';

const safeNext = (n: string | null) => (n && /^\/panel(\/[\w\-/]*)?$/.test(n) ? n : '/panel');

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.session?.mfaPassed) redirect(303, safeNext(url.searchParams.get('next')));
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, cookies, url } = event;
		const t = panelDict(event.locals.lang);
		const form = await request.formData();
		const email = String(form.get('email') ?? '').toLowerCase().trim().slice(0, 200);
		const password = String(form.get('password') ?? '');
		const ip = clientIp(event);

		// Próby rezerwujemy PRZED kosztowną weryfikacją – równoległe żądania nie ominą limitu.
		const wait =
			consume(`login:${email}`, LOGIN_LIMIT.max, LOGIN_LIMIT.windowMs) ||
			consume(`ip:${ip}`, IP_LIMIT.max, IP_LIMIT.windowMs);
		if (wait) {
			return fail(429, { email, error: t.err.tooManyLogin(Math.ceil(wait / 60)) });
		}

		let user;
		try {
			user = await checkCredentials(email, password);
		} catch (e) {
			if (e instanceof BusyError) return fail(503, { email, error: t.err.busy });
			throw e;
		}
		if (!user) return fail(400, { email, error: t.err.badLogin });
		reset(`login:${email}`);
		refund(`ip:${ip}`);

		const full = fullAfterPassword(user);
		const { token, session } = createSession(user, {
			mfaPassed: full,
			ip,
			userAgent: request.headers.get('user-agent') ?? undefined
		});
		setSessionCookie(cookies, token, session.expiresAt);
		if (full) redirect(303, safeNext(url.searchParams.get('next')));
		redirect(303, user.totpEnabled ? '/login/2fa' : '/panel/2fa-setup');
	}
};
