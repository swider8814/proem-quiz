import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSettings, saveSettings } from '#lib/server/themes.js';
import { mailConfigured } from '#lib/server/mail.js';
import { errText, panelDict } from '#lib/i18n/panel.js';
import { readBackupStatus } from '#lib/server/backup-status.js';
import { appVersion, fmtBuiltAt } from '#lib/server/version.js';
import { mediaUsage } from '#lib/server/media.js';

const requireAdmin = (locals: App.Locals) => {
	if (locals.user?.role !== 'admin') error(403, panelDict(locals.lang).err.adminsOnly);
};

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const v = appVersion();
	const about = { ...v, builtAt: fmtBuiltAt(v.builtAt, locals.lang), node: process.version, startedAt: fmtBuiltAt(new Date(Date.now() - process.uptime() * 1000).toISOString(), locals.lang), media: await mediaUsage() };
	return { settings: getSettings(), mail: mailConfigured(), mailFrom: process.env.MAIL_FROM ?? null, backup: readBackupStatus(), about };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const orgName = String(f.get('orgName') ?? '').trim();
		const logo = String(f.get('orgLogo') ?? '').trim() || null;
		if (orgName.length < 2 || orgName.length > 60) return fail(400, { error: panelDict(locals.lang).err.orgName });
		if (logo && !/^med_[A-Za-z0-9_-]{10,20}$/.test(logo)) return fail(400, { error: panelDict(locals.lang).err.badLogo });
		const res = saveSettings(orgName, logo);
		if ('error' in res) return fail(400, { error: errText(locals.lang, res.error ?? 'invalid') });
		return { saved: true };
	}
};
