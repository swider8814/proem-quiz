import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canEdit, quizAccess, quizSaveSchema, saveQuiz } from '#lib/server/quizzes.js';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!canEdit(quizAccess(locals.user!, params.id))) error(403, 'Brak uprawnień do edycji.');
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Nieprawidłowe dane.');
	}
	const parsed = quizSaveSchema.safeParse(body);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const where = issue.path[0] === 'questions' && typeof issue.path[1] === 'number' ? `Pytanie ${issue.path[1] + 1}: ` : '';
		return json({ error: `${where}${issue.message}` }, { status: 400 });
	}
	const res = await saveQuiz(locals.user!, params.id, parsed.data);
	if ('error' in res) return json({ error: res.error }, { status: 400 });
	return json(res);
};
