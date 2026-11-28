// Edytor quizów w prawdziwej przeglądarce.   node tests/editor-ui.e2e.mjs [katalog-na-zrzuty]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { finish, makeAdmin, makeMp3, ok, sleep, startServer, waitForHydration } from './_helpers.mjs';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const snap = async (p, n) => shots && p.screenshot({ path: `${shots}/${n}.png`, fullPage: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-ed-'));
const mp3 = path.join(tmp, 'Cicha noc.mp3');
fs.writeFileSync(mp3, makeMp3(20));
const png = path.join(tmp, 'zdjecie.png');
fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

try {
	const { browser: admin } = await makeAdmin(srv, 'ed@proem.pl');
	const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
	await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const p = waitForHydration(await ctx.newPage());
	const errors = [];
	p.on('pageerror', (e) => errors.push(String(e)));
	p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	p.on('dialog', (d) => d.accept());

	// Nowy quiz z listy
	await p.goto(`${srv.base}/panel`);
	await p.fill('input[name="title"]', 'Wigilia 2026');
	await p.click('button:has-text("Utwórz quiz")');
	await p.waitForURL(/\/panel\/quizzes\/quiz_/);
	ok(true, 'quiz utworzony z listy');

	// Pytanie audio
	await p.selectOption('select[aria-label="Typ nowego pytania"]', 'audio');
	await p.click('button:has-text("Dodaj pytanie")');
	await p.setInputFiles('.audio input[type="file"]', mp3);
	await p.waitForSelector('.audio .play', { timeout: 20000 });
	await p.waitForFunction(() => !document.querySelector('.wave .loading'), null, { timeout: 15000 });
	ok(await p.isVisible('.wave'), 'po wgraniu MP3 widać falę dźwięku');
	ok(/Cicha noc/.test(await p.textContent('.audio .top')), 'nazwa pliku widoczna');
	// Zakres wpisany ręcznie
	await p.fill('.controls label:has-text("Początek") input', '0:02');
	await p.press('.controls label:has-text("Początek") input', 'Tab');
	await p.fill('.controls label:has-text("Koniec") input', '0:08,5');
	await p.press('.controls label:has-text("Koniec") input', 'Tab');
	ok(/6\.5 s/.test(await p.textContent('.len')), 'długość fragmentu przeliczona (6.5 s)');
	await p.click('.audio .play');
	await sleep(400);
	ok(await p.isVisible('.audio .play[aria-label="Zatrzymaj"]'), 'odsłuch fragmentu startuje');
	await p.click('.audio .play');
	const answers = p.locator('.answers input[type="text"]');
	await answers.nth(0).fill('Cicha noc');
	await answers.nth(1).fill('Wśród nocnej ciszy');
	await answers.nth(2).fill('Lulajże, Jezuniu');
	await snap(p, 'ed-01-audio');

	// Pytanie ABCD z obrazkiem i dwiema poprawnymi
	await p.selectOption('select[aria-label="Typ nowego pytania"]', 'choice');
	await p.click('button:has-text("Dodaj pytanie")');
	{
		// Podpowiedź znika po kliknięciu w pole (nie wygląda jak wpisany tekst)
		const prompt = p.locator('input[placeholder^="np. Jaka jest stolica"]');
		const phOpacity = () => prompt.evaluate((el) => getComputedStyle(el, '::placeholder').opacity);
		await p.click('body', { position: { x: 5, y: 5 } });
		const before = await phOpacity();
		await prompt.focus();
		await p.waitForTimeout(250);
		ok(before !== '0' && (await phOpacity()) === '0', `podpowiedź w polu pytania znika po kliknięciu (${before} → ${await phOpacity()})`);
	}
	await p.fill('input[placeholder^="np. Jaka jest stolica"]', 'Które kolory są na fladze Polski?');
	await answers.nth(0).fill('Biały');
	await answers.nth(1).fill('Czerwony');
	await answers.nth(2).fill('Zielony');
	await p.locator('.answer').nth(1).locator('input[type="checkbox"]').check();
	await p.setInputFiles('.image input[type="file"]', png);
	await p.waitForSelector('.image img');
	ok(true, 'obrazek dodany do pytania');

	// Prawda / fałsz
	await p.selectOption('select[aria-label="Typ nowego pytania"]', 'truefalse');
	await p.click('button:has-text("Dodaj pytanie")');
	await p.fill('input[placeholder^="np. Jaka jest stolica"]', 'Mikołaj ma renifery');
	// Tekst
	await p.selectOption('select[aria-label="Typ nowego pytania"]', 'text');
	await p.click('button:has-text("Dodaj pytanie")');
	await p.fill('input[placeholder^="np. Jaka jest stolica"]', 'Jak ma na imię renifer z czerwonym nosem?');
	await p.fill('input[aria-label="Akceptowana odpowiedź 1"]', 'Rudolf');
	await p.click('button:has-text("dodaj wariant")');
	await p.fill('input[aria-label="Akceptowana odpowiedź 2"]', 'Rudolph');
	// Kolejność
	await p.selectOption('select[aria-label="Typ nowego pytania"]', 'order');
	await p.click('button:has-text("Dodaj pytanie")');
	await p.fill('input[placeholder^="np. Jaka jest stolica"]', 'Ułóż zdanie');
	for (const [i, w] of ['I', 'love', 'Christmas'].entries()) await p.fill(`input[aria-label="Element ${i + 1}"]`, w);

	ok((await p.locator('.list .item').count()) === 5, '5 pytań na liście');
	ok(/Niezapisane zmiany/.test(await p.textContent('.status')), 'status: niezapisane zmiany');
	ok(await p.locator('a.start.disabled').count() === 1, '„Uruchom grę” zablokowane przy niezapisanych zmianach');

	// Zmiana kolejności
	await p.locator('.list .item').nth(4).click();
	await p.click('button[aria-label="Przesuń w górę"]');
	ok(/Ułóż zdanie/.test(await p.locator('.list .item').nth(3).textContent()), 'przesunięcie pytania w górę');
	// Przeciąganie myszą: ostatnie na początek i z powrotem
	{
		const names = async () => (await p.locator('.list .item .t').allTextContents()).map((t) => t.trim());
		const before = await names();
		await p.locator('.list li').nth(4).dragTo(p.locator('.list li').nth(0));
		const after = await names();
		ok(after[0] === before[4] && after.length === 5, `przeciąganie pytania na liście (${after[0]})`);
		await p.locator('.list li').nth(0).dragTo(p.locator('.list li').nth(4));
		ok(JSON.stringify(await names()) === JSON.stringify(before), 'przeciąganie z powrotem przywraca kolejność');
	}

	// Zapis (Ctrl+S)
	await p.keyboard.press('Control+s');
	await p.waitForFunction(() => /Zapisano/.test(document.querySelector('.status')?.textContent ?? ''), null, { timeout: 30000 });
	ok(true, 'zapis Ctrl+S (z wycięciem fragmentu audio)');
	await p.waitForTimeout(300); // po przejściu koloru (transition)
	const savedBtn = await p.locator('.bar .save').evaluate((b) => ({ text: b.textContent.trim(), bg: getComputedStyle(b).backgroundColor }));
	ok(/Zapisano/.test(savedBtn.text) && savedBtn.bg === 'rgb(239, 250, 243)', `po zapisie przycisk „✓ Zapisano” na zielonym tle (${JSON.stringify(savedBtn)})`);
	await snap(p, 'ed-02-zapisane');

	// Po odświeżeniu wszystko jest
	await p.reload();
	await p.waitForSelector('.list .item');
	ok((await p.locator('.list .item').count()) === 5, 'po odświeżeniu 5 pytań');
	await p.locator('.list .item').nth(0).click();
	await p.waitForSelector('.audio .play', { timeout: 15000 });
	const start = await p.inputValue('.controls label:has-text("Początek") input');
	const end = await p.inputValue('.controls label:has-text("Koniec") input');
	ok(start === '0:02.0' && end === '0:08.5', `zakres audio zachowany (${start}–${end})`);
	ok(/Zapisano/.test(await p.textContent('.status')), 'po odświeżeniu brak fałszywych „niezapisanych zmian”');
	await p.locator('.list .item').nth(1).click();
	const checked = await p.locator('.answer input[type="checkbox"]:checked').count();
	ok(checked === 2, 'dwie poprawne odpowiedzi zachowane');

	// Błąd walidacji jest czytelny
	await p.locator('.list .item').nth(2).click();
	await p.fill('input[placeholder^="np. Jaka jest stolica"]', '');
	await p.click('button.save');
	await p.waitForSelector('.status .err');
	ok(/Pytanie 3/.test(await p.textContent('.status .err')), `czytelny błąd zapisu: ${await p.textContent('.status .err')}`);

	// Mobile: panel na telefonie nie rozjeżdża się
	const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	await phone.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const m = await phone.newPage();
	await m.goto(p.url());
	await m.waitForSelector('.qnav button[aria-controls="q-list"]');
	ok(!(await m.isVisible('.list .item')), 'telefon: lista pytań schowana pod przyciskiem');
	await m.click('.qnav button[aria-controls="q-list"]');
	await m.waitForSelector('.list .item');
	await m.locator('.list .item').nth(1).click();
	ok(!(await m.isVisible('.list .item')) && /Pytanie 2 z 5/.test(await m.textContent('.qnav button[aria-controls="q-list"]')), 'telefon: wybór pytania z listy zamyka ją i pokazuje „Pytanie 2 z 5”');
	await m.click('.qnav button[aria-controls="q-list"]');
	const overflow = await m.evaluate(() => {
		if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) return 'strona';
		for (const el of document.querySelectorAll('.list .item, header nav, .card')) {
			const p = el.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect();
			if (r.right > p.right + 1 && getComputedStyle(el.parentElement).overflowX !== 'visible') return el.className;
			if (r.right > window.innerWidth + 1) return el.className;
		}
		return false;
	});
	ok(!overflow, 'edytor na telefonie bez poziomego przewijania');
	await snap(m, 'ed-03-telefon');
	// Nagłówek na telefonie: rząd 1 – wróć, tytuł, ⋯; rząd 2 – Zapisz i Uruchom grę po połowie.
	const head = await m.evaluate(() => {
		const r = (s) => document.querySelector(s).getBoundingClientRect();
		const [back, title, more, save, start] = ['.bar .back', '.bar .title-wrap', '.more-narrow .trigger', '.bar .save', '.bar .start'].map(r);
		const mid = (b) => b.top + b.height / 2;
		return { row1: Math.max(Math.abs(mid(back) - mid(title)), Math.abs(mid(more) - mid(title))), row2: Math.abs(mid(save) - mid(start)), widths: [Math.round(save.width), Math.round(start.width)], below: save.top >= title.bottom, bar: Math.round(document.querySelector('.bar').getBoundingClientRect().height) };
	});
	ok(head.row1 <= 2 && head.row2 <= 2 && head.below && Math.abs(head.widths[0] - head.widths[1]) <= 2, `telefon: nagłówek w dwóch rzędach ${JSON.stringify(head)}`);
	ok(head.bar <= 140, `telefon: nagłówek edytora niski (${head.bar} px)`);
	ok(/Zapisano/.test(await m.textContent('.bar .save')), 'telefon: przycisk zapisu pokazuje „Zapisano”, gdy nie ma zmian');
	ok(!(await m.isVisible('.bar-actions .wide')), 'telefon: ustawienia/udostępnianie/raporty nie w pasku, tylko w menu ⋯');
	await m.click('.more-narrow .trigger');
	const menuItems = await m.locator('.pop:not([hidden])').innerText();
	ok(/Ustawienia/.test(menuItems) && /Raporty/.test(menuItems), `telefon: menu ⋯ ma ustawienia i raporty (${menuItems.replace(/\s+/g, ' ')})`);
	await m.click('.pop:not([hidden]) button:has-text("Ustawienia")');
	ok(await m.isVisible('fieldset.settings'), 'telefon: „Ustawienia” z menu otwierają ustawienia quizu');
	// Obrót tabletu / szersze okno przy otwartym menu: przycisk ⋯ znika, więc menu też (nie zostaje na wierzchu).
	await m.click('.more-narrow .trigger');
	await m.setViewportSize({ width: 1024, height: 768 });
	await m.waitForTimeout(150);
	ok((await m.locator('.pop:not([hidden])').count()) === 0, 'po poszerzeniu ekranu ponad breakpoint otwarte menu ⋯ się zamyka');
	await m.setViewportSize({ width: 390, height: 844 });
	// Stan hover (na iOS zostaje po dotknięciu): „Zapisano” i „Uruchom grę” dalej czytelne.
	for (const sel of ['.bar .save', '.bar .start']) {
		await m.hover(sel);
		const c = await m.locator(sel).evaluate((b) => {
			const lum = (c) => { const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
			const st = getComputedStyle(b), [a, d] = [lum(st.color), lum(st.backgroundColor)].sort((x, y) => y - x);
			return (a + 0.05) / (d + 0.05) * Number(st.opacity);
		});
		ok(c >= 4.5, `telefon, hover ${sel}: tekst czytelny (kontrast ${c.toFixed(1)}:1)`);
	}

	// Kolory motywu: pole HEX obok próbnika (wpisanie, skrót #rgb, błędna wartość, zapis)
	await p.goto(`${srv.base}/panel/themes/theme_proem`);
	const hex = p.getByLabel('Tło (HEX)');
	await hex.fill('#12ab9f');
	ok((await p.getByLabel('Tło', { exact: true }).inputValue()) === '#12ab9f', 'HEX wpisany → próbnik koloru zaktualizowany');
	await hex.fill('#fd0');
	await hex.blur();
	ok((await hex.inputValue()) === '#ffdd00' && (await p.getByLabel('Tło', { exact: true }).inputValue()) === '#ffdd00', 'skrót #fd0 rozwinięty do #ffdd00 po wyjściu z pola');
	await hex.fill('zielony');
	ok((await hex.getAttribute('aria-invalid')) === 'true', 'błędny HEX oznaczony');
	await hex.blur();
	ok((await hex.inputValue()) === '#ffdd00' && (await hex.getAttribute('aria-invalid')) === 'false', 'błędny HEX cofnięty do ostatniego poprawnego koloru (bez oznaczenia błędu)');
	await snap(p, 'ed-05-kolory-hex');
	// Czekamy na odpowiedź zapisu (networkidle bywa spełnione, zanim żądanie w ogóle wyjdzie).
	await Promise.all([p.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/panel/themes/theme_proem')), p.click('button.save')]);
	await p.goto(`${srv.base}/panel/themes/theme_proem`);
	ok((await p.getByLabel('Tło (HEX)').inputValue()) === '#ffdd00', 'kolor z pola HEX zapisany w motywie');

	// Foldery na liście quizów: nowy folder, przeniesienie z listy rozwijanej (bez przeładowania strony)
	await p.goto(`${srv.base}/panel`);
	await p.click('button.chip.add');
	await p.fill('form[action="?/folderCreate"] input[name=name]', 'Zimowisko');
	await p.click('form[action="?/folderCreate"] button:not([type])');
	await p.waitForURL(/f=fld_/);
	ok((await p.textContent('.folder-bar')).includes('Zimowisko'), 'folder utworzony i otwarty');
	await p.click('.chip >> text=Wszystkie');
	await p.waitForURL(/\/panel$/);
	const fid = await p.$eval('.chip.folder', (a) => new URL(a.href).searchParams.get('f'));
	// Karta przy :hover ma transform – menu (position: fixed) musi i tak otworzyć się przy przycisku ⋯.
	await p.hover('.list li >> nth=0');
	await p.click('.list li >> nth=0 >> button.trigger');
	ok(await p.isVisible('.pop:not([hidden])'), 'menu „Więcej” otwarte');
	await p.waitForTimeout(250); // po animacji otwierania
	const [tb, pb] = [await p.locator('.list li >> nth=0 >> button.trigger').boundingBox(), await p.locator('.pop:not([hidden])').boundingBox()];
	const gap = Math.min(Math.abs(pb.y - (tb.y + tb.height)), Math.abs(tb.y - (pb.y + pb.height)));
	ok(gap <= 12 && Math.abs(pb.x + pb.width - (tb.x + tb.width)) <= 12, `menu przy przycisku ⋯ mimo transform karty (odstęp ${Math.round(gap)} px)`);
	// Pozycje menu (link „Raporty” i przyciski formularzy) mają tę samą wysokość, ikona i tekst wyśrodkowane.
	const items = await p.locator('.pop:not([hidden])').evaluate((el) => [...el.querySelectorAll(':scope > a, :scope > form > button')].map((b) => {
		const r = b.getBoundingClientRect(), ic = b.querySelector('svg').getBoundingClientRect();
		return { h: Math.round(r.height), off: Math.abs(ic.top + ic.height / 2 - (r.top + r.height / 2)) };
	}));
	ok(new Set(items.map((i) => i.h)).size === 1, `pozycje menu równej wysokości (${items.map((i) => i.h).join(', ')})`);
	ok(items.every((i) => i.off <= 2), 'ikony w menu wyśrodkowane w pionie');
	// Mysz wciąż nad ⋯ (jak „przyklejony” hover po dotknięciu na iOS): kropki muszą być widoczne na tle.
	await p.hover('.list li >> nth=0 >> button.trigger');
	const contrast = await p.locator('.list li >> nth=0 >> button.trigger').evaluate((b) => {
		const lum = (c) => { const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
		const s = getComputedStyle(b), [a, c] = [lum(s.color), lum(s.backgroundColor)].sort((x, y) => y - x);
		return (a + 0.05) / (c + 0.05);
	});
	ok(contrast >= 3, `otwarty ⋯ przy hover: kropki widoczne (kontrast ${contrast.toFixed(1)}:1)`);
	await p.keyboard.press('Escape');
	ok(!(await p.isVisible('.pop:not([hidden])')), 'Escape zamyka menu „Więcej”');
	// Niski ekran (telefon w poziomie, duże powiększenie): menu mieści się w oknie i przewija w środku.
	const vp = p.viewportSize();
	await p.setViewportSize({ width: vp.width, height: 300 });
	await p.locator('.list li >> nth=0 >> button.trigger').scrollIntoViewIfNeeded();
	await p.click('.list li >> nth=0 >> button.trigger');
	await p.waitForTimeout(250);
	const low = await p.locator('.pop:not([hidden])').evaluate((el) => { const b = el.getBoundingClientRect(); return { t: b.top, b: b.bottom, vh: innerHeight, scroll: el.scrollHeight > el.clientHeight, oy: getComputedStyle(el).overflowY }; });
	ok(low.t >= 0 && low.b <= low.vh, `niski ekran: menu w całości w oknie (${Math.round(low.t)}–${Math.round(low.b)} z ${low.vh})`);
	ok(!low.scroll || low.oy === 'auto', 'niski ekran: za wysokie menu przewija się w środku');
	await p.keyboard.press('Escape');
	await p.setViewportSize(vp);
	ok(await p.evaluate(() => document.activeElement?.classList.contains('trigger')), 'po Escape fokus wraca na przycisk ⋯');
	await p.click('.list li >> nth=0 >> button.trigger');
	await p.selectOption('.pop:not([hidden]) select[name=folder]', fid);
	await p.waitForFunction(() => document.querySelector('.chip.folder span')?.textContent === '1');
	ok(/\/panel$/.test(p.url()), 'przeniesienie do folderu bez zmiany widoku listy');
	ok((await p.$$('.pop:not([hidden])')).length === 0, 'menu zamyka się po przeniesieniu do folderu');
	await p.click('.chip.folder');
	await p.waitForURL(/f=fld_/);
	ok((await p.$$('.list li')).length === 1, 'quiz widoczny w folderze');
	await snap(p, 'ed-04-foldery');

	ok(errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, `brak błędów JS ${errors.join(' | ')}`);
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
	fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(finish() ? 1 : 0);
