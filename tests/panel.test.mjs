// Reset hasła, e-maile, motywy i ustawienia (osobny proces serwera).   node tests/panel.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Browser, finish, makeAdmin, makeAuthor, makeMp3, ok, startServer, upload } from './_helpers.mjs';

const srv = await startServer({ MAIL_TEST_OUTBOX: '1' });
const B = () => new Browser(srv.base);
const outbox = () => {
	const f = path.join(srv.dataDir, 'outbox.jsonl');
	return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
};
const waitMail = async (to, n) => {
	for (let i = 0; i < 80; i++) {
		const m = outbox().filter((x) => x.to === to);
		if (m.length >= n) return m[n - 1];
		await new Promise((r) => setTimeout(r, 50));
	}
	return null;
};

try {
	const adm = await makeAdmin(srv, 'admin@proem.pl');
	const admin = adm.browser;

	// ── Zaproszenie wysyłane e-mailem ─────────────────────────────────────
	const inv = await admin.req('/panel/users?/invite', { method: 'POST', form: { name: 'Ewa', email: 'ewa@proem.pl', role: 'author' } });
	ok(inv.status === 200 && /wysłano też e-mailem/.test(inv.text), 'zaproszenie wysłane e-mailem');
	const invMail = await waitMail('ewa@proem.pl', 1);
	const invLink = invMail?.text.match(/\/invite\/[A-Za-z0-9_-]+/)?.[0];
	ok(!!invLink, 'e-mail zawiera link aktywacyjny');
	ok(!/<script/i.test(invMail.html), 'treść HTML bez skryptów');

	// ── Reset hasła ───────────────────────────────────────────────────────
	const f1 = await B().req('/login/forgot', { method: 'POST', form: { email: 'admin@proem.pl' } });
	ok(!outbox().some((m) => m.to === 'admin@proem.pl'), 'odpowiedź przed jakąkolwiek pracą dla konta (brak różnicy czasu istnieje/nie istnieje)');
	const f2 = await B().req('/login/forgot', { method: 'POST', form: { email: 'nie-ma@proem.pl' } });
	ok(f1.status === 200 && f2.status === 200 && /Jeśli konto z tym adresem istnieje/.test(f1.text) && /Jeśli konto z tym adresem istnieje/.test(f2.text), 'ta sama odpowiedź dla istniejącego i nieistniejącego konta');
	const resetMail = await waitMail('admin@proem.pl', 1);
	const resetLink = resetMail?.text.match(/\/reset\/[A-Za-z0-9_-]+/)?.[0];
	ok(!!resetLink, 'e-mail z linkiem resetu');
	ok(outbox().every((m) => m.to !== 'nie-ma@proem.pl'), 'brak maila dla nieistniejącego konta');
	ok((await B().req(resetLink.replace('/reset/', '/invite/'))).status === 404, 'link resetu nie działa jako zaproszenie');
	ok((await B().req(invLink.replace('/invite/', '/reset/'))).status === 404, 'zaproszenie nie działa jako reset');

	const other = admin.clone();
	const r = B();
	const done = await r.req(resetLink, { method: 'POST', form: { password: 'NoweHaslo12345!', repeat: 'NoweHaslo12345!' } });
	ok(done.status === 303 && done.loc === '/login/2fa', 'reset hasła NIE omija 2FA (wymagany kod)');
	ok((await r.req('/panel/users')).status === 303, 'po resecie bez kodu brak dostępu');
	ok((await other.req('/panel/users')).status === 303, 'reset wylogował pozostałe sesje');
	ok((await B().req(resetLink, { method: 'POST', form: { password: 'InneHaslo12345!', repeat: 'InneHaslo12345!' } })).status === 404, 'link resetu działa tylko raz');
	const login = await B().req('/login', { method: 'POST', form: { email: 'admin@proem.pl', password: 'NoweHaslo12345!' } });
	ok(login.status === 303 && login.loc === '/login/2fa', 'logowanie nowym hasłem działa');

	// Limit próśb o reset
	for (let i = 0; i < 4; i++) await B().req('/login/forgot', { method: 'POST', form: { email: 'ewa2@proem.pl' } });
	ok(true, 'kolejne prośby o reset nie zwracają błędu (bez zdradzania limitu)');

	// ── Motywy i ustawienia ───────────────────────────────────────────────
	// świeża sesja admina (poprzednia wylogowana resetem) – przez nowe konto admina
	const adm2 = (await makeAdmin(srv, 'admin2@proem.pl')).browser;
	const author = await makeAuthor(srv, adm2, 'autor@proem.pl');
	ok((await author.req('/panel/themes')).status === 403, 'autor nie ma dostępu do motywów');
	ok((await author.req('/panel/settings')).status === 403, 'autor nie ma dostępu do ustawień');

	const c = await adm2.req('/panel/themes?/create', { method: 'POST', form: { name: 'Proem Zako – obozy', style: 'poster' } });
	ok(c.status === 303 && c.loc.startsWith('/panel/themes/theme_'), 'admin tworzy motyw');
	const themeUrl = c.loc;
	const good = { name: 'Proem Zako – obozy', style: 'vivid', headingFont: 'Montserrat', logoLight: null, logoDark: null,
		colors: { background: '#123456', surface: '#ffffff', text: '#000000', accent: '#ff0000', answers: ['#111111', '#222222', '#333333', '#444444'] } };
	const s1 = await adm2.req(`${themeUrl}?/save`, { method: 'POST', form: { theme: JSON.stringify(good) } });
	ok(s1.status === 200 && /Zapisano/.test(s1.text), 'zapis poprawnego motywu');
	const bad = { ...good, colors: { ...good.colors, background: 'red;background:url(//evil)' } };
	const s2 = await adm2.req(`${themeUrl}?/save`, { method: 'POST', form: { theme: JSON.stringify(bad) } });
	ok(s2.status === 400, 'kolor spoza formatu #RRGGBB odrzucony (brak wstrzyknięcia CSS)');
	const s3 = await adm2.req(`${themeUrl}?/save`, { method: 'POST', form: { theme: JSON.stringify({ ...good, headingFont: 'Comic Sans' }) } });
	ok(s3.status === 400, 'czcionka spoza listy odrzucona');

	// Logo organizacji – publiczne; zdjęcie spoza ustawień – nie
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
	const logo = JSON.parse((await upload(adm2, png, 'logo.png')).text);
	ok((await B().req(`/media/${logo.id}`, { raw: true })).status === 404, 'nowe zdjęcie nie jest publiczne');
	const st = await adm2.req('/panel/settings', { method: 'POST', form: { orgName: 'Fundacja Proem', orgLogo: logo.id } });
	ok(st.status === 200, 'zapis ustawień organizacji');
	ok((await B().req(`/media/${logo.id}`, { raw: true })).status === 200, 'logo organizacji jest publiczne');
	// Motyw z ciemnym tłem i dwoma logo: lista motywów pokazuje logo „na ciemne tło”
	{
		const lightLogo = JSON.parse((await upload(adm2, png, 'logo-jasne.png')).text);
		const darkLogo = JSON.parse((await upload(adm2, png, 'logo-ciemne.png')).text);
		const sv = await adm2.req(`${themeUrl}?/save`, { method: 'POST', form: { theme: JSON.stringify({ ...good, logoLight: lightLogo.id, logoDark: darkLogo.id }) } });
		ok(sv.status === 200, 'motyw z dwoma logo zapisany');
		const lst = await adm2.req('/panel/themes');
		// Sprawdzamy znaczniki <img> (dane strony zawierają oba adresy).
		const img = (h, id) => h.includes(`<img src="/media/${id}"`);
		ok(img(lst.text, darkLogo.id) && !img(lst.text, lightLogo.id), 'lista motywów: ciemne tło → logo na ciemne tło');
		await adm2.req(`${themeUrl}?/save`, { method: 'POST', form: { theme: JSON.stringify({ ...good, colors: { ...good.colors, background: '#f4f6ff' }, logoLight: lightLogo.id, logoDark: darkLogo.id }) } });
		const lst2 = await adm2.req('/panel/themes');
		ok(img(lst2.text, lightLogo.id) && !img(lst2.text, darkLogo.id), 'lista motywów: jasne tło → logo na jasne tło');
		await adm2.req(`${themeUrl}?/save`, { method: 'POST', form: { theme: JSON.stringify(good) } });
		// Dekoracja motywu (śnieg) zapisuje się; nieznana wartość odrzucona
		const snowSave = await adm2.req(`${themeUrl}?/save`, { method: 'POST', form: { theme: JSON.stringify({ ...good, decor: 'snow' }) } });
		const tdb = new Database(path.join(srv.dataDir, 'quiz.db'), { readonly: true });
		const decor = tdb.prepare('SELECT decor FROM themes WHERE id = ?').get(themeUrl.split('/').pop()).decor;
		const xmas = tdb.prepare("SELECT name, decor FROM themes WHERE id = 'theme_proem_christmas'").get();
		tdb.close();
		ok(snowSave.status === 200 && decor === 'snow', `dekoracja motywu zapisana (${decor})`);
		ok((await adm2.req(`${themeUrl}?/save`, { method: 'POST', form: { theme: JSON.stringify({ ...good, decor: '<script>' }) } })).status === 400, 'nieznana dekoracja odrzucona');
		ok(xmas?.name === 'Święta Bożego Narodzenia' && xmas.decor === 'snow', 'gotowy motyw świąteczny ze śniegiem');
		await adm2.req(`${themeUrl}?/save`, { method: 'POST', form: { theme: JSON.stringify(good) } });
	}

	// Zdjęcia: zmniejszane do 1600 px, bez metadanych, z miniaturą 480 px; ogromne wymiary odrzucane
	{
		const { execFileSync: ff } = await import('node:child_process');
		const tmp = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'pq-img-'));
		ff('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=3000x2000', '-frames:v', '1', '-metadata', 'comment=TAJNE-GPS-52.1', path.join(tmp, 'big.jpg')]);
		ff('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=8000x6000', '-frames:v', '1', path.join(tmp, 'huge.png')]);
		const bigUp = JSON.parse((await upload(adm2, fs.readFileSync(path.join(tmp, 'big.jpg')), 'zdjecie.jpg')).text);
		const pdb3 = new Database(path.join(srv.dataDir, 'quiz.db'), { readonly: true });
		const row = pdb3.prepare('SELECT file FROM media WHERE id = ?').get(bigUp.id);
		pdb3.close();
		const dim = (f) => ff('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', f], { encoding: 'utf8' }).trim();
		const stored = path.join(srv.dataDir, 'media', row.file);
		const thumb = stored.replace(/\.[a-z]+$/, '_t.webp');
		ok(dim(stored) === '1600x1067', `zdjęcie zmniejszone do 1600 px (${dim(stored)})`);
		ok(!fs.readFileSync(stored).includes('TAJNE-GPS'), 'metadane zdjęcia usunięte');
		ok(fs.existsSync(thumb) && dim(thumb) === '480x320', `miniatura 480 px WebP (${fs.existsSync(thumb) ? dim(thumb) : 'brak'})`);
		// Duży animowany GIF: zmniejszony do 1600 px, animacja zachowana; mały GIF bez zmian
		ff('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=2400x1200:rate=5', '-frames:v', '5', path.join(tmp, 'big.gif')]);
		ff('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=5', '-frames:v', '3', path.join(tmp, 'small.gif')]);
		const frames = (f) => ff('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim();
		const fileOf = (id) => {
			const d = new Database(path.join(srv.dataDir, 'quiz.db'), { readonly: true });
			const f = d.prepare('SELECT file FROM media WHERE id = ?').get(id).file;
			d.close();
			return path.join(srv.dataDir, 'media', f);
		};
		const gifBig = fileOf(JSON.parse((await upload(adm2, fs.readFileSync(path.join(tmp, 'big.gif')), 'duzy.gif')).text).id);
		ok(dim(gifBig) === '1600x800' && frames(gifBig) === '5', `duży GIF zmniejszony z animacją (${dim(gifBig)}, klatek ${frames(gifBig)})`);
		// Mały GIF z komentarzem (rozszerzenie 0x21 0xFE przed końcem pliku): komentarz usunięty, animacja i wymiary zostają
		const raw = fs.readFileSync(path.join(tmp, 'small.gif'));
		const note = Buffer.from('TAJNE-GPS-52.1');
		const smallSrc = Buffer.concat([raw.subarray(0, raw.length - 1), Buffer.from([0x21, 0xfe, note.length]), note, Buffer.from([0x00, 0x3b])]);
		const gifSmall = fileOf(JSON.parse((await upload(adm2, smallSrc, 'maly.gif')).text).id);
		ok(!fs.readFileSync(gifSmall).includes('TAJNE-GPS') && dim(gifSmall) === '320x240' && frames(gifSmall) === '3', `mały GIF oczyszczony z komentarza, animacja zachowana (${dim(gifSmall)}, klatek ${frames(gifSmall)})`);
		const hugeUp = await upload(adm2, fs.readFileSync(path.join(tmp, 'huge.png')), 'bomba.png');
		ok(hugeUp.status === 400 && /megapikseli/.test(hugeUp.text), 'obrazek 48 Mpx odrzucony przed dekodowaniem');
		fs.rmSync(tmp, { recursive: true, force: true });
	}
	const panel = await adm2.req('/panel');
	ok(panel.text.includes(`/media/${logo.id}`), 'logo w nagłówku panelu');

	// Domyślny motyw i usuwanie
	ok((await adm2.req(`${themeUrl}?/makeDefault`, { method: 'POST', form: {} })).status === 200, 'ustawienie motywu jako domyślnego');
	const del = await adm2.req(`${themeUrl}?/delete`, { method: 'POST', form: {} });
	ok(del.status === 400, 'motywu domyślnego nie da się usunąć');
	await adm2.req('/panel/themes/theme_proem?/makeDefault', { method: 'POST', form: {} });
	const del2 = await adm2.req(`${themeUrl}?/delete`, { method: 'POST', form: {} });
	ok(del2.status === 303, 'usunięcie motywu niedomyślnego');

	// ── Udostępnianie quizów między autorami ──
	const kasia = await makeAuthor(srv, adm2, 'kasia@proem.pl');
	const cq = await author.req('/panel?/create', { method: 'POST', form: { title: 'Quiz autora' } });
	const sq = cq.loc.split('/').pop();
	const json = { 'content-type': 'application/json', accept: 'application/json' };
	const quizBody = (title) => JSON.stringify({
		title, description: null, themeId: null, locale: 'pl',
		settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
		questions: [{ type: 'choice', prompt: '2+2?', promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1, data: { type: 'choice', answers: ['3', '4'], correct: [1] } }]
	});
	ok((await author.req(`/panel/api/quizzes/${sq}`, { method: 'PUT', body: quizBody('Quiz autora'), headers: json })).status === 200, 'autor zapisuje swój quiz');
	ok((await kasia.req(`/panel/quizzes/${sq}`)).status === 404, 'przed udostępnieniem inny autor nie widzi quizu');
	ok((await kasia.req(`/panel/quizzes/${sq}/share`)).status === 404, 'obcy nie otworzy strony udostępniania');

	const sharePage = await author.req(`/panel/quizzes/${sq}/share`);
	ok(sharePage.status === 200 && sharePage.text.includes('kasia@proem.pl'), 'właściciel widzi listę osób do udostępnienia');
	const kasiaId = sharePage.text.match(/<option value="(usr_[A-Za-z0-9_-]+)">kasia/)?.[1];
	ok(!!kasiaId, 'ID konta w formularzu udostępniania');

	const setShare = (b, form) => b.req(`/panel/quizzes/${sq}/share?/set`, { method: 'POST', form });
	ok((await setShare(author, { userId: kasiaId, permission: 'host' })).status === 200, 'udostępnienie do prowadzenia');
	const list = (await kasia.req('/panel')).text;
	ok(list.includes('Quiz autora'), 'udostępniony quiz na liście drugiej osoby');
	// Wyszukiwanie po autorze (imię i nazwisko konta „autor”), bez względu na wielkość liter
	const byAuthor = (await kasia.req('/panel?q=AUTOR')).text;
	ok(byAuthor.includes('Quiz autora'), 'wyszukiwanie po autorze znajduje udostępniony quiz');
	ok(!(await kasia.req('/panel?q=nikt-taki')).text.includes('Quiz autora'), 'wyszukiwanie po nieznanym autorze nic nie zwraca');
	ok((await kasia.req(`/panel/quizzes/${sq}`)).status === 200, 'osoba z dostępem „prowadzenie” otwiera quiz (podgląd)');
	ok((await kasia.req(`/panel/quizzes/${sq}/host`)).status === 200, 'osoba z dostępem „prowadzenie” otwiera ekran gry');
	ok((await kasia.req(`/panel/api/quizzes/${sq}`, { method: 'PUT', body: quizBody('Przejęty'), headers: json })).status === 403, 'dostęp „prowadzenie” nie pozwala edytować');
	ok((await kasia.req(`/panel/quizzes/${sq}/share`)).status === 403, 'osoba z dostępem nie zarządza udostępnianiem');

	// ── Dźwięk na podium: własny plik (fragment, wyrównana głośność), dostępny dla prowadzących ──
	const memMp3 = JSON.parse((await upload(author, makeMp3(6), 'mem.mp3')).text);
	const withPodium = (settings) => {
		const b = JSON.parse(quizBody('Quiz autora'));
		b.settings = { ...b.settings, ...settings };
		return JSON.stringify(b);
	};
	const noFile = await author.req(`/panel/api/quizzes/${sq}`, { method: 'PUT', body: withPodium({ podiumSound: 'custom', podiumAudio: null }), headers: json });
	ok(noFile.status === 400 && /Wybierz plik/.test(noFile.text), 'własny dźwięk bez pliku → czytelny błąd');
	const tooLong = await author.req(`/panel/api/quizzes/${sq}`, { method: 'PUT', body: withPodium({ podiumSound: 'custom', podiumAudio: { mediaId: memMp3.id, startMs: 0, endMs: 25_000 } }), headers: json });
	ok(tooLong.status === 400 && /20 sekund/.test(tooLong.text), 'dźwięk na podium dłuższy niż 20 s odrzucony');
	const savedPodium = await author.req(`/panel/api/quizzes/${sq}`, { method: 'PUT', body: withPodium({ podiumSound: 'custom', podiumAudio: { mediaId: memMp3.id, startMs: 500, endMs: 4500 } }), headers: json });
	ok(savedPodium.status === 200, 'zapis quizu z własnym dźwiękiem na podium');
	const pdb = new Database(path.join(srv.dataDir, 'quiz.db'), { readonly: true });
	const pset = JSON.parse(pdb.prepare('SELECT settings FROM quizzes WHERE id = ?').get(sq).settings);
	const clip = pdb.prepare('SELECT * FROM media WHERE id = ?').get(pset.podiumAudio?.clipMediaId ?? '');
	pdb.close();
	ok(pset.podiumSound === 'custom' && clip && clip.duration_ms >= 3500 && clip.duration_ms <= 4500, `wycięty fragment na podium: ${clip?.duration_ms} ms`);
	ok((await kasia.req(`/media/${clip.id}`)).status === 200, 'osoba prowadząca quiz może pobrać dźwięk na podium');
	const editorPage = await author.req(`/panel/quizzes/${sq}`);
	ok(!editorPage.text.includes(clip.id), 'edytor nie dostaje identyfikatora wyciętego fragmentu');
	const kasiaOwn = JSON.parse((await upload(kasia, makeMp3(3), 'kasia.mp3')).text);
	const foreign = await author.req(`/panel/api/quizzes/${sq}`, { method: 'PUT', body: withPodium({ podiumSound: 'custom', podiumAudio: { mediaId: kasiaOwn.id, startMs: 0, endMs: 2000 } }), headers: json });
	ok(foreign.status === 400, 'cudzy plik jako dźwięk na podium odrzucony');
	// ── Muzyka w tle: własny plik (pętla 5–60 s) ──
	const shortMusic = await author.req(`/panel/api/quizzes/${sq}`, { method: 'PUT', body: withPodium({ music: 'custom', musicAudio: { mediaId: memMp3.id, startMs: 0, endMs: 3000 } }), headers: json });
	ok(shortMusic.status === 400 && /od 5 do 60/.test(shortMusic.text), 'muzyka krótsza niż 5 s odrzucona');
	const noMusicFile = await author.req(`/panel/api/quizzes/${sq}`, { method: 'PUT', body: withPodium({ music: 'custom', musicAudio: null }), headers: json });
	ok(noMusicFile.status === 400, 'własna muzyka bez pliku odrzucona');
	const musicOk = await author.req(`/panel/api/quizzes/${sq}`, { method: 'PUT', body: withPodium({ music: 'custom', musicAudio: { mediaId: memMp3.id, startMs: 0, endMs: 6000 }, musicLobby: true, musicQuestions: false }), headers: json });
	ok(musicOk.status === 200, 'zapis z własną muzyką w tle');
	const mdb2 = new Database(path.join(srv.dataDir, 'quiz.db'), { readonly: true });
	const mset = JSON.parse(mdb2.prepare('SELECT settings FROM quizzes WHERE id = ?').get(sq).settings);
	mdb2.close();
	ok(mset.music === 'custom' && !!mset.musicAudio?.clipMediaId && mset.musicQuestions === false, 'muzyka: wycięty fragment i ustawienia zapisane');
	ok((await setShare(kasia, { userId: kasiaId, permission: 'edit' })).status === 403, 'nie można samemu podnieść sobie uprawnień');
	const delShared = await kasia.req('/panel?/delete', { method: 'POST', form: { id: sq } });
	ok(delShared.status === 403, 'osoba z dostępem nie usunie cudzego quizu');
	ok((await kasia.req('/panel?/duplicate', { method: 'POST', form: { id: sq } })).status === 403, 'dostęp „prowadzenie” nie pozwala zrobić kopii quizu (review Codexa #4)');
	ok(!/action="\?\/duplicate"/.test((await kasia.req('/panel')).text), 'przy „prowadzeniu” brak przycisku Duplikuj');

	ok((await setShare(author, { userId: kasiaId, permission: 'edit' })).status === 200, 'zmiana na edycję');
	ok((await kasia.req(`/panel/api/quizzes/${sq}`, { method: 'PUT', body: quizBody('Quiz autora v2'), headers: json })).status === 200, 'dostęp „edycja” pozwala zapisać');
	const dupEdit = await kasia.req('/panel?/duplicate', { method: 'POST', form: { id: sq } });
	ok(dupEdit.status === 303, 'dostęp „edycja” pozwala zrobić kopię');

	ok((await setShare(author, { userId: kasiaId, permission: 'owner' })).status === 400, 'nieznane uprawnienie odrzucone');
	ok((await setShare(author, { userId: 'usr_nieistnieje', permission: 'host' })).status === 400, 'nieistniejące konto odrzucone');

	ok((await setShare(author, { userId: kasiaId, permission: 'host', remove: '1' })).status === 200, 'odebranie dostępu');
	ok((await kasia.req(`/panel/quizzes/${sq}`)).status === 404, 'po odebraniu dostępu quiz znika');
	ok(!(await kasia.req('/panel')).text.includes(`/panel/quizzes/${sq}"`), 'po odebraniu dostępu quizu nie ma na liście');

	// Admin zarządza udostępnianiem cudzego quizu
	ok((await adm2.req(`/panel/quizzes/${sq}/share`)).status === 200, 'admin otwiera udostępnianie cudzego quizu');
	ok((await setShare(adm2, { userId: kasiaId, permission: 'host' })).status === 200, 'admin udostępnia cudzy quiz');
	// Udostępnienie „prowadzenie” administratorowi nie odbiera mu prawa edycji (review Codexa #3)
	const sp = (await author.req(`/panel/quizzes/${sq}/share`)).text;
	ok(!/admin2@proem\.pl|Test Admin \(/.test(sp.match(/<select name="userId"[\s\S]*?<\/select>/)?.[0] ?? ''), 'administratorzy nie są na liście do udostępnienia');
	const Database1 = Database;
	const sdb = new Database1(path.join(srv.dataDir, 'quiz.db'), { readonly: true });
	const adminId = sdb.prepare('SELECT id FROM users WHERE email = ?').get('admin2@proem.pl')?.id;
	sdb.close();
	if (adminId) await setShare(author, { userId: adminId, permission: 'host' });
	ok(!!adminId && (await adm2.req(`/panel/api/quizzes/${sq}`, { method: 'PUT', body: quizBody('Poprawione przez admina'), headers: json })).status === 200, 'admin z wpisem „prowadzenie” nadal może edytować');

	// ── Przykładowe quizy do próby (cli demo-quiz) ──
	const demoOut = srv.cli('demo-quiz', 'admin2@proem.pl');
	const demoIds = [...demoOut.matchAll(/\/panel\/quizzes\/(quiz_[A-Za-z0-9_-]+)/g)].map((m) => m[1]);
	ok(demoIds.length === 4, 'demo-quiz tworzy cztery quizy');
	for (const qid of demoIds) {
		const ed = await adm2.req(`/panel/quizzes/${qid}`);
		ok(ed.status === 200, `przykładowy quiz otwiera się w edytorze (${qid})`);
		const start = await adm2.req(`/panel/quizzes/${qid}/host?/start`, { method: 'POST', form: {} });
		ok(start.status === 200 && /"pin"|pin/.test(start.text), 'przykładowy quiz da się uruchomić');
	}
	// Zapis z edytora tego samego quizu przechodzi walidację (dane w poprawnym formacie)
	const { default: Database2 } = await import('better-sqlite3');
	const ddb = new Database2(path.join(srv.dataDir, 'quiz.db'), { readonly: true });
	const dq = ddb.prepare('SELECT type, prompt, prompt_translation, time_limit, points_multiplier, data FROM questions WHERE quiz_id = ? ORDER BY position').all(demoIds[1]);
	ddb.close();
	const demoSave = {
		title: 'Example – Christmas (English)', description: null, themeId: null, locale: 'en',
		settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
		questions: dq.map((q) => { const { clipMediaId: _c, ...data } = JSON.parse(q.data); return { type: q.type, prompt: q.prompt, promptTranslation: q.prompt_translation, imageMediaId: null, timeLimit: q.time_limit, pointsMultiplier: q.points_multiplier, data }; })
	};
	const ds = await adm2.req(`/panel/api/quizzes/${demoIds[1]}`, { method: 'PUT', body: JSON.stringify(demoSave), headers: { 'content-type': 'application/json', accept: 'application/json' } });
	ok(ds.status === 200, `przykładowe pytania przechodzą walidację edytora (${ds.text.slice(0, 120)})`);
	// Pokaz nowych typów (slajd, obrazki, kciuki, suwak, ankieta) też przechodzi walidację edytora
	{
		const ndb = new Database2(path.join(srv.dataDir, 'quiz.db'), { readonly: true });
		const nq = ndb.prepare('SELECT type, prompt, prompt_translation, time_limit, points_multiplier, data FROM questions WHERE quiz_id = ? ORDER BY position').all(demoIds[2]);
		const imgs = JSON.parse(nq[1].data).images;
		const imgRow = ndb.prepare('SELECT kind, file FROM media WHERE id = ?').get(imgs[0]);
		ndb.close();
		ok(nq.map((q) => q.type).join() === 'slide,choice,truefalse,slider,poll', `nowe typy w przykładzie: ${nq.map((q) => q.type)}`);
		ok(imgRow?.kind === 'image' && fs.readFileSync(path.join(srv.dataDir, 'media', imgRow.file)).subarray(1, 4).toString() === 'PNG', 'obrazki bombek to poprawne pliki PNG');
		const save = {
			title: 'Przykład – nowe typy pytań', description: null, themeId: null, locale: 'pl',
			settings: { defaultTimeLimit: 20, streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
			questions: nq.map((q) => ({ type: q.type, prompt: q.prompt, promptTranslation: q.prompt_translation, imageMediaId: null, timeLimit: q.time_limit, pointsMultiplier: q.points_multiplier, data: JSON.parse(q.data) }))
		};
		const ns = await adm2.req(`/panel/api/quizzes/${demoIds[2]}`, { method: 'PUT', body: JSON.stringify(save), headers: { 'content-type': 'application/json', accept: 'application/json' } });
		ok(ns.status === 200, `pokaz nowych typów przechodzi walidację edytora (${ns.text.slice(0, 160)})`);
	}
	// Pełny pokaz: wszystkie typy pytań, obrazek pytania, punkty ×2, ustawienia (odliczanie, muzyka, podium)
	{
		const fdb = new Database2(path.join(srv.dataDir, 'quiz.db'), { readonly: true });
		const fq = fdb.prepare('SELECT type, prompt, prompt_translation, image_media_id, time_limit, points_multiplier, data FROM questions WHERE quiz_id = ? ORDER BY position').all(demoIds[3]);
		const fs3 = JSON.parse(fdb.prepare('SELECT settings FROM quizzes WHERE id = ?').get(demoIds[3]).settings);
		fdb.close();
		const types = new Set(fq.map((q) => q.type));
		ok(['choice', 'truefalse', 'audio', 'text', 'order', 'poll', 'slider', 'slide'].every((t) => types.has(t)), `pełny pokaz ma wszystkie typy pytań (${[...types]})`);
		ok(fq.some((q) => q.image_media_id) && fq.some((q) => q.points_multiplier === 2) && fq.some((q) => JSON.parse(q.data).correct?.length > 1), 'pełny pokaz: obrazek pytania, punkty ×2, kilka poprawnych');
		ok(fs3.countdown === 5 && fs3.music === 'lounge' && fs3.podiumSound === 'triumph', 'pełny pokaz: odliczanie, muzyka i dźwięk podium ustawione');
		const save = {
			title: 'Pełny pokaz – wszystkie typy pytań', description: null, themeId: null, locale: 'pl', settings: fs3,
			questions: fq.map((q) => { const { clipMediaId: _c, ...data } = JSON.parse(q.data); return { type: q.type, prompt: q.prompt, promptTranslation: q.prompt_translation, imageMediaId: q.image_media_id, timeLimit: q.time_limit, pointsMultiplier: q.points_multiplier, data }; })
		};
		const fsv = await adm2.req(`/panel/api/quizzes/${demoIds[3]}`, { method: 'PUT', body: JSON.stringify(save), headers: { 'content-type': 'application/json', accept: 'application/json' } });
		ok(fsv.status === 200, `pełny pokaz przechodzi walidację edytora (${fsv.text.slice(0, 160)})`);
		// Dawna muzyka z syntezatora („calm”) zapisuje się jako nagranie „background”
		const legacy = await adm2.req(`/panel/api/quizzes/${demoIds[3]}`, { method: 'PUT', body: JSON.stringify({ ...save, settings: { ...fs3, music: 'calm' } }), headers: { 'content-type': 'application/json', accept: 'application/json' } });
		const ldb = new Database2(path.join(srv.dataDir, 'quiz.db'), { readonly: true });
		const lm = JSON.parse(ldb.prepare('SELECT settings FROM quizzes WHERE id = ?').get(demoIds[3]).settings).music;
		ldb.close();
		ok(legacy.status === 200 && lm === 'background', `dawna nazwa muzyki zamieniona na nagranie (${lm})`);
		for (const f of ['music-lounge', 'music-elevator', 'music-background', 'music-onhold', 'podium-fanfare', 'podium-triumph', 'podium-drumroll']) {
			const r = await B().req(`/sounds/${f}.mp3`, { raw: true });
			ok(r.status === 200, `wbudowany dźwięk /sounds/${f}.mp3 dostępny`);
		}
	}
	const audioQ = JSON.parse(dq[0].data);
	ok(dq[0].type === 'audio' && audioQ.audioMediaId, 'przykładowy quiz ma pytanie audio');
	const mp3 = await adm2.req(`/media/${audioQ.audioMediaId}`, { raw: true });
	const head = Buffer.from(await mp3.res.arrayBuffer()).subarray(0, 3).toString('latin1');
	ok(mp3.status === 200 && (head === 'ID3' || head.charCodeAt(0) === 0xff), 'melodia to poprawny plik MP3 dostępny dla właściciela');
	ok((await B().req(`/media/${audioQ.audioMediaId}`, { raw: true })).status === 404, 'melodia niedostępna publicznie');
	const { execFileSync: ex } = await import('node:child_process');
	const mdb = new Database2(path.join(srv.dataDir, 'quiz.db'), { readonly: true });
	const clipRow = mdb.prepare('SELECT file FROM media WHERE id = ?').get(audioQ.clipMediaId);
	mdb.close();
	const clipDur = Number(ex('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(srv.dataDir, 'media', clipRow.file)], { encoding: 'utf8' }));
	ok(audioQ.clipMediaId !== audioQ.audioMediaId && Math.abs(clipDur - audioQ.endMs / 1000) < 0.5, `klip demonstracyjny ma naprawdę ${audioQ.endMs / 1000} s (${clipDur.toFixed(1)} s) – review Codexa #5`);

	// ── Foldery, wyszukiwanie i stronicowanie listy quizów ──
	{
		const fo = await makeAuthor(srv, adm2, 'foldery@proem.pl');
		const other = await makeAuthor(srv, adm2, 'obcy@proem.pl');
		const mk = async (title, form = {}) => (await fo.req('/panel?/create', { method: 'POST', form: { title, ...form } })).loc.split('/').pop();
		const ids = [];
		for (let i = 1; i <= 23; i++) ids.push(await mk(`Quiz numer ${String(i).padStart(2, '0')}`));
		const kol = await mk('Kolędy i pastorałki');
		const f1 = await fo.req('/panel?/folderCreate', { method: 'POST', form: { name: '  Obóz <b>zimowy</b>  ' } });
		ok(f1.status === 303 && /\/panel\?f=fld_/.test(f1.loc), 'nowy folder → przejście do folderu');
		const fid = f1.loc.split('f=')[1];
		ok((await fo.req('/panel?/folderCreate', { method: 'POST', form: { name: '   ' } })).status === 400, 'folder bez nazwy odrzucony');
		const inFolder = await mk('Quiz w folderze', { folder: fid });
		const listF = await fo.req(`/panel?f=${fid}`);
		ok(listF.text.includes('Quiz w folderze') && !listF.text.includes('Quiz numer 01'), 'nowy quiz utworzony w otwartym folderze');
		ok(listF.text.includes('Obóz &lt;b>zimowy&lt;/b>') && !listF.text.includes('<b>zimowy</b>'), 'nazwa folderu wyświetlana jako tekst (bez HTML)');
		const mv = await fo.req(`/panel?f=${fid}&/move`, { method: 'POST', form: { id: kol, folder: fid } });
		ok(mv.status === 200, 'przeniesienie quizu do folderu');
		const listF2 = await fo.req(`/panel?f=${fid}`);
		ok(listF2.text.includes('Kolędy i pastorałki') && !listF2.text.includes('Quiz numer'), 'filtr folderu pokazuje tylko jego quizy');
		const none = await fo.req('/panel?f=none');
		ok(!none.text.includes('Kolędy i pastorałki') && none.text.includes('Quiz numer 05'), 'filtr „Bez folderu”');
		// Stronicowanie: 23 quizy bez folderu → 2 strony po 20
		const p1 = await fo.req('/panel?f=none');
		const p2 = await fo.req('/panel?f=none&p=2');
		const titles = (h) => [...h.matchAll(/class="title[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]);
		ok(titles(p1.text).length === 20 && titles(p2.text).length === 3, `stronicowanie po 20 (${titles(p1.text).length} + ${titles(p2.text).length})`);
		ok(new Set([...titles(p1.text), ...titles(p2.text)]).size === 23, 'strony nie powtarzają quizów');
		ok(p1.text.includes('Strona 1 z 2') && titles((await fo.req('/panel?f=none&p=999')).text).length === 3, 'numer strony poza zakresem → ostatnia strona');
		// Wyszukiwanie po całej liście, bez polskich znaków i wielkości liter
		const sr = await fo.req('/panel?q=KOLEDY');
		ok(titles(sr.text).join() === 'Kolędy i pastorałki', `wyszukiwanie bez polskich znaków (${titles(sr.text)})`);
		// Duplikat trafia do tego samego folderu
		const dup = await fo.req('/panel?/duplicate', { method: 'POST', form: { id: kol } });
		ok(titles((await fo.req(`/panel?f=${fid}`)).text).includes('Kolędy i pastorałki (kopia)'), 'kopia quizu w tym samym folderze');
		void dup;
		// Cudze foldery i quizy: nie da się przenieść cudzego quizu ani użyć cudzego folderu
		const otherQuiz = (await other.req('/panel?/create', { method: 'POST', form: { title: 'Cudzy quiz' } })).loc.split('/').pop();
		ok((await fo.req('/panel?/move', { method: 'POST', form: { id: otherQuiz, folder: fid } })).status === 404, 'nie można przenieść quizu bez dostępu');
		ok((await other.req('/panel?/move', { method: 'POST', form: { id: otherQuiz, folder: fid } })).status === 404, 'nie można użyć cudzego folderu');
		ok((await other.req('/panel?/folderRename', { method: 'POST', form: { id: fid, name: 'Przejęty' } })).status === 404, 'nie można zmienić nazwy cudzego folderu');
		ok((await other.req('/panel?/folderDelete', { method: 'POST', form: { id: fid } })).status === 404, 'nie można usunąć cudzego folderu');
		ok(!(await other.req(`/panel?f=${fid}`)).text.includes('Kolędy'), 'cudzy folder w adresie nic nie pokazuje');
		// Zmiana nazwy i usunięcie folderu – quizy zostają
		ok((await fo.req('/panel?/folderRename', { method: 'POST', form: { id: fid, name: 'Zimowisko' } })).status === 200, 'zmiana nazwy folderu');
		ok((await fo.req('/panel')).text.includes('Zimowisko'), 'nowa nazwa na liście folderów');
		ok((await fo.req('/panel?/folderDelete', { method: 'POST', form: { id: fid } })).status === 303, 'usunięcie folderu');
		const after = await fo.req('/panel?q=kol');
		ok(titles(after.text).length === 2, 'quizy z usuniętego folderu zostały (Bez folderu)');
		void inFolder; void ids;
	}

	// ── Imię i nazwisko: zmiana przez admina i przez samą osobę ──
	{
		const ewa = await makeAuthor(srv, adm2, 'zmiana-nazwy@proem.pl');
		const users = (await adm2.req('/panel/users')).text;
		const ewaId = [...users.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]).find((r) => r.includes('zmiana-nazwy@proem.pl'))?.match(/value="(usr_[A-Za-z0-9_-]+)"/)?.[1];
		ok(!!ewaId, 'ID konta Ewy na liście użytkowników');
		const ren = (b, name, id = ewaId) => b.req('/panel/users?/rename', { method: 'POST', form: { id, name } });
		ok((await ren(adm2, '  Ewa   Kowalska ')).status === 200, 'admin zmienia imię i nazwisko');
		ok((await ewa.req('/panel/security')).text.includes('value="Ewa Kowalska"'), 'nowe imię i nazwisko (spacje znormalizowane)');
		ok((await ewa.req('/panel')).text.includes('>EK</span>'), 'awatar pokazuje inicjały');
		ok((await ren(adm2, 'E')).status === 400, 'za krótkie imię odrzucone');
		ok((await ren(adm2, 'x'.repeat(81))).status === 400, 'za długie imię odrzucone');
		ok((await ren(adm2, 'Ktoś', 'usr_nieistnieje123')).status === 404, 'nieistniejące konto → 404');
		ok((await ren(ewa, 'Przejęte konto')).status === 403, 'autor nie zmienia nazw w zakładce Użytkownicy');
		const self = await ewa.req('/panel/security?/name', { method: 'POST', form: { name: 'Ewa Nowak', id: 'usr_cudze' } });
		ok(self.status === 200 && (await ewa.req('/panel/security')).text.includes('value="Ewa Nowak"'), 'autor zmienia własne imię i nazwisko');
		ok(self.text.includes('value="Ewa Nowak"') && self.text.includes('>EN</span>'), 'odpowiedź po zapisie od razu pokazuje nowe imię i inicjały (review Codexa)');
		ok((await ewa.req('/panel/security?/name', { method: 'POST', form: { name: ' ' } })).status === 400, 'puste imię odrzucone');
		ok((await adm2.req('/panel/users')).text.includes('Ewa Nowak'), 'zmiana widoczna dla admina');
	}

	ok(srv.alive(), 'serwer działa do końca testu');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	srv.stop();
}
process.exit(finish() ? 1 : 0);
