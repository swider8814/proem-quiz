// Wspólne zakończenie linku jednorazowego, który ustawia hasło: aktywacja konta (zaproszenie)
// i reset hasła. Jedno miejsce dla walidacji hasła, Argon2, atomowego zużycia linku, tworzenia
// sesji i wyboru następnego kroku 2FA – zmiana zasad trafia do obu dróg naraz.
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { BusyError, createSession, fullAfterPassword, hashPassword, passwordProblem, setSessionCookie } from './index.js';
import { consumeInvite, findInvite, type TokenPurpose } from '../users.js';
import { clientIp } from '../net.js';
import { panelDict } from '#lib/i18n/panel.js';
import { userLang } from '../lang.js';

/** Komunikat „link nieważny” – osobny dla każdej drogi. */
const GONE = { invite: 'inviteGone', reset: 'resetGone' } as const;

/** Konto, którego dotyczy link (albo 404), i język strony = język tego konta. */
export function loadPasswordLink(event: Pick<RequestEvent, 'params' | 'locals'>, purpose: TokenPurpose) {
	const found = findInvite(event.params.token ?? '', purpose);
	if (!found) error(404, panelDict(event.locals.lang).err[GONE[purpose]]);
	event.locals.lang = userLang(found.user);
	return found.user;
}

export async function completePasswordLink(event: RequestEvent, purpose: TokenPurpose) {
	const { params, request, cookies } = event;
	const tokenParam = params.token ?? '';
	const found = findInvite(tokenParam, purpose);
	const t = panelDict(found ? userLang(found.user) : event.locals.lang);
	if (!found) error(404, t.err[GONE[purpose]]);

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

	// Atomowo: link jednorazowy (przy resecie – także wylogowanie wszystkich sesji), a sesja według stanu
	// konta odczytanego w tej samej transakcji.
	const user = consumeInvite(tokenParam, passwordHash, purpose);
	if (!user) error(404, t.err[GONE[purpose]]);

	const full = fullAfterPassword(user);
	const { token, session } = createSession(user, {
		mfaPassed: full,
		ip: clientIp(event),
		userAgent: request.headers.get('user-agent') ?? undefined
	});
	setSessionCookie(cookies, token, session.expiresAt);
	// Ustawienie hasła NIE omija 2FA: konto z TOTP musi podać kod, admin bez TOTP – najpierw go skonfigurować.
	redirect(303, full ? '/panel' : user.totpEnabled ? '/login/2fa' : '/panel/2fa-setup');
}
