import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { checkCredentials, createSession, needsMfa, setSessionCookie } from '#lib/server/auth/index.js';
import { clientIp } from '#lib/server/net.js';
import { IP_LIMIT, LOGIN_LIMIT, hit, isLimited, reset } from '#lib/server/auth/rate-limit.js';

const safeNext = (n: string | null) => (n && n.startsWith('/panel') ? n : '/panel');

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.session?.mfaPassed) redirect(303, safeNext(url.searchParams.get('next')));
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, cookies, url } = event;
		const form = await request.formData();
		const email = String(form.get('email') ?? '').toLowerCase().trim();
		const password = String(form.get('password') ?? '');
		const ip = clientIp(event);

		const wait = Math.max(
			isLimited(`login:${email}`, LOGIN_LIMIT.max, LOGIN_LIMIT.windowMs),
			isLimited(`ip:${ip}`, IP_LIMIT.max, IP_LIMIT.windowMs)
		);
		if (wait) {
			return fail(429, { email, error: `Za dużo prób. Spróbuj ponownie za ${Math.ceil(wait / 60)} min.` });
		}

		const user = await checkCredentials(email, password);
		if (!user) {
			hit(`login:${email}`, LOGIN_LIMIT.windowMs);
			hit(`ip:${ip}`, IP_LIMIT.windowMs);
			return fail(400, { email, error: 'Nieprawidłowy e-mail lub hasło.' });
		}
		reset(`login:${email}`);

		const mfa = needsMfa(user);
		const { token, session } = createSession(user, {
			mfaPassed: !mfa,
			ip,
			userAgent: request.headers.get('user-agent') ?? undefined
		});
		setSessionCookie(cookies, token, session.expiresAt);
		redirect(303, mfa ? '/login/2fa' : safeNext(url.searchParams.get('next')));
	}
};
