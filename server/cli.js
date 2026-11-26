// Narzędzia administracyjne z konsoli serwera.
//   docker compose exec app node server/cli.js create-admin jan@proem.pl "Jan Kowalski"
//   docker compose exec app node server/cli.js invite-link jan@proem.pl
//   docker compose exec app node server/cli.js reset-2fa jan@proem.pl
//   docker compose exec app node server/cli.js backup /data/backup/quiz-2026-12-16.db
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';
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
		execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '96k', '-f', 'mp3', path.join(mediaDir, `${file}.part`)]);
		fs.renameSync(path.join(mediaDir, `${file}.part`), path.join(mediaDir, file));
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
	execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '0', '-t', String(DEMO_CLIP_MS / 1000), '-i', path.join(mediaDir, file), '-codec:a', 'libmp3lame', '-b:a', '96k', '-f', 'mp3', path.join(mediaDir, `${clipFile}.part`)]);
	fs.renameSync(path.join(mediaDir, `${clipFile}.part`), path.join(mediaDir, clipFile));
	fs.chmodSync(path.join(mediaDir, clipFile), 0o640);
	insert.run(clipId, ownerId, 'audio', 'Cicha noc – fragment.mp3', clipFile, DEMO_CLIP_MS, fs.statSync(path.join(mediaDir, clipFile)).size);
	return { id: mediaId, clipId, durationMs };
}

