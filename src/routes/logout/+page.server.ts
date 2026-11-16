import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { clearSessionCookie, deleteSession } from '#lib/server/auth/index.js';

export const load: PageServerLoad = () => redirect(303, '/login');

export const actions: Actions = {
	default: ({ locals, cookies }) => {
		if (locals.session) deleteSession(locals.session.id);
		clearSessionCookie(cookies);
		redirect(303, '/login');
	}
};
