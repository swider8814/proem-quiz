import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { createInvite, isValidEmail, resetUrl } from '#lib/server/users.js';
import { resetMail, sendMail } from '#lib/server/mail.js';
import { consume } from '#lib/server/auth/rate-limit.js';
import { clientIp } from '#lib/server/net.js';
import { panelDict } from '#lib/i18n/panel.js';

// Zawsze ta sama odpowiedź – nie zdradzamy, czy konto istnieje.
const DONE = { sent: true };

export const actions: Actions = {
	default: async (event) => {
		const { request, url } = event;
		const email = String((await request.formData()).get('email') ?? '').toLowerCase().trim().slice(0, 200);
		if (!isValidEmail(email)) return fail(400, { error: panelDict(event.locals.lang).err.badEmail });
		// Limity: 3 prośby na adres na godzinę, 10 na IP na godzinę.
		if (consume(`forgot:${email}`, 3, 60 * 60 * 1000) || consume(`forgot-ip:${clientIp(event)}`, 10, 60 * 60 * 1000)) {
			return DONE;
		}
		const user = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
		// Reset tylko dla aktywnych kont z hasłem (nieaktywowane konta dostają nowe zaproszenie od admina).
		if (user && !user.disabled && user.passwordHash) {
			const token = createInvite(user.id, 'reset');
			// Bez await: czas odpowiedzi nie zdradza, czy konto istnieje.
			void sendMail(resetMail(user.email, user.name, resetUrl(url.origin, token), user.locale));
		}
		return DONE;
	}
};
