// Zakładka Pomoc i podpowiedzi „?”: autor (bez sekcji admina), wyszukiwanie, link z podpowiedzi
// otwiera właściwą sekcję, admin widzi sekcję dla administratora, bez logowania – przekierowanie.
//   node tests/help-ui.e2e.mjs   (wymaga npm run build)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { finish, makeAdmin, makeAuthor, ok, startServer, waitForHydration } from './_helpers.mjs';
import { tipOffsets } from './_tip-align.mjs';

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

	// Telefon: każde „?” w edytorze otwiera dymek w całości na ekranie (także przy prawej krawędzi),
	// a kliknięcie „?” w wierszu z przełącznikiem nie przełącza go.
	for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
		const mctx = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true });
		await mctx.addCookies([{ name: 'pq_session', value: author.jar.pq_session, url: srv.base }]);
		const mp = waitForHydration(await mctx.newPage());
		// Na telefonie „Ustawienia” są w menu ⋯ obok tytułu quizu.
		const settings = async () => { await mp.click('.more-narrow button.trigger'); await mp.click('.pop:not([hidden]) button:has-text("Ustawienia")'); };
		await mp.goto(p.url().replace(/\/panel\/help.*/, '/panel'));
		// Na telefonie pole nowego quizu rozwija „+” przy nagłówku „Quizy” – i od razu dostaje fokus.
		await mp.click('.head-tools button[aria-controls="list-new"]');
		ok(await mp.evaluate(() => document.activeElement?.getAttribute('name') === 'title'), `telefon ${vp.width} px: „+” rozwija pole nowego quizu z kursorem`);
		await mp.fill('input[name="title"]', 'Telefon pomoc');
		await mp.click('button:has-text("Utwórz quiz")');
		await mp.waitForURL(/\/panel\/quizzes\/quiz_/);
		await mp.click('.add:not(.add-mobile) button:has-text("Dodaj pytanie")');
		await settings();
		const teamBefore = await mp.isChecked('label:has-text("Tryb drużynowy") input[type="checkbox"]');
		const n = await mp.locator('.helptip button.q').count();
		const bad = [];
		for (let i = 0; i < n; i++) {
			const q = mp.locator('.helptip button.q').nth(i);
			await q.scrollIntoViewIfNeeded();
			await q.click();
			const r = await mp.locator('.helptip .pop').evaluate((el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, vw: document.documentElement.clientWidth, vh: innerHeight }; });
			if (r.l < 0 || r.r > r.vw || r.t < 0 || r.b > r.vh) bad.push(`#${i} ${JSON.stringify(r)}`);
			await mp.keyboard.press('Escape');
		}
		ok(n >= 3 && bad.length === 0, `telefon ${vp.width} px: ${n} podpowiedzi w edytorze, każdy dymek mieści się na ekranie ${bad.join(' ')}`);
		// Każde „?” na wysokości środka tekstu etykiety, we wszystkich widokach (edytor, udostępnianie, prowadzenie).
		const quizUrl = mp.url();
		const offs = [...(await tipOffsets(mp))];
		await settings(); // zamyka ustawienia → widok pytania (Punkty, Tłumaczenie)
		offs.push(...(await tipOffsets(mp)));
		for (const sub of ['/share', '/host']) {
			await mp.goto(quizUrl + sub);
			offs.push(...(await tipOffsets(mp)));
		}
		const off = offs.filter((o) => o.diff === null || o.diff < -1.2 || o.diff > 0.8);
		ok(offs.length >= 6 && new Set(offs.map((o) => o.id)).size >= 5 && off.length === 0, `telefon ${vp.width} px: ${offs.length} × „?” wyrównane do tekstu etykiety ${JSON.stringify(off)}`);
		await mp.goto(quizUrl);
		await settings();
		ok((await mp.isChecked('label:has-text("Tryb drużynowy") input[type="checkbox"]')) === teamBefore, `telefon ${vp.width} px: „?” przy trybie drużynowym nie przełącza przełącznika`);
		await mctx.close();
	}

	const actx = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await actx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const ap = waitForHydration(await actx.newPage());
	await ap.goto(`${srv.base}/panel/help`);
	// Udostępnianie (formularz widzi właściciel, gdy jest komu udostępnić – tu admin i autorka).
	await ap.goto(`${srv.base}/panel`);
	// Telefon: gdy lista nie jest pusta, pole nowego quizu rozwija „+” przy nagłówku.
	if (await ap.isVisible('.head-tools button[aria-controls="list-new"]')) await ap.click('.head-tools button[aria-controls="list-new"]');
	await ap.fill('input[name="title"]', 'Admina');
	await ap.click('button:has-text("Utwórz quiz")');
	await ap.waitForURL(/\/panel\/quizzes\/quiz_/);
	await ap.goto(ap.url() + '/share');
	const sh = await tipOffsets(ap);
	ok(sh.length === 1 && sh[0].diff !== null && sh[0].diff >= -1.2 && sh[0].diff <= 0.8, `telefon: „?” przy Uprawnieniach wyrównane do tekstu (${JSON.stringify(sh)})`);
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
