import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { isPanelLang } from '#lib/i18n/panel.js';
import { LANG_COOKIE } from '#lib/server/lang.js';

/** Bezpieczny powrót: tylko ścieżka w obrębie tej samej domeny. */
function safeBack(next: unknown, origin: string): string {
	if (typeof next !== 'string' || next.length > 500) return '/panel';
	try {
		const u = new URL(next, origin);
		return u.origin === origin ? u.pathname + u.search : '/panel';
	} catch {
		return '/panel';
	}
}

// Zmiana języka panelu. Formularz POST – SvelteKit sprawdza nagłówek Origin (ochrona CSRF).
export const POST: RequestHandler = async ({ request, locals, cookies, url }) => {
	const f = await request.formData();
	const lang = f.get('lang');
	const back = safeBack(f.get('next'), url.origin);
	if (!isPanelLang(lang)) redirect(303, back);
	cookies.set(LANG_COOKIE, lang, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 365 * 24 * 60 * 60
	});
	// Zalogowany w pełni: język zapisany w koncie (e-maile, domyślny język nowych quizów).
	if (locals.user && locals.session?.mfaPassed) {
		db.update(schema.users).set({ locale: lang }).where(eq(schema.users.id, locals.user.id)).run();
	}
	redirect(303, back);
};
