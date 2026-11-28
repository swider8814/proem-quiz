// Konflikt zapisu w edytorze: ktoś zapisał quiz w drugiej karcie – edytor pyta, zanim nadpisze, i nie gubi zmian.
//   node tests/quiz-conflict.e2e.mjs   (wymaga npm run build)
import { chromium } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration, appDialogs } from './_helpers.mjs';

const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const json = { 'content-type': 'application/json', accept: 'application/json' };
const body = (title) => JSON.stringify({
	title, description: null, themeId: null, locale: 'pl',
	settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
	questions: [{ type: 'choice', prompt: '2+2?', promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1, data: { type: 'choice', answers: ['3', '4'], correct: [1] } }]
});
try {
	const { browser: admin } = await makeAdmin(srv, 'konflikt@proem.pl');
	const created = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Quiz' } });
	const id = created.loc.split('/').pop();
	await admin.req(`/panel/api/quizzes/${id}`, { method: 'PUT', body: body('Start'), headers: json });

	const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
	await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const p = waitForHydration(await ctx.newPage());
	const dialogs = [];
	let answer = false;
	(await appDialogs(p)).on('dialog', (d) => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
	await p.goto(`${srv.base}/panel/quizzes/${id}`);
	await p.fill('input.title', 'Moja wersja');

	// W tym czasie ktoś zapisuje quiz w innej karcie.
	await admin.req(`/panel/api/quizzes/${id}`, { method: 'PUT', body: body('Zmiana z drugiej karty'), headers: json });

	await Promise.all([p.waitForResponse((r) => r.request().method() === 'PUT'), p.click('button.save')]);
	await p.waitForTimeout(300);
	ok(dialogs.length === 1 && /zastąpić/.test(dialogs[0]), 'edytor pyta przed nadpisaniem cudzych zmian');
	ok((await p.inputValue('input.title')) === 'Moja wersja', 'po „Anuluj” zmiany zostają w edytorze');
	const server1 = await admin.req(`/panel/quizzes/${id}`);
	ok(server1.text.includes('Zmiana z drugiej karty') && !server1.text.includes('Moja wersja'), 'po „Anuluj” nic nie zapisano');
	ok(await p.isVisible('text=Ktoś inny zapisał ten quiz'), 'komunikat o konflikcie widoczny');

	answer = true;
	// Wymuszony zapis spowolniony o 1,5 s: przez cały ten czas przycisk zapisu ma być zablokowany (review Codexa –
	// inaczej drugi zapis mógłby wejść pomiędzy i zostać nadpisany starszą migawką).
	await p.route(`**/panel/api/quizzes/${id}`, async (route) => {
		if (route.request().method() === 'PUT' && !('expectedVersion' in JSON.parse(route.request().postData() ?? '{}'))) await new Promise((r) => setTimeout(r, 1500));
		await route.continue();
	});
	const forced = p.waitForResponse((r) => r.request().method() === 'PUT' && r.status() === 200);
	await p.click('button.save');
	await p.waitForTimeout(700);
	ok(await p.isDisabled('button.save'), 'w trakcie wymuszonego zapisu przycisk „Zapisz” zablokowany');
	await forced;
	await p.unroute(`**/panel/api/quizzes/${id}`);
	await p.waitForTimeout(300);
	const server2 = await admin.req(`/panel/quizzes/${id}`);
	ok(server2.text.includes('Moja wersja'), 'po potwierdzeniu zapisano wersję z edytora');
	// Kolejny zapis z tej karty – wersja zaktualizowana, bez pytania.
	await p.fill('input.title', 'Moja wersja 2');
	await Promise.all([p.waitForResponse((r) => r.request().method() === 'PUT' && r.status() === 200), p.click('button.save')]);
	ok(dialogs.length === 2, 'następny zapis z tej samej karty bez pytania o konflikt');
	await ctx.close();
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
