import type { RequestEvent } from '@sveltejs/kit';

/**
 * Adres IP klienta. Nagłówek proxy brany pod uwagę tylko przy TRUST_PROXY=1.
 * Za Cytrusem (Nginx) prawdziwy adres jest w X-Forwarded-For.
 * Bierzemy OSTATNI wpis – dopisuje go nasze proxy, więc klient nie może go podrobić
 * (wcześniejsze wpisy mógł wysłać sam). Bez nagłówka – adres połączenia.
 */
export function clientIp(event: Pick<RequestEvent, 'request' | 'getClientAddress'>): string {
	const xff = process.env.TRUST_PROXY === '1' ? event.request.headers.get('x-forwarded-for') : null;
	if (xff) {
		const last = xff.split(',').pop()?.trim();
		if (last) return last;
	}
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}
