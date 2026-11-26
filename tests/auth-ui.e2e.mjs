// Strony bez logowania i panel w prawdziwej przeglądarce, pod adresem innym niż localhost
// (jak w sieci Wi-Fi): brak błędów JavaScript i poprawna hydratacja (wcześniej <form> w <p> → 500).
//   node tests/auth-ui.e2e.mjs   (wymaga npm run build)
import os from 'node:os';
import { chromium } from 'playwright-core';
import { finish, hydrated, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';

// Adres sieciowy maszyny (nie localhost) – przeglądarka traktuje go jak niezaufany origin (http).
const lan = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address ?? '127.0.0.1';
const srv = await startServer({}, { host: lan });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--no-proxy-server'] }); // bez proxy środowiska: łączymy się z adresem w sieci lokalnej
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
			await hydrated(page);
			const h1 = (await page.textContent('h1').catch(() => '')) ?? '';
			ok(!/^\s*500\s*$/.test(h1) && errors.length === 0, `${locale} ${path.replace(/[A-Za-z0-9_-]{12,}$/, '…')}: strona działa w przeglądarce ${errors.join(' | ')}`);
			errors.length = 0;
		}
		// Przełącznik języka działa po hydratacji
		await page.goto(srv.base + '/login');
		await hydrated(page);
		const before = await page.getAttribute('html', 'lang');
		// Menu języka: otwórz, wybierz drugi język (PL ↔ EN)
		await page.click('.lang button.trigger');
		await page.click(`form[action="/lang"] button[lang="${locale === 'pl-PL' ? 'en' : 'pl'}"]`);
		// Przełącznik przeładowuje stronę – sprawdzamy w pętli (wykonanie skryptu ginie przy nawigacji).
		let lang = before;
		for (let i = 0; i < 150 && lang === before; i++) {
			await page.waitForTimeout(200);
			lang = await page.getAttribute('html', 'lang').catch(() => before);
		}
		ok(lang === (locale === 'pl-PL' ? 'en' : 'pl'), `${locale}: przełącznik języka na stronie logowania (${lang})`);
		await ctx.close();
	}
	// Formularze w prawdziwej przeglądarce (nagłówek Origin, ochrona CSRF): aktywacja konta i logowanie
	{
		const ctx = await browser.newContext({ locale: 'pl-PL' });
		const page = waitForHydration(await ctx.newPage());
		const link = srv.cli('create-admin', 'formularz@proem.pl', 'Formularz').match(/\/invite\/[A-Za-z0-9_-]+/)[0];
		await page.goto(srv.base + link);
		await page.fill('#password', 'BardzoTajne123!');
		await page.fill('#repeat', 'BardzoTajne123!');
		await Promise.all([page.waitForURL(/\/panel\/2fa-setup/, { timeout: 60000 }), page.click('button.block')]);
		const body = await page.textContent('body');
		ok(page.url().endsWith('/panel/2fa-setup') && !/Cross-site POST/.test(body ?? ''), `aktywacja konta w przeglądarce działa (${page.url().replace(srv.base, '')})`);
		// Konfiguracja 2FA w przeglądarce → przejście do panelu pokazuje menu administratora (bez odświeżania)
		const { generate } = await import('otplib');
		const secret = (await page.textContent('code.copy')).replace(/\s/g, '');
		await page.fill('#code', await generate({ secret }));
		await Promise.all([page.waitForSelector('ol.codes'), page.click('button.block')]);
		await page.check('label.check input');
		await Promise.all([page.waitForURL(/\/panel\/?$/, { timeout: 60000 }), page.click('a.btn:has-text("Przejdź do panelu")')]);
		ok(await page.isVisible('header nav a[href="/panel/users"]'), 'po konfiguracji 2FA menu administratora widoczne od razu');
		// Telefon: menu pod przyciskiem (hamburger), zamyka się po przejściu na stronę
		await page.setViewportSize({ width: 390, height: 760 });
		ok(!(await page.isVisible('header nav a[href="/panel/users"]')) && (await page.isVisible('button.burger')), 'telefon: menu schowane, widać przycisk menu');
		const headerH = await page.$eval('header', (h) => h.getBoundingClientRect().height);
		ok(headerH < 80, `telefon: niski nagłówek (${Math.round(headerH)} px)`);
		await page.click('button.burger');
		ok(await page.isVisible('header nav a[href="/panel/users"]'), 'telefon: przycisk otwiera menu');
		await Promise.all([page.waitForURL('**/panel/users'), page.click('header nav a[href="/panel/users"]')]);
		await page.waitForTimeout(200);
		ok(!(await page.isVisible('header nav a[href="/panel/users"]')), 'telefon: menu zamyka się po przejściu');
		await page.setViewportSize({ width: 1280, height: 800 });
		const page2 = waitForHydration(await (await browser.newContext()).newPage());
		await page2.goto(srv.base + '/login');
		await page2.fill('#email', 'formularz@proem.pl');
		await page2.fill('#password', 'BardzoTajne123!');
		await Promise.all([page2.waitForURL(/\/login\/2fa|\/panel\/2fa-setup/, { timeout: 60000 }), page2.click('button.block')]);
		ok(/\/login\/2fa|\/panel\/2fa-setup/.test(page2.url()) && !/Cross-site POST/.test((await page2.textContent('body')) ?? ''), `logowanie w przeglądarce działa (${page2.url().replace(srv.base, '')})`);
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
		await hydrated(page);
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
