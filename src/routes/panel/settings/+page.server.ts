import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSettings, saveSettings } from '#lib/server/themes.js';
import { mailConfigured } from '#lib/server/mail.js';

const requireAdmin = (locals: App.Locals) => {
	if (locals.user?.role !== 'admin') error(403, 'Tylko dla administratorów');
};

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	return { settings: getSettings(), mail: mailConfigured(), mailFrom: process.env.MAIL_FROM ?? null };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const orgName = String(f.get('orgName') ?? '').trim();
		const logo = String(f.get('orgLogo') ?? '').trim() || null;
		if (orgName.length < 2 || orgName.length > 60) return fail(400, { error: 'Nazwa organizacji: 2–60 znaków.' });
		if (logo && !/^med_[A-Za-z0-9_-]{10,20}$/.test(logo)) return fail(400, { error: 'Nieprawidłowe logo.' });
		const res = saveSettings(orgName, logo);
		if ('error' in res) return fail(400, { error: res.error });
		return { saved: true };
	}
};
