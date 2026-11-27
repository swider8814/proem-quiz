// Pola suwaka w edytorze mieszczą się w karcie pytania na każdej szerokości (wąski telefon → komputer).
// Regresja: „grid-column: span 2” przy jednej kolumnie tworzyło niejawną drugą kolumnę i lista wychodziła poza kartę.
import { chromium } from 'playwright-core';
import { finish, makeAdmin, ok, sleep, startServer, waitForHydration } from './_helpers.mjs';

const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
	const { browser: admin } = await makeAdmin(srv, 'suwak@proem.pl');
	for (const w of [320, 390, 820, 1400]) {
		const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 500, hasTouch: w < 500 });
		await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
		const p = waitForHydration(await ctx.newPage());
		await p.goto(`${srv.base}/panel`);
		if (!(await p.isVisible('input[name="title"]'))) await p.click('button[aria-controls="list-new"]');
		await p.fill('input[name="title"]', `Suwak ${w}`);
		await p.click('button:has-text("Utwórz quiz")');
		await p.waitForURL(/\/panel\/quizzes\/quiz_/);
		const add = (await p.isVisible('.add-mobile select')) ? '.add-mobile' : '.list .add';
		await p.selectOption(`${add} select`, 'slider');
		await p.click(`${add} button`);
		await sleep(250);
		const r = await p.evaluate(() => {
			const card = document.querySelector('fieldset.q').getBoundingClientRect();
			const right = Math.max(...[...document.querySelectorAll('.slider-set label')].map((l) => l.getBoundingClientRect().right));
			// Każda kolumna co najmniej 9rem – niejawna kolumna z „span 2” była węższa (np. 111 px przy 320 px).
			const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
			const tracks = getComputedStyle(document.querySelector('.slider-set')).gridTemplateColumns.split(' ').map(parseFloat);
			return { over: Math.round(right - card.right), scroll: document.documentElement.scrollWidth - innerWidth, narrowest: Math.round(Math.min(...tracks)), min: Math.round(9 * rem) };
		});
		ok(r.over < 0 && r.scroll <= 0 && r.narrowest >= r.min, `${w} px: pola suwaka w karcie, kolumny ≥ 9rem, bez poziomego przewijania (${JSON.stringify(r)})`);
		await ctx.close();
	}
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish());
