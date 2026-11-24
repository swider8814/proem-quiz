/**
 * Rysunki awatarów (własne, z prostych kształtów; viewBox 0 0 100 100, wszystko mieści się w kadrze).
 * Każdy zwierzak narysowany osobno: uszy zachodzą pod głowę, żeby „rosły” z niej, a nie wisiały obok.
 * Grupa class="eyes" mruga w animacji. To stałe napisy z kodu (nie dane od użytkownika) – bezpieczne dla {@html}.
 */

const INK = '#2b2233';

/** Oczy: ciemne kółka z błyskiem. */
const eyes = (y = 54, dx = 12, r = 5.5) =>
	`<g class="eyes"><circle cx="${50 - dx}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${50 + dx}" cy="${y}" r="${r}" fill="${INK}"/>` +
	`<circle cx="${50 - dx + r * 0.35}" cy="${y - r * 0.4}" r="${r * 0.35}" fill="#fff"/><circle cx="${50 + dx + r * 0.35}" cy="${y - r * 0.4}" r="${r * 0.35}" fill="#fff"/></g>`;
const cheeks = (y = 66, dx = 23, c = '#ff7a9a') =>
	`<circle cx="${50 - dx}" cy="${y}" r="5" fill="${c}" opacity="0.45"/><circle cx="${50 + dx}" cy="${y}" r="5" fill="${c}" opacity="0.45"/>`;
const smile = (y = 72, w = 6) => `<path d="M${50 - w} ${y} Q50 ${y + 5} ${50 + w} ${y}" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
/** Pyszczek „w” (kot, myszka, lis). */
const catMouth = (y = 67) =>
	`<path d="M50 ${y} v3 M50 ${y + 3} q-4 4 -8 1 M50 ${y + 3} q4 4 8 1" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
const whiskers = (y = 66) =>
	`<path d="M16 ${y - 4} L32 ${y} M16 ${y + 4} L32 ${y + 2} M84 ${y - 4} L68 ${y} M84 ${y + 4} L68 ${y + 2}" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>`;

