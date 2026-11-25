import type { LayoutServerLoad } from './$types';
import { getSettings } from '#lib/server/themes.js';
import { appVersion, fmtBuiltAt } from '#lib/server/version.js';

export const load: LayoutServerLoad = ({ locals }) => {
	const u = locals.user!;
	const org = getSettings();
	return {
		org: { name: org.orgName, logoUrl: org.orgLogo ? `/media/${org.orgLogo}` : null },
		user: { id: u.id, name: u.name, email: u.email, role: u.role, totpEnabled: u.totpEnabled },
		version: (() => { const v = appVersion(); return { label: v.label, short: v.short, commitUrl: v.commitUrl, builtAt: fmtBuiltAt(v.builtAt, locals.lang) }; })()
	};
};
