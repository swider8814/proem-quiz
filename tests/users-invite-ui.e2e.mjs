// Formularz „Zaproś osobę” w Użytkownikach: na desktopie dwa rzędy (nic się nie ucina, przycisk
// w linii z polami), opis roli pod listą zmienia się po wyborze, na telefonie pola jedno pod drugim.
//   node tests/users-invite-ui.e2e.mjs [katalog-na-zrzuty]   (wymaga npm run build)
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const snap = async (p, n) => shots && p.locator('#invite-box').screenshot({ path: `${shots}/${n}.png` });
const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });

const sizes = [
	{ name: 'desktop', viewport: { width: 1280, height: 900 } },
	{ name: 'laptop', viewport: { width: 1024, height: 768 } },
	{ name: 'tablet', viewport: { width: 820, height: 1180 }, hasTouch: true },
	{ name: 'telefon', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
];

try {
	const { browser: admin } = await makeAdmin(srv, 'invite-ui@proem.pl');
	for (const s of sizes) {
		const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: 2, isMobile: s.isMobile, hasTouch: s.hasTouch });
		await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
		const p = waitForHydration(await ctx.newPage());
		await p.goto(`${srv.base}/panel/users`);
		if (s.isMobile) await p.click('.invite-toggle');

		const box = async (sel) => p.locator(sel).boundingBox();
		const [name, email, role, locale, submit] = await Promise.all(['#name', '#email', '#role', '#locale', '.f-submit'].map(box));
		const w = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
		ok(w <= 1, `${s.name}: bez poziomego przewijania (${w} px)`);

		// Tekst wybranej opcji mieści się w liście (krótkie nazwy ról, opis osobno).
		const clipped = await p.evaluate(() => {
			const sel = /** @type {HTMLSelectElement} */ (document.querySelector('#role'));
			const c = document.createElement('canvas').getContext('2d');
			const cs = getComputedStyle(sel);
			c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
			const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
			return Math.max(...[...sel.options].map((o) => c.measureText(o.text).width)) - (sel.clientWidth - pad);
		});
		ok(clipped <= 0, `${s.name}: nazwy ról mieszczą się w liście (zapas ${Math.round(-clipped)} px)`);

		if (s.isMobile) {
			ok(email.y > name.y + name.height - 1 && role.y > email.y && locale.y > role.y && submit.y > locale.y, `${s.name}: pola jedno pod drugim`);
			ok(Math.abs(submit.width - name.width) <= 1, `${s.name}: przycisk na całą szerokość`);
		} else {
			ok(Math.abs(name.y - email.y) <= 1, `${s.name}: imię i e-mail w pierwszym rzędzie`);
			ok(role.y > name.y + name.height, `${s.name}: rola w drugim rzędzie`);
			ok(Math.abs(role.y - locale.y) <= 1, `${s.name}: rola i język w jednym rzędzie`);
			const bottom = (b) => b.y + b.height;
			ok(Math.abs(bottom(submit) - bottom(role)) <= 2, `${s.name}: przycisk wyrównany do pól (${Math.round(bottom(submit) - bottom(role))} px)`);
			ok(name.width >= 200 && email.width >= 200, `${s.name}: imię i e-mail mają ≥ 200 px (${Math.round(name.width)}/${Math.round(email.width)})`);
		}

		const hint = () => p.textContent('#role-hint');
		ok(/Tworzy i prowadzi/.test(await hint()), `${s.name}: opis roli autora pod listą`);
		await snap(p, `invite-${s.name}-autor`);
		await p.selectOption('#role', 'admin');
		ok(/weryfikacji dwuetapowej/.test(await hint()), `${s.name}: po wyborze administratora opis się zmienia`);
		await snap(p, `invite-${s.name}-admin`);
		await ctx.close();
	}

	// Wysłanie formularza nadal działa, a rola z formularza trafia na listę.
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const p = waitForHydration(await ctx.newPage());
	await p.goto(`${srv.base}/panel/users`);
	await p.fill('#name', 'Anna Admin');
	await p.fill('#email', 'anna@proem.pl');
	await p.selectOption('#role', 'admin');
	await p.selectOption('#locale', 'en');
	ok((await p.inputValue('#name')) === 'Anna Admin' && (await p.inputValue('#email')) === 'anna@proem.pl', 'zmiana roli i języka nie czyści wpisanego imienia i e-maila');
	await Promise.all([p.waitForSelector('.success code.copy'), p.click('.f-submit')]);
	const row = p.locator('tr', { hasText: 'anna@proem.pl' });
	ok((await row.locator('select[name="role"]').inputValue()) === 'admin', 'zaproszenie: zapisana rola administratora');
	ok((await row.locator('select[name="locale"]').inputValue()) === 'en', 'zaproszenie: zapisany język konta');
	ok(/Tworzy i prowadzi/.test(await p.textContent('#role-hint')) && (await p.inputValue('#name')) === '', 'po wysłaniu formularz jest pusty i wraca do roli autora');

	// Błąd walidacji: wpisane wartości (także rola) wracają do formularza.
	await p.fill('#name', 'Anna Druga');
	await p.fill('#email', 'anna@proem.pl'); // to konto już istnieje
	await p.selectOption('#role', 'admin');
	await Promise.all([p.waitForSelector('#invite-box .error'), p.click('.f-submit')]);
	ok((await p.inputValue('#name')) === 'Anna Druga' && (await p.inputValue('#role')) === 'admin', 'po błędzie wracają wpisane imię i rola');
	ok(/weryfikacji dwuetapowej/.test(await p.textContent('#role-hint')), 'po błędzie opis pasuje do zwróconej roli');
	await ctx.close();
} catch (e) {
	ok(false, `wyjątek: ${e?.stack ?? e}`);
} finally {
	await browser.close();
	srv.stop?.();
}
process.exit(finish() ? 1 : 0);
