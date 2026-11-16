import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { BusyError, createSession, fullAfterPassword, hashPassword, passwordProblem, setSessionCookie } from '#lib/server/auth/index.js';
import { consumeInvite, findInvite } from '#lib/server/users.js';
import { clientIp } from '#lib/server/net.js';

export const load: PageServerLoad = ({ params }) => {
	const found = findInvite(params.token);
	if (!found) error(404, 'Ten link zaproszenia jest nieważny albo wygasł. Poproś administratora o nowy.');
	return { name: found.user.name, email: found.user.email, role: found.user.role };
};

export const actions: Actions = {
	default: async (event) => {
		const { params, request, cookies } = event;
		if (!findInvite(params.token)) error(404, 'Ten link zaproszenia jest nieważny albo wygasł.');

		const f = await request.formData();
		const password = String(f.get('password') ?? '');
		const repeat = String(f.get('repeat') ?? '');
		const problem = passwordProblem(password) ?? (password !== repeat ? 'Hasła się różnią.' : null);
		if (problem) return fail(400, { error: problem });

		let passwordHash: string;
		try {
			passwordHash = await hashPassword(password);
		} catch (e) {
			if (e instanceof BusyError) return fail(503, { error: 'Serwer jest chwilowo zajęty. Spróbuj za moment.' });
			throw e;
		}

		// Zaproszenie zużywane ATOMOWO; sesja według stanu konta odczytanego w tej samej transakcji.
		const user = consumeInvite(params.token, passwordHash);
		if (!user) error(404, 'Ten link zaproszenia jest nieważny albo został już użyty.');

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
