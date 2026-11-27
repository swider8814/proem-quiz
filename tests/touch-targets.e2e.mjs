// Cele dotyku w panelu na telefonie: równe 44 px. Root panelu ma 15px, więc 2.75rem to tylko 41,25 px –
// tak „Wyloguj” wychodziło niższe od przycisku języka obok.
//   node tests/touch-targets.e2e.mjs [katalog-na-zrzuty]   (wymaga npm run build)
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
try {
	const { browser: admin } = await makeAdmin(srv, 'touch@proem.pl');
	const ctx = await browser.newContext(phone);
	await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const p = waitForHydration(await ctx.newPage());
	await p.goto(`${srv.base}/panel`);
	const burger = await p.locator('.burger').boundingBox();
	ok(burger.height >= 44 && burger.width >= 44, `menu: przycisk ☰ co najmniej 44×44 (${burger.width}×${burger.height})`);
	await p.click('.burger');
	const h = await p.evaluate(() => {
		const r = (s) => document.querySelector(s).getBoundingClientRect();
		const [lang, out] = [r('.acts .trigger'), r('.acts form button')];
		return { lang: lang.height, out: out.height, langTop: lang.top, outTop: out.top };
	});
	if (shots) await p.screenshot({ path: `${shots}/menu.png` });
	ok(h.lang >= 44 && h.out >= 44, `menu: język i „Wyloguj” co najmniej 44 px (${h.lang} / ${h.out})`);
	ok(h.lang === h.out && h.langTop === h.outTop, `menu: język i „Wyloguj” tej samej wysokości i w jednej linii ${JSON.stringify(h)}`);
	// Inne przyciski panelu na telefonie też nie niższe niż 44 px.
	await p.click('.burger');
	const low = await p.evaluate(() => [...document.querySelectorAll('main button, main .btn, main input[type="text"], main select')]
		.filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44 && !e.matches('.link'))
		.map((e) => `${e.className || e.tagName}:${e.getBoundingClientRect().height}`));
	ok(low.length === 0, `lista quizów: przyciski i pola co najmniej 44 px ${JSON.stringify(low)}`);

	// iPhone w poziomie: boczna kolumna + wcięcie „notcha” z lewej. Chrome nie emuluje env(safe-area-inset-*),
	// więc podstawiamy wartość iPhone'a (59 px) do tych samych wzorów co w +layout.svelte.
	const land = await browser.newContext({ viewport: { width: 932, height: 430 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
	await land.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const q = waitForHydration(await land.newPage());
	for (const lang of ['pl', 'en', 'uk']) {
		await q.goto(`${srv.base}/panel`);
		await q.evaluate((l) => fetch('/lang', { method: 'POST', body: new URLSearchParams({ lang: l, next: '/panel' }), redirect: 'manual' }), lang);
		await q.goto(`${srv.base}/panel`);
		await q.addStyleTag({ content: '.sidebar { width: calc(15rem + max(0px, 59px - 1rem)) !important; padding-left: max(1rem, 59px) !important; }' });
		const r = await q.evaluate(() => {
			const who = document.querySelector('.who').getBoundingClientRect();
			const bs = [...document.querySelectorAll('.acts .trigger, .acts form button')].map((b) => b.getBoundingClientRect());
			return { inside: bs.every((b) => b.left >= who.left && b.right <= who.right + 0.5), h: bs.map((b) => b.height), oneRow: Math.abs(bs[0].top - bs[1].top) < 1 };
		});
		if (shots) await q.screenshot({ path: `${shots}/land-${lang}.png` });
		ok(r.inside && r.oneRow, `poziomo (${lang}): język i wylogowanie mieszczą się w kolumnie, w jednym rzędzie ${JSON.stringify(r)}`);
		ok(r.h.every((x) => x >= 44), `poziomo (${lang}): dotyk – oba przyciski 44 px (${r.h})`);
	}
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
