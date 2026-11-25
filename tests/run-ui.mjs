// Wszystkie testy przeglądarkowe (tests/*.e2e.mjs) po kolei – nowy test wystarczy dodać do katalogu,
// bez dopisywania do package.json (to powodowało konflikty między PR-ami).
//   node tests/run-ui.mjs [fragment-nazwy]   np. node tests/run-ui.mjs mobile
// W CI (GITHUB_ACTIONS) każda nieudana asercja trafia też jako adnotacja ::error:: (widoczna w PR).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const filter = process.argv[2] ?? '';
// game-ui najpierw (najszerszy test), reszta alfabetycznie.
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.e2e.mjs') && f.includes(filter)).sort((a, b) => (a === 'game-ui.e2e.mjs' ? -1 : b === 'game-ui.e2e.mjs' ? 1 : a.localeCompare(b)));
const failed = [];
for (const f of files) {
	const t = Date.now();
	process.stdout.write(`\n━━ ${f}\n`);
	const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const out = (r.stdout ?? '') + (r.stderr ?? '');
	process.stdout.write(out);
	process.stdout.write(`━━ ${f}: ${r.status === 0 ? 'OK' : 'BŁĄD'} (${Math.round((Date.now() - t) / 1000)} s)\n`);
	if (r.status !== 0) {
		failed.push(f);
		if (process.env.GITHUB_ACTIONS) {
			const lines = out.split('\n').filter((l) => l.startsWith('✘')).slice(0, 10);
			for (const l of lines.length ? lines : out.trim().split('\n').slice(-5)) console.log(`::error title=${f}::${l.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 300)}`);
		}
	}
}
console.log(failed.length ? `\nNIEUDANE: ${failed.join(', ')}` : `\nWszystkie testy UI OK (${files.length})`);
process.exit(failed.length ? 1 : 0);
