/**
 * Inicjały do kółka z awatarem: pierwsza litera imienia i nazwiska („Jan Kowalski” → „JK”).
 * Jedno słowo → jedna litera; przy kilku słowach bierzemy pierwsze i ostatnie
 * („Anna Maria Nowak” → „AN”). Array.from, żeby nie przeciąć znaku spoza BMP.
 */
export function initials(name: string): string {
	const words = name
		.trim()
		.split(/\s+/)
		.map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ''))
		.filter(Boolean);
	if (!words.length) return '?';
	const first = Array.from(words[0])[0];
	const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : '';
	return (first + last).toLocaleUpperCase();
}
