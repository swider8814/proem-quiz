import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, mediaDir, schema } from './db/index.js';
import { newId } from './auth/crypto.js';

const run = promisify(execFile);

export const LIMITS = { audio: 30 * 1024 * 1024, image: 5 * 1024 * 1024 };

type Sniffed = { kind: 'audio' | 'image'; ext: string; mime: string };

/** Rozpoznanie typu po zawartości (nie po nazwie ani nagłówku przeglądarki). SVG celowo nieobsługiwane (XSS). */
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
	if (ascii(4, 4) === 'ftyp') return { kind: 'audio', ext: 'm4a', mime: 'audio/mp4' }; // m4a/aac
	return null;
}

export const MIME: Record<string, string> = {
	png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg'
};

async function probeDuration(file: string): Promise<number | null> {
	try {
		const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 20_000 });
		const sec = parseFloat(stdout);
		return Number.isFinite(sec) ? Math.round(sec * 1000) : null;
	} catch {
		return null;
	}
}

/**
 * Zapis pliku. Audio jest zawsze przekodowywane do MP3 (ujednolicenie + "oczyszczenie" pliku),
 * obraz zapisywany po sprawdzeniu sygnatury. Nazwy plików na dysku nie pochodzą od użytkownika.
 */
export async function saveUpload(ownerId: string, originalName: string, data: Uint8Array) {
	const type = sniff(data);
	if (!type) return { error: 'Nieobsługiwany format pliku. Audio: MP3, M4A, WAV, OGG, FLAC. Obrazy: PNG, JPG, WEBP, GIF.' };
	if (data.byteLength > LIMITS[type.kind]) {
		return { error: `Plik jest za duży (max ${LIMITS[type.kind] / 1024 / 1024} MB).` };
	}
	const id = newId('med');
	await fs.mkdir(mediaDir, { recursive: true });
	let file: string;
	let durationMs: number | null = null;

	if (type.kind === 'audio') {
		const tmp = path.join(mediaDir, `${id}.upload.${type.ext}`);
		file = `${id}.mp3`;
		await fs.writeFile(tmp, data, { mode: 0o640 });
		try {
			await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-vn', '-map_metadata', '-1', '-ac', '2', '-ar', '44100', '-b:a', '160k', path.join(mediaDir, file)], { timeout: 120_000 });
		} catch {
			await fs.rm(tmp, { force: true });
			return { error: 'Nie udało się odczytać pliku audio.' };
		}
		await fs.rm(tmp, { force: true });
		durationMs = await probeDuration(path.join(mediaDir, file));
	} else {
		file = `${id}.${type.ext}`;
		await fs.writeFile(path.join(mediaDir, file), data, { mode: 0o640 });
	}
	const stat = await fs.stat(path.join(mediaDir, file));
	const row = db
		.insert(schema.media)
		.values({
			id,
			ownerId,
			kind: type.kind,
			originalName: originalName.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 120) || 'plik',
			file,
			durationMs,
			sizeBytes: stat.size
		})
		.returning()
		.get();
	return { media: row };
}

/** Wycina fragment [startMs, endMs] z łagodnym wejściem/wyjściem. Zwraca id nowego media. */
export async function cutClip(ownerId: string, sourceId: string, startMs: number, endMs: number) {
	const src = db.select().from(schema.media).where(eq(schema.media.id, sourceId)).get();
	if (!src || src.kind !== 'audio') return null;
	const start = Math.max(0, startMs) / 1000;
	const dur = Math.max(1, Math.min(60_000, endMs - startMs)) / 1000;
	const fade = Math.min(0.3, dur / 4);
	const id = newId('med');
	const file = `${id}.mp3`;
	try {
		await run(
			'ffmpeg',
			['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(start), '-t', String(dur), '-i', path.join(mediaDir, src.file),
				'-af', `afade=t=in:st=0:d=${fade},afade=t=out:st=${(dur - fade).toFixed(3)}:d=${fade}`, '-b:a', '160k', path.join(mediaDir, file)],
			{ timeout: 60_000 }
		);
	} catch {
		return null;
	}
	const stat = await fs.stat(path.join(mediaDir, file));
	db.insert(schema.media)
		.values({ id, ownerId, kind: 'audio', originalName: `${src.originalName} (fragment)`, file, durationMs: Math.round(dur * 1000), sizeBytes: stat.size })
		.run();
	return id;
}

export async function deleteMedia(id: string) {
	const m = db.select().from(schema.media).where(eq(schema.media.id, id)).get();
	if (!m) return;
	db.delete(schema.media).where(eq(schema.media.id, id)).run();
	await fs.rm(path.join(mediaDir, m.file), { force: true });
}

export const mediaUrl = (id: string | null | undefined) => (id ? `/media/${id}` : null);
