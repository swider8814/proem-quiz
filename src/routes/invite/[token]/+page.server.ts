import type { Actions, PageServerLoad } from './$types';
import { completePasswordLink, loadPasswordLink } from '#lib/server/auth/password-link.js';
import { userLang } from '#lib/server/lang.js';

export const load: PageServerLoad = (event) => {
	const user = loadPasswordLink(event, 'invite');
	// Strona w języku wybranym przez administratora dla tego konta.
	return { name: user.name, email: user.email, role: user.role, lang: userLang(user) };
};

export const actions: Actions = {
	default: (event) => completePasswordLink(event, 'invite')
};
