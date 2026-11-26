// Obrazki jako odpowiedzi: edytor → gra (telefon i ekran) + dostęp do plików tylko w trakcie pytania.
//   node tests/image-answers.e2e.mjs [katalog-na-zrzuty]   (wymaga npm run build i Chrome)
import fs from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { finish, makeAdmin, ok, sleep, startServer, upload } from './_helpers.mjs';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const snap = async (p, name) => shots && p.screenshot({ path: `${shots}/${name}.png` });
const srv = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });

// Kolorowe obrazki 2×2 PNG (różne pliki → różne media).
const zlib = await import('node:zlib');
const png = (r, g, b) => {
	const raw = Buffer.alloc(2 * (1 + 2 * 3));
	for (let y = 0; y < 2; y++) {
		raw[y * 7] = 0;
		for (let x = 0; x < 2; x++) raw.set([r, g, b], y * 7 + 1 + x * 3);
	}
	const chunk = (type, data) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const td = Buffer.concat([Buffer.from(type), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(zlib.crc32(td) >>> 0);
		return Buffer.concat([len, td, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(2, 0);
	ihdr.writeUInt32BE(2, 4);
	ihdr.set([8, 2, 0, 0, 0], 8);
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

try {
	const { browser: admin } = await makeAdmin(srv, 'obrazki@proem.pl');
	const imgs = [];
	for (const [r, g, b] of [[230, 0, 40], [20, 100, 220], [250, 200, 0], [0, 160, 80]]) imgs.push(JSON.parse((await upload(admin, png(r, g, b), 'x.png')).text).id);
	const secret = JSON.parse((await upload(admin, png(9, 9, 9), 'tajny.png')).text).id;
	ok(imgs.every(Boolean) && !!secret, 'obrazki wgrane');
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Zwierzęta' } });
	const quizId = c.loc.split('/').pop();
	const base = { promptTranslation: null, timeLimit: 20, pointsMultiplier: 1 };
	const quiz = (questions) => JSON.stringify({
		title: 'Zwierzęta', description: null, themeId: 'theme_proem_vivid', locale: 'pl',
		settings: { defaultTimeLimit: 20, countdown: 3, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
		questions
	});
	const json = { 'content-type': 'application/json', accept: 'application/json' };
	const q1 = { ...base, imageMediaId: secret, type: 'choice', prompt: 'Który to osioł?', data: { type: 'choice', answers: ['', 'Owca', '', ''], correct: [0], images: imgs, alts: ['Szary osioł z długimi uszami', null, '', null] } };
	const bad = await admin.req(`/panel/api/quizzes/${quizId}`, { method: 'PUT', headers: json, body: quiz([{ ...q1, data: { ...q1.data, images: [imgs[0], null, null, null], answers: ['', 'Owca', '', 'x'] } }]) });
	ok(bad.status === 400, 'odpowiedź bez podpisu i bez obrazka odrzucona');
	const save = await admin.req(`/panel/api/quizzes/${quizId}`, { method: 'PUT', headers: json, body: quiz([q1]) });
	ok(save.status === 200, 'quiz z obrazkami jako odpowiedziami zapisany');

	const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
	await hostCtx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	const host = await hostCtx.newPage();
	await host.goto(`${srv.base}/panel/quizzes/${quizId}/host`);
	await host.click('form[action="?/start"] button');
	await host.waitForSelector('.pin');
	const pin = (await host.textContent('.pin')).replace(/\s/g, '');
	const anon = (p) => fetch(`${srv.base}${p}`);
	ok((await anon(`/game-media/${pin}/${imgs[0]}`)).status === 404, 'w poczekalni obrazki odpowiedzi niedostępne');

	// Wybór postaci na wąskich telefonach: jeden rząd przewijany w bok wewnątrz karty, nic nie zasłania napisu pod nim,
	// strona nie przewija się w poziomie, a kliknięta postać jest widoczna w rzędzie.
	for (const dev of ['iPhone SE', 'iPhone 14', 'Galaxy S9+']) {
		const p = await (await browser.newContext({ ...devices[dev] })).newPage();
		await p.goto(`${srv.base}/play?pin=${pin}`);
		await p.waitForSelector('.avatars .av');
		await p.click('.avatars .av >> nth=7');
		await sleep(400);
		const lay = await p.evaluate(() => {
			const card = document.querySelector('form.card').getBoundingClientRect();
			const strip = document.querySelector('.avatars');
			const sr = strip.getBoundingClientRect();
			const avs = [...document.querySelectorAll('.avatars .av')].map((b) => b.getBoundingClientRect());
			const sel = document.querySelector('.avatars .av.sel').getBoundingClientRect();
			const label = document.querySelectorAll('form.card .big-label')[1].getBoundingClientRect();
			return {
				inside: sr.left >= card.left - 1 && sr.right <= card.right + 1,
				scrolls: strip.scrollWidth > strip.clientWidth,
				selVisible: sel.left >= sr.left - 1 && sel.right <= sr.right + 1,
				below: avs.every((r) => r.bottom <= label.top + 1),
				pageFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
				w: Math.round(avs[0].width)
			};
		});
		ok(lay.inside && lay.scrolls && lay.selVisible && lay.below && lay.pageFits && lay.w >= 40, `${dev}: rząd postaci w karcie, przewijany w bok, nie zasłania napisu (${JSON.stringify(lay)})`);
		// Wybrana postać wyraźnie oznaczona także w motywie kolorowym (przezroczysta linia motywu)
		const sel = await p.evaluate(() => {
			const s = document.querySelector('.av.sel');
			const other = document.querySelector('.av:not(.sel)');
			return { idx: [...document.querySelectorAll('.av')].indexOf(s), border: getComputedStyle(s).borderColor, check: !!s.querySelector('.av-check'), dim: Number(getComputedStyle(other).opacity) };
		});
		ok(sel.idx === 7 && sel.border === 'rgb(17, 17, 17)' && sel.check && sel.dim < 1, `${dev}: wybrana postać podświetlona ✓, pozostałe przygaszone (${JSON.stringify(sel)})`);
		await p.context().close();
	}

	const phone = await (await browser.newContext({ ...devices['iPhone 14'] })).newPage();
	await phone.goto(`${srv.base}/play?pin=${pin}`);
	await phone.click('button:has-text("Dołącz do gry")');
	await phone.waitForSelector('text=Jesteś w grze!');
	await host.keyboard.press('Space');
	await phone.waitForSelector('.tiles.pics img.pic', { timeout: 10000 });
	await phone.waitForFunction(() => [...document.querySelectorAll('img.pic')].every((i) => i.complete && i.naturalWidth > 0));
	ok((await phone.$$('img.pic')).length === 4, 'telefon pokazuje 4 obrazki odpowiedzi');
	// Dostępność (review Codexa): nazwa przycisku = podpis, a bez podpisu – opis obrazka; dopiero bez obu – litera.
	const names = await phone.$$eval('.tiles .g-tile', (b) => b.map((x) => x.getAttribute('aria-label')));
	ok(names[0] === 'Szary osioł z długimi uszami' && names[1] === 'Owca' && names[2] === 'C', `telefon: nazwy odpowiedzi dla czytnika (${names.join(' | ')})`);
	ok((await phone.textContent('.tiles')).includes('Owca'), 'podpis pod obrazkiem, gdy jest');
	await host.waitForFunction(() => [...document.querySelectorAll('.answers img.ans-img')].filter((i) => i.naturalWidth > 0).length === 4);
	ok((await host.getAttribute('.answers img.ans-img >> nth=0', 'alt')) === 'Szary osioł z długimi uszami', 'ekran prowadzącego: opis obrazka jako alt');
	ok(true, 'ekran prowadzącego pokazuje obrazki odpowiedzi');
	const gm = await anon(`/game-media/${pin}/${imgs[1]}`);
	ok(gm.status === 200, 'w trakcie pytania obrazek odpowiedzi dostępny z PIN-em');
	ok(gm.headers.get('content-type') === 'image/webp', `telefony dostają lekką miniaturę WebP (${gm.headers.get('content-type')})`);
	ok((await anon(`/game-media/${pin}/${secret}`)).status === 404, 'obrazek do pytania (nie odpowiedzi) nie jest dostępny przez trasę gry');
	ok((await anon(`/game-media/000000/${imgs[1]}`)).status === 404, 'zły PIN → 404');
	ok((await anon(`/media/${imgs[1]}`)).status === 404, 'bez logowania /media dalej prywatne');
	await snap(phone, 'img-01-telefon');
	await snap(host, 'img-02-ekran');
	await phone.click('.g-tile.a0');
	await phone.waitForSelector('text=Dobrze!');
	ok(true, 'odpowiedź obrazkiem przyjęta');
	await host.keyboard.press('Space'); // podium (jedyne pytanie) / ranking
	await sleep(500);
	await host.keyboard.press('Space');
	await phone.waitForSelector('text=Koniec gry!');
	ok((await anon(`/game-media/${pin}/${imgs[1]}`)).status === 404, 'po pytaniu obrazki znów niedostępne');

	// Tryb drużynowy: podczas narady obrazki odpowiedzi widać na ekranie i telefonie (review Codexa)
	const c2 = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Drużyny' } });
	const q2 = c2.loc.split('/').pop();
	const teamBody = JSON.parse(quiz([q1]));
	teamBody.settings = { ...teamBody.settings, teamMode: true, teamTalk: 10, countdown: 3, avatars: false };
	teamBody.themeId = 'theme_proem_christmas';
	ok((await admin.req(`/panel/api/quizzes/${q2}`, { method: 'PUT', headers: json, body: JSON.stringify(teamBody) })).status === 200, 'quiz drużynowy zapisany');
	const host2 = await hostCtx.newPage();
	await host2.goto(`${srv.base}/panel/quizzes/${q2}/host`);
	await host2.click('form[action="?/start"] button');
	await host2.waitForSelector('.pin');
	const pin2 = (await host2.textContent('.pin')).replace(/\s/g, '');
	const team = await (await browser.newContext({ ...devices['iPhone 14'] })).newPage();
	await team.goto(`${srv.base}/play?pin=${pin2}`);
	await team.waitForSelector('input[aria-label="Imię 1"]');
	ok((await team.$$('.avatars')).length === 0, 'postacie wyłączone w ustawieniach → brak wyboru postaci na telefonie');
	ok((await team.$$('.snow span')).length > 0, 'motyw świąteczny: na telefonie pada śnieg');
	await team.fill('input[aria-label="Imię 1"]', 'Ala');
	await team.click('button:has-text("Dołącz do gry")');
	await team.waitForSelector('text=Jesteś w grze!');
	await host2.waitForSelector('.players .members');
	ok((await host2.textContent('.players')).includes('Ala'), 'członek drużyny widoczny w poczekalni');
	ok((await host2.$$('.snow span')).length > 0, 'motyw świąteczny: śnieg na ekranie prowadzącego');
	await host2.screenshot({ path: '/tmp/xmas-host.png' });
	await team.screenshot({ path: '/tmp/xmas-phone.png' });
	await host2.keyboard.press('Space');
	await host2.waitForSelector('.answers.talk');
	await host2.waitForFunction(() => [...document.querySelectorAll('.answers.talk img')].filter((i) => i.naturalWidth > 0).length === 4);
	await team.waitForFunction(() => [...document.querySelectorAll('.talk-img')].filter((i) => i.naturalWidth > 0).length === 4);
	ok(true, 'narada: obrazki odpowiedzi na ekranie i telefonie');
	await snap(team, 'img-03-narada-telefon');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
