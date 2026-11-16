import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, clearSessionCookie, purgeExpiredSessions, validateSession } from '#lib/server/auth/index.js';

setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref();

const SETUP_2FA_PATH = '/panel/2fa-setup';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	const found = token ? validateSession(token) : null;
	if (token && !found) clearSessionCookie(event.cookies);
	event.locals.user = found?.user ?? null;
	event.locals.session = found?.session ?? null;

	const path = event.url.pathname;

	// API panelu (JSON): wymagamy nagłówka Origin z naszej domeny dla zapisów (CSRF poza formularzami).
	if (path.startsWith('/panel/api/') && event.request.method !== 'GET') {
		const origin = event.request.headers.get('origin');
		if (origin !== event.url.origin) return new Response('Forbidden', { status: 403 });
	}
	if (path === '/panel' || path.startsWith('/panel/')) {
		const { user, session } = event.locals;
		if (!user || !session) {
			redirect(303, `/login?next=${encodeURIComponent(path)}`);
		}
		// Hasło OK, ale brak kodu TOTP.
		if (!session.mfaPassed) redirect(303, '/login/2fa');
		// Admin bez skonfigurowanego TOTP może tylko przejść konfigurację.
		if (user.role === 'admin' && !user.totpEnabled && path !== SETUP_2FA_PATH) {
			redirect(303, SETUP_2FA_PATH);
		}
	}

	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	// Strony panelu i logowania nie mogą trafiać do cache przeglądarki/proxy.
	if (/^\/(panel|login|invite|logout)/.test(path)) {
		response.headers.set('Cache-Control', 'no-store');
	}
	return response;
};
