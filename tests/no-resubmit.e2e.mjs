// Po wysłaniu formularza w panelu odświeżenie strony nie wysyła go ponownie
// („Czy chcesz ponownie wysłać formularz?” w iOS Safari po powrocie do karty).
// Formularze idą przez fetch (use:enhance), więc w historii nie zostaje żądanie POST,
// a odświeżenie to zwykłe GET. Sprawdzamy na desktopie i na telefonie.
//   node tests/no-resubmit.e2e.mjs   (wymaga npm run build)
import { chromium } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });

const sizes = [
	{ name: 'desktop', viewport: { width: 1280, height: 900 } },
	{ name: 'telefon', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
];

/** Metoda żądania, którym przeglądarka odświeża bieżącą stronę. */
async function reloadMethod(p) {
	const [req] = await Promise.all([p.waitForRequest((r) => r.isNavigationRequest()), p.reload()]);
	await p.waitForLoadState('load');
	return req.method();
}

try {
	const { browser: admin } = await makeAdmin(srv, 'resubmit@proem.pl');
	for (const s of sizes) {
		const ctx = await browser.newContext({ viewport: s.viewport, isMobile: s.isMobile, hasTouch: s.hasTouch, locale: 'pl-PL' });
		await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
		const p = waitForHydration(await ctx.newPage());
		const dialogs = [];
		let answer = true;
		p.on('dialog', (d) => { dialogs.push(d.message()); return answer ? d.accept() : d.dismiss(); });

		// 1. Zaproszenie (dokładnie przypadek z iPhone'a): wynik bez przeładowania strony, adres bez „?/invite”.
		const email = `osoba-${s.name}@proem.pl`;
		await p.goto(`${srv.base}/panel/users`);
		await p.evaluate(() => { window.__same = 1; });
		if (s.isMobile) await p.click('.invite-toggle');
		await p.fill('#name', `Osoba ${s.name}`);
		await p.fill('#email', email);
		await Promise.all([p.waitForSelector('.success code.copy'), p.click('.f-submit')]);
		ok(await p.evaluate(() => window.__same === 1), `${s.name}: zaproszenie bez przeładowania dokumentu`);
		ok(!p.url().includes('?/'), `${s.name}: adres po zaproszeniu bez akcji (${p.url().replace(srv.base, '')})`);
		ok((await reloadMethod(p)) === 'GET', `${s.name}: odświeżenie po zaproszeniu = GET`);
		ok((await p.locator('tr', { hasText: email }).count()) === 1, `${s.name}: po odświeżeniu jedno konto, nie dwa`);

		// 2. Błąd walidacji też nie zostawia POST w historii.
		if (s.isMobile) await p.click('.invite-toggle');
		await p.fill('#name', 'Ktoś Inny');
		await p.fill('#email', email);
		await Promise.all([p.waitForSelector('#invite-box .error'), p.click('.f-submit')]);
		ok((await reloadMethod(p)) === 'GET', `${s.name}: odświeżenie po błędzie formularza = GET`);

		// 3. Potwierdzenie: „Anuluj” naprawdę nic nie wysyła, „OK” – wysyła.
		const row = () => p.locator('tr', { hasText: email });
		answer = false;
		await row().locator('button.trigger').click(); // „Usuń” jest w menu ⋯ wiersza
		await p.locator('.pop:not([hidden]) button.danger:has-text("Usuń")').click();
		await p.waitForTimeout(500);
		ok(dialogs.length === 1 && (await row().count()) === 1, `${s.name}: anulowane usuwanie nie usuwa konta`);
		answer = true;
		await row().locator('button.trigger').click();
		await Promise.all([p.waitForSelector('p.success'), p.locator('.pop:not([hidden]) button.danger:has-text("Usuń")').click()]);
		await p.waitForFunction((e) => ![...document.querySelectorAll('tr')].some((r) => r.textContent?.includes(e)), email);
		ok(dialogs.length === 2, `${s.name}: potwierdzone usuwanie usuwa konto`);
		ok((await reloadMethod(p)) === 'GET', `${s.name}: odświeżenie po usunięciu = GET`);

		// 4. Nowy quiz: akcja z przekierowaniem (Post/Redirect/Get) prowadzi do edytora zwykłym adresem.
		await p.goto(`${srv.base}/panel`);
		await p.fill('form.new input[name="title"]', `Quiz ${s.name}`);
		await Promise.all([p.waitForURL(/\/panel\/quizzes\/[^/?]+$/), p.click('form.new button')]);
		ok((await reloadMethod(p)) === 'GET', `${s.name}: odświeżenie edytora po utworzeniu quizu = GET`);
		await p.goto(`${srv.base}/panel?q=${encodeURIComponent(`Quiz ${s.name}`)}`);
		ok((await p.locator('ul.list > li').count()) === 1, `${s.name}: utworzono jeden quiz`);

		// 5. Ustawienia: zapis i odświeżenie.
		await p.goto(`${srv.base}/panel/settings`);
		await Promise.all([p.waitForSelector('p.success'), p.click('button.save')]);
		ok((await reloadMethod(p)) === 'GET', `${s.name}: odświeżenie po zapisie ustawień = GET`);
		await ctx.close();
	}
} catch (e) {
	ok(false, `wyjątek: ${e?.stack ?? e}`);
} finally {
	await browser.close();
	srv.stop?.();
}
process.exit(finish() ? 1 : 0);
