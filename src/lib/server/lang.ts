import { isPanelLang, langFromAcceptLanguage, type PanelLang } from '#lib/i18n/panel.js';
import type { User } from './auth/index.js';

export const LANG_COOKIE = 'pq_lang';

/** Język panelu dla konta (uk → en). */
export const userLang = (user: Pick<User, 'locale'>): PanelLang => (user.locale === 'pl' ? 'pl' : 'en');

/** Język panelu z konta (uk → en), potem z ciasteczka, potem z przeglądarki. */
export function resolveLang(user: User | null, cookie: string | undefined, acceptLanguage: string | null): PanelLang {
	if (user) return userLang(user);
	if (isPanelLang(cookie)) return cookie;
	return langFromAcceptLanguage(acceptLanguage);
}
