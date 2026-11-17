// Kopie zapasowe: polecenie `cli.js backup`, skrypt backup.sh (z mikrus-backup-setup.sh) i odtworzenie
// aplikacji z kopii. Docker i rclone są podstawione atrapami (zapisują wywołania).
//   node tests/backup.test.mjs   (wymaga npm run build)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { Browser, finish, makeAdmin, makeMp3, ok, startServer, upload } from './_helpers.mjs';

const repo = process.cwd();
const setup = fs.readFileSync('scripts/mikrus-backup-setup.sh', 'utf8');
const backupSh = setup.match(/<<'BACKUP_EOF'\n([\s\S]*?)\nBACKUP_EOF\n/)[1] + '\n';

// Katalog aplikacji jak na serwerze: <app>/data, <app>/backup.sh, <app>/backup-config/
const app = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-app-'));
const data = path.join(app, 'data');
fs.mkdirSync(data);
fs.writeFileSync(path.join(app, 'backup.sh'), backupSh, { mode: 0o700 });

// Atrapa dockera: „docker compose exec -T app node server/cli.js backup /data/…” → prawdziwe cli.js na <app>/data.
const bin = path.join(app, 'bin');
fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, 'docker'), [
	'#!/bin/bash',
	'echo "docker $*" >> "$STUB_APP/docker.log"',
	'if [[ "$1 $2 $3 $4" == "compose exec -T app" ]]; then',
	'  shift 4',
	'  cd "$STUB_REPO" && DATA_DIR="$STUB_DATA" exec "$@"',
	'fi',
	'exit 0',
	''
].join('\n'), { mode: 0o755 });
// Atrapa rclone: zapisuje wywołania; RCLONE_FAIL=1 symuluje błąd wysyłki.
fs.writeFileSync(path.join(bin, 'rclone'), '#!/bin/bash\necho "rclone $*" >> "$STUB_APP/rclone.log"\n[[ "${RCLONE_FAIL:-}" == 1 ]] && exit 1\nexit 0\n', { mode: 0o755 });

const runBackup = (env = {}) =>
	spawnSync('bash', [path.join(app, 'backup.sh')], {
		env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_APP: app, STUB_DATA: data, STUB_REPO: repo, ...env },
		encoding: 'utf8'
	});
const status = () => JSON.parse(fs.readFileSync(path.join(data, 'backup', 'status.json'), 'utf8'));
const snapshots = () => fs.readdirSync(path.join(data, 'backup')).filter((f) => /^quiz-.*\.db$/.test(f)).sort();
const mediaSnap = (db) => path.join(data, 'backup', db.replace(/^quiz-/, 'media-').replace(/\.db$/, ''));

