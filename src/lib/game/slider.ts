/** Liczba miejsc dziesiętnych liczby (także w zapisie 1e-7). */
export function decimals(n: number): number {
	const s = String(n);
	const m = /e-(\d+)$/.exec(s);
	if (m) return Number(m[1]) + ((s.split('e')[0].split('.')[1] ?? '').length);
	return (s.split('.')[1] ?? '').length;
}

/**
 * Środek suwaka na siatce kroku liczonej od `min` (bez błędów zaokrągleń typu 0,30000000000000004).
 * Precyzja = większa z precyzji `min` i `step` – np. min 0,05 i krok 0,1 daje 0,15, nie 0,1.
 */
export function sliderMid(sl: { min: number; max: number; step: number }): number {
	const dec = Math.min(Math.max(decimals(sl.step), decimals(sl.min)), 12);
	return Number((sl.min + Math.round((sl.max - sl.min) / 2 / sl.step) * sl.step).toFixed(dec));
}
