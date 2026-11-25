import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createTheme, listThemes, themeUsage } from '#lib/server/themes.js';
import { mediaUrl } from '#lib/server/media.js';
import { panelDict } from '#lib/i18n/panel.js';

const requireAdmin = (locals: App.Locals) => {
	if (locals.user?.role !== 'admin') error(403, panelDict(locals.lang).err.adminsOnly);
};

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	const usage = themeUsage();
	return {
		styles: panelDict(locals.lang).themes.styles,
		themes: listThemes().map((t) => ({
			id: t.id, name: t.name, style: t.style, colors: t.colors, isDefault: t.isDefault,
			logoUrl: mediaUrl(t.logoLight), logoDarkUrl: mediaUrl(t.logoDark), quizzes: usage.get(t.id) ?? 0
		}))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const name = String(f.get('name') ?? '').trim();
		const style = String(f.get('style') ?? '');
		if (name.length < 2 || name.length > 60) return fail(400, { error: panelDict(locals.lang).err.themeName });
		if (!['poster', 'vivid', 'calm'].includes(style)) return fail(400, { error: panelDict(locals.lang).err.chooseStyle });
		redirect(303, `/panel/themes/${createTheme(name, style as 'poster' | 'vivid' | 'calm')}`);
	}
};
