// Narzędzia administracyjne z konsoli serwera.
//   docker compose exec app node server/cli.js create-admin jan@proem.pl "Jan Kowalski"
//   docker compose exec app node server/cli.js invite-link jan@proem.pl
//   docker compose exec app node server/cli.js reset-2fa jan@proem.pl
//   docker compose exec app node server/cli.js backup /data/backup/quiz-2026-12-16.db
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';

const DATA_DIR = process.env.DATA_DIR ?? path.resolve('data');
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:3000';
const db = new Database(path.join(DATA_DIR, 'quiz.db'));
db.pragma('foreign_keys = ON');

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const id = (p) => `${p}_${randomBytes(10).toString('base64url')}`;

function inviteFor(userId) {
	const t = token();
	db.prepare('DELETE FROM invites WHERE user_id = ? AND used_at IS NULL').run(userId);
	db.prepare('INSERT INTO invites (id, user_id, expires_at) VALUES (?, ?, ?)').run(
		sha256(t),
		userId,
		Date.now() + 7 * 24 * 60 * 60 * 1000
	);
	return `${ORIGIN}/invite/${t}`;
}

/**
 * Melodia „Cicha noc” (F. X. Gruber, 1818 – domena publiczna) wygenerowana syntezatorem → MP3 w DATA_DIR/media.
 * Pozwala przetestować pytanie audio bez pobierania plików z internetu.
 */
const DEMO_CLIP_MS = 12_000;

function demoMelody(ownerId) {
	const NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46 };
	const tune = [
		['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3], ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
		['D5', 2], ['D5', 1], ['B4', 3], ['C5', 2], ['C5', 1], ['G4', 3],
		['A4', 2], ['A4', 1], ['C5', 1.5], ['B4', 0.5], ['A4', 1], ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
		['A4', 2], ['A4', 1], ['C5', 1.5], ['B4', 0.5], ['A4', 1], ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
		['D5', 2], ['D5', 1], ['F5', 1.5], ['D5', 0.5], ['B4', 1], ['C5', 3], ['E5', 3],
		['C5', 1], ['G4', 1], ['E4', 1], ['G4', 1.5], ['F4', 0.5], ['D4', 1], ['C4', 6]
	];
	const rate = 22050;
	const beat = 0.42;
	const total = Math.ceil(tune.reduce((t, [, b]) => t + b, 0) * beat * rate) + rate;
	const pcm = new Float32Array(total);
	let pos = 0;
	for (const [n, b] of tune) {
		const len = Math.round(b * beat * rate);
		const f = NOTE[n];
		for (let i = 0; i < len + rate * 0.3 && pos + i < total; i++) {
			const t = i / rate;
			const env = Math.min(1, t / 0.01) * Math.exp(-t * 2.2) * (i < len ? 1 : Math.exp(-(i - len) / (rate * 0.05)));
			pcm[pos + i] += env * (0.6 * Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t) + 0.1 * Math.sin(6 * Math.PI * f * t));
		}
		pos += len;
	}
	const wav = Buffer.alloc(44 + total * 2);
	wav.write('RIFF', 0); wav.writeUInt32LE(36 + total * 2, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
	wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24);
	wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(total * 2, 40);
	for (let i = 0; i < total; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i] * 0.5)) * 32767), 44 + i * 2);
	const mediaId = id('med');
	const mediaDir = path.join(DATA_DIR, 'media');
	fs.mkdirSync(mediaDir, { recursive: true });
	const tmp = path.join(mediaDir, `${mediaId}.wav`);
	const file = `${mediaId}.mp3`;
	fs.writeFileSync(tmp, wav);
	try {
		execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '96k', path.join(mediaDir, file)]);
	} finally {
		fs.rmSync(tmp, { force: true });
	}
	fs.chmodSync(path.join(mediaDir, file), 0o640);
	const durationMs = Math.round((total / rate) * 1000);
	const insert = db.prepare('INSERT INTO media (id, owner_id, kind, original_name, file, duration_ms, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)');
	insert.run(mediaId, ownerId, 'audio', 'Cicha noc (melodia, domena publiczna).mp3', file, durationMs, fs.statSync(path.join(mediaDir, file)).size);
	// Fragment 0–12 s jako osobny plik – tak jak robi to zapis w edytorze (prowadzący odtwarza tylko klip).
	const clipId = id('med');
	const clipFile = `${clipId}.mp3`;
	execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '0', '-t', String(DEMO_CLIP_MS / 1000), '-i', path.join(mediaDir, file), '-codec:a', 'libmp3lame', '-b:a', '96k', path.join(mediaDir, clipFile)]);
	fs.chmodSync(path.join(mediaDir, clipFile), 0o640);
	insert.run(clipId, ownerId, 'audio', 'Cicha noc – fragment.mp3', clipFile, DEMO_CLIP_MS, fs.statSync(path.join(mediaDir, clipFile)).size);
	return { id: mediaId, clipId, durationMs };
}

