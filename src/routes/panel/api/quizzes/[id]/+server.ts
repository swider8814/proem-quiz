import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canEdit, quizAccess, quizSaveSchema, saveQuiz } from '#lib/server/quizzes.js';
import { errText, panelDict } from '#lib/i18n/panel.js';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const t = panelDict(locals.lang);
	if (!canEdit(quizAccess(locals.user!, params.id))) error(403, t.err.noEditRights);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, t.err.invalid);
	}
	const parsed = quizSaveSchema.safeParse(body);
	if (!parsed.success) {
		// Komunikaty schematu to klucze z i18n/panel.ts; wbudowane komunikaty zod → „Nieprawidłowe dane”.
		const issue = parsed.error.issues[0];
		const where = issue.path[0] === 'questions' && typeof issue.path[1] === 'number' ? t.err.questionPrefix(issue.path[1] + 1) : '';
		const text = errText(locals.lang, issue.message);
		return json({ error: `${where}${text === issue.message ? t.err.invalid : text}` }, { status: 400 });
	}
	const res = await saveQuiz(locals.user!, params.id, parsed.data);
	if ('error' in res) return json({ error: errText(locals.lang, res.error) + (res.detail ? ` (${res.detail})` : '') }, { status: 400 });
	return json(res);
};
