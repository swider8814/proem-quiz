// Wybór logo do tła gry.   npx tsx tests/theme.test.ts
import { isDark, logoFor } from '../src/lib/game/theme.ts';
import { AVATAR_ART } from '../src/lib/game/avatar-art.ts';

let failed = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) failed++; };
const t = (background: string, logoDarkUrl: string | null = '/media/ciemne') => ({
	style: 'poster' as const,
	colors: { background, surface: '#fff', text: '#111', accent: '#fc0', answers: [] },
	logoUrl: '/media/jasne',
	logoDarkUrl
});
ok(isDark('#2c1d63') && isDark('#000') && isDark('#1b1f3b'), 'ciemne tła rozpoznane (fiolet Proem, czerń, granat)');
ok(!isDark('#dff1ff') && !isDark('#ffffff') && !isDark('#ffc93c'), 'jasne tła rozpoznane (błękit, biel, żółty)');
ok(!isDark('url(x)') && !isDark(undefined), 'nieprawidłowy kolor = jasny (bez wyjątku)');
ok(logoFor(t('#2c1d63')) === '/media/ciemne', 'ciemne tło → logo na ciemne tło');
ok(logoFor(t('#dff1ff')) === '/media/jasne', 'jasne tło → logo na jasne tło');
ok(logoFor(t('#2c1d63', null)) === '/media/jasne', 'ciemne tło bez drugiego logo → zwykłe logo');
ok(logoFor(null) === null, 'brak motywu → brak logo');
// Rysunki postaci: tyle, ile losuje serwer (AVATARS w engine.js), bez skryptów i odnośników.
ok(AVATAR_ART.length === 24 && AVATAR_ART.every((a) => a.includes('class="eyes"') && !/<script|href|on\w+=/i.test(a)), 'postacie: 24 rysunki z oczami, bez skryptów i odnośników');
if (failed) { console.log(`\n${failed} błędów`); process.exit(1); }
console.log('\nWszystko OK');
