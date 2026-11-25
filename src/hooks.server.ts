import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import {
	SESSION_COOKIE,
	clearSessionCookie,
	purgeExpiredSessions,
	setSessionCookie,
	validateSession
} from '#lib/server/auth/index.js';

import { sweepOrphanMedia } from '#lib/server/media-access.js';

setInterval(() => {
	purgeExpiredSessions();
	sweepOrphanMedia().catch((e) => console.error('[media] sprzątanie nie powiodło się', e));
}, 60 * 60 * 1000).unref();

const SETUP_2FA_ROUTE = '/panel/2fa-setup';

/**
 * Kontrola dostępu opiera się na ROZPOZNANEJ trasie (event.route.id), a nie na surowej ścieżce URL –
 * zakodowane warianty (/%70anel/...) trafiają do tej samej trasy i podlegają tym samym regułom.
 */
const isPanelRoute = (id: string | null) => id === '/panel' || !!id?.startsWith('/panel/');
const isPanelApi = (id: string | null) => !!id?.startsWith('/panel/api/');
const isPrivateRoute = (id: string | null) => isPanelRoute(id) || !!id && /^\/(login|invite|logout|reset)(\/|$)/.test(id);

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	const found = token ? validateSession(token) : null;
	if (token && !found) clearSessionCookie(event.cookies);
	if (token && found?.refreshed) setSessionCookie(event.cookies, token, found.session.expiresAt);
	event.locals.user = found?.user ?? null;
	event.locals.session = found?.session ?? null;

	const routeId = event.route.id;

	// API panelu (JSON): zapisy tylko z naszej domeny (CSRF poza formularzami).
	if (isPanelApi(routeId) && event.request.method !== 'GET' && event.request.method !== 'HEAD') {
		if (event.request.headers.get('origin') !== event.url.origin) {
			return new Response('Forbidden', { status: 403 });
		}
	}

	if (isPanelRoute(routeId)) {
		const { user, session } = event.locals;
		if (!user || !session) {
			if (isPanelApi(routeId)) return new Response('Unauthorized', { status: 401 });
			redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
		}
		const setupRequired = user.role === 'admin' && !user.totpEnabled;
		if (!session.mfaPassed) {
			// Sesja pośrednia: albo kod TOTP, albo (admin bez TOTP) wyłącznie konfiguracja.
			if (user.totpEnabled) redirect(303, '/login/2fa');
			if (!setupRequired) redirect(303, '/login');
		}
		if (setupRequired && routeId !== SETUP_2FA_ROUTE) {
			if (isPanelApi(routeId)) return new Response('Forbidden', { status: 403 });
			redirect(303, SETUP_2FA_ROUTE);
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
	if (isPrivateRoute(routeId)) response.headers.set('Cache-Control', 'no-store');
	return response;
};
