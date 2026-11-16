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
fs.rmSync(dir, { recursive: true, force: true });
process.exit(finish() ? 1 : 0);
