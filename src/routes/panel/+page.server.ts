import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { createQuiz, duplicateQuiz, listQuizzes, quizAccess } from '#lib/server/quizzes.js';
import { sweepOrphanMedia } from '#lib/server/media-access.js';

export const load: PageServerLoad = ({ locals }) => ({ quizzes: listQuizzes(locals.user!) });

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const title = String((await request.formData()).get('title') ?? '').trim();
		if (!title) return fail(400, { error: 'Podaj tytuł quizu.' });
		redirect(303, `/panel/quizzes/${createQuiz(locals.user!, title)}`);
	},
	duplicate: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!quizAccess(locals.user!, id)) error(404);
		const copy = duplicateQuiz(locals.user!, id);
		if (!copy) error(404);
		redirect(303, `/panel/quizzes/${copy}`);
	},
	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		const access = quizAccess(locals.user!, id);
		if (access !== 'owner' && locals.user!.role !== 'admin') return fail(403, { error: 'Możesz usuwać tylko własne quizy.' });
		db.delete(schema.quizzes).where(eq(schema.quizzes.id, id)).run();
		// Pliki usuniętego quizu znikną przy sprzątaniu (po dobie od wgrania, o ile nic ich nie używa).
		sweepOrphanMedia().catch(() => {});
		return { message: 'Quiz usunięty.' };
	}
};
