import { error, fail } from '@sveltejs/kit';
import QRCode from 'qrcode';
import type { Actions, PageServerLoad } from './$types';
import { buildSnapshot, canHost, loadQuiz, quizAccess } from '#lib/server/quizzes.js';
import { games } from '#lib/server/games.js';
import { panelDict } from '#lib/i18n/panel.js';

export const load: PageServerLoad = ({ params, locals }) => {
	if (!canHost(quizAccess(locals.user!, params.id))) error(404, panelDict(locals.lang).err.quizNotFound);
	const loaded = loadQuiz(params.id)!;
	return { quiz: { id: loaded.quiz.id, title: loaded.quiz.title, questionCount: loaded.questions.length } };
};

export const actions: Actions = {
	start: async ({ params, locals, url }) => {
		if (!canHost(quizAccess(locals.user!, params.id))) error(404, panelDict(locals.lang).err.quizNotFound);
		const snapshot = buildSnapshot(params.id);
		if (!snapshot || snapshot.questions.length === 0) return fail(400, { error: panelDict(locals.lang).err.noQuestions });
		const { pin, hostToken } = games().create(snapshot, locals.user!.id);
		const host = url.host;
		const joinUrl = `${url.origin}/play?pin=${pin}`;
		return {
			game: {
				pin,
				hostToken,
				joinHost: host,
				qr: await QRCode.toDataURL(joinUrl, { margin: 1, width: 320 })
			}
		};
	}
};