/** Obrazek PNG 128×128: bombka w danym kolorze (do przykładowego pytania z obrazkami). */
function demoBauble(ownerId, name, [r, g, b]) {
	const W = 128;
	const raw = Buffer.alloc(W * (1 + W * 4));
	for (let y = 0; y < W; y++) {
		raw[y * (1 + W * 4)] = 0;
		for (let x = 0; x < W; x++) {
			const o = y * (1 + W * 4) + 1 + x * 4;
			const dx = x - 64, dy = y - 74;
			const d = Math.sqrt(dx * dx + dy * dy);
			let px = [255, 255, 255, 0];
			if (x >= 54 && x <= 74 && y >= 18 && y <= 32) px = [190, 160, 60, 255]; // zawieszka
			if (d <= 44) {
				const shine = Math.max(0, 1 - Math.hypot(x - 48, y - 58) / 22); // odblask
				px = [Math.min(255, r + shine * 140), Math.min(255, g + shine * 140), Math.min(255, b + shine * 140), 255];
			}
			raw.set(px, o);
		}
	}
	const chunk = (type, data) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const td = Buffer.concat([Buffer.from(type), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(zlib.crc32(td) >>> 0);
		return Buffer.concat([len, td, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(W, 0);
	ihdr.writeUInt32BE(W, 4);
	ihdr.set([8, 6, 0, 0, 0], 8);
	const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
	const mediaId = id('med');
	const file = `${mediaId}.png`;
	const dir = path.join(DATA_DIR, 'media');
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, `${file}.part`), png, { mode: 0o640 });
	fs.renameSync(path.join(dir, `${file}.part`), path.join(dir, file));
	db.prepare('INSERT INTO media (id, owner_id, kind, original_name, file, duration_ms, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(mediaId, ownerId, 'image', name, file, null, png.length);
	return mediaId;
}

const STAMPED = /^quiz-\d{4}-\d{2}-\d{2}_\d{4}\.db$/;
const MEDIA_FILE = /^med_[A-Za-z0-9_-]{10,20}\.(mp3|png|jpe?g|webp|gif)$/;

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
		// Przykładowe quizy do próby: PL i EN (z polskim drugim wierszem) oraz pokaz nowych typów pytań.
		const user = emailArg && findUser(emailArg);
		if (!user) throw new Error('Użycie: demo-quiz <email istniejącego konta>');
		const theme = db.prepare('SELECT id FROM themes WHERE is_default = 1').get()?.id ?? null;
		const settings = JSON.stringify({ defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true });
		const melody = demoMelody(user.id);
		const audio = (answers) => ({ type: 'audio', answers, correct: [0], audioMediaId: melody.id, clipMediaId: melody.clipId, startMs: 0, endMs: DEMO_CLIP_MS, loop: false, revealEndMs: Math.min(melody.durationMs, 28_000) });
		const make = (title, locale, questions, extra = {}) => {
			const quizId = id('quiz');
			db.transaction(() => {
				db.prepare('INSERT INTO quizzes (id, owner_id, title, theme_id, locale, settings) VALUES (?, ?, ?, ?, ?, ?)').run(quizId, user.id, title, theme, locale, JSON.stringify({ ...JSON.parse(settings), ...extra }));
				questions.forEach((q, i) =>
					db.prepare('INSERT INTO questions (id, quiz_id, position, type, prompt, prompt_translation, image_media_id, time_limit, points_multiplier, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
						.run(id('qst'), quizId, i, q.data.type, q.prompt, q.tr ?? null, q.image ?? null, q.time ?? 20, q.points ?? 1, JSON.stringify(q.data))
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
		const baubles = [
			['czerwona', [200, 20, 40]],
			['zielona', [20, 140, 60]],
			['niebieska', [30, 80, 200]],
			['złota', [200, 150, 20]]
		].map(([n, c]) => demoBauble(user.id, `Bombka ${n}.png`, c));
		make('Przykład – nowe typy pytań', 'pl', [
			{ prompt: 'Witajcie na świątecznym quizie!', data: { type: 'slide', text: 'Zeskanujcie kod QR telefonem i wybierzcie swoją postać.\nZaczynamy za chwilę!' } },
			{ prompt: 'Która bombka jest zielona?', data: { type: 'choice', answers: ['', '', '', ''], correct: [1], images: baubles } },
			{ prompt: 'Święty Mikołaj nosi czerwony strój.', data: { type: 'truefalse', correct: true, thumbs: true } },
			{ prompt: 'Ile dni ma grudzień?', time: 25, data: { type: 'slider', min: 0, max: 60, step: 1, correct: 31, margin: 'low', unit: 'dni' } },
			{ prompt: 'Która kolęda podoba Ci się najbardziej?', data: { type: 'poll', answers: ['Cicha noc', 'Wśród nocnej ciszy', 'Lulajże, Jezuniu', 'Bóg się rodzi'] } }
		]);
		// Pełny pokaz: każdy typ pytania i warianty (obrazek pytania, obrazki odpowiedzi, kilka poprawnych,
		// kciuki, ankieta z obrazkami, punkty ×2, slajdy), odliczanie, muzyka i dźwięk podium.
		const star = demoBauble(user.id, 'Bombka fioletowa.png', [120, 40, 170]);
		make('Pełny pokaz – wszystkie typy pytań', 'pl', [
			{ prompt: 'Witajcie na quizie!', data: { type: 'slide', text: 'Zeskanujcie kod QR, wpiszcie ksywkę i wybierzcie swoje zwierzątko.\nZa chwilę pierwsze pytanie!' } },
			{ prompt: 'Jaka to kolęda?', data: audio(['Cicha noc', 'Wśród nocnej ciszy', 'Lulajże, Jezuniu', 'Bóg się rodzi']) },
			{ prompt: 'Jakiego koloru jest ta bombka?', image: star, data: { type: 'choice', answers: ['Czerwona', 'Fioletowa', 'Zielona', 'Złota'], correct: [1] } },
			{ prompt: 'Która bombka jest niebieska?', data: { type: 'choice', answers: ['', '', '', ''], correct: [2], images: baubles } },
			{ prompt: 'Wskaż jeden z darów Mędrców (kilka odpowiedzi jest dobrych)', data: { type: 'choice', answers: ['Złoto', 'Srebro', 'Kadzidło', 'Mirra'], correct: [0, 2, 3] } },
			{ prompt: 'Wigilia to wieczór 24 grudnia.', data: { type: 'truefalse', correct: true } },
			{ prompt: 'Renifery Mikołaja mieszkają na pustyni.', data: { type: 'truefalse', correct: false, thumbs: true } },
			{ prompt: 'Co dzielimy przy wigilijnym stole?', time: 30, data: { type: 'text', accepted: ['opłatek', 'opłatkiem'], typoTolerance: 1 } },
			{ prompt: 'Ułóż od najwcześniejszego', time: 30, data: { type: 'order', items: ['Adwent', 'Wigilia', 'Boże Narodzenie', 'Trzech Króli'], partialCredit: true } },
			{ prompt: 'W którym roku pierwszy raz zaśpiewano „Cichą noc”?', time: 30, data: { type: 'slider', min: 1700, max: 1900, step: 1, correct: 1818, margin: 'medium', unit: '' } },
			{ prompt: 'Krótka przerwa', data: { type: 'slide', text: 'Brawo! Za chwilę dwie ankiety (bez punktów) i pytanie finałowe za podwójne punkty.' } },
			{ prompt: 'Która bombka podoba Ci się najbardziej?', points: 0, data: { type: 'poll', answers: ['', '', '', ''], images: baubles } },
			{ prompt: 'Jaką kolędę lubisz śpiewać najbardziej?', points: 0, data: { type: 'poll', answers: ['Cicha noc', 'Wśród nocnej ciszy', 'Lulajże, Jezuniu', 'Bóg się rodzi'] } },
			{ prompt: 'FINAŁ ×2: Ile potraw tradycyjnie jest na wigilijnym stole?', points: 2, data: { type: 'choice', answers: ['7', '10', '12', '24'], correct: [2] } }
		], { countdown: 5, music: 'lounge', podiumSound: 'triumph' });
		console.log('Pytanie audio: melodia „Cicha noc” (F. X. Gruber, 1818 – domena publiczna), wygenerowana syntezatorem.');
		break;
	}
	case 'backup': {
		// Spójna kopia: baza (SQLite online backup, bez sesji) + migawka plików z tej samej chwili
		// (twarde dowiązania – bez dodatkowego miejsca), w DATA_DIR/backup. Plus usunięcie kopii starszych
		// niż N dni. Wszystko jako użytkownik aplikacji – root na serwerze niczego tu nie zapisuje ani nie kasuje.
		const name = emailArg;
		if (!name || !STAMPED.test(name)) throw new Error('Użycie: backup quiz-RRRR-MM-DD_GGMM.db [dni-przechowywania]');
		const keepDays = Math.min(Math.max(Number(rest[0] ?? 7) || 7, 1), 365);
		const dir = backupDir();
		const dest = path.join(dir, name);
		const snapDir = path.join(dir, name.replace(/^quiz-/, 'media-').replace(/\.db$/, ''));
		fs.mkdirSync(snapDir, { recursive: true, mode: 0o750 });
		if (!fs.lstatSync(snapDir).isDirectory()) throw new Error('Katalog migawki plików nie jest katalogiem');
		const mediaSrc = path.join(DATA_DIR, 'media');
		// Pliki są niezmienne (publikowane atomowo pod unikalną nazwą), więc dowiązanie = stan pliku na zawsze.
		// Dowiązujemy przed i po kopii bazy: każdy plik, na który wskazuje baza, trafi do migawki.
		const linkAll = () => {
			if (!fs.existsSync(mediaSrc)) return;
			for (const f of fs.readdirSync(mediaSrc)) {
				if (!MEDIA_FILE.test(f)) continue;
				const src = path.join(mediaSrc, f);
				const dst = path.join(snapDir, f);
				if (!fs.lstatSync(src).isFile() || fs.existsSync(dst)) continue;
				try {
					fs.linkSync(src, dst);
				} catch (e) {
					if (e.code !== 'ENOENT') throw e; // plik usunięty w międzyczasie – nie był już potrzebny
				}
			}
		};
		linkAll();
		const tmp = `${dest}.tmp`;
		fs.rmSync(tmp, { force: true });
		await db.backup(tmp);
		linkAll();
		const copy = new Database(tmp);
		let missing = 0;
		try {
			copy.exec('DELETE FROM sessions;');
			// Jednorazowe linki (aktywacja konta, reset hasła), które nie zostały jeszcze użyte: po odtworzeniu
			// kopii link zużyty już PO jej wykonaniu znów byłby ważny (do pierwotnego terminu). W kopii ich nie ma –
			// po odtworzeniu admin wysyła nowe zaproszenie, a reset hasła zamawia się ponownie.
			copy.exec('DELETE FROM invites WHERE used_at IS NULL;');
			const check = copy.pragma('integrity_check', { simple: true });
			if (check !== 'ok') throw new Error(`Kopia uszkodzona: ${check}`);
			for (const r of copy.prepare('SELECT file FROM media').all()) {
				if (!fs.existsSync(path.join(snapDir, path.basename(r.file)))) missing++;
			}
			copy.exec('VACUUM;');
		} finally {
			copy.close();
		}
		if (missing) {
			// Kopia, w której baza wskazuje brakujące pliki, nie nadaje się do odtworzenia – nie publikujemy jej.
			fs.rmSync(tmp, { force: true });
			throw new Error(`Kopia przerwana: ${missing} plików wskazanych w bazie nie ma na dysku serwera.`);
		}
		fs.chmodSync(tmp, 0o640);
		fs.renameSync(tmp, dest);
		// Rotacja po dacie w nazwie: tylko zwykłe pliki kopii i katalogi migawek (dowiązania pomijane).
		const cutoff = Date.now() - keepDays * 24 * 3600 * 1000;
		for (const f of fs.readdirSync(dir)) {
			const m = f.match(/^(?:quiz|media)-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(?:\.db)?$/);
			if (!m || f === name || path.join(dir, f) === snapDir) continue;
			const when = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
			if (!(when < cutoff)) continue;
			const st = fs.lstatSync(path.join(dir, f));
			if (st.isFile() && f.endsWith('.db')) fs.rmSync(path.join(dir, f));
			else if (st.isDirectory() && !f.endsWith('.db')) fs.rmSync(path.join(dir, f), { recursive: true });
		}
		console.log(JSON.stringify({ ok: true, file: name, media: path.basename(snapDir), bytes: fs.statSync(dest).size, missingMedia: missing }));
		break;
	}
	case 'backup-status': {
		// Stan ostatniej kopii dla panelu: backup-status <ok|failed> <plik|-> <ok|failed|off>
		const [snapshot, file, drive] = [emailArg, rest[0], rest[1]];
		if (!['ok', 'failed'].includes(snapshot) || !['ok', 'failed', 'off'].includes(drive)) throw new Error('Użycie: backup-status <ok|failed> <plik|-> <ok|failed|off>');
		const dir = backupDir();
		let bytes = 0;
		let snapshotFile = '';
		if (file && STAMPED.test(file)) {
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
