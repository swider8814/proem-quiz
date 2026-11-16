// Serwer Socket.IO do testów (osobny proces). Wypisuje JSON z portem, PIN-em i tokenem prowadzącego.
import http from 'node:http';
import { attachRealtime } from '../server/realtime.js';
import { registry } from '../server/game/engine.js';

const server = http.createServer();
attachRealtime(server);
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const quiz = {
	quizId: 'q', title: 'T', locale: 'pl', theme: {}, blockedWords: [],
	settings: { streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
	questions: [
		{ id: 'a', type: 'choice', prompt: '2+2?', timeLimit: 20, multiplier: 1, data: { answers: ['3', '4'], correct: [1] } },
		{ id: 'b', type: 'choice', prompt: '3+3?', timeLimit: 20, multiplier: 1, data: { answers: ['6', '7'], correct: [0] } }
	]
};
const g1 = registry().create(quiz, 'u1');
const g2 = registry().create(quiz, 'u2');
process.stdout.write(JSON.stringify({ port: server.address().port, g1, g2 }) + '\n');
