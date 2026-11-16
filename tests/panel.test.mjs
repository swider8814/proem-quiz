// Reset hasła, e-maile, motywy i ustawienia (osobny proces serwera).   node tests/panel.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { Browser, finish, makeAdmin, makeAuthor, ok, startServer, upload } from './_helpers.mjs';

const srv = await startServer({ MAIL_TEST_OUTBOX: '1' });
const B = () => new Browser(srv.base);
const outbox = () => {
	const f = path.join(srv.dataDir, 'outbox.jsonl');
	return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
};
const waitMail = async (to, n) => {
	for (let i = 0; i < 40; i++) {
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
	const panel = await adm2.req('/panel');
	ok(panel.text.includes(`/media/${logo.id}`), 'logo w nagłówku panelu');

	// Domyślny motyw i usuwanie
	ok((await adm2.req(`${themeUrl}?/makeDefault`, { method: 'POST', form: {} })).status === 200, 'ustawienie motywu jako domyślnego');
	const del = await adm2.req(`${themeUrl}?/delete`, { method: 'POST', form: {} });
	ok(del.status === 400, 'motywu domyślnego nie da się usunąć');
	await adm2.req('/panel/themes/theme_proem?/makeDefault', { method: 'POST', form: {} });
	const del2 = await adm2.req(`${themeUrl}?/delete`, { method: 'POST', form: {} });
	ok(del2.status === 303, 'usunięcie motywu niedomyślnego');

	ok(srv.alive(), 'serwer działa do końca testu');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	srv.stop();
}
process.exit(finish() ? 1 : 0);
