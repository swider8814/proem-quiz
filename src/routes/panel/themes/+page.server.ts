import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { STYLE_LABELS, createTheme, listThemes, themeUsage } from '#lib/server/themes.js';
import { mediaUrl } from '#lib/server/media.js';

const requireAdmin = (locals: App.Locals) => {
	if (locals.user?.role !== 'admin') error(403, 'Tylko dla administratorów');
};

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	const usage = themeUsage();
	return {
		styles: STYLE_LABELS,
		themes: listThemes().map((t) => ({
			id: t.id, name: t.name, style: t.style, colors: t.colors, isDefault: t.isDefault,
			logoUrl: mediaUrl(t.logoLight), quizzes: usage.get(t.id) ?? 0
		}))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const name = String(f.get('name') ?? '').trim();
		const style = String(f.get('style') ?? '');
		if (name.length < 2 || name.length > 60) return fail(400, { error: 'Podaj nazwę motywu (2–60 znaków).' });
		if (!['poster', 'vivid', 'calm'].includes(style)) return fail(400, { error: 'Wybierz styl.' });
		redirect(303, `/panel/themes/${createTheme(name, style as 'poster' | 'vivid' | 'calm')}`);
	}
};
