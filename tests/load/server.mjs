// Serwer do testu obciążenia: ten sam kod Socket.IO co produkcja (attachRealtime), bez panelu.
// Wypisuje JSON z portem, PIN-em i tokenem prowadzącego, potem co sekundę statystyki procesu na stderr.
import http from 'node:http';
import { attachRealtime } from '../../server/realtime.js';
import { registry } from '../../server/game/engine.js';

const QUESTIONS = Number(process.env.QUESTIONS || 10);
const server = http.createServer();
attachRealtime(server);
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const questions = Array.from({ length: QUESTIONS }, (_, i) => ({
	id: `q${i}`,
	type: 'choice',
	prompt: `Pytanie ${i + 1}: jaka to piosenka?`,
	timeLimit: 20,
	multiplier: 1,
	data: { answers: ['Cicha noc', 'Wśród nocnej ciszy', 'Lulajże, Jezuniu', 'Bóg się rodzi'], correct: [i % 4] }
}));
const quiz = {
	quizId: 'load', title: 'Test obciążenia', locale: 'pl', theme: {}, blockedWords: [],
	settings: { streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
	questions
};
const game = registry().create(quiz, 'load-host');
process.stdout.write(JSON.stringify({ port: server.address().port, game }) + '\n');

let last = process.cpuUsage();
let lastAt = Date.now();
setInterval(() => {
	const now = Date.now();
	const cpu = process.cpuUsage(last);
	const pct = ((cpu.user + cpu.system) / 1000 / (now - lastAt)) * 100;
	last = process.cpuUsage();
	lastAt = now;
	process.stderr.write(JSON.stringify({ cpu: Math.round(pct), rssMb: Math.round(process.memoryUsage().rss / 1048576) }) + '\n');
}, 500).unref();
