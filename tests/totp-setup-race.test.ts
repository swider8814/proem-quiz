// Wyścig konfiguracji TOTP: dwie nakładające się finalizacje i reset 2FA w trakcie.
//   npx tsx tests/totp-setup-race.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-totp-race-'));
process.env.DATA_DIR = dir;
process.env.TOTP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
const { db, schema } = await import('../src/lib/server/db/index.ts');
const auth = await import('../src/lib/server/auth/index.ts');
const { decrypt, sha256 } = await import('../src/lib/server/auth/crypto.ts');
const { eq } = await import('drizzle-orm');
const { generate } = await import('otplib');
// @ts-expect-error helper JS
const { ok, finish } = await import('./_helpers.mjs');

db.insert(schema.users).values({ id: 'u1', email: 'autor@proem.pl', name: 'Autor', passwordHash: 'x' }).run();
const user = () => auth.getUser('u1')!;
const sessions = () => db.select().from(schema.sessions).where(eq(schema.sessions.userId, 'u1')).all();
const recoveryHashes = () => new Set(db.select().from(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, 'u1')).all().map((r) => r.codeHash));
const norm = (c: string) => c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const meta = {};

// ── 1. Dwie konfiguracje tego samego konta (dwie przeglądarki) kończą się równolegle ──
{
	const u = user();
	const a = auth.createSession(u, { mfaPassed: true });
	const b = auth.createSession(u, { mfaPassed: true });
	const secA = auth.newTotpSecret(u).secret;
	const secB = auth.newTotpSecret(u).secret;
	const [codeA, codeB] = [await generate({ secret: secA }), await generate({ secret: secB })];
	const [ra, rb] = await Promise.all([
		auth.enableTotp(u, a.session.id, secA, codeA, meta),
		auth.enableTotp(u, b.session.id, secB, codeB, meta)
	]);
	const results = [ra, rb];
	const won = results.filter((r) => r !== null && r !== 'stale');
	ok(won.length === 1 && results.filter((r) => r === 'stale').length === 1, 'dwie równoległe finalizacje: jedna wygrywa, druga „stale”');
	const winner = won[0] as Exclude<typeof ra, 'stale' | null>;
	const winnerSecret = winner === ra ? secA : secB;
	ok(decrypt(user().totpSecret!) === winnerSecret, 'zapisany sekret należy do zwycięskiej konfiguracji');
	const hashes = recoveryHashes();
	ok(hashes.size === 10 && winner.codes.every((c) => hashes.has(sha256(norm(c)))), 'kody zapasowe należą do zwycięskiej konfiguracji');
	ok(sessions().length === 1 && sessions()[0].id === winner.session.id, 'została tylko nowa sesja zwycięzcy');
}

// ── 2. Reset 2FA przez admina w trakcie finalizacji ──
{
	auth.resetTotp('u1');
	const u = user();
	const s = auth.createSession(u, { mfaPassed: true });
	const sec = auth.newTotpSecret(u).secret;
	const pending = auth.enableTotp(u, s.session.id, sec, await generate({ secret: sec }), meta);
	auth.resetTotp('u1'); // synchronicznie – w trakcie sprawdzania kodu
	ok((await pending) === 'stale', 'reset 2FA w trakcie finalizacji → „stale”');
	ok(!user().totpEnabled && recoveryHashes().size === 0 && sessions().length === 0, 'po „stale” nic nie zapisano');
}

// ── 3. Zwykła konfiguracja nadal działa ──
{
	const u = user();
	const s = auth.createSession(u, { mfaPassed: true });
	const sec = auth.newTotpSecret(u).secret;
	const r = await auth.enableTotp(u, s.session.id, sec, await generate({ secret: sec }), meta);
	ok(r !== null && r !== 'stale' && user().totpEnabled && r.codes.length === 10, 'pojedyncza konfiguracja: TOTP włączone, 10 kodów');
	ok((await auth.enableTotp(u, s.session.id, sec, '000000', meta)) === null, 'zły kod → null (nie „stale”)');
}

fs.rmSync(dir, { recursive: true, force: true });
process.exit(finish() ? 1 : 0);