const srv = await startServer({ DATA_DIR: data });
let restored;
try {
	const { browser: admin } = await makeAdmin(srv, 'kopia@proem.pl');
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Quiz do kopii' } });
	ok(c.status === 303, 'quiz utworzony');
	const media = JSON.parse((await upload(admin, makeMp3(2), 'kolęda.mp3')).text);
	ok(!!media.id, 'plik audio wgrany');

	// ── cli.js backup: tylko do katalogu danych ──
	for (const evil of ['/tmp/poza.db', '../poza.db', 'quiz-2026-01-01_0000.db/../../x.db']) {
		const bad = spawnSync(process.execPath, ['server/cli.js', 'backup', evil], { env: { ...process.env, DATA_DIR: data }, encoding: 'utf8' });
		ok(bad.status !== 0 && !fs.existsSync('/tmp/poza.db'), `nazwa kopii spoza wzorca odrzucona (${evil})`);
	}
	// Dowiązanie zamiast katalogu kopii (kontener mógłby je podłożyć) → kopia odmawia zapisu
	{
		const alt = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-alt-'));
		fs.mkdirSync(path.join(alt, 'data'));
		const target = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-target-'));
		fs.symlinkSync(target, path.join(alt, 'data', 'backup'));
		fs.copyFileSync(path.join(data, 'quiz.db'), path.join(alt, 'data', 'quiz.db'));
		const r = spawnSync(process.execPath, ['server/cli.js', 'backup-status', 'ok', '-', 'off'], { env: { ...process.env, DATA_DIR: path.join(alt, 'data') }, encoding: 'utf8' });
		ok(r.status !== 0 && fs.readdirSync(target).length === 0, 'data/backup jako dowiązanie → brak zapisu poza katalogiem danych');
		fs.rmSync(alt, { recursive: true, force: true });
		fs.rmSync(target, { recursive: true, force: true });
	}

	// ── backup.sh bez Dysku Google ──
	const r1 = runBackup({ RCLONE: path.join(bin, 'rclone') });
	ok(r1.status === 0, `backup.sh kończy się sukcesem (${r1.stderr.trim() || r1.stdout.trim().split('\n').pop()})`);
	ok(snapshots().length === 1, 'jest kopia bazy');
	// Migawka plików z tej samej chwili (twarde dowiązania) – review Codexa #5
	const snapDir = mediaSnap(snapshots()[0]);
	const liveFile = fs.readdirSync(path.join(data, 'media')).find((f) => f.startsWith(media.id));
	ok(fs.existsSync(path.join(snapDir, liveFile)) && fs.statSync(path.join(snapDir, liveFile)).ino === fs.statSync(path.join(data, 'media', liveFile)).ino, 'plik w migawce to twarde dowiązanie (bez dodatkowego miejsca)');
	const st1 = status();
	ok(st1.snapshotOk === true && st1.drive === 'off' && st1.snapshotBytes > 0, 'status: kopia OK, Dysk wyłączony');
	ok(!fs.existsSync(path.join(app, 'rclone.log')), 'bez konfiguracji Dysku rclone nie jest uruchamiany');

	const snap = new Database(path.join(data, 'backup', snapshots()[0]), { readonly: true });
	ok(snap.pragma('integrity_check', { simple: true }) === 'ok', 'kopia bazy jest spójna');
	ok(snap.prepare('SELECT count(*) n FROM sessions').get().n === 0, 'kopia bez sesji logowania');
	ok(snap.prepare("SELECT count(*) n FROM quizzes WHERE title = 'Quiz do kopii'").get().n === 1, 'kopia zawiera quiz');
	snap.close();
	ok((fs.statSync(path.join(data, 'backup', snapshots()[0])).mode & 0o777) === 0o640, 'kopia bazy ma uprawnienia 640');

	// ── z Dyskiem Google ──
	fs.mkdirSync(path.join(app, 'backup-config'));
	fs.writeFileSync(path.join(app, 'backup-config', 'rclone.conf'), '# atrapa\n');
	// stara kopia (10 dni) do rotacji + dowiązanie, którego rotacja nie może ruszyć
	const old = path.join(data, 'backup', 'quiz-2000-01-01_0230.db');
	const oldSnap = path.join(data, 'backup', 'media-2000-01-01_0230');
	fs.mkdirSync(oldSnap);
	fs.writeFileSync(path.join(oldSnap, 'med_staryplik12345.mp3'), 'x');
	fs.writeFileSync(path.join(data, 'media', 'med_wtrakcie12345.mp3.part'), 'niedokończony');
	fs.writeFileSync(old, 'x');
	fs.utimesSync(old, new Date(Date.now() - 10 * 864e5), new Date(Date.now() - 10 * 864e5));
	const outside = path.join(app, 'nie-usuwac.txt');
	fs.writeFileSync(outside, 'ważne');
	fs.symlinkSync(outside, path.join(data, 'backup', 'quiz-1999-01-01_0000.db'));
	fs.utimesSync(outside, new Date(Date.now() - 10 * 864e5), new Date(Date.now() - 10 * 864e5));

	const r2 = runBackup({ RCLONE: path.join(bin, 'rclone'), BACKUP_STAMP: '2026-12-16_0800' });
	ok(r2.status === 0, 'backup.sh z Dyskiem: sukces');
	ok(!fs.existsSync(old), 'kopie starsze niż 7 dni usunięte z serwera');
	ok(!fs.existsSync(oldSnap), 'migawka plików starsza niż 7 dni usunięta');
	ok(!fs.readdirSync(mediaSnap('quiz-2026-12-16_0800.db')).some((f) => f.endsWith('.part')), 'niedokończone pliki (.part) nie trafiają do migawki');
	ok(fs.existsSync(outside) && fs.lstatSync(path.join(data, 'backup', 'quiz-1999-01-01_0000.db')).isSymbolicLink(), 'rotacja nie podąża za dowiązaniami');
	const calls = fs.readFileSync(path.join(app, 'rclone.log'), 'utf8');
	ok(/rclone copy \S+\/backup\/media-2026-12-16_0800 gcrypt:media --immutable/.test(calls), 'pliki audio/obrazy z migawki tej samej chwili, tylko nowe (--immutable)');
	ok(/rclone copy \S+\/backup\/quiz-[\d_-]+\.db gcrypt:db/.test(calls), 'kopia bazy wysłana');
	ok(/rclone delete gcrypt:db --min-age 90d --include quiz-\*\.db/.test(calls), 'na Dysku kopie bazy trzymane 90 dni');
	ok(!/gcrypt:media.*(delete|sync|purge)|(delete|sync|purge).*gcrypt:media/.test(calls), 'pliki na Dysku nigdy nie są kasowane ani synchronizowane z usuwaniem');
	ok(status().drive === 'ok', 'status: Dysk OK');

	const r3 = runBackup({ RCLONE: path.join(bin, 'rclone'), RCLONE_FAIL: '1', BACKUP_STAMP: '2026-12-16_0900' });
	ok(r3.status !== 0 && status().drive === 'failed' && status().snapshotOk === true, 'błąd Dysku: kod błędu i status „failed”, kopia lokalna jest');


	// ── status widoczny w panelu ──
	const settings = await admin.req('/panel/settings');
	ok(/Kopie zapasowe/.test(settings.text) && /Dysk Google/.test(settings.text), 'stan kopii w ustawieniach panelu');
	ok(/błąd/i.test(settings.text), 'panel pokazuje błąd wysyłki na Dysk');

	// Nieudane wysłanie plików → baza tej kopii nie trafia na Dysk (review Codexa #5)
	fs.writeFileSync(path.join(app, 'rclone.log'), '');
	fs.writeFileSync(path.join(bin, 'rclone'), '#!/bin/bash\necho "rclone $*" >> "$STUB_APP/rclone.log"\n[[ "$2" == *media-* ]] && exit 1\nexit 0\n', { mode: 0o755 });
	const r4 = runBackup({ RCLONE: path.join(bin, 'rclone'), BACKUP_STAMP: '2026-12-16_1000' });
	const calls4 = fs.readFileSync(path.join(app, 'rclone.log'), 'utf8');
	ok(r4.status !== 0 && !/gcrypt:db/.test(calls4), 'po błędzie wysyłki plików baza nie jest wysyłana na Dysk');

	// Brak pliku wskazanego w bazie → kopia nieudana, nic nie publikujemy (review Codexa #5)
	const victim = fs.readdirSync(path.join(data, 'media')).find((f) => f.endsWith('.mp3'));
	const moved = path.join(app, 'odlozony.mp3');
	fs.renameSync(path.join(data, 'media', victim), moved);
	const r5 = runBackup({ RCLONE: path.join(bin, 'rclone'), BACKUP_STAMP: '2026-12-16_1100' });
	ok(r5.status !== 0 && !fs.existsSync(path.join(data, 'backup', 'quiz-2026-12-16_1100.db')) && status().snapshotOk === false, 'brakujący plik w bazie → kopia oznaczona jako nieudana i nieopublikowana');
	fs.renameSync(moved, path.join(data, 'media', victim));

	// ── odtworzenie: nowy katalog danych z kopii bazy + pliki ──
	const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-restore-'));
	fs.copyFileSync(path.join(data, 'backup', snapshots().at(-1)), path.join(fresh, 'quiz.db'));
	// Pliki z migawki (nie z bieżącego katalogu) – nawet po usunięciu oryginału.
	const lastSnap = mediaSnap(snapshots().at(-1));
	fs.rmSync(path.join(data, 'media', liveFile)); // jak sprzątanie nieużywanych plików po usunięciu quizu
	ok(fs.existsSync(path.join(lastSnap, liveFile)), 'plik zostaje w migawce po usunięciu z katalogu aplikacji');
	fs.cpSync(lastSnap, path.join(fresh, 'media'), { recursive: true });
	srv.stop();
	restored = await startServer({ DATA_DIR: fresh });
	const b = new Browser(restored.base);
	const login = await b.req('/login', { method: 'POST', form: { email: 'kopia@proem.pl', password: 'BardzoTajne123!' } });
	ok(login.status === 303 && login.loc === '/login/2fa', 'po odtworzeniu: logowanie hasłem działa i wymaga 2FA');
	ok(restored.alive(), 'odtworzona aplikacja działa');
	const db = new Database(path.join(fresh, 'quiz.db'), { readonly: true });
	ok(db.prepare('SELECT count(*) n FROM media WHERE id = ?').get(media.id).n === 1 && fs.readdirSync(path.join(fresh, 'media')).length > 0, 'po odtworzeniu: plik audio jest w bazie i na dysku');
	db.close();
	fs.rmSync(fresh, { recursive: true, force: true });
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	try { srv.stop(); } catch {}
	try { restored?.stop(); } catch {}
	fs.rmSync(app, { recursive: true, force: true });
}
process.exit(finish() ? 1 : 0);
