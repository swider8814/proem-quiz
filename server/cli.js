// Narzędzia administracyjne z konsoli serwera.
//   docker compose exec app node server/cli.js create-admin jan@proem.pl "Jan Kowalski"
//   docker compose exec app node server/cli.js invite-link jan@proem.pl
//   docker compose exec app node server/cli.js reset-2fa jan@proem.pl
//   docker compose exec app node server/cli.js backup /data/backup/quiz-2026-12-16.db
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
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
	case 'backup': {
		// Spójna kopia działającej bazy (SQLite online backup), bez sesji logowania.
		const dest = emailArg;
		if (!dest || !dest.endsWith('.db')) throw new Error('Użycie: backup <plik.db>');
		const destDir = path.resolve(path.dirname(dest));
		if (!destDir.startsWith(path.resolve(DATA_DIR) + path.sep)) throw new Error('Kopia musi trafić do katalogu danych (np. /data/backup).');
		fs.mkdirSync(destDir, { recursive: true, mode: 0o750 });
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
		const stat = fs.statSync(dest);
		console.log(JSON.stringify({ ok: true, file: dest, bytes: stat.size }));
		break;
	}
	default:
		console.log('Komendy: create-admin <email> "<Imię>", invite-link <email>, reset-2fa <email>, backup <plik.db>');
}
db.close();
