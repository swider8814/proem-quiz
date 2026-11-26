// Lista użytkowników: filtry (szukanie, status, rola, język), liczniki, kolejność, stan w adresie
// (także po akcjach na liście), pusty wynik i układ na telefonie.
//   node tests/users-filters-ui.e2e.mjs [katalog-na-zrzuty]   (wymaga npm run build)
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { Browser, finish, makeAdmin, makeAuthor, ok, startServer, waitForHydration } from './_helpers.mjs';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const snap = async (p, n) => shots && p.screenshot({ path: `${shots}/${n}.png`, fullPage: true });
const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });

try {
	const { browser: admin } = await makeAdmin(srv, 'filtry@proem.pl');
	const invite = (name, email, role, locale) => admin.req('/panel/users?/invite', { method: 'POST', form: { name, email, role, locale } });
	// Aktywni: Test Admin (admin, 2FA), zofia (autor PL), John English (autor EN). Zablokowany: blok.
	await makeAuthor(srv, admin, 'zofia@proem.pl');
	const j = await invite('John English', 'john@proem.pl', 'author', 'en');
	await new Browser(srv.base).req(j.text.match(/\/invite\/[A-Za-z0-9_-]+/)[0], { method: 'POST', form: { password: 'AutorHaslo123!', repeat: 'AutorHaslo123!' } });
	await makeAuthor(srv, admin, 'blok@proem.pl');
	// Czekają: Łukasz (autor EN), Ewa (admin PL – bez 2FA).
	await invite('Łukasz Nowak', 'lukasz@proem.pl', 'author', 'en');
	await invite('Ewa Czeka', 'ewa@proem.pl', 'admin', 'pl');

	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const p = waitForHydration(await ctx.newPage());
	await p.goto(`${srv.base}/panel/users`);
	// Blokada przez interfejs.
	await Promise.all([p.waitForURL(/\/panel\/users/), p.locator('tr', { hasText: 'blok@proem.pl' }).locator('button:has-text("Zablokuj")').click()]);
	await p.waitForSelector('p.success');

	const emails = () => p.locator('.list tbody tr td.person .muted').allTextContents();
	const chip = (label) => p.locator('.chips .chip', { hasText: label });
	const count = async (label) => Number(await chip(label).locator('span').textContent());
	const waitRows = (n) => p.waitForFunction((n) => document.querySelectorAll('.list tbody tr').length === n, n);

	let list = await emails();
	ok(list.length === 6, `wszystkie konta na liście (${list.length})`);
	ok(list.slice(0, 2).join() === 'ewa@proem.pl,lukasz@proem.pl', `najpierw czekające na aktywację (${list.slice(0, 2)})`);
	ok(list.at(-1) === 'blok@proem.pl', 'zablokowane na końcu');
	ok((await count('Wszystkie')) === 6 && (await count('Aktywne')) === 3 && (await count('Czekają')) === 2 && (await count('Zablokowane')) === 1, 'liczniki statusów');
	ok((await count('bez 2FA')) === 1, 'przycisk „Administratorzy bez 2FA” z licznikiem');
	ok(/Pokazano 6 z 6/.test(await p.textContent('.count')), 'licznik „Pokazano 6 z 6”');
	const over = await p.evaluate(() => { const l = document.querySelector('.list'); return l.scrollWidth - l.clientWidth; });
	ok(over <= 1, `desktop: tabela mieści się w karcie (${over} px)`);
	await snap(p, 'filtry-desktop-wszystkie');

	// Status
	await chip('Czekają').click();
	await waitRows(2);
	ok((await emails()).join() === 'ewa@proem.pl,lukasz@proem.pl', 'status: tylko czekające');
	ok((await chip('Czekają').getAttribute('aria-pressed')) === 'true', 'status: przycisk oznaczony (aria-pressed)');
	await p.waitForFunction(() => location.search.includes('status=pending'));
	ok(true, 'status w adresie (?status=pending)');

	// Rola – liczniki uwzględniają pozostałe filtry
	await p.selectOption('.frow select[aria-label="Rola"]', 'admin');
	await waitRows(1);
	ok((await emails()).join() === 'ewa@proem.pl', 'rola + status: tylko Ewa');
	ok((await count('Aktywne')) === 1 && (await count('Wszystkie')) === 2, 'liczniki statusów liczone w obrębie wybranej roli');
	await snap(p, 'filtry-desktop-czekajace-admin');

	// Akcja na liście nie gubi filtrów
	await Promise.all([p.waitForURL(/status=pending/), p.locator('tr', { hasText: 'ewa@proem.pl' }).locator('button:has-text("Nowy link")').click()]);
	await p.waitForSelector('.success code.copy');
	ok((await emails()).join() === 'ewa@proem.pl', 'po akcji „Nowy link” filtry zostają');
	ok(!/%2F|\/reinvite/.test(await p.evaluate(() => location.search)) && /role=admin/.test(await p.evaluate(() => location.search)), 'po akcji adres bez nazwy akcji, z filtrami');

	// Wyczyść + szukanie bez polskich znaków
	await p.click('.count .link');
	await waitRows(6);
	await p.fill('.frow .q', 'lukasz');
	await waitRows(1);
	ok((await emails()).join() === 'lukasz@proem.pl', 'szukanie „lukasz” znajduje „Łukasz”');
	await p.fill('.frow .q', 'PROEM.PL');
	await waitRows(6);
	ok(true, 'szukanie po e-mailu bez rozróżniania wielkości liter');
	await p.fill('.frow .q', '');

	// Język
	await p.selectOption('.frow select[aria-label="Język konta"]', 'en');
	await waitRows(2);
	ok((await emails()).sort().join() === 'john@proem.pl,lukasz@proem.pl', 'język EN: John i Łukasz');

	// Pusty wynik
	await p.fill('.frow .q', 'zzz-nikt');
	await p.waitForSelector('.empty');
	ok(/Brak osób/.test(await p.textContent('.empty')), 'pusty wynik: komunikat');
	await p.click('.empty button');
	await waitRows(6);
	ok((await p.inputValue('.frow .q')) === '' && (await p.inputValue('.frow select[aria-label="Język konta"]')) === 'all', 'pusty wynik: „Wyczyść filtry” zeruje wszystko');
	await p.waitForFunction(() => location.search === '');
	ok(true, 'po wyczyszczeniu adres bez parametrów');

	// Wejście z linkiem z filtrami (odświeżenie / wysłany link) – także HTML z serwera
	const html = (await admin.req('/panel/users?status=blocked&role=author')).text;
	const tbody = html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>')); // bez danych strony w <script>
	ok(tbody.includes('blok@proem.pl') && !tbody.includes('zofia@proem.pl'), 'serwer renderuje od razu przefiltrowaną listę');
	await p.goto(`${srv.base}/panel/users?status=blocked&role=author`);
	ok((await emails()).join() === 'blok@proem.pl', 'link z filtrami: tylko zablokowany autor');
	await ctx.close();

	// Telefon
	const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await phone.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const m = waitForHydration(await phone.newPage());
	await m.goto(`${srv.base}/panel/users`);
	const w = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
	ok(w <= 1, `telefon: bez poziomego przewijania strony (${w} px)`);
	const tops = await m.locator('.chips .chip').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
	ok(new Set(tops).size === 1, 'telefon: statusy w jednym rzędzie');
	const scrolls = await m.evaluate(() => { const c = document.querySelector('.chips'); return c.scrollWidth > c.clientWidth && getComputedStyle(c).overflowX === 'auto'; });
	ok(scrolls, 'telefon: rząd statusów przewija się w bok');
	await m.locator('.chips .chip', { hasText: 'Zablokowane' }).click();
	await m.waitForFunction(() => document.querySelectorAll('.list tbody tr').length === 1);
	ok(true, 'telefon: filtr statusu działa');
	await m.locator('.chips .chip', { hasText: 'Wszystkie' }).click();
	await snap(m, 'filtry-telefon');
	await phone.close();
} catch (e) {
	ok(false, `wyjątek: ${e?.stack ?? e}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
