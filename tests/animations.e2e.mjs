// Delikatne animacje panelu: menu na telefonie się wysuwa, sekcje Pomocy rozwijają się płynnie,
// a przy „ogranicz ruch” wszystko dzieje się od razu.
//   node tests/animations.e2e.mjs   (wymaga npm run build)
import { chromium, devices } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
	const { browser: admin } = await makeAdmin(srv, 'ruch@proem.pl');
	for (const reduced of [false, true]) {
		const ctx = await browser.newContext({ ...devices['iPhone 14'], reducedMotion: reduced ? 'reduce' : 'no-preference' });
		await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
		const p = waitForHydration(await ctx.newPage());
		await p.goto(`${srv.base}/panel/help`);
		const tag = reduced ? 'ogranicz ruch' : 'animacje';
		// Menu: tuż po kliknięciu jeszcze w ruchu (albo od razu na miejscu przy ograniczonym ruchu).
		// Klik i pomiar po 60 ms w samej stronie – bez opóźnień przesyłu między testem a przeglądarką.
		const mid = await p.evaluate(() => new Promise((r) => { document.querySelector('button.burger').click(); setTimeout(() => r(+getComputedStyle(document.querySelector('.menu')).opacity), 60); }));
		await p.waitForTimeout(400);
		const end = await p.evaluate(() => +getComputedStyle(document.querySelector('.menu')).opacity);
		ok(end === 1 && (reduced ? mid === 1 : mid > 0 && mid < 1), `${tag}: menu (w trakcie ${mid.toFixed(2)}, na końcu ${end})`);
		await p.click('button.burger');
		await p.waitForTimeout(400);
		ok(!(await p.isVisible('.menu')), `${tag}: menu chowa się po drugim kliknięciu`);
		// Pomoc: wysokość treści rośnie płynnie od 0.
				const h1 = await p.evaluate(() => new Promise((r) => { const d = document.querySelectorAll('details.sec')[1]; d.querySelector('summary').click(); setTimeout(() => r(d.getBoundingClientRect().height), 60); }));
		await p.waitForTimeout(400);
		const h2 = await p.evaluate(() => document.querySelectorAll('details.sec')[1].getBoundingClientRect().height);
		ok(h2 > 150 && (reduced ? h1 === h2 : h1 > 90 && h1 < h2), `${tag}: sekcja Pomocy (${Math.round(h1)} → ${Math.round(h2)} px)`);
		// Zwijanie: też płynne, na końcu sekcja zamknięta.
		const c1 = await p.evaluate(() => new Promise((r) => { const d = document.querySelectorAll('details.sec')[1]; d.querySelector('summary').click(); setTimeout(() => r({ h: d.getBoundingClientRect().height, open: d.open }), 60); }));
		await p.waitForTimeout(400);
		const c2 = await p.evaluate(() => { const d = document.querySelectorAll('details.sec')[1]; return { h: d.getBoundingClientRect().height, open: d.open }; });
		ok(!c2.open && c2.h < 150 && (reduced ? !c1.open : c1.h > c2.h && c1.h < h2), `${tag}: zwijanie sekcji (${Math.round(c1.h)} → ${Math.round(c2.h)} px)`);
		// Szybkie potrójne dotknięcie (otwórz → zwiń → otwórz w < 220 ms): na końcu sekcja otwarta.
		const tri = await p.evaluate(() => new Promise((r) => {
			const d = document.querySelectorAll('details.sec')[2];
			const s = d.querySelector('summary');
			s.click(); setTimeout(() => s.click(), 40); setTimeout(() => s.click(), 80);
			setTimeout(() => r({ open: d.open, h: d.getBoundingClientRect().height }), 700);
		}));
		ok(tri.open && tri.h > 150, `${tag}: szybkie potrójne dotknięcie kończy się otwartą sekcją (${Math.round(tri.h)} px)`);
		await ctx.close();
	}
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
