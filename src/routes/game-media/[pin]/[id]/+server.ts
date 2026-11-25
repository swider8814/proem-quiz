import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import fs from 'node:fs';
import { serveMedia } from '#lib/server/media-serve.js';
import { thumbPath } from '#lib/server/media.js';
import { games } from '#lib/server/games.js';

/**
 * Obrazki odpowiedzi dla telefonów graczy (bez logowania). Plik jest dostępny tylko wtedy, gdy gra
 * o tym PIN-ie trwa i BIEŻĄCE pytanie (odliczanie, pytanie, wyniki) ma go jako obrazek odpowiedzi –
 * czyli dokładnie to, co gracze i tak widzą na ekranie. Inne pliki quizu zostają prywatne.
 */
export const GET: RequestHandler = async ({ params, request }) => {
	if (!/^\d{6}$/.test(params.pin) || !/^med_[A-Za-z0-9_-]{10,20}$/.test(params.id)) error(404, 'Nie znaleziono');
	const g = games().get(params.pin);
	if (!g || !g.currentPublicMedia().includes(params.id)) error(404, 'Nie znaleziono');
	const m = db.select().from(schema.media).where(eq(schema.media.id, params.id)).get();
	if (!m || m.kind !== 'image') error(404, 'Nie znaleziono');
	// Miniatura (480 px WebP), gdy jest – 300 telefonów naraz nie pobiera pełnych zdjęć.
	const thumb = thumbPath(m.file);
	return serveMedia(m, request, 'private, max-age=600', fs.existsSync(thumb) ? thumb : undefined);
};
