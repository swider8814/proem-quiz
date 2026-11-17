import { error } from '@sveltejs/kit';
import { asc, inArray } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { canEdit, canManageShares, loadQuiz, quizAccess } from '#lib/server/quizzes.js';
import { DEFAULT_QUIZ_SETTINGS } from '#lib/server/db/schema.js';
import { panelDict } from '#lib/i18n/panel.js';

export const load: PageServerLoad = ({ params, locals }) => {
	const access = quizAccess(locals.user!, params.id);
	if (!access) error(404, panelDict(locals.lang).err.quizNotFound);
	const loaded = loadQuiz(params.id)!;
	const mediaIds = new Set<string>();
	for (const q of loaded.questions) {
		if (q.imageMediaId) mediaIds.add(q.imageMediaId);
		if (q.data.type === 'audio') mediaIds.add(q.data.audioMediaId);
		if (q.data.type === 'choice' || q.data.type === 'poll') for (const im of q.data.images ?? []) if (im) mediaIds.add(im);
	}
	const settings = { ...DEFAULT_QUIZ_SETTINGS, ...loaded.quiz.settings };
	// Edytor dostaje plik i zakres; wycięty fragment (clipMediaId) serwer liczy sam przy zapisie.
	const strip = (a: typeof settings.podiumAudio) => (a ? { mediaId: a.mediaId, startMs: a.startMs, endMs: a.endMs } : null);
	const podiumAudio = strip(settings.podiumAudio);
	const musicAudio = strip(settings.musicAudio);
	for (const a of [podiumAudio, musicAudio]) if (a) mediaIds.add(a.mediaId);
	const media = mediaIds.size
		? db.select({ id: schema.media.id, name: schema.media.originalName, durationMs: schema.media.durationMs, kind: schema.media.kind })
				.from(schema.media).where(inArray(schema.media.id, [...mediaIds])).all()
		: [];
	return {
		canEdit: canEdit(access),
		canShare: canManageShares(locals.user!, access),
		quiz: {
			id: loaded.quiz.id,
			title: loaded.quiz.title,
			description: loaded.quiz.description,
			themeId: loaded.quiz.themeId,
			locale: loaded.quiz.locale,
			settings: { ...settings, podiumAudio, musicAudio }
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
