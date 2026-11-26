// Panel i ekran prowadzącego na telefonie (390 px): dodawanie pytań bez szukania listy,
// ekran prowadzącego bez poziomego przewijania, okrągłe przyciski przy graczach.
//   node tests/mobile-ui.e2e.mjs [katalog-na-zrzuty]   (wymaga npm run build)
import fs from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const snap = async (p, n) => shots && p.screenshot({ path: `${shots}/${n}.png`, fullPage: true });
const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
try {
	const { browser: admin } = await makeAdmin(srv, 'mobile@proem.pl');
	const ctx = await browser.newContext(phone);
	await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const p = waitForHydration(await ctx.newPage());

	// ── Edytor na telefonie ──
	await p.goto(`${srv.base}/panel`);
	await p.fill('input[name="title"]', 'Telefon');
	await p.click('button:has-text("Utwórz quiz")');
	await p.waitForURL(/\/panel\/quizzes\/quiz_/);
	await p.click('.add:not(.add-mobile) button:has-text("Dodaj pytanie")'); // pusty quiz: lista jest otwarta
	await p.locator('input[maxlength="200"]').first().fill('Pierwsze pytanie');
	ok(await p.isVisible('.qnav .qnav-add'), 'telefon: przycisk „+” przy nawigacji pytań widoczny');
	ok(await p.isVisible('.add-mobile button'), 'telefon: „Dodaj pytanie” widoczne na dole edytora (bez otwierania listy)');
	await snap(p, 'm-01-edytor');
	await p.click('.qnav .qnav-add');
	ok(/Pytanie 2 z 2/.test(await p.textContent('.qnav .grow')), 'telefon: „+” dodaje kolejne pytanie i je otwiera');
	await p.selectOption('.add-mobile select', 'truefalse');
	await p.click('.add-mobile button');
	ok(/Pytanie 3 z 3/.test(await p.textContent('.qnav .grow')), 'telefon: dodawanie z dołu edytora działa');
	ok((await p.inputValue('#q-time')) === '', 'czas: pole „inny” puste, gdy wybrany jest przycisk (bez drugiego „20”)');
	await p.fill('#q-time', '45');
	ok((await p.locator('.time .seg button[aria-pressed="true"]').count()) === 0, 'czas: własna wartość 45 s odznacza przyciski');
	await p.click('.time .seg button:has-text("30")');
	ok((await p.inputValue('#q-time')) === '', 'czas: wybór przycisku czyści pole „inny”');
	const w = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
	ok(w <= 1, `edytor: bez poziomego przewijania (${w} px)`);

	// ── Lista quizów na telefonie: „Quizy” + lupa + plus w jednym rzędzie, filtry w jednym rzędzie ──
	for (const n of ['Wigilia', 'Kolędy', 'Obóz zimowy', 'Szkółka niedzielna']) await admin.req('/panel?/folderCreate', { method: 'POST', form: { name: n } });
	await p.goto(`${srv.base}/panel`);
	const lay = await p.evaluate(() => {
		const r = (s) => document.querySelector(s).getBoundingClientRect();
		const mid = (b) => b.top + b.height / 2;
		const [h1, tools] = [r('.head h1'), r('.head-tools')];
		const chips = [...document.querySelectorAll('.folders > *')].map((c) => { const b = c.getBoundingClientRect(); return Math.round(b.top + b.height / 2); });
		return { row: Math.abs(mid(h1) - mid(tools)), chipsRows: new Set(chips).size, overflow: document.documentElement.scrollWidth - innerWidth, foldersScroll: document.querySelector('.folders').scrollWidth > document.querySelector('.folders').clientWidth };
	});
	ok(lay.row <= 4, `lista, telefon: „Quizy”, lupa i plus w jednym rzędzie (${lay.row})`);
	ok(!(await p.isVisible('input[name="title"]')) && !(await p.isVisible('input[name="q"]')), 'lista, telefon: pole nowego quizu i wyszukiwarka schowane pod ikonami');
	ok(lay.chipsRows === 1 && lay.foldersScroll && lay.overflow <= 1, `lista, telefon: filtry w jednym rzędzie przewijanym w bok, strona bez poziomego przewijania ${JSON.stringify(lay)}`);
	await p.click('.head-tools button[aria-controls="list-search"]');
	ok(await p.evaluate(() => document.activeElement?.getAttribute('name') === 'q'), 'lista, telefon: lupa rozwija wyszukiwarkę z kursorem');
	await p.fill('input[name="q"]', 'Telefon');
	await Promise.all([p.waitForURL(/q=Telefon/), p.press('input[name="q"]', 'Enter')]);
	ok(await p.isVisible('input[name="q"]'), 'lista, telefon: przy aktywnym wyszukiwaniu pole zostaje widoczne');
	const afterSearch = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, h: Math.round(document.querySelector('input[name="q"]').getBoundingClientRect().height) }));
	ok(afterSearch.overflow <= 1 && afterSearch.h <= 56, `lista, telefon: po wyszukaniu strona bez poziomego przewijania, pole normalnej wysokości ${JSON.stringify(afterSearch)}`);
	// Stan hover (zostaje po dotknięciu na iOS): ikony przy nagłówku czytelne, także „włączona” lupa.
	for (const sel of ['.head-tools button[aria-controls="list-search"]', '.head-tools button[aria-controls="list-new"]']) {
		await p.hover(sel);
		const c = await p.locator(sel).evaluate((b) => {
			const lum = (c) => { const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
			const st = getComputedStyle(b), [a, d] = [lum(st.color), lum(st.backgroundColor)].sort((x, y) => y - x);
			return (a + 0.05) / (d + 0.05);
		});
		ok(c >= 3, `lista, telefon, hover ${sel.match(/list-\w+/)[0]}: ikona widoczna (kontrast ${c.toFixed(1)}:1)`);
	}
	await snap(p, 'm-00-lista');

	// ── Ekran prowadzącego na telefonie ──
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Gra z telefonu' } });
	const id = c.loc.split('/').pop();
	const quiz = {
		title: 'Gra z telefonu', description: null, themeId: 'theme_proem', locale: 'pl',
		settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
		questions: [{ type: 'truefalse', prompt: 'Prawda czy fałsz?', promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1, data: { type: 'truefalse', correct: true, thumbs: false } }]
	};
	const save = await admin.req(`/panel/api/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(quiz), headers: { 'content-type': 'application/json', accept: 'application/json' } });
	ok(save.status === 200, 'quiz do gry zapisany');
	await p.goto(`${srv.base}/panel/quizzes/${id}/host`);
	await p.click('form[action="?/start"] button');
	await p.waitForSelector('.pin');
	const pin = (await p.textContent('.pin')).replace(/\s/g, '');
	const pl = await (await browser.newContext({ ...devices['iPhone 14'] })).newPage();
	await pl.goto(`${srv.base}/play`);
	await pl.fill('#pin', pin);
	await pl.click('button:has-text("Dalej")');
	await pl.waitForSelector('.nick-show');
	await pl.click('button:has-text("Dołącz do gry")');
	await p.waitForSelector('.player .mini');
	await snap(p, 'm-02-prowadzacy');
	const host = await p.evaluate(() => {
		const over = document.documentElement.scrollWidth - innerWidth;
		const out = [...document.querySelectorAll('.controls .g-btn')].filter((b) => { const r = b.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map((b) => b.textContent.trim());
		const minis = [...document.querySelectorAll('.player .mini')].map((b) => { const r = b.getBoundingClientRect(); return Math.abs(r.width - r.height); });
		return { over, out, maxDiff: Math.max(...minis) };
	});
	ok(host.over <= 1, `prowadzący: bez poziomego przewijania (${host.over} px)`);
	ok(host.out.length === 0, `prowadzący: wszystkie przyciski na ekranie ${host.out.join(', ')}`);
	ok(host.maxDiff <= 1, `prowadzący: przyciski przy graczu okrągłe (różnica ${host.maxDiff.toFixed(1)} px)`);
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
