import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clientIp } from '#lib/server/net.js';

// Diagnostyka konfiguracji proxy (tylko admin): skąd przychodzi połączenie i jakie IP widzi aplikacja.
export const GET: RequestHandler = (event) => {
	if (event.locals.user?.role !== 'admin') error(403);
	let remote = '';
	try {
		remote = event.getClientAddress();
	} catch {
		remote = 'unknown';
	}
	return json({
		remoteAddress: remote,
		xForwardedFor: event.request.headers.get('x-forwarded-for'),
		resolvedClientIp: clientIp(event),
		trustedProxies: process.env.TRUSTED_PROXIES || '(brak – nagłówek X-Forwarded-For jest ignorowany)'
	});
};
