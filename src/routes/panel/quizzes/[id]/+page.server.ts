import { error } from '@sveltejs/kit';
import { asc, inArray } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { canEdit, loadQuiz, quizAccess } from '#lib/server/quizzes.js';
import { DEFAULT_QUIZ_SETTINGS } from '#lib/server/db/schema.js';

export const load: PageServerLoad = ({ params, locals }) => {
	const access = quizAccess(locals.user!, params.id);
	if (!access) error(404, 'Nie znaleziono quizu.');
	const loaded = loadQuiz(params.id)!;
	const mediaIds = new Set<string>();
	for (const q of loaded.questions) {
		if (q.imageMediaId) mediaIds.add(q.imageMediaId);
		if (q.data.type === 'audio') mediaIds.add(q.data.audioMediaId);
	}
	const media = mediaIds.size
		? db.select({ id: schema.media.id, name: schema.media.originalName, durationMs: schema.media.durationMs, kind: schema.media.kind })
				.from(schema.media).where(inArray(schema.media.id, [...mediaIds])).all()
		: [];
	return {
		canEdit: canEdit(access),
		quiz: {
			id: loaded.quiz.id,
			title: loaded.quiz.title,
			description: loaded.quiz.description,
			themeId: loaded.quiz.themeId,
			locale: loaded.quiz.locale,
			settings: { ...DEFAULT_QUIZ_SETTINGS, ...loaded.quiz.settings }
		},
		questions: loaded.questions.map((q) => {
			const { clipMediaId: _clip, ...data } = q.data as typeof q.data & { clipMediaId?: string };
			return {
				id: q.id,
				type: q.type,
				prompt: q.prompt,
				promptTranslation: q.promptTranslation,
				imageMediaId: q.imageMediaId,
				timeLimit: q.timeLimit,
				pointsMultiplier: q.pointsMultiplier as 0 | 1 | 2,
				data
			};
		}),
		media: Object.fromEntries(media.map((m) => [m.id, m])),
		themes: db.select({ id: schema.themes.id, name: schema.themes.name, style: schema.themes.style }).from(schema.themes).orderBy(asc(schema.themes.name)).all()
	};
};
