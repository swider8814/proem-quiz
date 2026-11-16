import type { RequestEvent } from '@sveltejs/kit';
// Wspólna logika z serwerem gry (server/net.js).
import { resolveClientIp } from '../../../server/net.js';

/** Adres IP klienta. X-Forwarded-For tylko od zaufanych proxy (TRUSTED_PROXIES). */
export function clientIp(event: Pick<RequestEvent, 'request' | 'getClientAddress'>): string {
	let remote = '';
	try {
		remote = event.getClientAddress();
	} catch {
		return 'unknown';
	}
	return resolveClientIp(remote, event.request.headers.get('x-forwarded-for')) || 'unknown';
}