/** Katalog kopii: DATA_DIR/backup – zwykły katalog (nie dowiązanie). */
function backupDir() {
	const dir = path.join(DATA_DIR, 'backup');
	fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
	if (!fs.lstatSync(dir).isDirectory()) throw new Error('data/backup nie jest katalogiem');
	return dir;
}

const findUser = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

const [cmd, emailArg, ...rest] = process.argv.slice(2);

switch (cmd) {
	case 'create-admin': {
		if (!emailArg) throw new Error('Użycie: create-admin <email> "<Imię Nazwisko>"');
		const email = emailArg.toLowerCase().trim();
		let user = findUser(email);
		if (user) {
			db.prepare("UPDATE users SET role = 'admin', disabled = 0 WHERE id = ?").run(user.id);
			console.log(`Konto ${email} istniało – nadano rolę administratora.`);
		} else {
			const userId = id('usr');
			db.prepare("INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, 'admin')").run(
				userId,
				email,
				rest.join(' ') || email.split('@')[0]
			);
			user = findUser(email);
			console.log(`Utworzono administratora ${email}.`);
		}
		if (!user.password_hash) console.log(`\nLink aktywacyjny (ważny 7 dni):\n${inviteFor(user.id)}\n`);
		break;
	}
	case 'invite-link': {
		const user = emailArg && findUser(emailArg);
		if (!user) throw new Error('Nie znaleziono konta.');
		console.log(`\nNowy link (ważny 7 dni):\n${inviteFor(user.id)}\n`);
		break;
	}
	case 'reset-2fa': {
		const user = emailArg && findUser(emailArg);
		if (!user) throw new Error('Nie znaleziono konta.');
		db.transaction(() => {
			db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL WHERE id = ?').run(user.id);
			db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
			db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
		})();
		console.log(`Zresetowano 2FA dla ${user.email}. Przy następnym logowaniu skonfiguruje je od nowa.`);
		break;
	}
	case 'demo-quiz': {
		// Dwa przykładowe quizy (PL i EN z polskim drugim wierszem) do próby – bez plików audio.
		const user = emailArg && findUser(emailArg);
		if (!user) throw new Error('Użycie: demo-quiz <email istniejącego konta>');
		const theme = db.prepare('SELECT id FROM themes WHERE is_default = 1').get()?.id ?? null;
		const settings = JSON.stringify({ defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true });
		const melody = demoMelody(user.id);
		const audio = (answers) => ({ type: 'audio', answers, correct: [0], audioMediaId: melody.id, clipMediaId: melody.clipId, startMs: 0, endMs: DEMO_CLIP_MS, loop: false, revealEndMs: Math.min(melody.durationMs, 28_000) });
		const make = (title, locale, questions) => {
			const quizId = id('quiz');
			db.transaction(() => {
				db.prepare('INSERT INTO quizzes (id, owner_id, title, theme_id, locale, settings) VALUES (?, ?, ?, ?, ?, ?)').run(quizId, user.id, title, theme, locale, settings);
				questions.forEach((q, i) =>
					db.prepare('INSERT INTO questions (id, quiz_id, position, type, prompt, prompt_translation, time_limit, points_multiplier, data) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
						.run(id('qst'), quizId, i, q.data.type, q.prompt, q.tr ?? null, q.time ?? 20, JSON.stringify(q.data))
				);
			})();
			console.log(`Utworzono: ${title} → ${ORIGIN}/panel/quizzes/${quizId}`);
		};
		make('Przykład – Boże Narodzenie', 'pl', [
			{ prompt: 'Jaka to kolęda?', data: audio(['Cicha noc', 'Wśród nocnej ciszy', 'Lulajże, Jezuniu', 'Bóg się rodzi']) },
			{ prompt: 'W jakim mieście urodził się Jezus?', data: { type: 'choice', answers: ['Betlejem', 'Nazaret', 'Jerozolima', 'Kafarnaum'], correct: [0] } },
			{ prompt: 'Wigilia to wieczór 24 grudnia.', data: { type: 'truefalse', correct: true } },
			{ prompt: 'Który z tych darów NIE był darem Mędrców?', data: { type: 'choice', answers: ['Złoto', 'Kadzidło', 'Mirra', 'Srebro'], correct: [3] } },
			{ prompt: 'Co dzielimy przy wigilijnym stole?', time: 30, data: { type: 'text', accepted: ['opłatek', 'opłatkiem'], typoTolerance: 1 } },
			{ prompt: 'Ułóż od najwcześniejszego', time: 30, data: { type: 'order', items: ['Adwent', 'Wigilia', 'Boże Narodzenie', 'Trzech Króli'], partialCredit: true } },
			{ prompt: 'Ile potraw tradycyjnie jest na wigilijnym stole?', data: { type: 'choice', answers: ['7', '10', '12', '24'], correct: [2] } }
		]);
		make('Example – Christmas (English)', 'en', [
			{ prompt: 'Name that carol!', tr: 'Jaka to kolęda?', data: audio(['Silent Night', 'O Holy Night', 'Joy to the World', 'Away in a Manger']) },
			{ prompt: 'Where was Jesus born?', tr: 'Gdzie urodził się Jezus?', data: { type: 'choice', answers: ['Bethlehem', 'Nazareth', 'Jerusalem', 'Rome'], correct: [0] } },
			{ prompt: 'Christmas Eve is on 24 December.', tr: 'Wigilia jest 24 grudnia.', data: { type: 'truefalse', correct: true } },
			{ prompt: 'Which gift did the Wise Men NOT bring?', tr: 'Którego daru Mędrcy NIE przynieśli?', data: { type: 'choice', answers: ['Gold', 'Frankincense', 'Myrrh', 'Silver'], correct: [3] } },
			{ prompt: 'What animals did the shepherds look after?', tr: 'Jakimi zwierzętami opiekowali się pasterze?', time: 30, data: { type: 'text', accepted: ['sheep', 'lambs'], typoTolerance: 1 } },
			{ prompt: 'Put in order, from the earliest', tr: 'Ułóż od najwcześniejszego', time: 30, data: { type: 'order', items: ['Advent', 'Christmas Eve', 'Christmas Day', 'Epiphany'], partialCredit: true } },
			{ prompt: 'Which colour is NOT usually used for Christmas decorations?', tr: 'Który kolor zwykle NIE jest kolorem świątecznych ozdób?', data: { type: 'choice', answers: ['Red', 'Green', 'Gold', 'Brown'], correct: [3] } }
		]);
		console.log('Pytanie audio: melodia „Cicha noc” (F. X. Gruber, 1818 – domena publiczna), wygenerowana syntezatorem.');
		break;
	}
	case 'backup': {
		// Spójna kopia działającej bazy (SQLite online backup) do DATA_DIR/backup, bez sesji logowania,
		// plus usunięcie kopii starszych niż N dni. Wszystko jako użytkownik aplikacji – root na serwerze
		// niczego nie zapisuje ani nie kasuje w katalogu danych (który kontroluje aplikacja).
		const name = emailArg;
		if (!name || !/^quiz-\d{4}-\d{2}-\d{2}_\d{4}\.db$/.test(name)) throw new Error('Użycie: backup quiz-RRRR-MM-DD_GGMM.db [dni-przechowywania]');
		const keepDays = Math.min(Math.max(Number(rest[0] ?? 7) || 7, 1), 365);
		const dir = backupDir();
		const dest = path.join(dir, name);
		const tmp = `${dest}.tmp`;
		fs.rmSync(tmp, { force: true });
		await db.backup(tmp);
		const copy = new Database(tmp);
		try {
			copy.exec('DELETE FROM sessions;');
			const check = copy.pragma('integrity_check', { simple: true });
			if (check !== 'ok') throw new Error(`Kopia uszkodzona: ${check}`);
			copy.exec('VACUUM;');
		} finally {
			copy.close();
		}
		fs.chmodSync(tmp, 0o640);
		fs.renameSync(tmp, dest);
		// Rotacja: tylko zwykłe pliki kopii (dowiązania i inne pliki pomijane).
		const cutoff = Date.now() - keepDays * 24 * 3600 * 1000;
		for (const f of fs.readdirSync(dir)) {
			if (!/^quiz-.*\.db$/.test(f) || f === name) continue;
			const st = fs.lstatSync(path.join(dir, f));
			if (st.isFile() && st.mtimeMs < cutoff) fs.rmSync(path.join(dir, f));
		}
		console.log(JSON.stringify({ ok: true, file: name, bytes: fs.statSync(dest).size }));
		break;
	}
	case 'backup-status': {
		// Stan ostatniej kopii dla panelu: backup-status <ok|failed> <plik|-> <ok|failed|off>
		const [snapshot, file, drive] = [emailArg, rest[0], rest[1]];
		if (!['ok', 'failed'].includes(snapshot) || !['ok', 'failed', 'off'].includes(drive)) throw new Error('Użycie: backup-status <ok|failed> <plik|-> <ok|failed|off>');
		const dir = backupDir();
		let bytes = 0;
		let snapshotFile = '';
		if (file && /^quiz-\d{4}-\d{2}-\d{2}_\d{4}\.db$/.test(file)) {
			const st = fs.lstatSync(path.join(dir, file), { throwIfNoEntry: false });
			if (st?.isFile()) {
				bytes = st.size;
				snapshotFile = file;
			}
		}
		const status = { at: new Date().toISOString(), snapshotOk: snapshot === 'ok', snapshotFile, snapshotBytes: bytes, drive };
		const tmp = path.join(dir, `.status-${process.pid}.json`);
		fs.writeFileSync(tmp, JSON.stringify(status) + '\n', { mode: 0o640, flag: 'wx' });
		fs.renameSync(tmp, path.join(dir, 'status.json'));
		console.log(JSON.stringify(status));
		break;
	}
	default:
		console.log('Komendy: create-admin <email> "<Imię>", demo-quiz <email>, invite-link <email>, reset-2fa <email>, backup <plik.db> [dni], backup-status <ok|failed> <plik|-> <ok|failed|off>');
}
db.close();
