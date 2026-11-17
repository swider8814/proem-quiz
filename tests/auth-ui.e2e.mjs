// Strony bez logowania i panel w prawdziwej przeglądarce, pod adresem innym niż localhost
// (jak w sieci Wi-Fi): brak błędów JavaScript i poprawna hydratacja (wcześniej <form> w <p> → 500).
//   node tests/auth-ui.e2e.mjs   (wymaga npm run build)
import os from 'node:os';
import { chromium } from 'playwright-core';
import { finish, makeAdmin, ok, startServer } from './_helpers.mjs';

// Adres sieciowy maszyny (nie localhost) – przeglądarka traktuje go jak niezaufany origin (http).
const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address ?? '127.0.0.1';
const srv = await startServer({}, { host: lan });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
	const { browser: admin } = await makeAdmin(srv, 'ui@proem.pl');
	const invite = srv.cli('create-admin', 'nowy@proem.pl', 'Nowy Admin').match(/\/invite\/[A-Za-z0-9_-]+/)[0];
	for (const locale of ['pl-PL', 'en-US']) {
		const ctx = await browser.newContext({ locale });
		const page = await ctx.newPage();
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => { if (m.type() === 'error' && !/Cross-Origin-Opener-Policy/.test(m.text())) errors.push(m.text()); });
		for (const path of ['/panel', '/login/forgot', invite, '/play']) {
			await page.goto(srv.base + path);
			await page.waitForTimeout(800); // hydratacja (strona gry trzyma otwarte połączenie, więc bez networkidle)
			const h1 = (await page.textContent('h1').catch(() => '')) ?? '';
			ok(!/^\s*500\s*$/.test(h1) && errors.length === 0, `${locale} ${path.replace(/[A-Za-z0-9_-]{12,}$/, '…')}: strona działa w przeglądarce ${errors.join(' | ')}`);
			errors.length = 0;
		}
		// Przełącznik języka działa po hydratacji
		await page.goto(srv.base + '/login');
		await page.click('form[action="/lang"] button');
		await page.waitForLoadState('networkidle');
		const lang = await page.getAttribute('html', 'lang');
		ok(lang === (locale === 'pl-PL' ? 'en' : 'pl'), `${locale}: przełącznik języka na stronie logowania (${lang})`);
		await ctx.close();
	}
	// Panel po zalogowaniu (ciasteczko sesji) – też bez błędów
	const ctx = await browser.newContext();
	await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	for (const path of ['/panel', '/panel/users', '/panel/themes', '/panel/settings', '/panel/security']) {
		await page.goto(srv.base + path);
		await page.waitForLoadState('networkidle');
		ok(errors.length === 0 && !/^\s*500\s*$/.test((await page.textContent('h1').catch(() => '')) ?? ''), `panel ${path}: bez błędów JavaScript ${errors.join(' | ')}`);
		errors.length = 0;
	}
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
