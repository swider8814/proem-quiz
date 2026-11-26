// #12: sprzątanie nieużywanych mediów.   npx tsx tests/media-sweep.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-sweep-'));
process.env.DATA_DIR = dir;
const { db, schema, mediaDir } = await import('../src/lib/server/db/index.ts');
const { sweepOrphanMedia } = await import('../src/lib/server/media-access.ts');
// @ts-expect-error helper JS
const { ok, finish } = await import('./_helpers.mjs');

const old = new Date(Date.now() - 3 * 24 * 3600 * 1000);
db.insert(schema.users).values({ id: 'u1', email: 'u@x.pl', name: 'U' }).run();
const mk = (id: string, createdAt: Date) => {
	fs.writeFileSync(path.join(mediaDir, `${id}.mp3`), 'x');
	db.insert(schema.media).values({ id, ownerId: 'u1', kind: 'audio', originalName: id, file: `${id}.mp3`, sizeBytes: 1, createdAt }).run();
};
mk('med_orphan_old_1', old); // nieużywany, stary -> usunąć
mk('med_orphan_new_1', new Date()); // nieużywany, świeży -> zostaje (może czekać na zapis)
mk('med_in_quiz_001', old); // w pytaniu
mk('med_clip_00001', old); // wycięty fragment w pytaniu
mk('med_in_theme_01', old); // logo motywu
mk('med_in_game_001', old); // tylko w aktywnej grze
db.insert(schema.quizzes).values({ id: 'q1', ownerId: 'u1', title: 'Q', settings: {} as never }).run();
db.insert(schema.questions).values({ id: 'x1', quizId: 'q1', position: 0, type: 'audio', prompt: 'P',
	data: { type: 'audio', answers: ['a', 'b'], correct: [0], audioMediaId: 'med_in_quiz_001', clipMediaId: 'med_clip_00001', startMs: 0, endMs: 1000, loop: false } }).run();
db.update(schema.themes).set({ logoLight: 'med_in_theme_01' }).where((await import('drizzle-orm')).eq(schema.themes.id, 'theme_proem')).run();
(globalThis as Record<string, unknown>).__proemQuizGames = { games: new Map([['111111', { quiz: { questions: [{ data: { clipUrl: '/media/med_in_game_001' } }] } }]]) };

const removed = await sweepOrphanMedia();
const left = new Set(db.select({ id: schema.media.id }).from(schema.media).all().map((m) => m.id));
ok(removed === 1 && !left.has('med_orphan_old_1'), 'stary, nieużywany plik usunięty');
ok(!fs.existsSync(path.join(mediaDir, 'med_orphan_old_1.mp3')), 'plik zniknął z dysku');
for (const id of ['med_orphan_new_1', 'med_in_quiz_001', 'med_clip_00001', 'med_in_theme_01', 'med_in_game_001']) ok(left.has(id), `zachowany: ${id}`);
// Decyzja o usunięciu zapada synchronicznie: wiersz znika już w chwili wywołania, zanim sprzątanie odda
// sterowanie (zapis quizu nie może wejść między ustalenie listy używanych a usunięcie wiersza).
mk('med_orphan_old_2', old);
mk('med_orphan_old_3', old);
const pending = sweepOrphanMedia();
const goneAtOnce = !db.select().from(schema.media).all().some((m) => m.id === 'med_orphan_old_2' || m.id === 'med_orphan_old_3');
await pending;
ok(goneAtOnce, 'wiersz nieużywanego pliku usunięty synchronicznie, bez okna na wyścig z zapisem quizu');

// Pliki poza ewidencją (restart w trakcie konwersji / między rename a zapisem w bazie).
const { newId } = await import('../src/lib/server/auth/crypto.ts');
const { sweepStrayFiles } = await import('../src/lib/server/media-access.ts');
const at = (name: string, ageMs: number) => {
	const f = path.join(mediaDir, name);
	fs.writeFileSync(f, 'x');
	const t = (Date.now() - ageMs) / 1000;
	fs.utimesSync(f, t, t);
	return name;
};
const DAY = 24 * 3600 * 1000;
const known = newId('med');
db.insert(schema.media).values({ id: known, ownerId: 'u1', kind: 'audio', originalName: 'k', file: `${known}.mp3`, sizeBytes: 1, createdAt: new Date() }).run();
const strayOld = [at(`${newId('med')}.mp3`, 2 * DAY), at(`${newId('med')}_t.webp`, 2 * DAY), at(`${newId('med')}.gif.part.palette.png`, 2 * DAY), at(`${known}.mp3.part`, 2 * DAY)];
const keep = [at(`${known}.mp3`, 2 * DAY), at(`${newId('med')}.gif.part`, 60_000), at('notatka.txt', 2 * DAY)];
const n = await sweepStrayFiles();
const files = new Set(fs.readdirSync(mediaDir));
ok(n === strayOld.length && strayOld.every((f) => !files.has(f)), `stare pliki bez wpisu i stare pliki robocze usunięte (${n})`);
ok(keep.every((f) => files.has(f)), 'zostają: plik z wpisem w bazie, świeży plik trwającego uploadu, pliki spoza mediów');

fs.rmSync(dir, { recursive: true, force: true });
process.exit(finish() ? 1 : 0);
