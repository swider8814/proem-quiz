// Treść Pomocy: obie wersje językowe kompletne, podpowiedzi „?” wskazują istniejące sekcje
// i są użyte w panelu, a formatowanie **…** nie przepuszcza HTML.
//   npx tsx tests/help.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { HELP, HELP_TIPS, helpHtml } from '../src/lib/help/content.ts';
import { finish, ok } from './_helpers.mjs';

const ids = HELP.map((s) => s.id);
ok(new Set(ids).size === ids.length, `sekcje Pomocy mają unikalne id (${ids.join(', ')})`);
for (const s of HELP) {
	for (const l of ['pl', 'en'] as const) ok(!!s[l].title && !!s[l].summary && (s[l].steps?.length ?? 0) > 0, `sekcja ${s.id}/${l}: tytuł, opis i kroki`);
	ok((s.pl.steps?.length ?? 0) === (s.en.steps?.length ?? 0), `sekcja ${s.id}: tyle samo kroków PL i EN`);
	ok((s.pl.tips?.length ?? 0) === (s.en.tips?.length ?? 0), `sekcja ${s.id}: tyle samo wskazówek PL i EN`);
}
ok(HELP.filter((s) => s.adminOnly).every((s) => s.id === 'admin'), 'tylko sekcja „admin” jest dla administratorów');

const src: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.svelte')) src.push(fs.readFileSync(p, 'utf8')); } };
walk('src');
const all = src.join('\n');
for (const [id, tip] of Object.entries(HELP_TIPS)) {
	ok(ids.includes(tip.section), `podpowiedź „${id}” prowadzi do istniejącej sekcji (${tip.section})`);
	ok(!!tip.pl && !!tip.en, `podpowiedź „${id}”: PL i EN`);
	ok(all.includes(`<HelpTip id="${id}"`), `podpowiedź „${id}” jest użyta w panelu`);
}
ok(helpHtml('**A** <img src=x onerror=alert(1)>') === '<strong>A</strong> &lt;img src=x onerror=alert(1)&gt;', 'helpHtml: pogrubienie działa, HTML jest escapowany');

process.exit(finish() ? 1 : 0);
