import type { Actions, PageServerLoad } from './$types';
import { completePasswordLink, loadPasswordLink } from '#lib/server/auth/password-link.js';
import { userLang } from '#lib/server/lang.js';

export const load: PageServerLoad = (event) => {
	const user = loadPasswordLink(event, 'reset');
	// Strona w języku konta, którego dotyczy link.
	return { email: user.email, lang: userLang(user) };
};

export const actions: Actions = {
	default: (event) => completePasswordLink(event, 'reset')
};
