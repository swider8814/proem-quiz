import { fail } from '@sveltejs/kit';
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Actions } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { createInvite, isValidEmail, resetUrl } from '#lib/server/users.js';
import { resetMail, sendMail } from '#lib/server/mail.js';
import { consume } from '#lib/server/auth/rate-limit.js';
import { clientIp } from '#lib/server/net.js';

function sendResetIfAccount(email: string, origin: string) {
	const user = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
	// Reset tylko dla aktywnych kont z hasłem (nieaktywowane konta dostają nowe zaproszenie od admina).
	if (!user || user.disabled || !user.passwordHash) return;
	const token = createInvite(user.id, 'reset');
	void sendMail(resetMail(user.email, user.name, resetUrl(origin, token)));
}

// Zawsze ta sama odpowiedź – nie zdradzamy, czy konto istnieje.
const DONE = { sent: true };

export const actions: Actions = {
	default: async (event) => {
		const { request, url } = event;
		const email = String((await request.formData()).get('email') ?? '').toLowerCase().trim().slice(0, 200);
		if (!isValidEmail(email)) return fail(400, { error: 'Podaj poprawny adres e-mail.' });
		// Limity: 3 prośby na adres na godzinę, 10 na IP na godzinę.
		if (consume(`forgot:${email}`, 3, 60 * 60 * 1000) || consume(`forgot-ip:${clientIp(event)}`, 10, 60 * 60 * 1000)) {
			return DONE;
		}
		// Cała obsługa (odczyt konta, token, e-mail) dopiero po odpowiedzi i z losowym opóźnieniem –
		// odpowiedź dla istniejącego i nieistniejącego konta wymaga dokładnie tej samej pracy.
		const origin = url.origin;
		setTimeout(() => {
			try {
				sendResetIfAccount(email, origin);
			} catch (e) {
				console.error('[reset] błąd obsługi prośby o reset:', (e as Error).message);
			}
		}, 200 + randomInt(400));
		return DONE;
	}
};
