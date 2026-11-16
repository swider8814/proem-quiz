import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, mediaDir, schema } from '#lib/server/db/index.js';
import { MIME } from '#lib/server/media.js';
import { canUseMedia, fullyAuthenticated, isPublicImage } from '#lib/server/media-access.js';

// Publiczne są tylko logotypy/tła motywów i logo organizacji.
// Pozostałe pliki (audio, zdjęcia w pytaniach) – tylko dla osób z dostępem do quizu, który ich używa.
export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!/^med_[A-Za-z0-9_-]{10,20}$/.test(params.id)) error(404, 'Nie znaleziono');
	const m = db.select().from(schema.media).where(eq(schema.media.id, params.id)).get();
	if (!m) error(404, 'Nie znaleziono');
	const isPublic = isPublicImage(m);
	if (!isPublic && !(fullyAuthenticated(locals) && canUseMedia(locals.user, m))) error(404, 'Nie znaleziono');

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
		// Prywatne pliki nie trafiają do wspólnych cache; publiczne logo – krótko, żeby zmiana logo była widoczna.
		'Cache-Control': isPublic ? 'public, max-age=3600' : 'private, max-age=600',
		'Content-Security-Policy': "default-src 'none'; sandbox"
	};

	// Zakresy bajtów – wymagane przez Safari na iOS przy odtwarzaniu audio.
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
};
