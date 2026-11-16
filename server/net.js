// @ts-nocheck
// Ustalanie adresu IP klienta – wspólne dla HTTP (SvelteKit) i Socket.IO.
//
// Nagłówek X-Forwarded-For jest brany pod uwagę WYŁĄCZNIE wtedy, gdy połączenie przyszło
// bezpośrednio od zaufanego proxy z listy TRUSTED_PROXIES (adresy IP lub sieci CIDR,
// rozdzielone przecinkami). Bez tej zmiennej nagłówek jest ignorowany.
import net from 'node:net';

function parseList(raw) {
	const list = new net.BlockList();
	let count = 0;
	for (const item of String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
		const [addr, bits] = item.split('/');
		const type = net.isIPv6(addr) ? 'ipv6' : net.isIPv4(addr) ? 'ipv4' : null;
		if (!type) {
			console.warn(`[net] Pomijam nieprawidłowy wpis TRUSTED_PROXIES: ${item}`);
			continue;
		}
		if (bits !== undefined) list.addSubnet(addr, parseInt(bits, 10), type);
		else list.addAddress(addr, type);
		count++;
	}
	return { list, count };
}

let cached = null;
function trusted() {
	const raw = process.env.TRUSTED_PROXIES ?? '';
	if (!cached || cached.raw !== raw) cached = { raw, ...parseList(raw) };
	return cached;
}

/** "::ffff:1.2.3.4" -> "1.2.3.4" */
export function normalizeIp(ip) {
	if (typeof ip !== 'string') return '';
	const v = ip.trim().replace(/^\[|\]$/g, '');
	return v.startsWith('::ffff:') && net.isIPv4(v.slice(7)) ? v.slice(7) : v;
}

export function isTrustedProxy(ip) {
	const t = trusted();
	if (!t.count) return false;
	const n = normalizeIp(ip);
	const type = net.isIPv6(n) ? 'ipv6' : net.isIPv4(n) ? 'ipv4' : null;
	return type ? t.list.check(n, type) : false;
}

/**
 * @param {string} remote adres bezpośredniego nadawcy (gniazdo TCP)
 * @param {string|string[]|null|undefined} xff wartość nagłówka X-Forwarded-For
 */
export function resolveClientIp(remote, xff) {
	let ip = normalizeIp(remote);
	if (!isTrustedProxy(ip)) return ip;
	const header = Array.isArray(xff) ? xff.join(',') : xff;
	if (typeof header !== 'string' || !header) return ip;
	// Idziemy od prawej: pomijamy kolejne zaufane proxy, pierwszy niezaufany adres to klient.
	const hops = header.split(',').map(normalizeIp).filter(Boolean);
	for (let i = hops.length - 1; i >= 0; i--) {
		if (!net.isIP(hops[i])) return ip;
		ip = hops[i];
		if (!isTrustedProxy(ip)) return ip;
	}
	return ip;
}
