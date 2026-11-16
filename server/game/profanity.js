// Filtr nicków: wulgaryzmy i nieprzyzwoite zwroty PL / EN / UK (+ rosyjski mat, często używany).
// Sprawdzamy rdzenie po normalizacji odpornej na typowe obejścia:
// k.u.r.w.a, kurrwa, kvrwa, k0rwa, KURWA, ku rwa, kúrwa, cyrylica udająca łacinę itp.

// Rdzenie (już po normalizacji: małe litery, bez polskich znaków, bez powtórzeń liter).
const ROOTS = [
	// PL
	'kurw', 'kurew', 'korwa', 'kurfa', 'chuj', 'huj', 'pierdol', 'pierdal', 'jeban', 'jebac', 'jebi', 'jebn', 'zjeb', 'pizd',
	'skurw', 'dziwk', 'szmat', 'cwel', 'pedal', 'pedzi', 'ciota', 'kutas', 'fiut', 'cipa', 'cipk', 'ruchac',
	'ruchan', 'dupa', 'dupek', 'dupy', 'sukinsyn', 'debil', 'kretyn', 'idiot', 'spierdal', 'wypierdal',
	'gowno', 'sraj', 'sracz', 'zajeb', 'pojeb', 'nazist', 'hitler', 'zydz', 'czarnuch', 'murzyn',
	'penis', 'wagin', 'seks', 'porno', 'cycki', 'cyc',
	// EN
	'fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pusy', 'whore', 'slut', 'nig', 'nigg', 'fag', 'fagot',
	'retard', 'bastard', 'ashole', 'arse', 'wank', 'twat', 'boob', 'tits', 'porn', 'sex', 'nazi', 'rape', 'pedo',
	'dildo', 'anal', 'cum', 'jizz', 'horny', 'milf', 'kys', 'killyourself',
	// UK / RU (cyrylica)
	'хуй', 'хуе', 'хуи', 'хуя', 'пизд', 'бляд', 'блят', 'ебат', 'ебан', 'ебал', 'ебуч', 'ебн', 'заеб', 'уеб', 'выеб', 'поеб', 'сука', 'суки', 'мудак',
	'мудил', 'підар', 'пидор', 'пидар', 'гандон', 'залуп', 'шлюх', 'курв', 'дроч', 'срак', 'гівн', 'говн',
	'жопа', 'дупа', 'член', 'секс', 'порн',
	// UK / RU (transliteracja)
	'blyat', 'blya', 'suka', 'pizda', 'huy', 'hui', 'ebat', 'yebat', 'mudak', 'pidor', 'gandon', 'zalupa'
];

// Krótkie rdzenie dopasowujemy tylko jako całe słowo (inaczej "Scunthorpe problem").
const WHOLE_WORD_ONLY = new Set(['nig', 'fag', 'cum', 'anal', 'arse', 'kys', 'cyc', 'fuk', 'fck', 'sex', 'hui', 'huy', 'cipa', 'idiot', 'murzyn', 'rape', 'dick', 'cock', 'boob', 'tits', 'nazi']);

const LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', $: 's', '7': 't', '8': 'b', '9': 'g', '+': 't', '€': 'e', '¥': 'y' };

// Cyrylica wyglądająca jak łacina -> łacina (żeby "kурwа" nie przeszło) i odwrotnie sprawdzamy oba warianty.
const CYR_TO_LAT = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', к: 'k', м: 'm', т: 't', в: 'b', н: 'h', і: 'i', ї: 'i', є: 'e' };

/** @param {string} s */
function baseNormalize(s) {
	return s
		.normalize('NFKC') // ｋｕｒｗａ (pełna szerokość), ligatury, indeksy itp. -> zwykłe znaki
		.toLowerCase()
		.replace(/ł/g, 'l')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/[0-9!|@$+€¥]/g, (c) => LEET[c] ?? c)
		.replace(/v/g, 'u') // kvrwa
		.replace(/q/g, 'k');
}

const collapse = (s) => s.replace(/(.)\1+/gu, '$1'); // kurrrwa -> kurwa
const lettersOnly = (s) => s.replace(/[^\p{L}]/gu, '');
const words = (s) => s.split(/[^\p{L}]+/u).filter(Boolean);

/** "s.e.x", "c i p a" -> dokłada sklejone ciągi pojedynczych liter jako osobne słowa. */
function withJoinedLetters(list) {
	const out = [...list];
	let run = '';
	for (const w of [...list, '']) {
		if (w.length === 1) run += w;
		else {
			if (run.length >= 2) out.push(run);
			run = '';
		}
	}
	return out;
}

/** @param {string} nick @param {string[]} [extra] dodatkowe słowa od admina */
export function isProfane(nick, extra = []) {
	const base = baseNormalize(nick);
	const variants = new Set();
	for (const v of [base, [...base].map((c) => CYR_TO_LAT[c] ?? c).join('')]) {
		variants.add(collapse(lettersOnly(v))); // sklejone: "k u r w a" -> "kurwa"
		variants.add(lettersOnly(v));
	}
	const wordSets = [base, [...base].map((c) => CYR_TO_LAT[c] ?? c).join('')].flatMap((v) =>
		withJoinedLetters(words(v)).flatMap((w) => [w, collapse(w)])
	);
	const roots = [...ROOTS, ...extra.map((w) => collapse(lettersOnly(baseNormalize(w)))).filter((w) => w.length >= 3)];

	for (const root of roots) {
		const r = collapse(root);
		if (WHOLE_WORD_ONLY.has(root)) {
			if (wordSets.some((w) => w === r || w === r + 's' || w === r + 'a' || w === r + 'y')) return true;
		} else if ([...variants].some((v) => v.includes(r))) {
			return true;
		}
	}
	return false;
}
