// Tryb „tylko własny nick” na telefonie gracza: od razu pole do wpisania, bez losowania.
//   node tests/nick-own.e2e.mjs   (wymaga npm run build)
import { chromium, devices } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
	const { browser: admin } = await makeAdmin(srv, 'nick@proem.pl');
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Imiona' } });
	const id = c.loc.split('/').pop();
	const quiz = {
		title: 'Imiona', description: null, themeId: 'theme_proem', locale: 'pl',
		settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'custom-only', teamMode: false, lateJoin: true, phoneAnswerText: true },
		questions: [{ type: 'truefalse', prompt: 'Prawda?', promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1, data: { type: 'truefalse', correct: true, thumbs: false } }]
	};
	const save = await admin.req(`/panel/api/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(quiz), headers: { 'content-type': 'application/json', accept: 'application/json' } });
	ok(save.status === 200, 'quiz z trybem „tylko własny nick” zapisany');

	const hctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	await hctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const host = waitForHydration(await hctx.newPage());
	await host.goto(`${srv.base}/panel/quizzes/${id}/host`);
	await host.click('form[action="?/start"] button');
	await host.waitForSelector('.pin');
	const pin = (await host.textContent('.pin')).replace(/\s/g, '');

	const ph = waitForHydration(await (await browser.newContext({ ...devices['iPhone 14'] })).newPage());
	await ph.goto(`${srv.base}/play`);
	await ph.fill('#pin', pin);
	await ph.click('button:has-text("Dalej")');
	await ph.waitForSelector('input[aria-label="Twój nick"]');
	ok(!(await ph.isVisible('.nick-show')) && !(await ph.isVisible('text=Wylosuj inny')), 'telefon: od razu pole na imię, bez losowego nicka i losowania');
	ok(await ph.isDisabled('button:has-text("Dołącz do gry")'), 'telefon: bez wpisanego imienia nie da się dołączyć');
	await ph.fill('input[aria-label="Twój nick"]', 'Ania');
	await ph.click('button:has-text("Dołącz do gry")');
	await ph.waitForSelector('text=Jesteś w grze!');
	await host.waitForSelector('.player:has-text("Ania")');
	ok(true, 'gracz „Ania” widoczny u prowadzącego');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
