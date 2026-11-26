// Inicjały w kółku awatara konta (panel).
//   npx tsx tests/initials.test.ts
import { initials } from '../src/lib/initials.ts';
import { finish, ok } from './_helpers.mjs';

const cases: [string, string][] = [
	['Jan Kowalski', 'JK'],
	['  daniel   świder ', 'DŚ'],
	['Anna Maria Nowak', 'AN'],
	['Ewa Kowalska-Nowak', 'EK'],
	['kasia', 'K'],
	['Łukasz (Proem) Żak', 'ŁŻ'],
	['', '?']
];
for (const [name, want] of cases) ok(initials(name) === want, `inicjały „${name}” → ${want} (${initials(name)})`);
process.exit(finish() ? 1 : 0);
