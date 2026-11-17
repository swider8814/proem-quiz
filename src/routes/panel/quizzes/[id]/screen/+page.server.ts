import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { canHost, quizAccess } from '#lib/server/quizzes.js';
import { panelDict } from '#lib/i18n/panel.js';

// Ekran dla widzów nie łączy się z serwerem gry – stan dostaje z okna prowadzącego
// w tej samej przeglądarce. Dostęp i tak tylko dla osób, które mogą prowadzić ten quiz.
export const load: PageServerLoad = ({ params, locals, url }) => {
	if (!canHost(quizAccess(locals.user!, params.id))) error(404, panelDict(locals.lang).err.quizNotFound);
	const pin = url.searchParams.get('pin') ?? '';
	if (!/^\d{6}$/.test(pin)) error(404, panelDict(locals.lang).err.quizNotFound);
	return { quizId: params.id, pin };
};
