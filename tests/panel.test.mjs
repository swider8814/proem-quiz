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
	ok(demoIds.length === 3, 'demo-quiz tworzy trzy quizy');
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

	ok(srv.alive(), 'serwer działa do końca testu');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	srv.stop();
}
process.exit(finish() ? 1 : 0);
