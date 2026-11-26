// „Wstecz” na podstronach panelu: jeden komponent, nad tytułem, cel dotyku ≥ 44 px, bez strzałek w tekście.
//   node tests/back-link.e2e.mjs [katalog-na-zrzuty]   (wymaga npm run build)
import fs from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });

const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
	const { browser: admin } = await makeAdmin(srv, 'wstecz@proem.pl');
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Wstecz' } });
	const id = c.loc.split('/').pop();
	const ctx = await browser.newContext({ ...devices['iPhone SE'] });
	await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const p = waitForHydration(await ctx.newPage());
	const pages = [
		[`/panel/quizzes/${id}/share`, `/panel/quizzes/${id}`, 'udostępnianie'],
		[`/panel/quizzes/${id}/host`, `/panel/quizzes/${id}`, 'start gry'],
		[`/panel/quizzes/${id}/reports`, `/panel/quizzes/${id}`, 'raporty'],
		['/panel/themes/theme_proem', '/panel/themes', 'motyw']
	];
	for (const [url, target, name] of pages) {
		await p.goto(srv.base + url);
		const r = await p.evaluate(() => {
			const a = document.querySelector('a.back-link');
			const h1 = document.querySelector('h1');
			if (!a || !h1) return null;
			const b = a.getBoundingClientRect();
			return { href: a.getAttribute('href'), h: Math.round(b.height), above: b.bottom <= h1.getBoundingClientRect().top + 1, icon: !!a.querySelector('svg.icon'), arrows: document.body.innerText.includes('←') };
		});
		ok(r && r.href === target && r.h >= 44 && r.above && r.icon && !r.arrows, `${name}: „Wstecz” nad tytułem, ${r?.h} px, prowadzi do ${r?.href}`);
		if (shots) await p.screenshot({ path: `${shots}/wstecz-${name.replace(' ', '-')}.png` });
	}
	await p.click('a.back-link');
	await p.waitForURL('**/panel/themes');
	ok(true, 'kliknięcie wraca do listy motywów');
	const anon = await (await browser.newContext({ ...devices['iPhone SE'] })).newPage();
	await anon.goto(`${srv.base}/login/forgot`);
	ok((await anon.getAttribute('a.back-link', 'href')) === '/login', 'przypomnienie hasła: „Wstecz” do logowania');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
