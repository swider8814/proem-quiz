// Slajd, ankieta i suwak w przeglądarce (prowadzący + telefon) oraz walidacja zapisu.
//   node tests/types-ui.e2e.mjs [katalog-na-zrzuty]   (wymaga npm run build i Chrome)
import fs from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { finish, makeAdmin, ok, sleep, startServer } from './_helpers.mjs';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const snap = async (p, name) => shots && p.screenshot({ path: `${shots}/${name}.png` });
const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });

try {
	const { browser: admin } = await makeAdmin(srv, 'typy@proem.pl');
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Typy' } });
	const quizId = c.loc.split('/').pop();
	const base = { promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1 };
	const body = (questions) => JSON.stringify({
		title: 'Typy', description: null, themeId: 'theme_proem', locale: 'pl',
		settings: { defaultTimeLimit: 20, countdown: 0, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
		questions
	});
	const json = { 'content-type': 'application/json', accept: 'application/json' };
	const slider = (d, prompt = 'Ile dni ma grudzień?') => ({ ...base, type: 'slider', prompt, data: { type: 'slider', min: 0, max: 100, step: 1, correct: 31, margin: 'low', unit: 'dni', ...d } });
	const put = (qs) => admin.req(`/panel/api/quizzes/${quizId}`, { method: 'PUT', headers: json, body: body(qs) });
	let r = await put([slider({ min: 100, max: 0 })]);
	ok(r.status === 400 && /maksimum/.test(r.text), 'suwak: odwrócony zakres odrzucony');
	r = await put([slider({ correct: 31.5 })]);
	ok(r.status === 400 && /na kroku/.test(r.text), 'suwak: wartość poza krokiem odrzucona');
	r = await put([slider({ step: 0.001, max: 1000 })]);
	ok(r.status === 400, 'suwak: zbyt wiele kroków odrzucone');
	r = await put([{ ...base, type: 'poll', prompt: 'Ankieta', data: { type: 'poll', answers: ['A', ''] } }]);
	ok(r.status === 400, 'ankieta: pusta odpowiedź odrzucona');
	r = await put([
		{ ...base, type: 'slide', prompt: 'Witajcie na quizie!', data: { type: 'slide', text: 'Za chwilę pierwsze pytanie.\nPowodzenia!' } },
		{ ...base, type: 'poll', prompt: 'Która kolęda podobała się najbardziej?', data: { type: 'poll', answers: ['Cicha noc', 'Lulajże, Jezuniu', 'Bóg się rodzi'] } },
		slider({})
	]);
	ok(r.status === 200, 'quiz ze slajdem, ankietą i suwakiem zapisany');

	const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
	await hostCtx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const host = await hostCtx.newPage();
	const errors = [];
	host.on('pageerror', (e) => errors.push(String(e)));
	await host.goto(`${srv.base}/panel/quizzes/${quizId}/host`);
	await host.click('form[action="?/start"] button');
	await host.waitForSelector('.pin');
	const pin = (await host.textContent('.pin')).replace(/\s/g, '');
	const phone = await (await browser.newContext({ ...devices['iPhone 14'] })).newPage();
	phone.on('pageerror', (e) => errors.push(String(e)));
	await phone.goto(`${srv.base}/play?pin=${pin}`);
	await phone.click('button:has-text("Dołącz do gry")');
	await phone.waitForSelector('text=Jesteś w grze!');

	await host.keyboard.press('Space');
	await host.waitForSelector('.slide-title');
	await phone.waitForSelector('text=Patrz na ekran');
	ok((await host.textContent('.controls')).includes('Dalej'), 'slajd: przycisk „Dalej” (bez „Zakończ pytanie”)');
	await sleep(700);
	await snap(host, 'typ-01-slajd');

	await host.keyboard.press('Space');
	await phone.waitForSelector('.tiles .g-tile');
	await phone.click('.g-tile.a1');
	await phone.waitForSelector('text=Twój głos jest policzony.');
	await host.waitForSelector('.dist .pct');
	ok((await host.textContent('.dist')).includes('100%'), 'ankieta: procenty na ekranie');
	ok((await host.$$('.answers .g-tile.dim')).length === 0, 'ankieta: żadna odpowiedź nie jest „zła”');
	await sleep(800);
	await snap(host, 'typ-02-ankieta');
	await snap(phone, 'typ-03-ankieta-telefon');

	await host.keyboard.press('Space'); // ranking
	await host.keyboard.press('Space'); // suwak
	await phone.waitForSelector('input.range');
	await host.waitForSelector('.big-range');
	await phone.$eval('input.range', (el) => {
		el.value = '33';
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
	ok((await phone.textContent('.slider-val')).includes('33'), 'suwak: wartość widoczna na telefonie');
	await snap(phone, 'typ-04-suwak-telefon');
	await phone.click('button:has-text("Wyślij")');
	await phone.waitForSelector('text=Dobrze!');
	await host.waitForSelector('.slider-res');
	ok((await host.textContent('.slider-res')).includes('31'), 'suwak: poprawna wartość na ekranie');
	await sleep(700);
	await snap(host, 'typ-05-suwak-wynik');
	ok(errors.length === 0, `brak błędów JS ${errors.join(' | ')}`);
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
