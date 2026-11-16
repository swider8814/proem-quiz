// Normalizacja tekstu: porównywanie wpisywanych odpowiedzi i filtr nicków.

const PL_MAP = { ł: 'l', Ł: 'l' };

/** Małe litery, bez polskich znaków i interpunkcji, pojedyncze spacje. Cyrylica zostaje. */
export function normalizeAnswer(s) {
	return String(s ?? '')
		.replace(/[łŁ]/g, (c) => PL_MAP[c])
		.normalize('NFD')
		.replace(/\p{M}/gu, '') // znaki diakrytyczne (ą→a, é→e; й→и w cyrylicy – akceptowalne)
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/** Odległość Levenshteina z limitem (szybkie odcięcie). */
export function levenshtein(a, b, max = 2) {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		let rowMin = i;
		for (let j = 1; j <= b.length; j++) {
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
			if (cur[j] < rowMin) rowMin = cur[j];
		}
		if (rowMin > max) return max + 1;
		prev = cur;
	}
	return prev[b.length];
}

/**
 * @param {string} given
 * @param {string[]} accepted
 * @param {0|1|2} tolerance
 */
export function textMatches(given, accepted, tolerance) {
	const g = normalizeAnswer(given);
	if (!g) return false;
	return accepted.some((a) => {
		const n = normalizeAnswer(a);
		if (!n) return false;
		// Krótkie odpowiedzi (≤4 znaki) muszą być dokładne – inaczej "kot" = "kod".
		const tol = n.length <= 4 ? 0 : tolerance;
		return levenshtein(g, n, tol) <= tol;
	});
}

/** Czyści nick: bez znaków sterujących, emoji zostają, max 20 znaków. */
export function cleanNick(s) {
	return String(s ?? '')
		.normalize('NFC')
		.replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '') // znaki sterujące, niewidoczne, bidi
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 20);
}
