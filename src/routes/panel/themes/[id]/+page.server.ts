import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { panelDict, errText } from '#lib/i18n/panel.js';
import { FONTS, STYLE_PRESETS, deleteTheme, getTheme, setDefaultTheme, themeSchema, themeUsage, updateTheme } from '#lib/server/themes.js';

const requireAdmin = (locals: App.Locals) => {
	if (locals.user?.role !== 'admin') error(403, panelDict(locals.lang).err.adminsOnly);
};

export const load: PageServerLoad = ({ params, locals }) => {
	requireAdmin(locals);
	const t = getTheme(params.id);
	if (!t) error(404, panelDict(locals.lang).err.themeNotFound);
	return {
		theme: { id: t.id, name: t.name, style: t.style, headingFont: t.headingFont, colors: t.colors, logoLight: t.logoLight, logoDark: t.logoDark, isDefault: t.isDefault },
		quizzes: themeUsage().get(t.id) ?? 0,
		styles: panelDict(locals.lang).themes.styles,
		presets: STYLE_PRESETS,
		fonts: FONTS
	};
};

export const actions: Actions = {
	save: async ({ params, request, locals }) => {
		requireAdmin(locals);
		let body: unknown;
		try {
			body = JSON.parse(String((await request.formData()).get('theme') ?? ''));
		} catch {
			return fail(400, { error: panelDict(locals.lang).err.invalid });
		}
		const parsed = themeSchema.safeParse(body);
		if (!parsed.success) {
			const msg = parsed.error.issues[0].message;
			const text = errText(locals.lang, msg);
			return fail(400, { error: text === msg ? panelDict(locals.lang).err.invalid : text });
		}
		const res = updateTheme(params.id, parsed.data);
		if ('error' in res) return fail(400, { error: errText(locals.lang, res.error ?? 'invalid') });
		return { saved: true };
	},
	makeDefault: async ({ params, locals }) => {
		requireAdmin(locals);
		if (!setDefaultTheme(params.id)) return fail(404, { error: panelDict(locals.lang).err.themeNotFound });
		return { saved: true };
	},
	delete: async ({ params, locals }) => {
		requireAdmin(locals);
		const res = deleteTheme(params.id);
		if ('error' in res) return fail(400, { error: errText(locals.lang, res.error ?? 'invalid') });
		redirect(303, '/panel/themes');
	}
};
