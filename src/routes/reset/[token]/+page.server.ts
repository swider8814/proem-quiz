import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { BusyError, createSession, fullAfterPassword, hashPassword, passwordProblem, setSessionCookie } from '#lib/server/auth/index.js';
import { consumeInvite, findInvite } from '#lib/server/users.js';
import { clientIp } from '#lib/server/net.js';

const GONE = 'Ten link jest nieważny, wygasł albo został już użyty. Poproś o nowy na stronie logowania.';

export const load: PageServerLoad = ({ params }) => {
	const found = findInvite(params.token, 'reset');
	if (!found) error(404, GONE);
	return { email: found.user.email };
};

export const actions: Actions = {
	default: async (event) => {
		const { params, request, cookies } = event;
		if (!findInvite(params.token, 'reset')) error(404, GONE);
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
		// Atomowo: link jednorazowy, wszystkie sesje wylogowane, stan konta (TOTP) z tej samej transakcji.
		const user = consumeInvite(params.token, passwordHash, 'reset');
		if (!user) error(404, GONE);
		const full = fullAfterPassword(user);
		const { token, session } = createSession(user, { mfaPassed: full, ip: clientIp(event), userAgent: request.headers.get('user-agent') ?? undefined });
		setSessionCookie(cookies, token, session.expiresAt);
		// Reset hasła NIE omija 2FA: konto z TOTP musi podać kod.
		redirect(303, full ? '/panel' : user.totpEnabled ? '/login/2fa' : '/panel/2fa-setup');
	}
};
