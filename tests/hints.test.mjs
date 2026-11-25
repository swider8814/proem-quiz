// Podpowiedzi w polach (placeholder) i przykładowe pytanie w podglądzie motywu muszą być uniwersalne –
// aplikacja służy przez cały rok (lekcje, obozy, szkoła), nie tylko na spotkaniu świątecznym.
//   node tests/hints.test.mjs
import fs from 'node:fs';
import { finish, ok } from './_helpers.mjs';

const src = fs.readFileSync('src/lib/i18n/panel.ts', 'utf8');
const seasonal = /kol[eę]d|wigili|świ[ąę]t|bożonarodz|mikołaj|choink|betlejem|cicha noc|christmas|carol|xmas|santa|silent night|holy night|manger|reindeer|renifer/i;
const lines = src.split('\n').filter((l) => /^\s*(\w*[Pp]laceholder\w*|\w*Ph|pvQuestion|pvAnswers)\s*:/.test(l));
ok(lines.length >= 8, `znaleziono podpowiedzi w słowniku panelu (${lines.length})`);
for (const l of lines) ok(!seasonal.test(l), `uniwersalna podpowiedź: ${l.trim().slice(0, 80)}`);
process.exit(finish() ? 1 : 0);
