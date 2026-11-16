import { fail, redirect } from '@sveltejs/kit';
import QRCode from 'qrcode';
import type { Actions, PageServerLoad } from './$types';
import { enableTotp, newTotpSecret, totpUri } from '#lib/server/auth/index.js';
import { decrypt, encrypt } from '#lib/server/auth/crypto.js';
import { MFA_LIMIT, hit, isLimited } from '#lib/server/auth/rate-limit.js';

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
		qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }),
		secret: secret.replace(/(.{4})/g, '$1 ').trim()
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const key = `mfa-setup:${user.id}`;
		if (isLimited(key, MFA_LIMIT.max, MFA_LIMIT.windowMs)) {
			return fail(429, { error: 'Za dużo prób. Odczekaj kilka minut.' });
		}
		const pending = cookies.get(COOKIE);
		if (!pending) return fail(400, { error: 'Sesja konfiguracji wygasła. Zeskanuj nowy kod QR.' });

		const code = String((await request.formData()).get('code') ?? '');
		const codes = await enableTotp(user, decrypt(pending), code);
		if (!codes) {
			hit(key, MFA_LIMIT.windowMs);
			return fail(400, { error: 'Kod się nie zgadza. Sprawdź, czy czas w telefonie jest ustawiony automatycznie.' });
		}
		cookies.delete(COOKIE, { path: cookieOpts.path });
		return { recoveryCodes: codes };
	}
};
