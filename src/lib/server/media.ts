import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { db, mediaDir, schema } from './db/index.js';
import { newId } from './auth/crypto.js';

// ── Limity ───────────────────────────────────────────────────────────────

export const LIMITS = { audio: 30 * 1024 * 1024, image: 5 * 1024 * 1024 };
const MAX_AUDIO_MS = 15 * 60 * 1000; // dłuższe utwory odrzucamy
const MAX_OUTPUT_BYTES = 25 * 1024 * 1024; // twardy limit pliku wynikowego ffmpeg
const QUOTA_BYTES = Number(process.env.MEDIA_QUOTA_BYTES) || 4 * 1024 ** 3; // suma wszystkich mediów
const MIN_FREE_BYTES = Number(process.env.MEDIA_MIN_FREE_BYTES) || 1024 ** 3; // zapas wolnego miejsca
const MAX_IMAGE_SIDE = 1600; // większe zdjęcia z telefonu są zmniejszane (ekran i tak ma ~1920 px)
const THUMB_SIDE = 480; // miniatura dla telefonów (obrazki odpowiedzi) – kilkadziesiąt KB zamiast MB
const MAX_IMAGE_PIXELS = 40_000_000; // „bomby” z ogromnymi wymiarami odrzucamy przed dekodowaniem
const FFMPEG_CONCURRENCY = 1;
const FFMPEG_MAX_PENDING = 8;

import type { ErrKey } from '#lib/i18n/panel.js';

/** Błąd pliku; message = klucz z src/lib/i18n/panel.ts (err). */
export class MediaError extends Error {
	constructor(public key: ErrKey, public status = 400) {
		super(key);
	}
}

// ── Kolejka zadań ffmpeg (ograniczona współbieżność i długość kolejki) ──────

let active = 0;
const waiting: (() => void)[] = [];

async function inQueue<T>(fn: () => Promise<T>): Promise<T> {
	if (active >= FFMPEG_CONCURRENCY) {
		if (waiting.length >= FFMPEG_MAX_PENDING) throw new MediaError('ffmpegBusy', 503);
		await new Promise<void>((r) => waiting.push(r));
	}
	active++;
	try {
		return await fn();
	} finally {
		active--;
		waiting.shift()?.();
	}
}

function run(cmd: string, args: string[], timeout: number): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(cmd, args, { timeout, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 }, (err, stdout) =>
			err ? reject(err) : resolve(stdout)
		);
	});
}

// ── Rozpoznawanie typu po zawartości ─────────────────────────────────────

type Sniffed = { kind: 'audio' | 'image'; ext: string; mime: string };

/** Rozpoznanie typu po zawartości (nie po nazwie ani nagłówku przeglądarki). SVG celowo nieobsługiwane. */
export function sniff(buf: Uint8Array): Sniffed | null {
	const b = (i: number) => buf[i];
	const ascii = (start: number, len: number) => String.fromCharCode(...buf.subarray(start, start + len));
	if (buf.length < 12) return null;
	if (b(0) === 0x89 && ascii(1, 3) === 'PNG') return { kind: 'image', ext: 'png', mime: 'image/png' };
	if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { kind: 'image', ext: 'jpg', mime: 'image/jpeg' };
	if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { kind: 'image', ext: 'webp', mime: 'image/webp' };
	if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return { kind: 'image', ext: 'gif', mime: 'image/gif' };
	if (ascii(0, 3) === 'ID3' || (b(0) === 0xff && (b(1) & 0xe0) === 0xe0)) return { kind: 'audio', ext: 'mp3', mime: 'audio/mpeg' };
	if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return { kind: 'audio', ext: 'wav', mime: 'audio/wav' };
	if (ascii(0, 4) === 'OggS') return { kind: 'audio', ext: 'ogg', mime: 'audio/ogg' };
	if (ascii(0, 4) === 'fLaC') return { kind: 'audio', ext: 'flac', mime: 'audio/flac' };
	if (ascii(4, 4) === 'ftyp') return { kind: 'audio', ext: 'm4a', mime: 'audio/mp4' };
	return null;
}

export const MIME: Record<string, string> = {
	png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg'
};

// ── Miejsce na dysku ─────────────────────────────────────────────────────

const usedBytes = () =>
	db.select({ n: sql<number>`coalesce(sum(${schema.media.sizeBytes}), 0)` }).from(schema.media).get()!.n;

