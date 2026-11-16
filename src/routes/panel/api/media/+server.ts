import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveUpload } from '#lib/server/media.js';
import { hit, isLimited } from '#lib/server/auth/rate-limit.js';

// Upload pliku (audio / obraz). Dostęp tylko po zalogowaniu (pilnuje hooks.server.ts dla /panel).
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	if (isLimited(`upload:${user.id}`, 60, 60 * 60 * 1000)) error(429, 'Za dużo plików w krótkim czasie.');
	hit(`upload:${user.id}`, 60 * 60 * 1000);

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) error(400, 'Brak pliku.');
	const res = await saveUpload(user.id, file.name, new Uint8Array(await file.arrayBuffer()));
	if ('error' in res) return json({ error: res.error }, { status: 400 });
	const m = res.media;
	return json({ id: m.id, kind: m.kind, name: m.originalName, durationMs: m.durationMs, url: `/media/${m.id}` });
};
