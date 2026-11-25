// Wersja aplikacji z obrazu Dockera (ustawiana przy budowie w GitHub Actions):
//   APP_BUILD    – numer przebiegu workflow → wersja 1.0.<numer>, rośnie z każdym wdrożeniem
//   APP_VERSION  – pełny SHA commita
//   APP_BUILT_AT – czas budowy (ISO, UTC)
// Lokalnie (npm run dev / build bez argumentów) wersja to „dev”.
const REPO = 'https://github.com/swider8814/proem-quiz';

export type AppVersion = { label: string; sha: string | null; short: string | null; builtAt: string | null; commitUrl: string | null };

export function appVersion(): AppVersion {
	const build = /^\d+$/.test(process.env.APP_BUILD ?? '') ? process.env.APP_BUILD! : null;
	const sha = /^[0-9a-f]{40}$/.test(process.env.APP_VERSION ?? '') ? process.env.APP_VERSION! : null;
	const at = process.env.APP_BUILT_AT && !Number.isNaN(Date.parse(process.env.APP_BUILT_AT)) ? new Date(process.env.APP_BUILT_AT).toISOString() : null;
	return { label: build ? `1.0.${build}` : 'dev', sha, short: sha ? sha.slice(0, 7) : null, builtAt: at, commitUrl: sha ? `${REPO}/commit/${sha}` : null };
}

/** Data w strefie Polski (serwer działa w UTC), np. „25.11.2026, 13:41”. */
export function fmtBuiltAt(iso: string | null, locale: string) {
	if (!iso) return null;
	return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(iso));
}
