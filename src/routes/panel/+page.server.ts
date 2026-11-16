import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { canEdit, createQuiz, duplicateQuiz, listQuizzes, quizAccess } from '#lib/server/quizzes.js';
import { sweepOrphanMedia } from '#lib/server/media-access.js';
import { panelDict } from '#lib/i18n/panel.js';

export const load: PageServerLoad = ({ locals }) => ({ quizzes: listQuizzes(locals.user!) });

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const title = String((await request.formData()).get('title') ?? '').trim();
		if (!title) return fail(400, { error: panelDict(locals.lang).err.giveTitle });
		redirect(303, `/panel/quizzes/${createQuiz(locals.user!, title)}`);
	},
	duplicate: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const access = quizAccess(locals.user!, id);
		if (!access) error(404);
		// Kopia = pełna, edytowalna treść quizu – tylko dla osób, które mogą go edytować (nie „prowadzenie”).
		if (!canEdit(access)) error(403);
		const copy = duplicateQuiz(locals.user!, id);
		if (!copy) error(404);
		redirect(303, `/panel/quizzes/${copy}`);
	},
	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const access = quizAccess(locals.user!, id);
		if (access !== 'owner' && locals.user!.role !== 'admin') return fail(403, { error: panelDict(locals.lang).err.onlyOwnQuizzes });
		db.delete(schema.quizzes).where(eq(schema.quizzes.id, id)).run();
		// Pliki usuniętego quizu znikną przy sprzątaniu (po dobie od wgrania, o ile nic ich nie używa).
		sweepOrphanMedia().catch(() => {});
		return { message: panelDict(locals.lang).list.deleted };
	}
};
