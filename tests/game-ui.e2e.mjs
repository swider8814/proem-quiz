// Pełna gra w prawdziwej przeglądarce: prowadzący + 3 telefony (iPhone).   node tests/game-ui.e2e.mjs [katalog-na-zrzuty]
// Wymaga: npm run build oraz Chrome/Chromium (CHROME_PATH lub /usr/bin/google-chrome).
import fs from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { finish, makeAdmin, makeMp3, ok, sleep, startServer, upload } from './_helpers.mjs';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = await startServer();
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
	args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox']
});
const snap = async (p, name) => shots && p.screenshot({ path: `${shots}/${name}.png` });

try {
	// ── Przygotowanie: admin + quiz z 5 typami pytań ─────────────────────
	const { browser: admin } = await makeAdmin(srv, 'host@proem.pl');
	const audio = JSON.parse((await upload(admin, makeMp3(4), 'koleda.mp3')).text);
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Wigilia – test' } });
	const quizId = c.loc.split('/').pop();
	const base = { promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1 };
	const quiz = {
		title: 'Wigilia – test', description: null, themeId: 'theme_proem', locale: 'pl',
		settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
		questions: [
			{ ...base, type: 'audio', prompt: 'Jaka to kolęda?', promptTranslation: 'Which carol is this?', data: { type: 'audio', answers: ['Cicha noc', 'Wśród nocnej ciszy', 'Lulajże, Jezuniu', 'Dzisiaj w Betlejem'], correct: [0], audioMediaId: audio.id, startMs: 500, endMs: 3500, loop: false, revealEndMs: null } },
			{ ...base, type: 'truefalse', prompt: 'Boże Narodzenie jest 25 grudnia', data: { type: 'truefalse', correct: true } },
			{ ...base, type: 'text', prompt: 'Jak ma na imię renifer z czerwonym nosem?', data: { type: 'text', accepted: ['Rudolf', 'Rudolph'], typoTolerance: 1 } },
			{ ...base, type: 'order', prompt: 'Ułóż zdanie', data: { type: 'order', items: ['I', 'love', 'Christmas'], partialCredit: false } }
		]
	};
	const save = await admin.req(`/panel/api/quizzes/${quizId}`, { method: 'PUT', body: JSON.stringify(quiz), headers: { 'content-type': 'application/json', accept: 'application/json' } });
	ok(save.status === 200, 'quiz zapisany (z wycięciem fragmentu audio)');

	// ── Prowadzący ────────────────────────────────────────────────────────
	const hostCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
	await hostCtx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const host = await hostCtx.newPage();
	const hostErrors = [];
	host.on('pageerror', (e) => hostErrors.push(String(e)));
	host.on('console', (m) => m.type() === 'error' && hostErrors.push(m.text()));
	await host.goto(`${srv.base}/panel/quizzes/${quizId}/host`);
	await host.click('form[action="?/start"] button');
	await host.waitForSelector('.pin');
	const pin = (await host.textContent('.pin')).replace(/\s/g, '');
	ok(/^\d{6}$/.test(pin), `gra uruchomiona, PIN ${pin}`);

	// ── 3 telefony ────────────────────────────────────────────────────────
	const phones = [];
	for (let i = 0; i < 3; i++) {
		const ctx = await browser.newContext({ ...devices['iPhone 14'] });
		const p = await ctx.newPage();
		p.errors = [];
		p.on('pageerror', (e) => p.errors.push(String(e)));
		phones.push(p);
	}
	// Telefon 1: PIN wpisany ręcznie, własny nick
	await phones[0].goto(`${srv.base}/play`);
	await snap(phones[0], '01-telefon-pin');
	await phones[0].fill('#pin', pin);
	await phones[0].click('button:has-text("Dalej")');
	await phones[0].waitForSelector('.nick-show');
	await snap(phones[0], '02-telefon-nick');
	await phones[0].click('text=albo wpisz własny');
	await phones[0].fill('input[aria-label="Twój nick"]', 'Kasia');
	await phones[0].click('button:has-text("Dołącz do gry")');
	await phones[0].waitForSelector('text=Jesteś w grze!');
	// Telefon 2: z kodu QR (PIN w adresie), losowy nick
	await phones[1].goto(`${srv.base}/play?pin=${pin}`);
	await phones[1].waitForSelector('.nick-show');
	await phones[1].click('button:has-text("Dołącz do gry")');
	await phones[1].waitForSelector('text=Jesteś w grze!');
	// Telefon 3: wulgarny nick odrzucony, potem poprawny
	await phones[2].goto(`${srv.base}/play?pin=${pin}`);
	await phones[2].click('text=albo wpisz własny');
	await phones[2].fill('input[aria-label="Twój nick"]', 'kurwa');
	await phones[2].click('button:has-text("Dołącz do gry")');
	await phones[2].waitForSelector('text=Wybierz inny nick.');
	ok(true, 'wulgarny nick odrzucony w interfejsie');
	await phones[2].fill('input[aria-label="Twój nick"]', 'Ola');
	await phones[2].click('button:has-text("Dołącz do gry")');
	await phones[2].waitForSelector('text=Jesteś w grze!');
	await snap(phones[2], '03-telefon-poczekalnia');

	await host.waitForFunction(() => document.querySelectorAll('.players .player').length === 3);
	ok(true, 'prowadzący widzi 3 graczy');
	await snap(host, '04-prowadzacy-poczekalnia');

	// ── Pytanie 1: audio ──────────────────────────────────────────────────
	await host.click('button:has-text("Zaczynamy")');
	await phones[0].waitForSelector('.tiles .g-tile', { timeout: 10000 });
	await host.waitForSelector('.eq');
	await sleep(500);
	const audioPlaying = await host.evaluate(() => !!document.querySelector('.eq.on'));
	ok(audioPlaying, 'fragment audio gra u prowadzącego');
	await snap(host, '05-prowadzacy-audio');
	await snap(phones[0], '06-telefon-pytanie-audio');
	await phones[0].click('.g-tile.a0'); // Cicha noc – dobrze
	await phones[1].click('.g-tile.a1');
	await phones[2].click('.g-tile.a0');
	await phones[0].waitForSelector('text=Dobrze!');
	await phones[1].waitForSelector('text=Niestety źle');
	ok(true, 'wszyscy odpowiedzieli → wynik od razu (bez czekania na koniec czasu)');
	await snap(phones[0], '07-telefon-dobrze');
	await snap(phones[1], '08-telefon-zle');
	await snap(host, '09-prowadzacy-wyniki');

	const nextQ = async () => {
		await host.keyboard.press('Space'); // ranking
		await host.waitForSelector('.board');
		await host.keyboard.press('Space'); // kolejne pytanie
		await phones[0].waitForSelector('.prompt');
		await phones[0].waitForFunction(() => !document.body.innerText.includes('Przygotuj się'), null, { timeout: 8000 });
	};

	// ── Pytanie 2: prawda/fałsz ───────────────────────────────────────────
	await nextQ();
	for (const p of phones) await p.click('button:has-text("Prawda")');
	await phones[0].waitForSelector('text=Dobrze!');
	ok(true, 'prawda/fałsz działa');
	await host.waitForSelector('.dist .barv');
	const tfBars = await host.$$eval('.dist .barv', (els) => els.map((e) => ({ cls: e.className, h: parseFloat(e.style.height), dim: e.classList.contains('dim') })));
	const tallest = tfBars.reduce((a, b) => (b.h > a.h ? b : a));
	ok(/\ba1\b/.test(tallest.cls) && !tallest.dim, `słupek „Prawda” ma kolor kafla „Prawda” (a1) i jest wyróżniony: ${JSON.stringify(tfBars)}`);

	// ── Pytanie 3: tekst ──────────────────────────────────────────────────
	await nextQ();
	await snap(phones[0], '10-telefon-tekst');
	await phones[0].fill('input[aria-label="Wpisz odpowiedź"]', 'rudolf');
	await phones[0].click('button:has-text("Wyślij")');
	await phones[1].fill('input[aria-label="Wpisz odpowiedź"]', 'Kometa');
	await phones[1].click('button:has-text("Wyślij")');
	await phones[2].fill('input[aria-label="Wpisz odpowiedź"]', 'Rudolff');
	await phones[2].click('button:has-text("Wyślij")');
	await phones[2].waitForSelector('text=Dobrze!');
	ok(true, 'odpowiedź tekstowa z literówką zaliczona');

	// ── Pytanie 4: kolejność ──────────────────────────────────────────────
	await nextQ();
	for (const p of phones) {
		for (const w of ['I', 'love', 'Christmas']) await p.locator('.order-btn', { hasText: new RegExp(`^\\s*${w}\\s*$`) }).click();
	}
	await snap(phones[0], '11-telefon-kolejnosc');
	for (const p of phones) await p.click('button:has-text("Wyślij")');
	await phones[0].waitForSelector('text=Dobrze!');
	ok(true, 'pytanie „kolejność” działa');

	// ── Koniec ────────────────────────────────────────────────────────────
	await host.keyboard.press('Space'); // ranking
	await host.waitForSelector('.board');
	await host.keyboard.press('Space'); // podium
	await host.waitForSelector('.podium');
	await phones[0].waitForSelector('text=Koniec gry!');
	await snap(host, '12-prowadzacy-podium');
	await snap(phones[0], '13-telefon-koniec');
	const first = await host.textContent('.step.s1 .who');
	ok(first === 'Kasia', `zwyciężczyni na podium: ${first}`);

	// ── Odświeżenie telefonu w trakcie gry nie gubi gracza ───────────────
	await phones[1].reload();
	await phones[1].waitForSelector('text=Koniec gry!');
	ok(true, 'po odświeżeniu telefon wraca do gry');

	ok(hostErrors.length === 0, `brak błędów JS u prowadzącego ${hostErrors.join(' | ')}`);
	ok(phones.every((p) => p.errors.length === 0), `brak błędów JS na telefonach ${phones.flatMap((p) => p.errors).join(' | ')}`);
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
