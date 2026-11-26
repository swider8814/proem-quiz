import { chromium } from 'playwright-core';
import { finish, makeAdmin, startServer, waitForHydration } from './_helpers.mjs';
const srv = await startServer();
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
	const { browser: admin } = await makeAdmin(srv, 'shot@proem.pl');
	await admin.req('/panel?/create', { method: 'POST', form: { title: 'Kolędy' } });
	await admin.req('/panel?/folderCreate', { method: 'POST', form: { name: 'Obóz zimowy 2027' } });
	for (const [w, n] of [[390, 'phone'], [1280, 'desk']]) {
		const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, isMobile: w < 500 });
		await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
		const p = waitForHydration(await ctx.newPage());
		await p.goto(`${srv.base}/panel`);
		await p.screenshot({ path: `/home/claude/scratch/${n}.png` });
		console.log(n, await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
	}
} finally { await browser.close(); await finish(srv); }
