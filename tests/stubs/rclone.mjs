#!/usr/bin/env node
// Atrapa rclone do testów backup.sh: „zdalny” dysk to katalog $STUB_APP/remote/<ścieżka po „gcrypt:”>.
// Obsługuje tylko to, czego używa backup.sh: copy, copyto, delete, lsf, cat (+ --min-age, --include,
// --files-from-raw, --files-only). Każde wywołanie trafia do $STUB_APP/rclone.log.
// RCLONE_FAIL=1 – każde polecenie kończy się błędem; RCLONE_FAIL_MEDIA=1 – błąd przy wysyłce plików.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const app = process.env.STUB_APP;
fs.appendFileSync(path.join(app, 'rclone.log'), `rclone ${args.join(' ')}\n`);
if (process.env.RCLONE_FAIL === '1') process.exit(1);

const opts = {};
const pos = [];
for (let i = 0; i < args.length; i++) {
	const a = args[i];
	if (a === '--files-only' || a === '--immutable') opts[a.slice(2)] = true;
	else if (a.startsWith('--')) opts[a.slice(2)] = args[++i];
	else pos.push(a);
}
const [cmd, ...p] = pos;
const resolve = (x) => (x.startsWith('gcrypt:') ? path.join(app, 'remote', x.slice('gcrypt:'.length)) : x);
const glob = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const list = (dir) => {
	if (!fs.existsSync(dir)) return [];
	let names = fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isFile()).sort();
	if (opts.include) names = names.filter((n) => glob(opts.include).test(n));
	if (opts['min-age']) {
		const ms = parseInt(opts['min-age'], 10) * 864e5;
		names = names.filter((n) => Date.now() - fs.statSync(path.join(dir, n)).mtimeMs >= ms);
	}
	if (opts['files-from-raw']) {
		const want = new Set(fs.readFileSync(opts['files-from-raw'], 'utf8').split('\n').filter(Boolean));
		names = names.filter((n) => want.has(n));
	}
	return names;
};

if (cmd === 'copy') {
	if (process.env.RCLONE_FAIL_MEDIA === '1' && /media-/.test(p[0])) process.exit(1);
	const [src, dst] = [resolve(p[0]), resolve(p[1])];
	fs.mkdirSync(dst, { recursive: true });
	const files = fs.statSync(src).isDirectory() ? list(src).map((n) => path.join(src, n)) : [src];
	for (const f of files) {
		const to = path.join(dst, path.basename(f));
		if (opts.immutable && fs.existsSync(to)) continue;
		fs.copyFileSync(f, to);
	}
} else if (cmd === 'copyto') {
	const to = resolve(p[1]);
	fs.mkdirSync(path.dirname(to), { recursive: true });
	fs.copyFileSync(resolve(p[0]), to);
} else if (cmd === 'delete') {
	const dir = resolve(p[0]);
	for (const n of list(dir)) fs.rmSync(path.join(dir, n));
} else if (cmd === 'lsf') {
	for (const n of list(resolve(p[0]))) process.stdout.write(n + '\n');
} else if (cmd === 'cat') {
	const dir = resolve(p[0]);
	for (const n of list(dir)) process.stdout.write(fs.readFileSync(path.join(dir, n)));
} else {
	process.exit(2);
}
