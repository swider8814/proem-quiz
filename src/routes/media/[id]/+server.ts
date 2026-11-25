import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { canUseMedia, fullyAuthenticated, isPublicImage } from '#lib/server/media-access.js';
import { serveMedia } from '#lib/server/media-serve.js';

// Publiczne są tylko logotypy/tła motywów i logo organizacji.
// Pozostałe pliki (audio, zdjęcia w pytaniach) – tylko dla osób z dostępem do quizu, który ich używa.
export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!/^med_[A-Za-z0-9_-]{10,20}$/.test(params.id)) error(404, 'Nie znaleziono');
	const m = db.select().from(schema.media).where(eq(schema.media.id, params.id)).get();
	if (!m) error(404, 'Nie znaleziono');
	const isPublic = isPublicImage(m);
	if (!isPublic && !(fullyAuthenticated(locals) && canUseMedia(locals.user, m))) error(404, 'Nie znaleziono');
	// Prywatne pliki nie trafiają do wspólnych cache; publiczne logo – krótko, żeby zmiana logo była widoczna.
	return serveMedia(m, request, isPublic ? 'public, max-age=3600' : 'private, max-age=600');
};
