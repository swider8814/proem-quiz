// Odtworzenie bazy ze starszej kopii: sesje i nieużyte linki jednorazowe unieważnione przy starcie.
//   npx tsx tests/restore-guard.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-restore-'));
process.env.DATA_DIR = dir;
const { db, schema } = await import('../src/lib/server/db/index.ts');
const { guardRestoredDb } = await import('../src/lib/server/restore-guard.ts');
const { eq } = await import('drizzle-orm');
// @ts-expect-error helper JS
const { ok, finish } = await import('./_helpers.mjs');

db.insert(schema.users).values({ id: 'u1', email: 'u@x.pl', name: 'U' }).run();
const addLinks = () => {
	const exp = new Date(Date.now() + 864e5);
	db.insert(schema.invites).values([
		{ id: `pending-${Math.random()}`, purpose: 'invite', userId: 'u1', expiresAt: exp },
		{ id: `used-${Math.random()}`, purpose: 'reset', userId: 'u1', expiresAt: exp, usedAt: new Date() }
	]).run();
	db.insert(schema.sessions).values({ id: `s-${Math.random()}`, userId: 'u1', mfaPassed: true, expiresAt: exp }).run();
};
const pending = () => db.select().from(schema.invites).all().filter((i) => !i.usedAt).length;
const used = () => db.select().from(schema.invites).all().filter((i) => i.usedAt).length;
const sessions = () => db.select().from(schema.sessions).all().length;
const gen = () => db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'db_generation')).get()?.value;

addLinks();
let g = guardRestoredDb();
ok(!g.restored && pending() === 1 && sessions() === 1 && gen() === '1', 'pierwszy start: nic nie unieważniono, licznik = 1');
g = guardRestoredDb();
ok(!g.restored && pending() === 1 && gen() === '2', 'zwykły restart: nic nie unieważniono, licznik rośnie');

// Odtworzenie kopii sprzed wprowadzenia licznika (brak db_generation w bazie, plik obok bazy został).
db.delete(schema.appSettings).where(eq(schema.appSettings.key, 'db_generation')).run();
addLinks();
g = guardRestoredDb();
ok(g.restored && pending() === 0 && sessions() === 0 && used() === 2, `stara kopia: unieważniono ${g.sessions} sesji i ${g.links} nieużytych linków, użyte zostają`);
ok(gen() === '3', 'po odtworzeniu licznik dalej rośnie (kolejny restart nie powtórzy unieważnienia)');

// Odtworzenie kopii z licznikiem mniejszym niż w pliku (kopia sprzed kilku restartów).
addLinks();
db.update(schema.appSettings).set({ value: '1' }).where(eq(schema.appSettings.key, 'db_generation')).run();
g = guardRestoredDb();
ok(g.restored && pending() === 0, 'kopia z mniejszym licznikiem: nieużyte linki unieważnione');
addLinks();
g = guardRestoredDb();
ok(!g.restored && pending() === 1, 'następny zwykły restart: bez unieważniania');

// Plik licznika nie da się zapisać (np. brak miejsca): unieważnienie i tak zatwierdzone, a funkcja zgłasza błąd
// (start serwera zostaje przerwany) – review Codexa.
db.delete(schema.appSettings).where(eq(schema.appSettings.key, 'db_generation')).run();
addLinks();
const counter = path.join(dir, 'db-generation');
fs.rmSync(`${counter}.tmp`, { force: true });
fs.mkdirSync(`${counter}.tmp`); // zapis pliku tymczasowego się nie uda
let threw = false;
try {
	guardRestoredDb();
} catch {
	threw = true;
}
ok(threw && pending() === 0 && sessions() === 0, 'błąd zapisu pliku: unieważnienie zatwierdzone, a błąd zgłoszony (start przerwany)');
fs.rmSync(`${counter}.tmp`, { recursive: true, force: true });
ok(!guardRestoredDb().restored, 'po naprawie: kolejny start nie unieważnia ponownie');

// Nieczytelny albo uszkodzony licznik to NIE pierwszy start – start przerwany, ślad nie nadpisany (review Codexa).
const saved = fs.readFileSync(counter, 'utf8');
fs.writeFileSync(counter, 'xyz');
let bad = false;
try { guardRestoredDb(); } catch { bad = true; }
ok(bad && fs.readFileSync(counter, 'utf8') === 'xyz', 'uszkodzony plik licznika: start przerwany, plik nie nadpisany');
fs.writeFileSync(counter, '9'.repeat(400)); // same cyfry, ale poza zakresem bezpiecznych liczb
addLinks();
const [p0, s0] = [pending(), sessions()];
let huge = false;
try { guardRestoredDb(); } catch { huge = true; }
ok(huge && pending() === p0 && sessions() === s0 && fs.readFileSync(counter, 'utf8').length === 400, 'licznik spoza zakresu liczb: start przerwany, nic nie unieważniono ani nie nadpisano');
fs.rmSync(counter);
fs.mkdirSync(counter); // odczyt się nie uda (EISDIR), ale nie jest to brak pliku
let unreadable = false;
try { guardRestoredDb(); } catch { unreadable = true; }
ok(unreadable, 'nieczytelny licznik (błąd inny niż brak pliku): start przerwany');
fs.rmSync(counter, { recursive: true });
fs.writeFileSync(counter, saved);

// Nowy serwer: brak pliku licznika, stara kopia bez licznika – znacznik z README wymusza unieważnienie.
fs.rmSync(counter, { force: true });
db.delete(schema.appSettings).where(eq(schema.appSettings.key, 'db_generation')).run();
addLinks();
fs.writeFileSync(path.join(dir, 'odtworzono-z-kopii'), '');
g = guardRestoredDb();
ok(g.restored && pending() === 0 && sessions() === 0 && !fs.existsSync(path.join(dir, 'odtworzono-z-kopii')), 'nowy serwer + znacznik odtworzenia: unieważnione, znacznik usunięty');
addLinks();
ok(!guardRestoredDb().restored && pending() === 1, 'kolejny start po odtworzeniu: bez unieważniania');

fs.rmSync(dir, { recursive: true, force: true });
process.exit(finish() ? 1 : 0);
