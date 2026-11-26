// Wyścig logowania: stan konta zmienia się w trakcie (asynchronicznej) weryfikacji hasła.
//   npx tsx tests/login-race.test.ts
// Zmiana stanu jest zapisywana synchronicznie zaraz po wywołaniu checkCredentials – trafia więc
// dokładnie między odczyt konta a koniec Argon2. Test jest deterministyczny.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-login-race-'));
process.env.DATA_DIR = dir;
const { db, schema } = await import('../src/lib/server/db/index.ts');
const auth = await import('../src/lib/server/auth/index.ts');
const { eq } = await import('drizzle-orm');
// @ts-expect-error helper JS
const { ok, finish } = await import('./_helpers.mjs');

const PW = 'BardzoTajne123!';
const hash = await auth.hashPassword(PW);
const otherHash = await auth.hashPassword('ZupelnieInne456!'); // gotowy wcześniej – bez await w trakcie wyścigu
db.insert(schema.users).values({ id: 'u1', email: 'autor@proem.pl', name: 'Autor', passwordHash: hash }).run();

type UserPatch = Partial<typeof schema.users.$inferInsert>;
const set = (v: UserPatch) => db.update(schema.users).set(v).where(eq(schema.users.id, 'u1')).run();
const base: UserPatch = { passwordHash: hash, totpEnabled: false, disabled: false, role: 'author' };

/** Startuje logowanie, w jego trakcie zmienia konto, zwraca wynik logowania. */
async function loginWhile(change: UserPatch | null) {
	set(base);
	const pending = auth.checkCredentials('autor@proem.pl', PW);
	if (change) set(change);
	return pending;
}

const plain = await loginWhile(null);
ok(plain?.id === 'u1' && auth.fullAfterPassword(plain), 'bez zmian: logowanie daje pełną sesję autorowi');

ok((await loginWhile({ passwordHash: otherHash })) === null, 'reset hasła w trakcie logowania → logowanie odrzucone');

const withTotp = await loginWhile({ totpEnabled: true });
ok(withTotp !== null && withTotp.totpEnabled && !auth.fullAfterPassword(withTotp), 'włączenie 2FA w trakcie logowania → wymagany kod, nie pełna sesja');

ok((await loginWhile({ disabled: true })) === null, 'blokada konta w trakcie logowania → logowanie odrzucone');

const promoted = await loginWhile({ role: 'admin' });
ok(promoted !== null && promoted.role === 'admin' && !auth.fullAfterPassword(promoted), 'awans na admina w trakcie logowania → najpierw konfiguracja 2FA');

fs.rmSync(dir, { recursive: true, force: true });
process.exit(finish() ? 1 : 0);
