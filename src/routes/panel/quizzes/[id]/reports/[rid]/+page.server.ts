import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { canEdit, canHost, quizAccess } from '#lib/server/quizzes.js';
import { deleteReport, getReport } from '#lib/server/reports.js';
import { panelDict } from '#lib/i18n/panel.js';

export const load: PageServerLoad = ({ params, locals }) => {
	const access = quizAccess(locals.user!, params.id);
	if (!canHost(access)) error(404, panelDict(locals.lang).err.quizNotFound);
	const r = getReport(params.id, params.rid);
	if (!r) error(404, panelDict(locals.lang).err.quizNotFound);
	return {
		quizId: params.id,
		report: { id: r.id, title: r.title, startedAt: r.startedAt, endedAt: r.endedAt, data: r.data },
		canDelete: canEdit(access) || r.hostId === locals.user!.id
	};
};

export const actions: Actions = {
	delete: ({ params, locals }) => {
		const access = quizAccess(locals.user!, params.id);
		const r = canHost(access) ? getReport(params.id, params.rid) : null;
		if (!r) error(404, panelDict(locals.lang).err.quizNotFound);
		if (!(canEdit(access) || r.hostId === locals.user!.id)) return fail(403);
		deleteReport(params.id, params.rid);
		redirect(303, `/panel/quizzes/${params.id}/reports`);
	}
};
