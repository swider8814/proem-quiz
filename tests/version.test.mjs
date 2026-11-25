// Wersja aplikacji: stopka panelu (każdy zalogowany) i Ustawienia → O aplikacji (admin).
//   node tests/version.test.mjs   (wymaga npm run build)
import { finish, makeAdmin, ok, startServer } from './_helpers.mjs';

const sha = '340cd74' + 'a'.repeat(33);
const srv = await startServer({ APP_BUILD: '95', APP_VERSION: sha, APP_BUILT_AT: '2026-11-25T12:41:00Z' });
try {
	const { browser: admin } = await makeAdmin(srv, 'wersja@proem.pl');
	const panel = (await admin.req('/panel')).text;
	ok(/Proem Quiz 1\.0\.95/.test(panel), 'stopka: wersja 1.0.<numer przebiegu>');
	ok(/25\.11\.2026, 13:41/.test(panel), 'stopka: czas budowy w strefie Polski (UTC 12:41 → 13:41)');
	ok(panel.includes(`/commit/${sha}`) && panel.includes('>340cd74<'), 'stopka: skrót commita z linkiem do GitHuba');
	const settings = (await admin.req('/panel/settings')).text;
	ok(/O aplikacji/.test(settings) && /1\.0\.95/.test(settings) && /Wolne miejsce na serwerze/.test(settings), 'Ustawienia: sekcja „O aplikacji” z wersją i miejscem na dysku');
	const health = JSON.parse((await admin.req('/health')).text);
	ok(health.version === sha, '/health bez zmian (pełny SHA)');
} catch (e) {
	ok(false, `wyjątek: ${e.stack}`);
} finally {
	srv.stop();
}
process.exit(finish() ? 1 : 0);
