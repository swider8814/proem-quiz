import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LIMITS, MediaError, saveUpload } from '#lib/server/media.js';
import { UPLOAD_LIMIT, consume } from '#lib/server/auth/rate-limit.js';
import { panelDict } from '#lib/i18n/panel.js';

// Ochrona pamięci: ile uploadów naraz trzymamy w buforze (cały proces / jedna osoba).
const MAX_CONCURRENT = 2;
const MAX_BODY = LIMITS.audio + 512 * 1024; // plik + narzut multipart
let inFlight = 0;
const userInFlight = new Set<string>();

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	const t = panelDict(locals.lang).err;
	const len = Number(request.headers.get('content-length'));
	if (!Number.isFinite(len) || len <= 0) error(411, t.noFileSize);
	if (len > MAX_BODY) error(413, t.fileTooBig);
	if (consume(`upload:${user.id}`, UPLOAD_LIMIT.max, UPLOAD_LIMIT.windowMs)) error(429, t.tooManyUploads);
	if (userInFlight.has(user.id)) error(429, t.waitUpload);
	if (inFlight >= MAX_CONCURRENT) error(503, t.uploadBusy);

	inFlight++;
	userInFlight.add(user.id);
	try {
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) error(400, t.noFile);
		if (file.size > MAX_BODY) error(413, t.fileTooBig);
		const m = await saveUpload(user.id, file.name, new Uint8Array(await file.arrayBuffer()));
		return json({ id: m.id, kind: m.kind, name: m.originalName, durationMs: m.durationMs, url: `/media/${m.id}` });
	} catch (e) {
		if (e instanceof MediaError) return json({ error: t[e.key] }, { status: e.status });
		throw e;
	} finally {
		inFlight--;
		userInFlight.delete(user.id);
	}
};
