import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { FONTS, STYLE_LABELS, STYLE_PRESETS, deleteTheme, getTheme, setDefaultTheme, themeSchema, themeUsage, updateTheme } from '#lib/server/themes.js';

const requireAdmin = (locals: App.Locals) => {
	if (locals.user?.role !== 'admin') error(403, 'Tylko dla administratorów');
};

export const load: PageServerLoad = ({ params, locals }) => {
	requireAdmin(locals);
	const t = getTheme(params.id);
	if (!t) error(404, 'Nie znaleziono motywu.');
	return {
		theme: { id: t.id, name: t.name, style: t.style, headingFont: t.headingFont, colors: t.colors, logoLight: t.logoLight, logoDark: t.logoDark, isDefault: t.isDefault },
		quizzes: themeUsage().get(t.id) ?? 0,
		styles: STYLE_LABELS,
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
			return fail(400, { error: 'Nieprawidłowe dane.' });
		}
		const parsed = themeSchema.safeParse(body);
		if (!parsed.success) return fail(400, { error: parsed.error.issues[0].message });
		const res = updateTheme(params.id, parsed.data);
		if ('error' in res) return fail(400, { error: res.error });
		return { saved: true };
	},
	makeDefault: async ({ params, locals }) => {
		requireAdmin(locals);
		if (!setDefaultTheme(params.id)) return fail(404, { error: 'Nie znaleziono motywu.' });
		return { saved: true };
	},
	delete: async ({ params, locals }) => {
		requireAdmin(locals);
		const res = deleteTheme(params.id);
		if ('error' in res) return fail(400, { error: res.error });
		redirect(303, '/panel/themes');
	}
};
