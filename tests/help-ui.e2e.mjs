// Zakładka Pomoc i podpowiedzi „?”: autor (bez sekcji admina), wyszukiwanie, link z podpowiedzi
// otwiera właściwą sekcję, admin widzi sekcję dla administratora, bez logowania – przekierowanie.
//   node tests/help-ui.e2e.mjs   (wymaga npm run build)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { finish, makeAdmin, makeAuthor, ok, startServer, waitForHydration } from './_helpers.mjs';

// Liczba sekcji z pliku treści (test uruchamia czysty node, bez TypeScriptu).
const content = fs.readFileSync('src/lib/help/content.ts', 'utf8');
const TOTAL = (content.match(/^\t\tid: '/gm) ?? []).length;
const ADMIN_ONLY = (content.match(/^\t\tadminOnly: true/gm) ?? []).length;

const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
	const anon = await fetch(`${srv.base}/panel/help`, { redirect: 'manual' });
	ok(anon.status === 303 && /\/login/.test(anon.headers.get('location') ?? ''), 'bez logowania: przekierowanie do logowania');

	const { browser: admin } = await makeAdmin(srv, 'pomoc@proem.pl');
	const author = await makeAuthor(srv, admin, 'lektorka@proem.pl');
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await ctx.addCookies([{ name: 'pq_session', value: author.jar.pq_session, url: srv.base }]);
	const p = waitForHydration(await ctx.newPage());
	await p.goto(`${srv.base}/panel`);
	await p.click('nav a:has-text("Pomoc")');
	await p.waitForURL(/\/panel\/help$/);
	const forAuthor = TOTAL - ADMIN_ONLY;
	ok((await p.locator('details.sec').count()) === forAuthor, `autor: ${forAuthor} sekcji, bez sekcji dla administratora`);
	await p.fill('input[type="search"]', 'PIN');
	const found = await p.locator('details.sec').count();
	ok(found >= 1 && found < forAuthor && (await p.locator('details.sec[open]').count()) === found, `wyszukiwanie „PIN” zawęża listę i rozwija wyniki (${found})`);
	await p.fill('input[type="search"]', 'zzzqqq');
	ok(await p.isVisible('text=Nic nie znaleziono'), 'wyszukiwanie bez wyników: komunikat');

	// Podpowiedź „?” w edytorze → link do sekcji Pomocy
	await p.goto(`${srv.base}/panel`);
	await p.fill('input[name="title"]', 'Z pomocą');
	await p.click('button:has-text("Utwórz quiz")');
	await p.waitForURL(/\/panel\/quizzes\/quiz_/);
	await p.click('button:has-text("Ustawienia")');
	await p.click('.helptip:near(label[for="s-nick"]) button.q');
	ok(await p.isVisible('.helptip .pop:has-text("Tylko losowe")'), 'podpowiedź przy nickach pokazuje krótki opis');
	await p.click('.helptip .pop a');
	await p.waitForURL(/\/panel\/help#settings$/);
	await p.waitForTimeout(300);
	ok(await p.locator('details#settings').evaluate((d) => d.open), 'link „Więcej w Pomocy” otwiera sekcję „Ustawienia quizu”');

	const actx = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await actx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const ap = waitForHydration(await actx.newPage());
	await ap.goto(`${srv.base}/panel/help`);
	ok((await ap.locator('details.sec').count()) === TOTAL, 'admin: wszystkie sekcje, łącznie z „Dla administratora”');
	ok((await ap.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1, 'telefon: strona Pomocy bez przewijania w bok');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
