import { fail, redirect } from '@sveltejs/kit';
import QRCode from 'qrcode';
import type { Actions, PageServerLoad } from './$types';
import { BusyError, enableTotp, newTotpSecret, setSessionCookie, totpUri, verifyPassword } from '#lib/server/auth/index.js';
import { decrypt, encrypt } from '#lib/server/auth/crypto.js';
import { MFA_LIMIT, consume } from '#lib/server/auth/rate-limit.js';
import { clientIp } from '#lib/server/net.js';
import { panelDict } from '#lib/i18n/panel.js';

// Sekret w trakcie konfiguracji trzymamy w zaszyfrowanym ciasteczku, dopóki użytkownik nie potwierdzi kodem.
const COOKIE = 'pq_totp_setup';
const cookieOpts = {
	path: '/panel/2fa-setup',
	httpOnly: true,
	sameSite: 'strict' as const,
	secure: process.env.NODE_ENV === 'production',
	maxAge: 15 * 60
};

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const user = locals.user!;
	const regenerate = url.searchParams.has('new');
	if (user.totpEnabled && !regenerate) redirect(303, '/panel/security');

	let secret: string | null = null;
	const pending = cookies.get(COOKIE);
	if (pending) {
		try {
			secret = decrypt(pending);
		} catch {
			secret = null;
		}
	}
	let uri: string;
	if (!secret) {
		const fresh = newTotpSecret(user);
		secret = fresh.secret;
		uri = fresh.uri;
		cookies.set(COOKIE, encrypt(secret), cookieOpts);
	} else {
		uri = totpUri(user.email, secret);
	}

	return {
		required: user.role === 'admin',
		reconfigure: user.totpEnabled,
		qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }),
		secret: secret.replace(/(.{4})/g, '$1 ').trim()
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals, cookies } = event;
		const user = locals.user!;
		const t = panelDict(locals.lang);
		const form = await request.formData();
		const code = String(form.get('code') ?? '').slice(0, 20);
		const pw = String(form.get('password') ?? '');

		// Rezerwacja próby przed operacjami asynchronicznymi.
		if (consume(`mfa-setup:${user.id}`, MFA_LIMIT.max, MFA_LIMIT.windowMs)) {
			return fail(429, { error: t.err.tooManyTries });
		}
		const pending = cookies.get(COOKIE);
		let secret: string;
		try {
			secret = decrypt(pending ?? '');
		} catch {
			return fail(400, { error: t.err.setupExpired });
		}
		try {
			// Zmiana istniejącej weryfikacji wymaga potwierdzenia hasłem (ktoś mógł przejąć otwartą sesję).
			if (user.totpEnabled && (!user.passwordHash || !(await verifyPassword(user.passwordHash, pw)))) {
				return fail(400, { error: t.err.badPassword });
			}
		} catch (e) {
			if (e instanceof BusyError) return fail(503, { error: t.err.busy });
			throw e;
		}
		const res = await enableTotp(user, secret, code, { ip: clientIp(event), userAgent: request.headers.get('user-agent') ?? undefined });
		if (!res) {
			return fail(400, { error: t.err.codeMismatch });
		}
		cookies.delete(COOKIE, { path: cookieOpts.path });
		// Wszystkie dotychczasowe sesje wygasły – ta przeglądarka dostaje nową, pełną sesję.
		setSessionCookie(cookies, res.token, res.session.expiresAt);
		return { recoveryCodes: res.codes };
	}
};