export const AVATAR_ART: string[] = [
	// 0 kot
	`<path d="M27 50 L24 12 L50 33 Z" fill="#e8893f"/><path d="M73 50 L76 12 L50 33 Z" fill="#e8893f"/>
	 <path d="M27 38 L28.5 20 L41 31 Z" fill="#ffc2b0"/><path d="M73 38 L71.5 20 L59 31 Z" fill="#ffc2b0"/>
	 <circle cx="50" cy="58" r="33" fill="#f6a457"/>
	 <ellipse cx="50" cy="69" rx="13" ry="9" fill="#fff1e2"/>
	 ${eyes(54)}<path d="M46 63 h8 l-4 4 z" fill="#f07c8e"/>${catMouth(66)}${whiskers(66)}`,
	// 1 pies (oklapnięte uszy)
	`<circle cx="50" cy="56" r="33" fill="#d9b48a"/>
	 <path d="M24 30 C10 32 8 56 16 66 C22 72 30 62 30 50 Z" fill="#8f6542"/>
	 <path d="M76 30 C90 32 92 56 84 66 C78 72 70 62 70 50 Z" fill="#8f6542"/>
	 <ellipse cx="50" cy="70" rx="15" ry="11" fill="#f6e7d4"/>
	 ${eyes(53)}<ellipse cx="50" cy="65" rx="6" ry="4.5" fill="${INK}"/>${smile(73, 5)}`,
	// 2 miś
	`<circle cx="25" cy="30" r="12" fill="#8b5e3c"/><circle cx="75" cy="30" r="12" fill="#8b5e3c"/>
	 <circle cx="25" cy="30" r="6" fill="#c99b74"/><circle cx="75" cy="30" r="6" fill="#c99b74"/>
	 <circle cx="50" cy="57" r="33" fill="#9c6b45"/>
	 <ellipse cx="50" cy="70" rx="14" ry="11" fill="#e5c3a0"/>
	 ${eyes(54)}<ellipse cx="50" cy="65" rx="5.5" ry="4" fill="${INK}"/>${smile(72, 5)}`,
	// 3 królik
	`<ellipse cx="38" cy="24" rx="8" ry="20" fill="#e6e1ec" transform="rotate(-8 38 24)"/><ellipse cx="62" cy="24" rx="8" ry="20" fill="#e6e1ec" transform="rotate(8 62 24)"/>
	 <ellipse cx="38" cy="25" rx="4" ry="14" fill="#f7b6c6" transform="rotate(-8 38 25)"/><ellipse cx="62" cy="25" rx="4" ry="14" fill="#f7b6c6" transform="rotate(8 62 25)"/>
	 <circle cx="50" cy="63" r="30" fill="#e6e1ec"/>
	 ${eyes(60, 11)}<path d="M46 68 h8 l-4 4 z" fill="#f07c8e"/>${catMouth(71)}${cheeks(73, 20)}`,
	// 4 lis
	`<path d="M26 52 L22 10 L50 34 Z" fill="#e8662a"/><path d="M74 52 L78 10 L50 34 Z" fill="#e8662a"/>
	 <path d="M22 10 L25.5 20 L31 24 Z" fill="#3b2a26"/><path d="M78 10 L74.5 20 L69 24 Z" fill="#3b2a26"/>
	 <path d="M26 39 L27 21 L39 31 Z" fill="#fff1e6"/><path d="M74 39 L73 21 L61 31 Z" fill="#fff1e6"/>
	 <circle cx="50" cy="57" r="33" fill="#f47c3c"/>
	 <path d="M17 58 C26 60 40 64 50 82 C60 64 74 60 83 58 C80 76 66 90 50 90 C34 90 20 76 17 58 Z" fill="#fff1e6"/>
	 ${eyes(54)}<ellipse cx="50" cy="69" rx="5" ry="3.8" fill="${INK}"/>`,
	// 5 sowa
	`<path d="M30 46 L22 12 L48 32 Z" fill="#7d5a3c"/><path d="M70 46 L78 12 L52 32 Z" fill="#7d5a3c"/>
	 <circle cx="50" cy="57" r="33" fill="#a77b52"/>
	 <circle cx="37" cy="52" r="13" fill="#f3e3c8"/><circle cx="63" cy="52" r="13" fill="#f3e3c8"/>
	 ${eyes(52, 13, 6.5)}<path d="M45 62 L55 62 L50 72 Z" fill="#f2a934"/>
	 <path d="M36 78 q4 4 8 0 M46 80 q4 4 8 0 M56 78 q4 4 8 0" stroke="#7d5a3c" stroke-width="2" fill="none" stroke-linecap="round"/>`,
	// 6 pingwin
	`<circle cx="50" cy="55" r="35" fill="#34374a"/>
	 <path d="M50 40 C42 30 24 34 24 52 C24 72 38 84 50 84 C62 84 76 72 76 52 C76 34 58 30 50 40 Z" fill="#ffffff"/>
	 ${eyes(54, 11)}<path d="M43 63 L57 63 L50 71 Z" fill="#f5a13a"/>${cheeks(66, 20)}`,
	// 7 żaba
	`<circle cx="32" cy="36" r="14" fill="#69bf6b"/><circle cx="68" cy="36" r="14" fill="#69bf6b"/>
	 <ellipse cx="50" cy="62" rx="38" ry="28" fill="#69bf6b"/>
	 <circle cx="32" cy="35" r="9" fill="#fff"/><circle cx="68" cy="35" r="9" fill="#fff"/>
	 ${eyes(36, 18, 5)}
	 <path d="M30 66 Q50 82 70 66" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>${cheeks(66, 30)}`,
	// 8 świnka
	`<path d="M28 46 L22 16 L48 34 Z" fill="#ee8ea1"/><path d="M72 46 L78 16 L52 34 Z" fill="#ee8ea1"/>
	 <circle cx="50" cy="57" r="33" fill="#f8b4c2"/>
	 <ellipse cx="50" cy="68" rx="12" ry="9" fill="#ee8ea1"/>
	 <ellipse cx="45.5" cy="68" rx="2.4" ry="3.4" fill="#b9566b"/><ellipse cx="54.5" cy="68" rx="2.4" ry="3.4" fill="#b9566b"/>
	 ${eyes(52)}${cheeks(66, 25, '#ff6f8f')}`,
	// 9 lew
	`<g fill="#c9782a">${Array.from({ length: 14 }, (_, i) => {
		const a = (i / 14) * Math.PI * 2;
		return `<circle cx="${(50 + Math.cos(a) * 34).toFixed(1)}" cy="${(55 + Math.sin(a) * 34).toFixed(1)}" r="11"/>`;
	}).join('')}<circle cx="50" cy="55" r="36"/></g>
	 <circle cx="29" cy="33" r="8" fill="#f0bd4f"/><circle cx="71" cy="33" r="8" fill="#f0bd4f"/>
	 <circle cx="50" cy="57" r="28" fill="#f5c65a"/>
	 <ellipse cx="50" cy="68" rx="12" ry="9" fill="#fde7ae"/>
	 ${eyes(53, 11)}<path d="M45 63 h10 l-5 5 z" fill="#7a4a2a"/>${smile(72, 5)}`,
	// 10 myszka
	`<circle cx="23" cy="32" r="16" fill="#aeb3bf"/><circle cx="77" cy="32" r="16" fill="#aeb3bf"/>
	 <circle cx="23" cy="32" r="9.5" fill="#f6b8c8"/><circle cx="77" cy="32" r="9.5" fill="#f6b8c8"/>
	 <circle cx="50" cy="59" r="31" fill="#c3c7d1"/>
	 ${eyes(56, 11)}<ellipse cx="50" cy="67" rx="4.5" ry="3.5" fill="#f07c8e"/>${catMouth(69)}${whiskers(68)}`,
	// 11 kurczak
	`<path d="M44 28 C42 18 48 14 50 22 C52 12 60 16 56 28 Z" fill="#f5b400"/>
	 <circle cx="50" cy="58" r="33" fill="#ffd84d"/>
	 ${eyes(54)}<path d="M42 62 L58 62 L50 69 Z" fill="#ff9a1f"/><path d="M44 66 L56 66 L50 73 Z" fill="#e5820f"/>${cheeks(66)}`
];