/** Czy zmieści się kolejne `bytes` (limit sumy mediów + wolne miejsce na dysku). */
async function ensureSpace(bytes: number) {
	if (usedBytes() + bytes > QUOTA_BYTES) {
		throw new MediaError('quota', 507);
	}
	try {
		const st = await fs.statfs(mediaDir);
		if (st.bavail * st.bsize - bytes < MIN_FREE_BYTES) throw new MediaError('diskFull', 507);
	} catch (e) {
		if (e instanceof MediaError) throw e;
	}
}

async function probeDuration(file: string): Promise<number | null> {
	try {
		const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], 20_000);
		const sec = parseFloat(out);
		return Number.isFinite(sec) && sec > 0 ? Math.round(sec * 1000) : null;
	} catch {
		return null;
	}
}

/** Miniatura obrazka: obok pliku, <id>_t.webp (pasuje do wzorca plików mediów – trafia do kopii). */
export function thumbPath(file: string) {
	return path.join(mediaDir, path.basename(file).replace(/\.[a-z0-9]+$/, '') + '_t.webp');
}

/**
 * Obrazek: sprawdzenie wymiarów (bez dekodowania), zmniejszenie do 1600 px, usunięcie metadanych
 * (np. GPS ze zdjęć z telefonu) i miniatura 480 px WebP dla telefonów. GIF zostaje jak był (animacja),
 * miniatura z pierwszej klatki.
 */
async function processImage(src: string, out: string, thumb: string, ext: string) {
	let w = 0;
	let h = 0;
	try {
		const dims = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', src], 15_000);
		[w, h] = dims.trim().split('x').map(Number);
	} catch {
		throw new MediaError('imageRead');
	}
	if (!(w > 0 && h > 0)) throw new MediaError('imageRead');
	if (w * h > MAX_IMAGE_PIXELS) throw new MediaError('imageHuge');
	const fit = (side: number) => `scale='min(${side},iw)':'min(${side},ih)':force_original_aspect_ratio=decrease`;
	const base = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-map_metadata', '-1', '-frames:v', '1'];
	try {
		if (ext === 'gif') await fs.copyFile(src, out);
		else {
			const codec = ext === 'png' ? ['-c:v', 'png', '-f', 'image2'] : ext === 'webp' ? ['-c:v', 'libwebp', '-quality', '85', '-f', 'webp'] : ['-c:v', 'mjpeg', '-q:v', '3', '-f', 'image2'];
			await run('ffmpeg', [...base, '-vf', fit(MAX_IMAGE_SIDE), ...codec, out], 60_000);
		}
		await run('ffmpeg', [...base, '-vf', fit(THUMB_SIDE), '-c:v', 'libwebp', '-quality', '75', '-f', 'webp', `${thumb}.part`], 60_000);
		await fs.chmod(`${thumb}.part`, 0o640);
		await fs.rename(`${thumb}.part`, thumb);
	} catch {
		await fs.rm(`${thumb}.part`, { force: true });
		await fs.rm(thumb, { force: true });
		throw new MediaError('imageProcess');
	}
}

async function sizeOf(file: string) {
	return (await fs.stat(file)).size;
}

// ── Zapis uploadu ────────────────────────────────────────────────────────

/**
 * Audio jest zawsze przekodowywane do MP3 (ujednolicenie + oczyszczenie pliku),
 * obraz zapisywany po sprawdzeniu sygnatury. Nazwy plików na dysku nie pochodzą od użytkownika.
 * Pliki częściowe są usuwane po każdym błędzie.
 */
