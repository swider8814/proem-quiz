// Limit prób w pamięci (jeden proces). Próba jest REZERWOWANA synchronicznie, zanim ruszy
// jakakolwiek operacja asynchroniczna – równoległe żądania nie przekroczą limitu.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Rezerwuje próbę. Zwraca 0, gdy wolno próbować, albo liczbę sekund do odblokowania.
 * Każde wywołanie zwracające 0 zużywa jedną próbę z puli.
 */
export function consume(key: string, max: number, windowMs: number): number {
	const now = Date.now();
	let b = buckets.get(key);
	if (!b || b.resetAt <= now) {
		b = { count: 0, resetAt: now + windowMs };
		buckets.set(key, b);
	}
	if (b.count >= max) return Math.max(1, Math.ceil((b.resetAt - now) / 1000));
	b.count++;
	return 0;
}

/** Zwraca próbę do puli (np. po udanym logowaniu). */
export const reset = (key: string) => buckets.delete(key);

setInterval(() => {
	const now = Date.now();
	for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 60_000).unref();

export const LOGIN_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };
export const IP_LIMIT = { max: 30, windowMs: 15 * 60 * 1000 };
export const MFA_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
export const UPLOAD_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };

/** Oddaje jedną zarezerwowaną próbę (np. udane logowanie nie obciąża limitu IP). */
export function refund(key: string) {
	const b = buckets.get(key);
	if (b && b.count > 0) b.count--;
}
