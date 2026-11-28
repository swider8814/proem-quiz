// Pełna gra w prawdziwej przeglądarce: prowadzący + 3 telefony (iPhone).   node tests/game-ui.e2e.mjs [katalog-na-zrzuty]
// Wymaga: npm run build oraz Chrome/Chromium (CHROME_PATH lub /usr/bin/google-chrome).
import fs from 'node:fs';
import { chromium, devices } from 'playwright-core';
import { finish, makeAdmin, makeMp3, ok, sleep, startServer, upload, appDialogs } from './_helpers.mjs';

const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = await startServer();
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
	args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox']
});
const snap = async (p, name) => shots && p.screenshot({ path: `${shots}/${name}.png` });

try {
	// ── Przygotowanie: admin + quiz z 5 typami pytań ─────────────────────
	const { browser: admin } = await makeAdmin(srv, 'host@proem.pl');
	const audio = JSON.parse((await upload(admin, makeMp3(4), 'koleda.mp3')).text);
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Wigilia – test' } });
	const quizId = c.loc.split('/').pop();
	const base = { promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1 };
	const quiz = {
		title: 'Wigilia – test', description: null, themeId: 'theme_proem', locale: 'pl',
		settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
		questions: [
			{ ...base, type: 'audio', prompt: 'Jaka to kolęda?', promptTranslation: 'Which carol is this?', data: { type: 'audio', answers: ['Cicha noc', 'Wśród nocnej ciszy', 'Lulajże, Jezuniu', 'Dzisiaj w Betlejem'], correct: [0], audioMediaId: audio.id, startMs: 500, endMs: 3500, loop: false, revealEndMs: null } },
			{ ...base, type: 'truefalse', prompt: 'Boże Narodzenie jest 25 grudnia', data: { type: 'truefalse', correct: true, thumbs: true } },
			{ ...base, type: 'text', prompt: 'Jak ma na imię renifer z czerwonym nosem?', data: { type: 'text', accepted: ['Rudolf', 'Rudolph'], typoTolerance: 1 } },
			{ ...base, type: 'order', prompt: 'Ułóż zdanie', data: { type: 'order', items: ['I', 'love', 'Christmas'], partialCredit: false } }
		]
	};
	const save = await admin.req(`/panel/api/quizzes/${quizId}`, { method: 'PUT', body: JSON.stringify(quiz), headers: { 'content-type': 'application/json', accept: 'application/json' } });
	ok(save.status === 200, 'quiz zapisany (z wycięciem fragmentu audio)');

	// ── Prowadzący ────────────────────────────────────────────────────────
	const hostCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
	await hostCtx.addCookies([{ name: 'pq_session', value: admin.jar.pq_session, url: srv.base }]);
	// Zapis odtwarzanych dźwięków (muzyka w tle, podium) – Audio nie trafia do DOM.
	await hostCtx.addInitScript(() => {
		window.__plays = [];
		const play = HTMLMediaElement.prototype.play;
		HTMLMediaElement.prototype.play = function () {
			window.__plays.push(new URL(this.src, location.href).pathname);
			return play.call(this).catch(() => {});
		};
	});
	const host = await hostCtx.newPage();
	const hostDlg = await appDialogs(host);
	const hostErrors = [];
	host.on('pageerror', (e) => hostErrors.push(String(e)));
	host.on('console', (m) => m.type() === 'error' && hostErrors.push(m.text()));
	await host.goto(`${srv.base}/panel/quizzes/${quizId}/host`);
	await host.click('form[action="?/start"] button');
	await host.waitForSelector('.pin');
	const pin = (await host.textContent('.pin')).replace(/\s/g, '');
	ok(/^\d{6}$/.test(pin), `gra uruchomiona, PIN ${pin}`);

	// ── 3 telefony ────────────────────────────────────────────────────────
	const phones = [];
	for (let i = 0; i < 3; i++) {
		const ctx = await browser.newContext({ ...devices['iPhone 14'] });
		const p = await ctx.newPage();
		p.errors = [];
		p.on('pageerror', (e) => p.errors.push(String(e)));
		phones.push(p);
	}
	// Telefon 1: PIN wpisany ręcznie, własny nick
	await phones[0].goto(`${srv.base}/play`);
	await snap(phones[0], '01-telefon-pin');
	await phones[0].fill('#pin', pin);
	await phones[0].click('button:has-text("Dalej")');
	await phones[0].waitForSelector('.nick-show');
	await snap(phones[0], '02-telefon-nick');
	await phones[0].click('text=albo wpisz własny');
	await phones[0].fill('input[aria-label="Twój nick"]', 'Kasia');
	await phones[0].click('button:has-text("Dołącz do gry")');
	await phones[0].waitForSelector('text=Jesteś w grze!');
	// Telefon 2: z kodu QR (PIN w adresie), losowy nick
	await phones[1].goto(`${srv.base}/play?pin=${pin}`);
	await phones[1].waitForSelector('.nick-show');
	await phones[1].click('button:has-text("Dołącz do gry")');
	await phones[1].waitForSelector('text=Jesteś w grze!');
	// Telefon 3: wulgarny nick odrzucony, potem poprawny
	await phones[2].goto(`${srv.base}/play?pin=${pin}`);
	await phones[2].click('text=albo wpisz własny');
	await phones[2].fill('input[aria-label="Twój nick"]', 'kurwa');
	await phones[2].click('button:has-text("Dołącz do gry")');
	await phones[2].waitForSelector('text=Wybierz inny nick.');
	ok(true, 'wulgarny nick odrzucony w interfejsie');
	await phones[2].fill('input[aria-label="Twój nick"]', 'Ola');
	await phones[2].click('button:has-text("Dołącz do gry")');
	await phones[2].waitForSelector('text=Jesteś w grze!');
	await snap(phones[2], '03-telefon-poczekalnia');

	await host.waitForFunction(() => document.querySelectorAll('.players .player').length === 3);
	ok(true, 'prowadzący widzi 3 graczy');
	ok((await host.$('button:has-text("Wycisz muzykę")')) !== null, 'muzyka w poczekalni z przyciskiem wyciszenia');
	ok((await host.evaluate(() => window.__plays)).includes('/sounds/music-background.mp3'), 'w poczekalni gra nagranie muzyki w tle');
	await snap(host, '04-prowadzacy-poczekalnia');

	// ── Ekran dla widzów (osobne okno na projektor) ───────────────────────
	const [screen] = await Promise.all([host.waitForEvent('popup'), host.click('button:has-text("Otwórz ekran dla widzów")')]);
	screen.errors = [];
	screen.on('pageerror', (e) => screen.errors.push(String(e)));
	await screen.setViewportSize({ width: 1920, height: 1080 });
	await screen.waitForSelector('.pin');
	ok((await screen.textContent('.pin')).replace(/\s/g, '') === pin, 'ekran widzów pokazuje PIN');
	ok(new URL(screen.url()).searchParams.get('pin') === pin, 'okno widzów przypięte do PIN-u tej gry (kanał per gra)');
	// Inna gra tego samego quizu w tej samej przeglądarce nie miesza się z tym ekranem
	await host.evaluate(([qid]) => new BroadcastChannel(`pq-screen-${qid}-000000`).postMessage({ t: 'closed' }), [quizId]);
	await sleep(300);
	ok((await screen.$('.pin')) !== null, 'komunikat z kanału innej gry ignorowany');
	ok(await screen.$eval('.qr', (i) => i.src.startsWith('data:image/')), 'ekran widzów pokazuje kod QR');
	ok((await screen.$$('.game .controls, .game .mini, .game button')).length === 0, 'ekran widzów nie ma żadnych przycisków');
	await screen.waitForFunction(() => document.querySelectorAll('.players .player').length === 3);
	await host.waitForSelector('text=Ekran widzów połączony');
	ok(true, 'prowadzący widzi, że ekran widzów jest połączony');
	await snap(screen, '04b-ekran-widzow-poczekalnia');

	// ── Pytanie 1: audio ──────────────────────────────────────────────────
	await host.click('button:has-text("Zaczynamy")');
	await phones[0].waitForSelector('.tiles .g-tile', { timeout: 10000 });
	await host.waitForSelector('.eq');
	await sleep(500);
	const audioPlaying = await host.evaluate(() => !!document.querySelector('.eq.on'));
	ok(audioPlaying, 'fragment audio gra u prowadzącego');
	await snap(host, '05-prowadzacy-audio');
	await snap(phones[0], '06-telefon-pytanie-audio');
	await phones[0].click('.g-tile.a0'); // Cicha noc – dobrze
	await phones[1].click('.g-tile.a1');
	await phones[2].click('.g-tile.a0');
	await phones[0].waitForSelector('text=Dobrze!');
	await phones[1].waitForSelector('text=Niestety źle');
	ok(true, 'wszyscy odpowiedzieli → wynik od razu (bez czekania na koniec czasu)');
	await snap(phones[0], '07-telefon-dobrze');
	await snap(phones[1], '08-telefon-zle');
	await snap(host, '09-prowadzacy-wyniki');
	// Przyciski prowadzącego muszą być widoczne także na mniejszym ekranie laptopa
	// (np. 1280×720 przy skalowaniu Windows), bez przewijania.
	const footerFits = async (label) => {
		for (const vp of [{ width: 1600, height: 900 }, { width: 1280, height: 600 }, { width: 1024, height: 560 }]) {
			await host.setViewportSize(vp);
			await sleep(150);
			const m = await host.evaluate(() => {
				const f = document.querySelector('.controls').getBoundingClientRect();
				return { bottom: Math.round(f.bottom), vh: innerHeight, scroll: document.scrollingElement.scrollHeight };
			});
			ok(m.bottom <= m.vh && m.scroll <= m.vh, `${label} ${vp.width}×${vp.height}: przyciski na dole widoczne ${JSON.stringify(m)}`);
		}
		await host.setViewportSize({ width: 1600, height: 900 });
	};
	await footerFits('wyniki pytania audio');
	await screen.waitForSelector('.dist .barv');
	ok(true, 'ekran widzów pokazuje wyniki pytania');
	await host.waitForSelector('.side li');
	ok((await host.$$('.side li')).length === 3, 'prowadzący ma ranking na żywo w panelu bocznym');
	ok((await screen.$$('.side')).length === 0, 'ranking na żywo nie trafia na ekran widzów');
	await snap(screen, '09b-ekran-widzow-wyniki');
	// Spacja w oknie widzów (np. pilot do prezentacji) przełącza grę u prowadzącego.
	await screen.keyboard.press('Space');
	await host.waitForSelector('.board');
	await screen.waitForSelector('.board');
	ok(true, 'spacja w oknie widzów → ranking u prowadzącego i na ekranie');
	// Tablica jak w Kahoot: najpierw punkty sprzed pytania, potem przesunięcia i nowe punkty
	const scoresNow = () => host.$$eval('.rank li .sc', (els) => els.map((e) => Number(e.textContent)));
	ok((await scoresNow()).every((x) => x === 0), `tablica startuje od punktów sprzed pytania (${await scoresNow()})`);
	await sleep(3000);
	const after = await scoresNow();
	const places = await host.$$eval('.rank li', (els) => els.map((e) => e.querySelector('.pos')?.textContent ?? 'medal'));
	ok(after.some((x) => x > 0) && after.every((x, i) => i === 0 || after[i - 1] >= x), `potem punkty dobiegają i kolejność według wyników (${after}; ${places})`);
	await snap(host, '09a-prowadzacy-tablica');
	await screen.waitForSelector('.rejoin .qr-sm');
	ok(true, 'między pytaniami ekran widzów pokazuje kod QR do powrotu');

	// „Wstecz” na telefonie nie wyrzuca z gry
	await phones[0].goBack();
	await phones[0].waitForSelector('.toast');
	ok(new URL(phones[0].url()).pathname === '/play' && (await phones[0].$('text=Jesteś w grze. Aby z niej wyjść')) !== null, 'wstecz w trakcie gry: zostaje w grze i widzi podpowiedź');
	// Wyjście ze strony i powrót przez kod QR → to samo konto (nick i punkty)
	const nickBefore = await phones[1].textContent('.g-chip.nick');
	await phones[1].goto('about:blank');
	await host.waitForSelector('.side li.off');
	ok(true, 'prowadzący widzi rozłączonego gracza');
	await phones[1].goto(`${srv.base}/play?pin=${pin}`);
	await phones[1].waitForSelector('.g-chip.nick');
	ok((await phones[1].textContent('.g-chip.nick')) === nickBefore, `po powrocie przez kod QR ten sam gracz: ${nickBefore}`);
	await host.waitForFunction(() => !document.querySelector('.side li.off'));
	ok(true, 'gracz znów połączony');
	await host.keyboard.press('Space');
	// Odliczanie przed pytaniem (domyślnie 5 s) na ekranie i na telefonie
	await host.waitForSelector('.intro .cd');
	const cd1 = Number(await host.textContent('.intro .cd'));
	await phones[0].waitForSelector('.cd');
	await snap(host, '09c-prowadzacy-odliczanie');
	await snap(phones[0], '09d-telefon-odliczanie');
	await sleep(1300);
	const cd2 = Number(await host.textContent('.intro .cd'));
	ok(cd1 >= 4 && cd1 <= 5 && cd2 < cd1, `odliczanie przed pytaniem: ${cd1} → ${cd2}`);
	await phones[0].waitForSelector('.prompt');
	await phones[0].waitForFunction(() => !document.body.innerText.includes('Przygotuj się'), null, { timeout: 8000 });

	const nextQ = async () => {
		await host.keyboard.press('Space'); // ranking
		await host.waitForSelector('.board');
		await host.keyboard.press('Space'); // kolejne pytanie
		await phones[0].waitForSelector('.prompt');
		await phones[0].waitForFunction(() => !document.body.innerText.includes('Przygotuj się'), null, { timeout: 8000 });
	};

	// ── Pytanie 2: prawda/fałsz ───────────────────────────────────────────
	await phones[0].waitForSelector('button.thumb[aria-label="Prawda"] svg');
	ok((await host.$$('.answers .thumb svg')).length === 2, 'prawda/fałsz jako kciuki: telefon i ekran');
	await snap(phones[0], '09e-telefon-kciuki');
	for (const p of phones) await p.click('button[aria-label="Prawda"]');
	await phones[0].waitForSelector('text=Dobrze!');
	ok(true, 'prawda/fałsz działa');
	await host.waitForSelector('.dist .barv');
	const tfBars = await host.$$eval('.dist .barv', (els) => els.map((e) => ({ cls: e.className, h: parseFloat(e.style.height), dim: e.classList.contains('dim') })));
	const tallest = tfBars.reduce((a, b) => (b.h > a.h ? b : a));
	ok(/\ba1\b/.test(tallest.cls) && !tallest.dim, `słupek „Prawda” ma kolor kafla „Prawda” (a1) i jest wyróżniony: ${JSON.stringify(tfBars)}`);

	// ── Pytanie 3: tekst ──────────────────────────────────────────────────
	await nextQ();
	await snap(phones[0], '10-telefon-tekst');
	await phones[0].fill('input[aria-label="Wpisz odpowiedź"]', 'rudolf');
	await phones[0].click('button:has-text("Wyślij")');
	await phones[1].fill('input[aria-label="Wpisz odpowiedź"]', 'Kometa');
	await phones[1].click('button:has-text("Wyślij")');
	await phones[2].fill('input[aria-label="Wpisz odpowiedź"]', 'Rudolff');
	await phones[2].click('button:has-text("Wyślij")');
	await phones[2].waitForSelector('text=Dobrze!');
	ok(true, 'odpowiedź tekstowa z literówką zaliczona');

	// ── Pytanie 4: kolejność ──────────────────────────────────────────────
	await nextQ();
	const words = ['I', 'love', 'Christmas'];
	const orderNow = (p) => p.$$eval('.order .item .label', (els) => els.map((e) => e.textContent.trim()));
	// Telefon 1: przeciąganie palcem/myszą
	for (let k = 0; k < words.length; k++) {
		const cur = await orderNow(phones[0]);
		const from = cur.indexOf(words[k]);
		if (from === k) continue;
		const items = await phones[0].$$('.order .item');
		const a = await items[from].boundingBox();
		const b = await items[k].boundingBox();
		await phones[0].mouse.move(a.x + 40, a.y + a.height / 2);
		await phones[0].mouse.down();
		for (let t = 1; t <= 8; t++) await phones[0].mouse.move(a.x + 40, a.y + a.height / 2 + ((b.y - a.y) * t) / 8);
		await phones[0].mouse.up();
		await sleep(100);
	}
	ok(JSON.stringify(await orderNow(phones[0])) === JSON.stringify(words), `przeciąganie ułożyło kolejność: ${await orderNow(phones[0])}`);
	// Pozostałe: strzałki (dostępność, klawiatura)
	for (const p of phones.slice(1)) {
		for (let k = 0; k < words.length; k++) {
			let cur = await orderNow(p);
			while (cur.indexOf(words[k]) > k) {
				await p.click(`.order .item:nth-child(${cur.indexOf(words[k]) + 1}) .arrow[aria-label^="Wyżej"]`);
				cur = await orderNow(p);
			}
		}
	}
	await snap(phones[0], '11-telefon-kolejnosc');
	for (const p of phones) await p.click('button:has-text("Wyślij")');
	await phones[0].waitForSelector('text=Dobrze!');
	ok(true, 'pytanie „kolejność” działa');

	// ── Koniec ────────────────────────────────────────────────────────────
	await host.keyboard.press('Space'); // ranking
	await host.waitForSelector('.board');
	// Spacja przy otwartym oknie „Usunąć gracza?” klika zaznaczone „Anuluj”, a nie przechodzi dalej (review Codexa)
	await host.click('.side li:has-text("Ola") .mini');
	await host.waitForSelector('dialog.pq-dialog[open]');
	await host.keyboard.press('Space');
	await host.waitForSelector('dialog.pq-dialog[open]', { state: 'detached' }).catch(() => {});
	await sleep(400);
	ok(!(await host.isVisible('dialog.pq-dialog[open]')) && (await host.isVisible('.board')) && !(await host.isVisible('.podium')) && (await host.$$('.side li')).length === 3,
		'Spacja w oknie z pytaniem: zamyka je (Anuluj), gra nie przechodzi dalej, gracz zostaje');
	// Wyrzucenie gracza w trakcie gry – z potwierdzeniem
	hostDlg.once('dialog', (d) => d.dismiss());
	await host.click('.side li:has-text("Ola") .mini');
	await sleep(300);
	ok((await host.$$('.side li')).length === 3, 'anulowane potwierdzenie → gracz zostaje');
	hostDlg.once('dialog', (d) => d.accept());
	await host.click('.side li:has-text("Ola") .mini');
	await phones[2].waitForSelector('text=Prowadzący usunął Cię z gry.');
	await host.waitForFunction(() => document.querySelectorAll('.side li').length === 2);
	ok(true, 'wyrzucenie w trakcie gry: gracz dostaje komunikat, znika z rankingu');
	await host.keyboard.press('Space'); // podium
	await host.waitForSelector('.podium');
	// Podium po kolei: 3. → 2. → 1. miejsce (na początku zwycięzcy jeszcze nie widać)
	const op = (sel) => host.$eval(sel, (e) => Number(getComputedStyle(e).opacity)).catch(() => 1);
	const early = await op('.step.s1');
	await sleep(4800);
	ok(early < 0.5 && (await op('.step.s1')) === 1, `podium wjeżdża po kolei: 1. miejsce na początku ukryte (${early}), potem widoczne`);
	ok((await host.evaluate(() => window.__plays)).includes('/sounds/podium-fanfare.mp3'), 'na podium gra nagranie fanfary');
	await phones[0].waitForSelector('text=Koniec gry!');
	await snap(host, '12-prowadzacy-podium');
	await snap(phones[0], '13-telefon-koniec');
	const first = await host.textContent('.step.s1 .who');
	ok(first === 'Kasia', `zwyciężczyni na podium: ${first}`);
	await screen.waitForSelector('.podium');
	await sleep(6500); // 3. → 2. → 1. miejsce, konfetti, reszta listy
	await snap(screen, '12b-ekran-widzow-podium');
	ok(true, 'ekran widzów pokazuje podium');
	await footerFits('podium');

	// Po końcu gry „wstecz” znów wychodzi ze strony (review Codexa)
	await phones[0].goBack();
	await sleep(300);
	await phones[0].goBack().catch(() => {});
	await sleep(300);
	ok(!phones[0].url().includes('/play'), `po zakończeniu gry „wstecz” nie jest blokowane (${phones[0].url()})`);

	// ── Odświeżenie telefonu w trakcie gry nie gubi gracza ───────────────
	await phones[1].reload();
	await phones[1].waitForSelector('text=Koniec gry!');
	ok(true, 'po odświeżeniu telefon wraca do gry');

	// Prowadzący zamyka zakończoną grę: telefony zostają na wynikach, bez paska „Łączenie…”
	hostDlg.once('dialog', (d) => d.accept());
	await host.click('.game button.g-btn:has-text("Zakończ grę")');
	await sleep(2500);
	ok((await phones[1].$$('.offline')).length === 0 && (await phones[1].isVisible('text=Koniec gry!')), 'po zamknięciu gry telefon zostaje na wynikach bez paska „Łączenie…”');

	ok(hostErrors.length === 0, `brak błędów JS u prowadzącego ${hostErrors.join(' | ')}`);
	// Zamknięcie okna prowadzącego: ekran widzów nie może zostać zamrożony na ostatnim widoku.
	await host.close();
	// Zwykle od razu (sygnał „op-bye” przy zamknięciu karty), a gdy przeglądarka go nie wyśle – po braku
	// sygnału życia przez 6 s (opLost w Host.svelte). Limit 5 s był krótszy od tej drugiej drogi (niestabilne CI).
	await screen.waitForSelector('text=czekam na okno prowadzącego', { timeout: 10_000 });
	ok(true, 'po zamknięciu okna prowadzącego ekran widzów pokazuje komunikat');
	ok(screen.errors.length === 0, `brak błędów JS na ekranie widzów ${screen.errors.join(' | ')}`);
	ok(phones.every((p) => p.errors.length === 0), `brak błędów JS na telefonach ${phones.flatMap((p) => p.errors).join(' | ')}`);
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	await browser.close();
	srv.stop();
}
process.exit(finish() ? 1 : 0);
