// Prosty limit prób w pamięci (jeden proces = wystarczy).
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Zwraca liczbę sekund do odblokowania albo 0, jeśli można próbować. */
export function isLimited(key: string, max: number, windowMs: number): number {
	const b = buckets.get(key);
	if (!b || b.resetAt < Date.now()) return 0;
	return b.count >= max ? Math.ceil((b.resetAt - Date.now()) / 1000) : 0;
}

export function hit(key: string, windowMs: number) {
	const now = Date.now();
	const b = buckets.get(key);
	if (!b || b.resetAt < now) buckets.set(key, { count: 1, resetAt: now + windowMs });
	else b.count++;
}

export const reset = (key: string) => buckets.delete(key);

setInterval(() => {
	const now = Date.now();
	for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}, 60_000).unref();

export const LOGIN_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };
export const IP_LIMIT = { max: 30, windowMs: 15 * 60 * 1000 };
export const MFA_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
