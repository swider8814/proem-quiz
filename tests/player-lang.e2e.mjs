// Język napisów na telefonie gracza i nicki pisane cyrylicą.
//   node tests/player-lang.e2e.mjs   (wymaga npm run build)
import { chromium, devices } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const json = { 'content-type': 'application/json', accept: 'application/json' };
try {
	const { browser: admin } = await makeAdmin(srv, 'lang@proem.pl');
	const hctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	await hctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);

	/** Quiz po polsku; zwraca PIN uruchomionej gry. */
	async function game(title, playerLanguage) {
		const c = await admin.req('/panel?/create', { method: 'POST', form: { title } });
		const id = c.loc.split('/').pop();
		const quiz = {
			title, description: null, themeId: 'theme_proem', locale: 'pl',
			settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true, playerLanguage },
			questions: [{ type: 'truefalse', prompt: 'Prawda?', promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1, data: { type: 'truefalse', correct: true, thumbs: false } }]
		};
		const save = await admin.req(`/panel/api/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(quiz), headers: json });
		ok(save.status === 200, `quiz „${title}” zapisany (playerLanguage=${playerLanguage})`);
		const host = waitForHydration(await hctx.newPage());
		await host.goto(`${srv.base}/panel/quizzes/${id}/host`);
		await host.click('form[action="?/start"] button');
		await host.waitForSelector('.pin');
		return { host, pin: (await host.textContent('.pin')).replace(/\s/g, '') };
	}

	// ── Wybór dozwolony: gracz przełącza na ukraiński, wpisuje nick cyrylicą ──
	const g1 = await game('Kolędy', true);
	const pctx = await browser.newContext({ ...devices['iPhone 14'] });
	const ph = waitForHydration(await pctx.newPage());
	await ph.goto(`${srv.base}/play`);
	ok(await ph.isVisible('text=Wpisz PIN gry'), 'ekran PIN domyślnie po polsku');
	await ph.selectOption('.langpick select', 'uk');
	ok(await ph.isVisible('text=Введіть PIN гри'), 'po wyborze ukraińskiego ekran PIN po ukraińsku');
	await ph.fill('#pin', g1.pin);
	await ph.click('button:has-text("Далі")');
	await ph.waitForSelector('text=або введіть свій');
	ok(await ph.isVisible('.langpick'), 'quiz pozwala – wybór języka widoczny na ekranie nicka');
	await ph.click('text=або введіть свій');
	await ph.fill('input[aria-label="Ваш нік"]', 'Олена     Щука');
	ok(await ph.isVisible('text=На екрані: Olena Shchuka'), 'podgląd scala spacje jak serwer (review Codexa)');
	await ph.fill('input[aria-label="Ваш нік"]', 'Олена');
	ok(await ph.isVisible('text=На екрані: Olena'), 'podgląd nicka łacinką pod polem');
	await ph.click('button:has-text("Приєднатися")');
	await ph.waitForSelector('text=Ви в грі!');
	await g1.host.waitForSelector('.player:has-text("Olena")');
	ok(true, 'prowadzący widzi nick „Olena” (łacinką)');
	ok((await ph.getAttribute('.game', 'lang')) === 'uk', 'atrybut lang ekranu gry = uk (czytnik ekranu)');

	// ── Wybór zablokowany: zapamiętany ukraiński nie działa, ekran w języku quizu ──
	const g2 = await game('Lekcja', false);
	const ph2 = waitForHydration(await pctx.newPage()); // ten sam telefon – pamięta ukraiński
	await ph2.goto(`${srv.base}/play?pin=${g2.pin}`);
	await ph2.waitForSelector('text=Dołącz do gry');
	ok(!(await ph2.isVisible('.langpick')), 'quiz blokuje – przycisku języka nie ma');
	ok(await ph2.isVisible('text=albo wpisz własny'), 'quiz blokuje – napisy w języku quizu mimo zapamiętanego wyboru');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
