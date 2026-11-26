// Transliteracja cyrylicy na alfabet łaciński dla własnych nicków.
// Gdy quiz jest po polsku albo angielsku, prowadzący i sala mają przeczytać każdy nick,
// więc „Олена” zapisujemy jako „Olena”. W quizie po ukraińsku cyrylica zostaje.
//
// Reguły: oficjalna transliteracja ukraińska (uchwała Gabinetu Ministrów Ukrainy nr 55 z 2010 r.) –
// Є Ї Й Ю Я na początku słowa jako Ye Yi Y Yu Ya, w środku jako ie i i iu ia; „зг” → „zgh”;
// miękki znak i apostrof znikają. Litery spoza alfabetu ukraińskiego (ы э ъ ё) – najprostszy odpowiednik.
// Używane na serwerze (zapis nicka) i na telefonie (podgląd „Na ekranie: …”).

/** @type {Record<string, string>} */
const BASE = {
	а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
	к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
	ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia',
	ы: 'y', э: 'e', ъ: '', ё: 'io'
};
/** Na początku słowa. */
const INITIAL = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya', ё: 'yo' };
const APOSTROPHES = /['’ʼ`]/;
const CYR = /[Ѐ-ӿ]/;
/** @param {string | undefined} c */
const isLetter = (c) => !!c && /\p{L}/u.test(c);
/** @param {string} c */
const isUpper = (c) => c !== c.toLowerCase();

/** @param {string} s */
export const hasCyrillic = (s) => CYR.test(s);

/**
 * Cyrylica → łacina; reszta tekstu (łacina, cyfry, emoji, spacje) bez zmian.
 * @param {string} s
 */
export function translit(s) {
	const chars = [...String(s ?? '')];
	let out = '';
	for (let i = 0; i < chars.length; i++) {
		const c = chars[i];
		const lower = c.toLowerCase();
		// Apostrof w środku słowa z cyrylicą (Мар’яна) znika; poza tym zostaje.
		if (APOSTROPHES.test(c) && CYR.test(chars[i - 1] ?? '') && CYR.test(chars[i + 1] ?? '')) continue;
		if (!(lower in BASE)) {
			out += c;
			continue;
		}
		const prev = chars[i - 1];
		const prevSkipApos = APOSTROPHES.test(prev ?? '') ? chars[i - 2] : prev;
		const wordStart = !isLetter(prevSkipApos); // po apostrofie w środku słowa: nie początek (Мар’яна → Mariana)
		let latin = wordStart && lower in INITIAL ? INITIAL[/** @type {keyof typeof INITIAL} */ (lower)] : BASE[lower];
		// „зг” → „zgh” (żeby nie czytać jak „zh”).
		if (lower === 'г' && prev?.toLowerCase() === 'з') latin = 'gh';
		if (latin && isUpper(c)) {
			// CAŁE SŁOWO WIELKIMI → wielkie litery; inaczej tylko pierwsza (Щ → Shch).
			const next = chars[i + 1];
			const shout = (next && isLetter(next) && isUpper(next)) || (prev && isLetter(prev) && isUpper(prev));
			latin = shout ? latin.toUpperCase() : latin[0].toUpperCase() + latin.slice(1);
		}
		out += latin;
	}
	return out;
}
