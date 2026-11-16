import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LIMITS, MediaError, saveUpload } from '#lib/server/media.js';
import { UPLOAD_LIMIT, consume } from '#lib/server/auth/rate-limit.js';

// Ochrona pamięci: ile uploadów naraz trzymamy w buforze (cały proces / jedna osoba).
const MAX_CONCURRENT = 2;
const MAX_BODY = LIMITS.audio + 512 * 1024; // plik + narzut multipart
let inFlight = 0;
const userInFlight = new Set<string>();

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	const len = Number(request.headers.get('content-length'));
	if (!Number.isFinite(len) || len <= 0) error(411, 'Brak rozmiaru pliku.');
	if (len > MAX_BODY) error(413, 'Plik jest za duży.');
	if (consume(`upload:${user.id}`, UPLOAD_LIMIT.max, UPLOAD_LIMIT.windowMs)) error(429, 'Za dużo plików w krótkim czasie.');
	if (userInFlight.has(user.id)) error(429, 'Poczekaj, aż poprzedni plik się wyśle.');
	if (inFlight >= MAX_CONCURRENT) error(503, 'Serwer odbiera teraz inne pliki. Spróbuj za chwilę.');

	inFlight++;
	userInFlight.add(user.id);
	try {
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) error(400, 'Brak pliku.');
		if (file.size > MAX_BODY) error(413, 'Plik jest za duży.');
		const m = await saveUpload(user.id, file.name, new Uint8Array(await file.arrayBuffer()));
		return json({ id: m.id, kind: m.kind, name: m.originalName, durationMs: m.durationMs, url: `/media/${m.id}` });
	} catch (e) {
		if (e instanceof MediaError) return json({ error: e.message }, { status: e.status });
		throw e;
	} finally {
		inFlight--;
		userInFlight.delete(user.id);
	}
};
