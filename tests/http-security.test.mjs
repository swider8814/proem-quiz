// Testy regresji bezpieczeństwa HTTP (osobny proces serwera, dane tymczasowe).
// Wymaga: npm run build.   Uruchom: node tests/http-security.test.mjs
import { generate } from 'otplib';
import { Browser, finish, makeAdmin, makeAuthor, makeMp3, ok, sleep, startServer, upload } from './_helpers.mjs';

const srv = await startServer();
const B = () => new Browser(srv.base);

try {
	// ── #1: zakodowane ścieżki nie omijają 2FA ─────────────────────────────
	{
		const { email, password } = await makeAdmin(srv, 'a1@proem.pl');
		const s = B();
		const r = await s.req('/login', { method: 'POST', form: { email, password } });
		ok(r.status === 303 && r.loc === '/login/2fa', '#1 hasło OK → wymagany kod (sesja pośrednia)');
		for (const p of ['/panel/users', '/%70anel/users', '/%70%61nel/users', '/panel/%75sers']) {
			const x = await s.req(p);
			ok(x.status === 303 && x.loc === '/login/2fa', `#1 GET ${p} bez kodu → /login/2fa (${x.status} ${x.loc})`);
		}
		for (const p of ['/panel/users?/invite', '/%70anel/users?/invite']) {
			const x = await s.req(p, { method: 'POST', form: { name: 'X', email: `x${Math.random()}@x.pl`, role: 'admin' } });
			ok(x.status === 303 && x.loc === '/login/2fa' && !/invite\//.test(x.text), `#1 POST ${p} bez kodu zablokowany`);
		}
		const api = await s.req('/%70anel/api/quizzes/x', { method: 'PUT', body: '{}', headers: { 'content-type': 'application/json', origin: 'https://evil.example' } });
		ok(api.status === 403, '#1 API pod zakodowaną ścieżką: kontrola Origin działa');
	}

	// ── #3: zaproszenie zużywane atomowo ──────────────────────────────────
	{
		const out = srv.cli('create-admin', 'a3@proem.pl', 'Race');
		const link = out.match(/\/invite\/[A-Za-z0-9_-]+/)[0];
		const pw = 'BardzoTajne123!';
		const results = await Promise.all(Array.from({ length: 6 }, () => B().req(link, { method: 'POST', form: { password: pw, repeat: pw } })));
		const wins = results.filter((r) => r.status === 303).length;
		ok(wins === 1, `#3 6 równoległych użyć zaproszenia → sukces dokładnie raz (${wins})`);

		// Link dla konta z włączonym TOTP (np. odzyskiwanie z konsoli) nie daje pełnej sesji.
		const { email } = await makeAdmin(srv, 'a3b@proem.pl');
		const out2 = srv.cli('invite-link', email);
		const link2 = out2.match(/\/invite\/[A-Za-z0-9_-]+/)[0];
		const att = B();
		const r = await att.req(link2, { method: 'POST', form: { password: 'NoweHaslo1234!', repeat: 'NoweHaslo1234!' } });
		ok(r.status === 303 && r.loc === '/login/2fa', '#3 zaproszenie dla konta z TOTP → nadal wymagany kod');
		const p = await att.req('/panel/users');
		ok(p.status === 303 && p.loc === '/login/2fa', '#3 bez kodu brak dostępu do panelu');
	}

	// ── #4: włączenie TOTP unieważnia inne sesje ──────────────────────────
	{
		const out = srv.cli('create-admin', 'a4@proem.pl', 'Sesje');
		const link = out.match(/\/invite\/[A-Za-z0-9_-]+/)[0];
		const pw = 'BardzoTajne123!';
		const s1 = B();
		const r1 = await s1.req(link, { method: 'POST', form: { password: pw, repeat: pw } });
		ok(r1.loc === '/panel/2fa-setup', '#4 nowy admin → konfiguracja 2FA');
		const s2 = B();
		await s2.req('/login', { method: 'POST', form: { email: 'a4@proem.pl', password: pw } });
		const before = await s2.req('/panel/users');
		ok(before.status === 303 && before.loc === '/panel/2fa-setup', '#4 druga sesja (samo hasło) ograniczona do konfiguracji');
		const oldCookie = s1.jar.pq_session;
		const page = await s1.req('/panel/2fa-setup');
		const secret = page.text.match(/<code class="copy[^>]*>([A-Z2-7 ]+)<\/code>/)[1].replace(/ /g, '');
		const done = await s1.req('/panel/2fa-setup', { method: 'POST', form: { code: await generate({ secret }) } });
		ok(done.status === 200 && s1.jar.pq_session !== oldCookie, '#4 po konfiguracji nowy token sesji');
		const after = await s2.req('/panel/users');
		ok(after.status === 303 && after.loc.startsWith('/login'), '#4 druga sesja po włączeniu TOTP nie ma dostępu');
		const s1ok = await s1.req('/panel/users');
		ok(s1ok.status === 200, '#4 osoba kończąca konfigurację ma pełny dostęp');
		const stale = new Browser(srv.base);
		stale.jar.pq_session = oldCookie;
		ok((await stale.req('/panel/users')).status === 303, '#4 stary token przestał działać');
	}

	// ── #5: równoległe próby nie omijają limitów ──────────────────────────
	{
		const { email, password, secret } = await makeAdmin(srv, 'a5@proem.pl');
		const results = await Promise.all(Array.from({ length: 40 }, () => B().req('/login', { method: 'POST', form: { email, password: 'zle-haslo-xyz' } })));
		const tried = results.filter((r) => r.status === 400).length;
		ok(tried <= 5, `#5 40 równoległych złych haseł → przetworzono ${tried} (limit 5)`);
		ok((await B().req('/login', { method: 'POST', form: { email, password } })).status === 429, '#5 po limicie nawet poprawne hasło czeka');

		// MFA: osobne konto, 30 równoległych złych kodów
		const m = await makeAdmin(srv, 'a5m@proem.pl');
		const s = B();
		await s.req('/login', { method: 'POST', form: { email: m.email, password: m.password } });
		const mfa = await Promise.all(Array.from({ length: 30 }, () => s.clone().req('/login/2fa', { method: 'POST', form: { mode: 'totp', code: '000000' } })));
		const checked = mfa.filter((r) => r.status === 400).length;
		ok(checked <= 5, `#5 30 równoległych złych kodów MFA → sprawdzono ${checked} (limit 5)`);
		void secret;
	}

	// ── #9: ten sam kod TOTP równolegle – dokładnie raz ───────────────────
	{
		const m = await makeAdmin(srv, 'a9@proem.pl');
		const s1 = B();
		const s2 = B();
		await s1.req('/login', { method: 'POST', form: { email: m.email, password: m.password } });
		await s2.req('/login', { method: 'POST', form: { email: m.email, password: m.password } });
		await sleep(31_000); // nowy krok czasu (kod z konfiguracji jest już zużyty)
		const code = await generate({ secret: m.secret });
		const [r1, r2] = await Promise.all([
			s1.req('/login/2fa', { method: 'POST', form: { mode: 'totp', code } }),
			s2.req('/login/2fa', { method: 'POST', form: { mode: 'totp', code } })
		]);
		const wins = [r1, r2].filter((r) => r.status === 303 && r.loc === '/panel').length;
		ok(wins === 1, `#9 ten sam kod w 2 sesjach równolegle → przeszedł ${wins} raz`);

		// ── #10: po MFA nowy token i ciasteczko na 30 dni ──
		const winner = r1.status === 303 ? r1 : r2;
		const cookie = winner.setCookies.find((c) => c.startsWith('pq_session='));
		const exp = new Date(cookie.match(/Expires=([^;]+)/i)[1]).getTime();
		ok(exp - Date.now() > 29 * 24 * 3600 * 1000, '#10 ciasteczko po MFA ważne ~30 dni');
		ok(/HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie) && /Secure/i.test(cookie), '#10 HttpOnly, SameSite=Lax, Secure');
	}

	// ── #8, #12: dostęp do mediów ─────────────────────────────────────────
	{
		const admin = (await makeAdmin(srv, 'a8@proem.pl')).browser;
		const anna = await makeAuthor(srv, admin, 'anna@proem.pl');
		const bob = await makeAuthor(srv, admin, 'bob@proem.pl');
		const up = await upload(anna, makeMp3(3), 'piosenka.mp3');
		const media = JSON.parse(up.text);
		ok(up.status === 200 && media.kind === 'audio', '#8 autor wgrał audio');
		ok((await anna.req(`/media/${media.id}`, { raw: true })).status === 200, '#8 właściciel odczytuje plik');
		ok((await bob.req(`/media/${media.id}`, { raw: true })).status === 404, '#8 inny autor NIE odczyta pliku po samym ID');
		ok((await B().req(`/media/${media.id}`, { raw: true })).status === 404, '#8 anonim nie odczyta audio');
		ok((await admin.req(`/media/${media.id}`, { raw: true })).status === 200, '#8 admin odczytuje plik');

		// Bob tworzy quiz i próbuje podpiąć cudze audio.
		const c = await bob.req('/panel?/create', { method: 'POST', form: { title: 'Quiz Boba' } });
		const quizId = c.loc.split('/').pop();
		const q = {
			title: 'Quiz Boba', description: null, themeId: null, locale: 'pl',
			settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
			questions: [{ type: 'audio', prompt: 'Jaka to piosenka?', promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1,
				data: { type: 'audio', answers: ['A', 'B'], correct: [0], audioMediaId: media.id, startMs: 0, endMs: 2000, loop: false, revealEndMs: null } }]
		};
		const save = await bob.req(`/panel/api/quizzes/${quizId}`, { method: 'PUT', body: JSON.stringify(q), headers: { 'content-type': 'application/json', accept: 'application/json' } });
		ok(save.status === 400 && /dostępu/.test(save.text), '#8 nie można przypisać cudzego audio do quizu');

		// Anna tworzy quiz ze swoim audio – zapis i wycięcie fragmentu działa.
		const c2 = await anna.req('/panel?/create', { method: 'POST', form: { title: 'Quiz Anny' } });
		const annaQuiz = c2.loc.split('/').pop();
		const s2 = await anna.req(`/panel/api/quizzes/${annaQuiz}`, { method: 'PUT', body: JSON.stringify({ ...q, title: 'Quiz Anny' }), headers: { 'content-type': 'application/json', accept: 'application/json' } });
		ok(s2.status === 200, '#8 właścicielka zapisuje quiz ze swoim audio');
		// Bob duplikuje? Nie ma dostępu – a admin może zduplikować i nadal odtworzy plik.
		const dup = await admin.req('/panel?/duplicate', { method: 'POST', form: { id: annaQuiz } });
		ok(dup.status === 303, '#8 admin duplikuje quiz');

		// Zdjęcie w pytaniu nie jest publiczne.
		const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
		const img = JSON.parse((await upload(anna, png, 'x.png')).text);
		const anon = await B().req(`/media/${img.id}`, { raw: true });
		ok(anon.status === 404, '#12 zdjęcie spoza motywów nie jest publiczne');
		const own = await anna.req(`/media/${img.id}`, { raw: true });
		ok(own.status === 200 && /private/.test(own.headers.get('cache-control')), '#12 prywatne pliki: Cache-Control private');
	}

	// ── #6: kontrolowane błędy przy przekroczeniu limitów mediów ──────────
	{
		const admin = (await makeAdmin(srv, 'a6@proem.pl')).browser;
		const big = await admin.req('/panel/api/media', { method: 'POST', body: 'x', headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(40 * 1024 * 1024), accept: 'application/json' } }).catch(() => ({ status: 413 }));
		ok(big.status === 413, '#6 zbyt duży upload odrzucony przed buforowaniem');
		const fake = await upload(admin, Buffer.from('to nie jest plik audio ani obraz.....'), 'x.mp3');
		ok(fake.status === 400, '#6 nierozpoznany plik → kontrolowany błąd 400');
		// Bardzo długi, ale malutki plik WAV (16 min, 1 kHz, 8 bit mono ≈ 1 MB) → odrzucony przez limit długości.
		const seconds = 16 * 60;
		const rate = 1000;
		const dataLen = seconds * rate;
		const wav = Buffer.alloc(44 + dataLen, 128);
		wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataLen, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
		wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24);
		wav.writeUInt32LE(rate, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(dataLen, 40);
		const long = await upload(admin, wav, 'dlugi.wav');
		ok(long.status === 400 && /za długi/.test(long.text), '#6 zbyt długie audio → kontrolowany błąd');
		const fs = await import('node:fs');
		const leftovers = fs.readdirSync(`${srv.dataDir}/media`).filter((f) => f.includes('.upload'));
		ok(leftovers.length === 0, '#6 brak plików częściowych po błędach');
	}

	ok(srv.alive(), 'serwer działa do końca testu');
} catch (e) {
	ok(false, `wyjątek w teście: ${e.stack}`);
} finally {
	srv.stop();
}
process.exit(finish() ? 1 : 0);
