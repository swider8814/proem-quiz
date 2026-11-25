import { isPanelLang, langFromAcceptLanguage, type PanelLang } from '#lib/i18n/panel.js';
import type { User } from './auth/index.js';

export const LANG_COOKIE = 'pq_lang';

/** Język panelu dla konta (uk → en). */
export const userLang = (user: Pick<User, 'locale'>): PanelLang => (user.locale === 'pl' ? 'pl' : 'en');

/**
 * Język panelu: konto po pełnym logowaniu; w sesji pośredniej (kod 2FA / obowiązkowa konfiguracja 2FA)
 * pierwszeństwo ma ciasteczko z przełącznika (konta wtedy nie zmieniamy); potem przeglądarka.
 */
export function resolveLang(user: User | null, mfaPassed: boolean, cookie: string | undefined, acceptLanguage: string | null): PanelLang {
	if (user && mfaPassed) return userLang(user);
	if (isPanelLang(cookie)) return cookie;
	if (user) return userLang(user);
	return langFromAcceptLanguage(acceptLanguage);
}
