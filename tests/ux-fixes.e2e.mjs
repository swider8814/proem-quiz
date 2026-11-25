// Poprawki intuicyjności (przegląd UX, listopad 2026):
//  – telefon: „Dołącz do gry” widoczne bez przewijania (24 postacie nad przyciskiem),
//  – edytor na komputerze: blok dodawania pytań z telefonu ukryty (był czwartą kolumną),
//  – odmiana: „1 gracz”, „2 gracze”, „5 graczy”,
//  – menu panelu z ikonami.
//   node tests/ux-fixes.e2e.mjs [katalog-na-zrzuty]   (wymaga npm run build)
import fs from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { finish, makeAdmin, ok, startServer, waitForHydration } from './_helpers.mjs';
import { t } from '../src/lib/game/i18n.ts';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const snap = async (p, n) => shots && p.screenshot({ path: `${shots}/${n}.png` });

// Odmiana bez przeglądarki
const pl = t('pl');
ok([1, 2, 4, 5, 12, 22, 25].map((n) => `${n} ${pl.players(n)}`).join(', ') === '1 gracz, 2 gracze, 4 gracze, 5 graczy, 12 graczy, 22 gracze, 25 graczy', 'odmiana: gracz / gracze / graczy');
ok(`${pl.answers(1)} ${pl.answers(3)} ${pl.answers(7)}` === 'odpowiedź odpowiedzi odpowiedzi', 'odmiana: odpowiedź / odpowiedzi');
ok(`${t('en').players(1)} ${t('en').players(2)}` === 'player players', 'odmiana EN: player / players');
ok(pl.avatarNames.length === 24 && t('en').avatarNames.length === 24 && t('uk').avatarNames.length === 24, 'nazwy wszystkich 24 postaci w każdym języku');

const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
	const { browser: admin } = await makeAdmin(srv, 'ux@proem.pl');
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'UX' } });
	const id = c.loc.split('/').pop();
	const quiz = {
		title: 'UX', description: null, themeId: 'theme_proem', locale: 'pl',
		settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
		questions: [{ type: 'truefalse', prompt: 'Prawda?', promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1, data: { type: 'truefalse', correct: true, thumbs: false } }]
	};
	await admin.req(`/panel/api/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(quiz), headers: { 'content-type': 'application/json', accept: 'application/json' } });

	// ── Edytor i menu na komputerze ──
	for (const width of [1280, 1920]) {
		const ctx = await browser.newContext({ viewport: { width, height: 900 } });
		await ctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
		const p = waitForHydration(await ctx.newPage());
		await p.goto(`${srv.base}/panel/quizzes/${id}`);
		ok(!(await p.isVisible('.add-mobile')), `edytor ${width} px: blok dodawania z telefonu ukryty`);
		ok(await p.isVisible('.list .add button'), `edytor ${width} px: „Dodaj pytanie” na liście pytań`);
		if (width === 1280) {
			await snap(p, 'ux-01-edytor');
			await p.goto(`${srv.base}/panel`);
			const icons = await p.$$eval('.sidebar nav a', (as) => as.map((a) => !!a.querySelector('svg.icon') && a.textContent.trim().length > 0));
			ok(icons.length === 6 && icons.every(Boolean), `menu panelu: ${icons.length} pozycji, każda z ikoną i napisem`);
			await snap(p, 'ux-02-menu');
		}
		await ctx.close();
	}

	// ── Gra: lobby prowadzącego i dołączanie z małych telefonów ──
	const hctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
	await hctx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const host = waitForHydration(await hctx.newPage());
	await host.goto(`${srv.base}/panel/quizzes/${id}/host`);
	await host.click('form[action="?/start"] button');
	await host.waitForSelector('.pin');
	const pin = (await host.textContent('.pin')).replace(/\s/g, '');
	const countText = async () => (await host.textContent('.count')).replace(/\s+/g, ' ').trim();
	const phones = [];
	for (const [i, dev] of ['iPhone SE', 'iPhone 14'].entries()) {
		const pl = await (await browser.newContext({ ...devices[dev] })).newPage();
		phones.push(pl);
		await pl.goto(`${srv.base}/play?pin=${pin}`);
		await pl.waitForSelector('.nick-show');
		// Ekran wjeżdża animacją (fly) – mierzymy po jej końcu (kołysanie wybranej postaci trwa bez końca, pomijamy je).
		await pl.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
		const m = await pl.evaluate(() => {
			const r = document.querySelector('button.join').getBoundingClientRect();
			return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, scrollY };
		});
		ok(m.bottom <= m.vh && m.top >= 0 && m.scrollY === 0, `${dev}: „Dołącz do gry” widoczne bez przewijania ${JSON.stringify(m)}`);
		const label = await pl.getAttribute('.av.sel', 'aria-label');
		ok(t('pl').avatarNames.includes(label), `${dev}: wybrana postać ma nazwę dla czytnika („${label}”)`);
		if (i === 0) await snap(pl, 'ux-03-nick-iphone-se');
		await pl.click('button.join');
		await pl.waitForSelector('text=Jesteś w grze!');
		await host.waitForFunction((n) => document.querySelectorAll('.players .player').length === n, i + 1);
		ok((await countText()) === (i === 0 ? '1 gracz' : '2 gracze'), `lobby: „${await countText()}”`);
	}
	await snap(host, 'ux-04-prowadzacy-lobby');
	// Pasek prowadzącego: „Zaczynamy” jako jedyny przycisk główny, na końcu paska.
	const bar = await host.$$eval('.controls .g-btn', (bs) => bs.map((b) => ({ t: b.textContent.trim(), primary: b.classList.contains('primary') })));
	ok(bar.filter((b) => b.primary).length === 1 && bar.at(-1).primary, `prowadzący: jeden główny przycisk na końcu (${bar.map((b) => b.t).join(' | ')})`);
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