export async function saveUpload(ownerId: string, originalName: string, data: Uint8Array) {
	const type = sniff(data);
	if (!type) throw new MediaError('unsupported');
	if (data.byteLength > LIMITS[type.kind]) throw new MediaError('fileTooBig', 413);
	await fs.mkdir(mediaDir, { recursive: true });
	await ensureSpace(type.kind === 'audio' ? MAX_OUTPUT_BYTES : data.byteLength);

	const id = newId('med');
	const file = type.kind === 'audio' ? `${id}.mp3` : `${id}.${type.ext}`;
	const out = path.join(mediaDir, file);
	const tmp = path.join(mediaDir, `${id}.upload`);
	// Plik wynikowy powstaje pod nazwą tymczasową i jest publikowany atomowo (rename) – kopie zapasowe
	// i rclone nigdy nie zobaczą niedokończonego pliku pod docelową nazwą.
	const part = `${out}.part`;
	let durationMs: number | null = null;
	let ok = false;
	try {
		if (type.kind === 'audio') {
			await fs.writeFile(tmp, data, { mode: 0o640 });
			durationMs = await inQueue(async () => {
				const inDur = await probeDuration(tmp);
				if (!inDur) throw new MediaError('audioRead');
				if (inDur > MAX_AUDIO_MS) throw new MediaError('audioLong');
				try {
					await run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-t', String(MAX_AUDIO_MS / 1000),
						'-vn', '-map_metadata', '-1', '-ac', '2', '-ar', '44100', '-b:a', '160k', '-fs', String(MAX_OUTPUT_BYTES), '-f', 'mp3', part], 120_000);
				} catch {
					throw new MediaError('audioProcess');
				}
				return probeDuration(part);
			});
		} else {
			await fs.writeFile(tmp, data, { mode: 0o640 });
			await inQueue(() => processImage(tmp, part, thumbPath(out), type.ext));
		}
		const size = await sizeOf(part);
		if (size === 0 || size >= MAX_OUTPUT_BYTES) throw new MediaError('outputBad');
		await fs.chmod(part, 0o640);
		await fs.rename(part, out);
		const row = db
			.insert(schema.media)
			.values({
				id,
				ownerId,
				kind: type.kind,
				originalName: originalName.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 120) || 'plik',
				file,
				durationMs,
				sizeBytes: size
			})
			.returning()
			.get();
		ok = true;
		return row;
	} finally {
		await fs.rm(tmp, { force: true });
		await fs.rm(part, { force: true });
		if (!ok) {
			await fs.rm(out, { force: true });
			await fs.rm(thumbPath(out), { force: true });
		}
	}
}

/** Wycina fragment [startMs, endMs] z łagodnym wejściem/wyjściem. Zwraca id nowego media. */
export async function cutClip(ownerId: string, sourceId: string, startMs: number, endMs: number, opts: { normalize?: boolean } = {}) {
	const src = db.select().from(schema.media).where(eq(schema.media.id, sourceId)).get();
	if (!src || src.kind !== 'audio') return null;
	const start = Math.max(0, startMs) / 1000;
	const dur = Math.max(1, Math.min(60_000, endMs - startMs)) / 1000;
	const fade = Math.min(0.3, dur / 4);
	await ensureSpace(2 * 1024 * 1024);
	const id = newId('med');
	const file = `${id}.mp3`;
	const out = path.join(mediaDir, file);
	const part = `${out}.part`; // publikacja atomowa, jak w saveUpload
	let ok = false;
	try {
		await inQueue(() =>
			run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(start), '-t', String(dur), '-i', path.join(mediaDir, path.basename(src.file)),
				// normalize: wyrównanie głośności (np. wgrany mem nie jest dwa razy głośniejszy niż reszta gry)
				'-af', `${opts.normalize ? 'loudnorm=I=-16:TP=-1.5:LRA=11,' : ''}afade=t=in:st=0:d=${fade},afade=t=out:st=${(dur - fade).toFixed(3)}:d=${fade}`, '-b:a', '160k', '-fs', String(4 * 1024 * 1024), '-f', 'mp3', part], 60_000)
		);
		const size = await sizeOf(part);
		if (size === 0) return null;
		await fs.chmod(part, 0o640);
		await fs.rename(part, out);
		db.insert(schema.media)
			.values({ id, ownerId, kind: 'audio', originalName: `${src.originalName} (fragment)`, file, durationMs: Math.round(dur * 1000), sizeBytes: size })
			.run();
		ok = true;
		return id;
	} catch (e) {
		if (e instanceof MediaError) throw e;
		return null;
	} finally {
		await fs.rm(part, { force: true });
		if (!ok) await fs.rm(out, { force: true });
	}
}

export async function deleteMedia(id: string) {
	const m = db.select().from(schema.media).where(eq(schema.media.id, id)).get();
	if (!m) return;
	db.delete(schema.media).where(eq(schema.media.id, id)).run();
	await fs.rm(path.join(mediaDir, path.basename(m.file)), { force: true });
	await fs.rm(thumbPath(m.file), { force: true });
}

export const mediaUrl = (id: string | null | undefined) => (id ? `/media/${id}` : null);
