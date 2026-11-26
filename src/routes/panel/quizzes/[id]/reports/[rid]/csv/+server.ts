import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canHost, quizAccess } from '#lib/server/quizzes.js';
import { getReport, reportCsv } from '#lib/server/reports.js';
import { panelDict } from '#lib/i18n/panel.js';

export const GET: RequestHandler = ({ params, locals }) => {
	if (!canHost(quizAccess(locals.user!, params.id))) error(404, 'Nie znaleziono');
	const r = getReport(params.id, params.rid);
	if (!r) error(404, 'Nie znaleziono');
	const t = panelDict(locals.lang);
	const R = t.reports;
	const csv = reportCsv(r, {
		place: R.place, player: r.data.teamMode ? R.team : R.player, score: R.score,
		question: R.question, type: R.type, answeredCount: R.answeredCount, correctCount: R.correctCount, wrongCount: R.wrongCount, avgTime: R.avgTime,
		types: t.editor.types
	});
	const day = new Date(r.endedAt).toISOString().slice(0, 10);
	const safe = r.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'quiz';
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="raport-${day}.csv"; filename*=UTF-8''${encodeURIComponent(`${safe} ${day}.csv`)}`,
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
