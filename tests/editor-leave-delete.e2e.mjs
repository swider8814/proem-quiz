// Edytor: usuwanie pytania z menu ⋯ na liście (z potwierdzeniem) oraz okno „Niezapisane zmiany”
// z opcjami „Zapisz i wyjdź” / „Wyjdź bez zapisywania” / „Zostań w edytorze”. Telefon i komputer.
//   node tests/editor-leave-delete.e2e.mjs [katalog-na-zrzuty]   (wymaga npm run build)
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { appDialogs, finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const snap = async (p, n) => shots && p.screenshot({ path: `${shots}/${n}.png`, fullPage: false });
const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1400, height: 900 } };

async function run(name, device, email) {
	const { browser: admin } = await makeAdmin(srv, email);
	const ctx = await browser.newContext(device);
	await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const p = waitForHydration(await ctx.newPage());
	const errors = [];
	p.on('pageerror', (e) => errors.push(String(e)));
	// Natywne okna przeglądarki nie powinny się pojawiać wcale.
	const native = [];
	p.on('dialog', (d) => { native.push(d.message()); d.dismiss(); });
	const dialogs = [];
	let answer = true;
	const app = await appDialogs(p);
	const onDelete = (d) => { dialogs.push(d.message()); return answer ? d.accept() : d.dismiss(); };
	const tap = (sel) => (device.hasTouch ? p.tap(sel) : p.click(sel));

	await p.goto(`${srv.base}/panel`);
	await p.fill('input[name="title"]', `Usuwanie ${name}`);
	await p.click('button:has-text("Utwórz quiz")');
	await p.waitForURL(/\/panel\/quizzes\/quiz_/);
	const editorUrl = p.url();
	const prompt = p.locator('.editor input[maxlength="200"]');
	for (const t of ['Pierwsze', 'Drugie', 'Trzecie']) {
		await p.locator('.add select:visible').first().selectOption('truefalse');
		await p.locator('.add button:has-text("Dodaj pytanie"):visible').first().click();
		await prompt.fill(t);
	}
	await p.click('button.save');
	await p.waitForSelector('button.save.clean');

	// Telefon: lista jest zwinięta – otwieramy ją.
	if (device.isMobile) await tap('.qnav .grow');
	const items = p.locator('.list li');
	ok((await items.count()) === 3, `${name}: trzy pytania na liście`);
	ok(await items.nth(0).locator('.item-menu .trigger').isVisible(), `${name}: menu ⋯ przy pytaniu na liście`);
	{
		// Menu nie zabiera miejsca na tekst pytania: przycisk mieści się w wierszu (bez poziomego przewijania).
		const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
		ok(!overflow, `${name}: lista bez poziomego przewijania`);
	}

	// Zaznaczamy trzecie, usuwamy pierwsze – edytor zostaje przy „Trzecie”.
	await items.nth(2).locator('.item').click();
	if (device.isMobile) await tap('.qnav .grow');
	await items.nth(0).locator('.item-menu .trigger').click();
	await snap(p, `${name}-01-menu`);
	ok(await p.isVisible('.pop:not([hidden]) button.danger:has-text("Usuń")'), `${name}: „Usuń” w menu pytania`);
	answer = false;
	app.once('dialog', onDelete);
	await p.click('.pop:not([hidden]) button.danger');
	await p.waitForTimeout(300);
	ok(dialogs.length === 1 && /Usunąć pytanie 1 \(„Pierwsze”\)\?$/.test(dialogs[0]), `${name}: potwierdzenie z numerem i treścią pytania (${dialogs[0]})`);
	ok((await items.count()) === 3, `${name}: anulowanie nie usuwa pytania`);
	answer = true;
	app.once('dialog', onDelete);
	await items.nth(0).locator('.item-menu .trigger').click();
	await p.click('.pop:not([hidden]) button.danger');
	await p.waitForTimeout(300);
	ok((await items.count()) === 2, `${name}: potwierdzenie usuwa pytanie`);
	if (device.isMobile && !(await p.isVisible('.list.open'))) await tap('.qnav .grow');
	ok((await p.locator('.item.active .t').textContent()) === 'Trzecie', `${name}: zaznaczenie zostaje przy tym samym pytaniu`);
	ok((await prompt.inputValue()) === 'Trzecie', `${name}: edytor pokazuje to samo pytanie po usunięciu wcześniejszego`);

	// ── Okno „Niezapisane zmiany” ──
	const reports = device.isMobile ? null : 'a.wide[href$="/reports"]';
	const goReports = async () => {
		if (reports) return p.click(reports);
		await p.click('.more-narrow .trigger');
		await p.click('.pop:not([hidden]) a[href$="/reports"]');
	};
	await goReports();
	await p.waitForSelector('dialog.pq-dialog[open]');
	ok(native.length === 0, `${name}: bez natywnych okien przeglądarki (${native.join(' | ')})`);
	await snap(p, `${name}-02-wyjscie`);
	ok(await p.isVisible('dialog.pq-dialog button:has-text("Zapisz i wyjdź")'), `${name}: opcja „Zapisz i wyjdź”`);
	{
		const box = await p.locator('dialog.pq-dialog').boundingBox();
		const vw = device.viewport.width;
		ok(box && box.x >= 0 && box.x + box.width <= vw, `${name}: okno mieści się na ekranie`);
	}
	await p.click('dialog.pq-dialog button:has-text("Zostań w edytorze")');
	ok(!(await p.isVisible('dialog.pq-dialog[open]')) && p.url() === editorUrl, `${name}: „Zostań” zamyka okno, zmiany zostają`);
	ok(await p.isVisible('button.save:not(.clean)'), `${name}: zmiany nadal niezapisane`);

	// Zapisz i wyjdź
	await goReports();
	await p.waitForSelector('dialog.pq-dialog[open]');
	await p.click('dialog.pq-dialog button:has-text("Zapisz i wyjdź")');
	await p.waitForURL(/\/reports$/);
	ok(true, `${name}: „Zapisz i wyjdź” przechodzi do raportów`);
	await p.goto(editorUrl);
	if (device.isMobile) await tap('.qnav .grow');
	ok((await p.locator('.list li').count()) === 2, `${name}: usunięcie zapisane na serwerze`);

	// Wyjdź bez zapisywania
	if (device.isMobile) await tap('.qnav .grow');
	await prompt.fill('Zmienione');
	await goReports();
	await p.waitForSelector('dialog.pq-dialog[open]');
	await p.click('dialog.pq-dialog button:has-text("Wyjdź bez zapisywania")');
	await p.waitForURL(/\/reports$/);
	await p.goto(editorUrl);
	ok((await prompt.inputValue()) !== 'Zmienione', `${name}: „Wyjdź bez zapisywania” porzuca zmiany`);

	// Wstecz z niezapisanymi zmianami: po decyzji przejście w historii, bez nowego wpisu (review Codexa).
	// Do edytora przez link z listy (nawigacja w aplikacji, nie nowe załadowanie strony).
	await p.goto(`${srv.base}/panel`);
	await p.click(`a[href="${new URL(editorUrl).pathname}"]`);
	await p.waitForURL(editorUrl);
	const len = await p.evaluate(() => history.length);
	await prompt.fill('Zmiana przed Wstecz');
	await p.evaluate(() => history.back());
	await p.waitForSelector('dialog.pq-dialog[open]');
	await p.click('dialog.pq-dialog button:has-text("Wyjdź bez zapisywania")');
	await p.waitForURL(/\/panel$/);
	ok((await p.evaluate(() => history.length)) === len, `${name}: Wstecz nie dodaje wpisu do historii`);
	await p.evaluate(() => history.forward());
	await p.waitForURL(editorUrl);
	ok(true, `${name}: Dalej wraca do edytora`);

	ok(errors.length === 0, `${name}: brak błędów JS ${errors.join(' | ')}`);
	await ctx.close();
}

try {
	await run('telefon', phone, 'leave-phone@proem.pl');
	await run('komputer', desktop, 'leave-desk@proem.pl');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
