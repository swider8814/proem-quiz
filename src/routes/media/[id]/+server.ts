import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, mediaDir, schema } from '#lib/server/db/index.js';
import { MIME } from '#lib/server/media.js';

// Obrazy (logo, zdjęcia w pytaniach) są publiczne – id jest nie do odgadnięcia.
// Audio tylko dla zalogowanych (prowadzący), żeby pliki z muzyką nie były dostępne publicznie.
export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!/^med_[A-Za-z0-9_-]{10,20}$/.test(params.id)) error(404, 'Nie znaleziono');
	const m = db.select().from(schema.media).where(eq(schema.media.id, params.id)).get();
	if (!m) error(404, 'Nie znaleziono');
	if (m.kind === 'audio' && !locals.session?.mfaPassed) error(404, 'Nie znaleziono');

	const file = path.join(mediaDir, path.basename(m.file));
	let stat: fs.Stats;
	try {
		stat = fs.statSync(file);
	} catch {
		error(404, 'Nie znaleziono');
	}
	const ext = path.extname(m.file).slice(1);
	const headers: Record<string, string> = {
		'Content-Type': MIME[ext] ?? 'application/octet-stream',
		'Accept-Ranges': 'bytes',
		'X-Content-Type-Options': 'nosniff',
		'Content-Disposition': 'inline',
		'Cache-Control': m.kind === 'audio' ? 'private, max-age=3600' : 'public, max-age=31536000, immutable',
		'Content-Security-Policy': "default-src 'none'; sandbox"
	};

	// Zakresy bajtów – wymagane przez Safari na iOS przy odtwarzaniu audio.
	const range = request.headers.get('range');
	const m2 = range?.match(/^bytes=(\d*)-(\d*)$/);
	if (m2 && (m2[1] || m2[2])) {
		let start = m2[1] ? parseInt(m2[1]) : stat.size - parseInt(m2[2]);
		let end = m2[1] && m2[2] ? parseInt(m2[2]) : stat.size - 1;
		start = Math.max(0, start);
		end = Math.min(end, stat.size - 1);
		if (start > end) {
			return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
		}
		headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
		headers['Content-Length'] = String(end - start + 1);
		const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
		return new Response(stream, { status: 206, headers });
	}
	headers['Content-Length'] = String(stat.size);
	return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers });
};
