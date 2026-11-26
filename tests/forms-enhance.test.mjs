// Każdy formularz POST do akcji strony idzie przez `use:enhance={send(...)}` (src/lib/forms.ts).
// Zwykły POST zostawia w historii odpowiedź na POST: odświeżenie (albo iOS Safari przeładowujący
// kartę w tle) pyta „Czy chcesz ponownie wysłać formularz?” i może powtórzyć akcję.
// Wyjątki: /logout i /lang zawsze kończą się przekierowaniem 303 (Post/Redirect/Get) i celowo
// robią pełne przeładowanie strony.
//   node tests/forms-enhance.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { finish, ok } from './_helpers.mjs';

const ALWAYS_REDIRECT = new Set(['/logout', '/lang']);

function* svelteFiles(dir) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) yield* svelteFiles(p);
		else if (e.name.endsWith('.svelte')) yield p;
	}
}

let forms = 0;
for (const file of svelteFiles('src')) {
	const src = fs.readFileSync(file, 'utf8');
	// Znacznik otwierający <form ...> (atrybuty mogą zawierać „>” w wyrażeniach {…}).
	for (const m of src.matchAll(/<form\b((?:[^>{]|\{[^}]*(?:\{[^}]*\}[^}]*)*\})*)>/g)) {
		const attrs = m[1];
		if (!/method="post"/i.test(attrs)) continue;
		const action = attrs.match(/action="([^"]*)"/)?.[1];
		if (action && ALWAYS_REDIRECT.has(action)) continue;
		forms++;
		const line = src.slice(0, m.index).split('\n').length;
		const where = `${file}:${line}`;
		ok(/use:enhance=\{send\(/.test(attrs), `${where} – formularz POST ma use:enhance={send(…)}`);
		// enhance nie sprawdza event.defaultPrevented – potwierdzenie musi iść przez send({ confirm }).
		ok(!/onsubmit=/.test(attrs), `${where} – bez onsubmit (potwierdzenie przez send({ confirm }))`);
	}
}
ok(forms >= 30, `znaleziono formularze POST do sprawdzenia (${forms})`);

process.exit(finish() ? 1 : 0);
