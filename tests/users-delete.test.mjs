// Usuwanie nieaktywowanych kont w Użytkownikach (osobny proces serwera).   node tests/users-delete.test.mjs
// Tylko administrator, tylko konto bez hasła; aktywne konta (quizy, pliki) zostają – te się blokuje.
import path from 'node:path';
import Database from 'better-sqlite3';
import { Browser, finish, makeAdmin, makeAuthor, ok, startServer } from './_helpers.mjs';

const srv = await startServer();
const dbFile = path.join(srv.dataDir, 'quiz.db');
const q = (sql, ...args) => {
	const d = new Database(dbFile, { readonly: true });
	try { return d.prepare(sql).get(...args); } finally { d.close(); }
};
const idOf = (email) => q('SELECT id FROM users WHERE email = ?', email)?.id;
const exists = (email) => !!idOf(email);

try {
	const { browser: admin } = await makeAdmin(srv, 'admin-del@proem.pl');
	const del = (who, id) => who.req('/panel/users?/delete', { method: 'POST', form: { id } });
	const invite = (email, extra = {}) => admin.req('/panel/users?/invite', { method: 'POST', form: { name: 'Osoba Testowa', email, role: 'author', ...extra } });
	const linkOf = (r) => r.text.match(/\/invite\/[A-Za-z0-9_-]+/)?.[0];

	// Zaproszenie z literówką w e-mailu – nigdy nie aktywowane.
	const typo = await invite('literowka@proem.pl');
	const typoLink = linkOf(typo);
	const typoId = idOf('literowka@proem.pl');
	ok(!!typoLink && !!typoId, 'konto czekające na aktywację utworzone');

	// Autor nie może usuwać.
	const author = await makeAuthor(srv, admin, 'autor-del@proem.pl');
	const a = await del(author, typoId);
	ok(a.status === 403 && exists('literowka@proem.pl'), `autor: 403, konto zostaje (${a.status})`);

	// Aktywnego konta nie da się usunąć (tylko blokada).
	const act = await del(admin, idOf('autor-del@proem.pl'));
	ok(act.status === 400 && /tylko konto, które nie zostało aktywowane/.test(act.text) && exists('autor-del@proem.pl'), `aktywne konto: 400 i zostaje (${act.status})`);

	// Własne konto i nieistniejące id.
	const own = await del(admin, idOf('admin-del@proem.pl'));
	ok(own.status === 400 && exists('admin-del@proem.pl'), `własne konto: 400 (${own.status})`);
	const none = await del(admin, 'user_nie-ma-takiego');
	ok(none.status === 404, `nieistniejące konto: 404 (${none.status})`);

	// Wyścig: konto aktywowane po wczytaniu listy, a przed kliknięciem „Usuń” – nie znika.
	const race = await invite('wyscig@proem.pl');
	const raceId = idOf('wyscig@proem.pl');
	await new Browser(srv.base).req(linkOf(race), { method: 'POST', form: { password: 'AutorHaslo123!', repeat: 'AutorHaslo123!' } });
	const r = await del(admin, raceId);
	ok(r.status === 400 && exists('wyscig@proem.pl'), `konto aktywowane w międzyczasie nie zostaje usunięte (${r.status})`);

	// Usunięcie nieaktywowanego konta: znika razem z zaproszeniem, link przestaje działać.
	const d = await del(admin, typoId);
	ok(d.status === 200 && /konto usunięte/.test(d.text), `nieaktywowane konto usunięte (${d.status})`);
	ok(!exists('literowka@proem.pl'), 'konta nie ma w bazie');
	ok(q('SELECT count(*) n FROM invites WHERE user_id = ?', typoId).n === 0, 'zaproszenia usunięte kaskadowo');
	const gone = await new Browser(srv.base).req(typoLink);
	ok(/nieważny, wygasł albo został już użyty/.test(gone.text), 'stary link z zaproszenia nie działa');
	const setPw = await new Browser(srv.base).req(typoLink, { method: 'POST', form: { password: 'AutorHaslo123!', repeat: 'AutorHaslo123!' } });
	ok(!setPw.loc?.startsWith('/panel') && !exists('literowka@proem.pl'), 'przez stary link nie da się ustawić hasła');
	ok((await invite('literowka@proem.pl')).status === 200 && exists('literowka@proem.pl'), 'ten sam adres można zaprosić ponownie');

	// Zablokowane, ale nieaktywowane konto też można usunąć.
	await invite('zablokowane@proem.pl');
	const blockedId = idOf('zablokowane@proem.pl');
	await admin.req('/panel/users?/toggle', { method: 'POST', form: { id: blockedId } });
	ok(q('SELECT disabled FROM users WHERE id = ?', blockedId).disabled === 1, 'konto zablokowane przed usunięciem');
	ok((await del(admin, blockedId)).status === 200 && !exists('zablokowane@proem.pl'), 'zablokowane nieaktywowane konto usunięte');

	// Bezpiecznik: odwołanie bez kaskady (tu: słowo w filtrze dodane „przez” to konto) – nic nie znika,
	// akcja kończy się komunikatem, a nie błędem 500.
	await invite('powiazane@proem.pl');
	const linkedId = idOf('powiazane@proem.pl');
	const w = new Database(dbFile);
	w.prepare('INSERT INTO blocked_words (word, added_by) VALUES (?, ?)').run('testslowo-del', linkedId);
	w.close();
	const fk = await del(admin, linkedId);
	ok(fk.status === 409 && exists('powiazane@proem.pl'), `powiązane dane bez kaskady: 409, konto zostaje (${fk.status})`);

	// Na liście: „Usuń” tylko przy nieaktywowanych, a zamiast „Zablokuj”.
	const html = (await admin.req('/panel/users')).text;
	const row = (email) => html.slice(html.lastIndexOf('<tr', html.indexOf(email)), html.indexOf('</tr>', html.indexOf(email)));
	ok(/\?\/delete/.test(row('powiazane@proem.pl')) && !/\?\/toggle/.test(row('powiazane@proem.pl')), 'nieaktywowane: „Usuń” zamiast „Zablokuj”');
	ok(!/\?\/delete/.test(row('autor-del@proem.pl')) && /\?\/toggle/.test(row('autor-del@proem.pl')), 'aktywne: tylko „Zablokuj”, bez „Usuń”');
} catch (e) {
	ok(false, `wyjątek: ${e?.stack ?? e}`);
} finally {
	srv.stop();
}
process.exit(finish() ? 1 : 0);
