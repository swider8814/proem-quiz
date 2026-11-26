// Tablet przy telewizorze: manifest i ikony do „Dodaj do ekranu głównego”, przycisk „Pełny ekran”
// tylko tam, gdzie przeglądarka pozwala na pełny ekran (iPhone – nie).
//   node tests/tablet.e2e.mjs   (wymaga npm run build)
import { chromium } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
	// Manifest i ikony są publiczne (bez logowania) i poprawne
	const m = await fetch(`${srv.base}/manifest.webmanifest`);
	const man = await m.json();
	ok(m.status === 200 && man.display === 'fullscreen' && man.start_url === '/panel', `manifest: ${m.status}, display ${man.display}`);
	for (const i of man.icons) {
		const r = await fetch(srv.base + i.src);
		ok(r.status === 200 && (r.headers.get('content-type') ?? '').startsWith(i.type.split('+')[0]), `ikona ${i.src}: ${r.status} ${r.headers.get('content-type')}`);
	}
	const apple = await fetch(`${srv.base}/icons/apple-touch-icon.png`);
	ok(apple.status === 200, 'apple-touch-icon dla iPada');
	const html = await (await fetch(`${srv.base}/login`)).text();
	ok(html.includes('rel="manifest"') && html.includes('rel="apple-touch-icon"') && html.includes('/icons/icon.svg'), 'strona linkuje manifest, ikonę iPada i favicon');

	const { browser: admin } = await makeAdmin(srv, 'tablet@proem.pl');
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Tablet' } });
	const id = c.loc.split('/').pop();
	const quiz = { title: 'Tablet', description: null, themeId: 'theme_proem', locale: 'pl',
		settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
		questions: [{ type: 'truefalse', prompt: 'P?', promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1, data: { type: 'truefalse', correct: true, thumbs: false } }] };
	await admin.req(`/panel/api/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(quiz), headers: { 'content-type': 'application/json', accept: 'application/json' } });

	for (const supported of [true, false]) {
		const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
		// Bez obsługi: jak Safari na iPhonie (fullscreenEnabled = false, brak webkit*).
		if (!supported) await ctx.addInitScript(() => { for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(Document.prototype, k, { get: () => false }); });
		await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
		const p = waitForHydration(await ctx.newPage());
		await p.goto(`${srv.base}/panel/quizzes/${id}/host`);
		await p.click('form[action="?/start"] button');
		await p.waitForSelector('.pin');
		const has = await p.isVisible('.controls button:has-text("Pełny ekran")');
		ok(has === supported, supported ? 'tablet z pełnym ekranem: przycisk widoczny' : 'bez pełnego ekranu (iPhone): przycisk schowany');
		if (supported) {
			await p.click('.controls button:has-text("Pełny ekran")');
			await p.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 3000 }).catch(() => {});
			ok(await p.evaluate(() => !!document.fullscreenElement), 'przycisk włącza pełny ekran');
		}
		await ctx.close();
	}
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
