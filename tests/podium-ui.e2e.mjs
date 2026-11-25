// Układ ekranu podium (ekran dla widzów) przy różnej liczbie graczy:
// podium, miejsca 4–10 i podsumowanie nie nachodzą na siebie i mieszczą się na ekranie 1920×1080 i 1366×768;
// przy nieparzystej liczbie miejsc 4–10 (w dwóch kolumnach) podsumowanie wypełnia pustą komórkę;
// medal i punkty mieszczą się w stopniu podium.
//   node tests/podium-ui.e2e.mjs   (wymaga npm run build)
import { chromium } from 'playwright-core';
import { io as connect } from 'socket.io-client';
import { finish, makeAdmin, ok, sleep, startServer, waitForHydration } from './_helpers.mjs';

// Boty łączą się z różnych „adresów” (x-forwarded-for), żeby nie trafić w limit połączeń z jednego IP.
const srv = await startServer({ TRUSTED_PROXIES: '127.0.0.1,::1,::ffff:127.0.0.1' });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const emit = (s, ev, arg) => new Promise((r) => s.timeout(10000).emit(ev, arg, (err, res) => r(err ? { error: 'timeout' } : res)));

try {
	const { browser: admin } = await makeAdmin(srv, 'podium@proem.pl');
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Podium' } });
	const id = c.loc.split('/').pop();
	const quiz = {
		title: 'Podium', description: null, themeId: 'theme_proem', locale: 'pl',
		settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true, countdown: 0 },
		questions: [{ type: 'choice', prompt: 'Stolica Francji?', promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1, data: { type: 'choice', answers: ['Paryż', 'Lyon', 'Marsylia', 'Nicea'], correct: [0] } }]
	};
	const save = await admin.req(`/panel/api/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(quiz), headers: { 'content-type': 'application/json', accept: 'application/json' } });
	ok(save.status === 200, 'quiz zapisany');

	let ipSeq = 0;
	// 4 → 1 miejsce poza podium, 8 → 5 (nieparzyste), 9 → 6 (parzyste), 40 → 7 (nieparzyste, pełna dziesiątka)
	for (const N of [4, 8, 9, 40]) {
		const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
		const host = waitForHydration(await ctx.newPage());
		await host.goto(`${srv.base}/panel/quizzes/${id}/host`);
		await host.click('form[action="?/start"] button');
		await host.waitForSelector('.pin');
		const pin = (await host.textContent('.pin')).replace(/\s/g, '');
		const [screen] = await Promise.all([ctx.waitForEvent('page'), host.click('button:has-text("Otwórz ekran dla widzów")')]);
		await screen.setViewportSize({ width: 1920, height: 1080 });

		const bots = [];
		for (let i = 0; i < N; i++) {
			const ip = ++ipSeq;
			const s = connect(srv.base + '/game', { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { 'x-forwarded-for': `10.${(ip >> 8) & 255}.${ip & 255}.9` } });
			await new Promise((r) => s.on('connect', r));
			await emit(s, 'check', { pin });
			const res = await emit(s, 'join', { pin, random: true, deviceId: `podium-${N}-${i}`, avatar: i % 20 });
			if (res?.error) throw new Error(`join ${res.error}`);
			bots.push(s);
		}
		await host.waitForFunction((n) => document.body.textContent.includes(String(n)), N);

		await host.keyboard.press('Space'); // pytanie
		await sleep(1500);
		// Różne czasy odpowiedzi = różne wyniki; co trzeci odpowiada źle.
		for (const [i, s] of bots.entries()) { await emit(s, 'answer', { index: 0, choice: i % 3 === 2 ? 1 : 0 }); await sleep(40); }
		for (let k = 0; k < 6 && !(await screen.locator('.podium').count()); k++) {
			await host.keyboard.press('Space');
			await screen.waitForSelector('.podium', { timeout: 3000 }).catch(() => {});
		}
		ok((await screen.locator('.podium').count()) === 1, `${N} graczy: ekran podium`);
		await sleep(10_000); // animacje wjazdu stopni, liczników, medali i listy

		const rest = Math.min(N, 10) - 3;
		for (const [w, h] of [[1920, 1080], [1366, 768]]) {
			await screen.setViewportSize({ width: w, height: h });
			await sleep(600);
			const r = await screen.evaluate(() => {
				const g = (q) => document.querySelector(q)?.getBoundingClientRect();
				const p = g('.podium'), list = g('.rank.rest'), sum = g('.board .summary'), b = g('.board');
				const cell = document.querySelector('.rank.rest li.sum-cell');
				const blocks = [...document.querySelectorAll('.podium .block')].map((el) => {
					const br = el.getBoundingClientRect();
					return [...el.children].every((ch) => { const cr = ch.getBoundingClientRect(); return cr.top >= br.top - 1 && cr.bottom <= br.bottom + 1; });
				});
				const medals = document.querySelectorAll('.podium .block .medal').length;
				const textFits = [cell, document.querySelector('.board .summary')].filter(Boolean).every((el) => el.scrollWidth <= el.clientWidth + 1);
				return {
					fits: (!list || p.bottom <= list.top + 1) && (!sum || !list || list.bottom <= sum.top + 1) && (!sum || p.bottom <= sum.top + 1) && Math.max(p.bottom, list?.bottom ?? 0, sum?.bottom ?? 0) <= b.bottom + 1,
					rows: document.querySelectorAll('.rank.rest li:not(.sum-cell)').length,
					cell: !!cell, bar: !!sum, blocks, medals, textFits
				};
			});
			const tag = `${N} graczy, ${w}×${h}:`;
			ok(r.fits, `${tag} podium, lista i podsumowanie nie nachodzą na siebie i mieszczą się na ekranie`);
			ok(r.rows === rest, `${tag} lista miejsc 4–${3 + rest} (${r.rows})`);
			const odd = rest > 3 && rest % 2 === 1;
			ok(odd ? r.cell && !r.bar : !r.cell && r.bar, `${tag} podsumowanie ${odd ? 'w pustej komórce listy' : 'jako pasek pod listą'}`);
			ok(r.textFits, `${tag} tekst podsumowania się mieści`);
			ok(r.medals === 3 && r.blocks.length === 3 && r.blocks.every(Boolean), `${tag} medale i punkty mieszczą się w stopniach podium`);
		}
		for (const s of bots) s.close();
		await ctx.close();
	}
} finally {
	await browser.close();
	srv.stop();
}
finish();
