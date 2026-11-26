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
		// Pomiar w samej stronie, w KAŻDEJ klatce przez ~450 ms po kliknięciu (requestAnimationFrame).
		// Pojedynczy pomiar po 60 ms był niestabilny na obciążonym CI (animacja mogła ledwo ruszyć).
		// Wynik: [stan przed kliknięciem, ...stany w kolejnych klatkach].
		const track = (what, index) =>
			p.evaluate(([what, index]) => new Promise((res) => {
				const read = () => {
					if (what === 'menu') { const m = document.querySelector('.menu'); return m ? +getComputedStyle(m).opacity : 0; }
					const d = document.querySelectorAll('details.sec')[index];
					return { h: d.getBoundingClientRect().height, open: d.open };
				};
				const out = [read()];
				(what === 'menu' ? document.querySelector('button.burger') : document.querySelectorAll('details.sec')[index].querySelector('summary')).click();
				const t0 = performance.now();
				const step = () => { out.push(read()); if (performance.now() - t0 < 450) requestAnimationFrame(step); else res(out); };
				requestAnimationFrame(step);
			}), [what, index]);
		const between = (vals, a, b, eps) => vals.some((v) => v > Math.min(a, b) + eps && v < Math.max(a, b) - eps);
		const settled = (vals, end) => vals.slice(1).every((v) => Math.abs(v - end) < 1);

		// Menu: przy animacji przechodzi przez stany pośrednie, przy ograniczonym ruchu od razu jest na miejscu.
		const ms = await track('menu');
		const mEnd = ms.at(-1);
		ok(mEnd === 1 && (reduced ? settled(ms, 1) : between(ms.slice(1), 0, 1, 0.02)), `${tag}: menu (${ms.length - 1} klatek, ${ms.slice(1, 4).map((v) => v.toFixed(2)).join(' → ')} … ${mEnd})`);
		await p.click('button.burger');
		await p.waitForTimeout(400);
		ok(!(await p.isVisible('.menu')), `${tag}: menu chowa się po drugim kliknięciu`);
		// Pomoc: wysokość treści rośnie płynnie.
		const ex = (await track('sec', 1)).map((x) => x.h);
		const h0 = ex[0];
		const h2 = ex.at(-1);
		ok(h2 > 150 && (reduced ? settled(ex, h2) : between(ex.slice(1), h0, h2, 10)), `${tag}: sekcja Pomocy (${Math.round(h0)} → ${Math.round(h2)} px, ${reduced ? 'od razu' : 'płynnie'})`);
		// Zwijanie: też płynne, na końcu sekcja zamknięta.
		const col = await track('sec', 1);
		const c2 = col.at(-1);
		const ch = col.map((x) => x.h);
		ok(!c2.open && c2.h < 150 && (reduced ? settled(ch, c2.h) : between(ch.slice(1), h2, c2.h, 10)), `${tag}: zwijanie sekcji (${Math.round(h2)} → ${Math.round(c2.h)} px)`);
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
