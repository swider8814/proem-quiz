// Transliteracja nicków (cyrylica → łacina) według oficjalnej normy ukraińskiej z 2010 r.
//   node tests/translit.test.mjs
import fs from 'node:fs';
import { hasCyrillic, translit } from '../server/game/translit.js';

let fails = 0;
const ok = (c, m) => { process.stderr.write(`${c ? '✔' : '✘'} ${m}\n`); if (!c) fails++; };

// Przykłady z normy (uchwała Gabinetu Ministrów Ukrainy nr 55) i typowe imiona.
const cases = {
	Олена: 'Olena', Олександр: 'Oleksandr', Юлія: 'Yuliia', Ярослава: 'Yaroslava', Сергій: 'Serhii', Єва: 'Yeva',
	Їжакевич: 'Yizhakevych', Згорани: 'Zghorany', 'Мар’яна': 'Mariana', "Подвір'я": 'Podviria', Хрещатик: 'Khreshchatyk',
	Ґанок: 'Ganok', Йосипівка: 'Yosypivka', Стрий: 'Stryi', Борщагівка: 'Borshchahivka', Розгон: 'Rozghon',
	'Наталія Коваль': 'Nataliia Koval', ОЛЕНА: 'OLENA', 'Олег 😀 7': 'Oleh 😀 7', Kasia: 'Kasia', 'Żółw': 'Żółw'
};
for (const [from, to] of Object.entries(cases)) ok(translit(from) === to, `${from} → ${to} (${translit(from)})`);
ok(hasCyrillic('Kasia Олена') && !hasCyrillic('Kasia Żółw'), 'hasCyrillic rozpoznaje cyrylicę');

const client = fs.readFileSync('src/lib/game/translit.js', 'utf8').split('\n').slice(2).join('\n');
ok(client === fs.readFileSync('server/game/translit.js', 'utf8'), 'kopia dla przeglądarki (src/lib/game/translit.js) identyczna z serwerową');

process.stderr.write(fails ? `\n${fails} BŁĘDÓW\n` : '\nWszystko OK\n');
process.exit(fails ? 1 : 0);
