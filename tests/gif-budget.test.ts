// Animowane GIF-y: limit klatek przed dekodowaniem, stała pamięć przy konwersji, sprzątanie plików roboczych.
//   npx tsx tests/gif-budget.test.ts   (wymaga ffmpeg)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-gif-'));
process.env.DATA_DIR = dir;
const { db, schema, mediaDir } = await import('../src/lib/server/db/index.ts');
const { saveUpload, MediaError } = await import('../src/lib/server/media.ts');
// @ts-expect-error helper JS
const { ok, finish } = await import('./_helpers.mjs');

db.insert(schema.users).values({ id: 'u1', email: 'u@x.pl', name: 'U' }).run();
const gif = (name: string, size: string, rate: number, seconds: number) => {
	const f = path.join(dir, name);
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=${rate}:duration=${seconds}`, f]);
	return new Uint8Array(fs.readFileSync(f));
};
const frames = (file: string) =>
	parseInt(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file], { encoding: 'utf8' }), 10);
const leftovers = () => fs.readdirSync(mediaDir).filter((f) => /\.(part|upload)$|palette/.test(f));

// Zwykła animacja: zachowana (wszystkie klatki), bez plików roboczych.
const row = await saveUpload('u1', 'anim.gif', gif('anim.gif', '320x240', 10, 3));
ok(row.kind === 'image' && frames(path.join(mediaDir, row.file)) === 30, 'animowany GIF zapisany z zachowaniem klatek');
ok(fs.existsSync(path.join(mediaDir, row.file.replace(/\.gif$/, '_t.webp'))), 'miniatura animacji powstała');
ok(leftovers().length === 0, 'po zapisie brak plików roboczych (paleta, .part, .upload)');

// Za dużo klatek: odrzucone przed dekodowaniem, bez śladów na dysku.
let err: unknown = null;
try {
	await saveUpload('u1', 'long.gif', gif('long.gif', '32x24', 50, 8)); // 400 klatek
} catch (e) {
	err = e;
}
ok(err instanceof MediaError && err.key === 'gifLong', `GIF z 400 klatkami odrzucony (${(err as Error)?.message})`);
ok(leftovers().length === 0 && db.select().from(schema.media).all().length === 1, 'po odrzuceniu brak plików roboczych i wpisu w bazie');

fs.rmSync(dir, { recursive: true, force: true });
process.exit(finish() ? 1 : 0);
