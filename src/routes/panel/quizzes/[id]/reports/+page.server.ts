import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { canHost, quizAccess } from '#lib/server/quizzes.js';
import { listReports } from '#lib/server/reports.js';
import { panelDict } from '#lib/i18n/panel.js';

export const load: PageServerLoad = ({ params, locals }) => {
	if (!canHost(quizAccess(locals.user!, params.id))) error(404, panelDict(locals.lang).err.quizNotFound);
	const quiz = db.select({ id: schema.quizzes.id, title: schema.quizzes.title }).from(schema.quizzes).where(eq(schema.quizzes.id, params.id)).get()!;
	return { quiz, reports: listReports(params.id) };
};
