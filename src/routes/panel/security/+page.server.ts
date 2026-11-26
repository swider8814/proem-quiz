import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { remainingRecoveryCodes } from '#lib/server/auth/index.js';
import { mailConfigured } from '#lib/server/mail.js';
import { cleanName, renameUser } from '#lib/server/users.js';
import { panelDict } from '#lib/i18n/panel.js';

export const load: PageServerLoad = ({ locals, url }) => ({
	remainingCodes: locals.user!.totpEnabled ? remainingRecoveryCodes(locals.user!.id) : 0,
	recoveryUsed: url.searchParams.has('recovery-used'),
	mail: mailConfigured()
});

export const actions: Actions = {
	// Każdy może poprawić własne imię i nazwisko (zawsze tylko swoje – ID z sesji, nie z formularza).
	name: async ({ request, locals }) => {
		const t = panelDict(locals.lang);
		const name = cleanName((await request.formData()).get('name'));
		if (!name) return fail(400, { nameError: t.err.giveName });
		renameUser(locals.user!.id, name);
		// Layout renderuje się w tym samym żądaniu – bez tego pokazałby starą nazwę i inicjały.
		locals.user!.name = name;
		return { nameSaved: true };
	}
};
