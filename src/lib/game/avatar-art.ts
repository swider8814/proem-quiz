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
	 <circle cx="50" cy="63" r="30" fill="#e6e1ec" stroke="#d3ccdc" stroke-width="1.6"/>
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
	 ${eyes(54)}<path d="M42 62 L58 62 L50 69 Z" fill="#ff9a1f"/><path d="M44 66 L56 66 L50 73 Z" fill="#e5820f"/>${cheeks(66)}`,
	// 12 panda
	`<circle cx="25" cy="30" r="12" fill="#2f2f3a"/><circle cx="75" cy="30" r="12" fill="#2f2f3a"/>
	 <circle cx="50" cy="57" r="33" fill="#f7f7f9" stroke="#d5d7e0" stroke-width="2"/>
	 <ellipse cx="37" cy="54" rx="9" ry="11" fill="#2f2f3a" transform="rotate(25 37 54)"/><ellipse cx="63" cy="54" rx="9" ry="11" fill="#2f2f3a" transform="rotate(-25 63 54)"/>
	 <g class="eyes"><circle cx="38" cy="53" r="4" fill="#fff"/><circle cx="62" cy="53" r="4" fill="#fff"/><circle cx="38.5" cy="53" r="2.4" fill="${INK}"/><circle cx="62.5" cy="53" r="2.4" fill="${INK}"/></g>
	 <ellipse cx="50" cy="66" rx="5" ry="3.6" fill="#2f2f3a"/>${smile(72, 5)}${cheeks(68, 24)}`,
	// 13 koala
	`<circle cx="21" cy="40" r="17" fill="#9aa1ad"/><circle cx="79" cy="40" r="17" fill="#9aa1ad"/>
	 <circle cx="21" cy="40" r="10" fill="#e9dde6"/><circle cx="79" cy="40" r="10" fill="#e9dde6"/>
	 <circle cx="50" cy="58" r="31" fill="#aeb5c0"/>
	 ${eyes(54, 12, 5)}<ellipse cx="50" cy="66" rx="7" ry="9" fill="#4a4550"/>${cheeks(70, 22)}`,
	// 14 tygrys
	`<circle cx="25" cy="30" r="11" fill="#f08a24"/><circle cx="75" cy="30" r="11" fill="#f08a24"/>
	 <circle cx="25" cy="30" r="5.5" fill="#fff1e2"/><circle cx="75" cy="30" r="5.5" fill="#fff1e2"/>
	 <circle cx="50" cy="57" r="33" fill="#f7952f"/>
	 <path d="M50 24 v10 M42 25 l2 8 M58 25 l-2 8 M18 52 h10 M19 60 h8 M82 52 h-10 M81 60 h-8" stroke="#3b2a26" stroke-width="3.2" stroke-linecap="round"/>
	 <ellipse cx="50" cy="70" rx="14" ry="10" fill="#fff1e2"/>
	 ${eyes(52)}<path d="M45 64 h10 l-5 4.5 z" fill="#3b2a26"/>${catMouth(68)}`,
	// 15 krowa
	`<path d="M30 32 C26 22 30 16 34 22 Z" fill="#e9dcc6"/><path d="M70 32 C74 22 70 16 66 22 Z" fill="#e9dcc6"/>
	 <ellipse cx="18" cy="44" rx="11" ry="6" fill="#f4f1ec" transform="rotate(-20 18 44)"/><ellipse cx="82" cy="44" rx="11" ry="6" fill="#f4f1ec" transform="rotate(20 82 44)"/>
	 <circle cx="50" cy="55" r="31" fill="#f4f1ec" stroke="#d8d2c8" stroke-width="2"/>
	 <path d="M28 40 C34 30 46 34 42 44 C38 52 28 50 28 40 Z" fill="#3a3340"/>
	 ${eyes(52, 12, 5)}
	 <ellipse cx="50" cy="72" rx="20" ry="13" fill="#f6b8c4"/><ellipse cx="43" cy="72" rx="2.6" ry="3.4" fill="#b9566b"/><ellipse cx="57" cy="72" rx="2.6" ry="3.4" fill="#b9566b"/>`,
	// 16 owca
	`<ellipse cx="18" cy="52" rx="10" ry="6" fill="#4a4048" transform="rotate(-25 18 52)"/><ellipse cx="82" cy="52" rx="10" ry="6" fill="#4a4048" transform="rotate(25 82 52)"/>
	 <g fill="#f3f0f5" stroke="#d6d0da" stroke-width="1.6">${Array.from({ length: 9 }, (_, i) => {
		const a = Math.PI + (i / 8) * Math.PI;
		return `<circle cx="${(50 + Math.cos(a) * 28).toFixed(1)}" cy="${(50 + Math.sin(a) * 26).toFixed(1)}" r="11"/>`;
	}).join('')}</g>
	 <ellipse cx="50" cy="60" rx="22" ry="26" fill="#5a4e58"/>
	 <g fill="#f3f0f5" stroke="#d6d0da" stroke-width="1.6"><circle cx="40" cy="34" r="9"/><circle cx="50" cy="31" r="10"/><circle cx="60" cy="34" r="9"/></g>
	 <g class="eyes"><circle cx="42" cy="55" r="4.5" fill="#fff"/><circle cx="58" cy="55" r="4.5" fill="#fff"/><circle cx="42.5" cy="55.5" r="2.6" fill="${INK}"/><circle cx="58.5" cy="55.5" r="2.6" fill="${INK}"/></g>
	 <path d="M46 70 Q50 74 54 70" stroke="#f3f0f5" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
	// 17 jeż
	`<path d="M12 64 L8 44 L20 50 L16 30 L30 40 L32 18 L42 34 L50 12 L58 34 L68 18 L70 40 L84 30 L80 50 L92 44 L88 64 Z" fill="#7a5a44"/>
	 <ellipse cx="50" cy="64" rx="30" ry="26" fill="#e9c9a3"/>
	 ${eyes(60, 11, 5)}<circle cx="50" cy="71" r="4.5" fill="${INK}"/>${cheeks(72, 20)}`,
	// 18 wiewiórka
	`<path d="M26 44 L24 14 L44 32 Z" fill="#c8662d"/><path d="M74 44 L76 14 L56 32 Z" fill="#c8662d"/>
	 <path d="M24 14 L22 8 L29 15 Z" fill="#c8662d"/><path d="M76 14 L78 8 L71 15 Z" fill="#c8662d"/>
	 <circle cx="50" cy="58" r="32" fill="#d9773a"/>
	 <ellipse cx="50" cy="72" rx="16" ry="12" fill="#fbe6cf"/>
	 ${eyes(54)}<ellipse cx="50" cy="66" rx="4" ry="3" fill="${INK}"/><rect x="47" y="71" width="6" height="5" rx="1.2" fill="#fff" stroke="${INK}" stroke-width="1"/>`,
	// 19 szop
	`<path d="M24 44 L24 16 L46 32 Z" fill="#7c7f8c"/><path d="M76 44 L76 16 L54 32 Z" fill="#7c7f8c"/>
	 <path d="M29 38 L29 24 L40 32 Z" fill="#d8d9df"/><path d="M71 38 L71 24 L60 32 Z" fill="#d8d9df"/>
	 <circle cx="50" cy="57" r="33" fill="#9a9dab"/>
	 <path d="M18 54 C26 44 42 46 50 54 C58 46 74 44 82 54 C76 62 60 64 50 58 C40 64 24 62 18 54 Z" fill="#35333f"/>
	 <ellipse cx="50" cy="72" rx="15" ry="11" fill="#eeeef2"/>
	 <g class="eyes"><circle cx="37" cy="54" r="4.5" fill="#fff"/><circle cx="63" cy="54" r="4.5" fill="#fff"/><circle cx="37.5" cy="54.5" r="2.6" fill="${INK}"/><circle cx="63.5" cy="54.5" r="2.6" fill="${INK}"/></g>
	 <ellipse cx="50" cy="68" rx="4.5" ry="3.2" fill="${INK}"/>${smile(74, 4)}`,
	// 20 małpka
	`<circle cx="18" cy="54" r="12" fill="#8a5a3b"/><circle cx="82" cy="54" r="12" fill="#8a5a3b"/>
	 <circle cx="18" cy="54" r="6.5" fill="#f0c9a4"/><circle cx="82" cy="54" r="6.5" fill="#f0c9a4"/>
	 <circle cx="50" cy="55" r="32" fill="#8a5a3b"/>
	 <path d="M50 42 C42 32 26 38 30 54 C26 66 36 82 50 82 C64 82 74 66 70 54 C74 38 58 32 50 42 Z" fill="#f0c9a4"/>
	 ${eyes(53, 10, 5)}<ellipse cx="46.5" cy="63" rx="1.6" ry="2" fill="${INK}"/><ellipse cx="53.5" cy="63" rx="1.6" ry="2" fill="${INK}"/>${smile(70, 8)}`,
	// 21 słoń
	`<ellipse cx="18" cy="52" rx="16" ry="21" fill="#9fb4cc"/><ellipse cx="82" cy="52" rx="16" ry="21" fill="#9fb4cc"/>
	 <ellipse cx="18" cy="52" rx="9" ry="13" fill="#f4bccb"/><ellipse cx="82" cy="52" rx="9" ry="13" fill="#f4bccb"/>
	 <circle cx="50" cy="52" r="29" fill="#b3c6dc"/>
	 <path d="M43 62 C42 76 44 88 56 90 C62 90 63 84 58 84 C52 84 54 74 57 62 Z" fill="#b3c6dc"/>
	 ${eyes(48, 11, 5)}${cheeks(62, 18)}`,
	// 22 wilk
	`<path d="M24 48 L20 10 L48 32 Z" fill="#6f7686"/><path d="M76 48 L80 10 L52 32 Z" fill="#6f7686"/>
	 <path d="M28 40 L26 20 L40 32 Z" fill="#d7d9e0"/><path d="M72 40 L74 20 L60 32 Z" fill="#d7d9e0"/>
	 <circle cx="50" cy="57" r="33" fill="#848b9b"/>
	 <path d="M30 62 C36 56 44 58 50 66 C56 58 64 56 70 62 C68 80 60 88 50 88 C40 88 32 80 30 62 Z" fill="#eceef3"/>
	 ${eyes(52)}<ellipse cx="50" cy="67" rx="5.5" ry="4" fill="${INK}"/>${smile(75, 4)}`,
	// 23 kaczuszka
	`<path d="M50 26 C46 16 52 12 54 20 Z" fill="#f2c200"/>
	 <circle cx="50" cy="56" r="33" fill="#ffe066"/>
	 ${eyes(50, 13)}
	 <ellipse cx="50" cy="66" rx="16" ry="7" fill="#ff9a1f"/><path d="M36 66 Q50 72 64 66" stroke="#e5820f" stroke-width="2" fill="none"/>${cheeks(62, 25)}`
];
