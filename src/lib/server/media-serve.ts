import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { mediaDir, schema } from './db/index.js';
import { MIME } from './media.js';

type Media = typeof schema.media.$inferSelect;

/** Odpowiedź z plikiem (z zakresami bajtów – wymagane przez Safari na iOS przy audio). */
export function serveMedia(m: Media, request: Request, cacheControl: string, fileOverride?: string): Response {
	const file = fileOverride ?? path.join(mediaDir, path.basename(m.file));
	let stat: fs.Stats;
	try {
		stat = fs.statSync(file);
	} catch {
		error(404, 'Nie znaleziono');
	}
	const ext = path.extname(file).slice(1);
	const headers: Record<string, string> = {
		'Content-Type': MIME[ext] ?? 'application/octet-stream',
		'Accept-Ranges': 'bytes',
		'X-Content-Type-Options': 'nosniff',
		'Content-Disposition': 'inline',
		'Cache-Control': cacheControl,
		'Content-Security-Policy': "default-src 'none'; sandbox"
	};
	const range = request.headers.get('range');
	const r = range?.match(/^bytes=(\d*)-(\d*)$/);
	if (r && (r[1] || r[2])) {
		let start = r[1] ? parseInt(r[1]) : stat.size - parseInt(r[2]);
		let end = r[1] && r[2] ? parseInt(r[2]) : stat.size - 1;
		start = Math.max(0, start);
		end = Math.min(end, stat.size - 1);
		if (start > end) {
			return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
		}
		headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
		headers['Content-Length'] = String(end - start + 1);
		return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers });
	}
	headers['Content-Length'] = String(stat.size);
	return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers });
}
