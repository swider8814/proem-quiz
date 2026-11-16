import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { BusyError, createSession, fullAfterPassword, hashPassword, passwordProblem, setSessionCookie } from '#lib/server/auth/index.js';
import { consumeInvite, findInvite } from '#lib/server/users.js';
import { clientIp } from '#lib/server/net.js';
import { panelDict } from '#lib/i18n/panel.js';
import { userLang } from '#lib/server/lang.js';

export const load: PageServerLoad = ({ params, locals }) => {
	const found = findInvite(params.token);
	if (!found) error(404, panelDict(locals.lang).err.inviteGone);
	locals.lang = userLang(found.user);
	// Strona w języku wybranym przez administratora dla tego konta.
	return { name: found.user.name, email: found.user.email, role: found.user.role, lang: userLang(found.user) };
};

export const actions: Actions = {
	default: async (event) => {
		const { params, request, cookies } = event;
		const found = findInvite(params.token);
		const t = panelDict(found ? userLang(found.user) : event.locals.lang);
		if (!found) error(404, t.err.inviteGone);

		const f = await request.formData();
		const password = String(f.get('password') ?? '');
		const repeat = String(f.get('repeat') ?? '');
		const problem = passwordProblem(password) ?? (password !== repeat ? 'passwordsDiffer' : null);
		if (problem) return fail(400, { error: t.err[problem] });

		let passwordHash: string;
		try {
			passwordHash = await hashPassword(password);
		} catch (e) {
			if (e instanceof BusyError) return fail(503, { error: t.err.busy });
			throw e;
		}

		// Zaproszenie zużywane ATOMOWO; sesja według stanu konta odczytanego w tej samej transakcji.
		const user = consumeInvite(params.token, passwordHash);
		if (!user) error(404, t.err.inviteGone);

		const full = fullAfterPassword(user);
		const { token, session } = createSession(user, {
			mfaPassed: full,
			ip: clientIp(event),
			userAgent: request.headers.get('user-agent') ?? undefined
		});
		setSessionCookie(cookies, token, session.expiresAt);
		redirect(303, full ? '/panel' : user.totpEnabled ? '/login/2fa' : '/panel/2fa-setup');
	}
};
