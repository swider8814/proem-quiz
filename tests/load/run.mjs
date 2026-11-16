// Test obciążenia gry na żywo: N graczy (domyślnie 200) przez Socket.IO, pełna gra.
// Serwer działa na jednym rdzeniu (taskset), jak mały VPS. Uruchom: node tests/load/run.mjs [gracze] [pytania]
// Mierzy: czas dołączania, opóźnienie rozesłania pytania do wszystkich, czas potwierdzenia odpowiedzi,
// zużycie CPU i pamięci serwera. Kończy się kodem 1, jeśli przekroczono progi.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { io } from 'socket.io-client';

const N = Number(process.argv[2] || 200);
const Q = Number(process.argv[3] || 10);
const POLLING_SHARE = 0.15; // część telefonów bez WebSocketów (np. przez proxy)

const useTaskset = await new Promise((r) => spawn('taskset', ['-V']).on('error', () => r(false)).on('exit', (c) => r(c === 0)));
const cmd = useTaskset ? ['taskset', ['-c', '0', process.execPath, 'tests/load/server.mjs']] : [process.execPath, ['tests/load/server.mjs']];
const srv = spawn(cmd[0], cmd[1], { env: { ...process.env, QUESTIONS: String(Q) }, stdio: ['ignore', 'pipe', 'pipe'] });
const info = await new Promise((resolve, reject) => {
	createInterface({ input: srv.stdout }).once('line', (l) => resolve(JSON.parse(l)));
	srv.on('exit', (c) => reject(new Error('serwer zakończył się: ' + c)));
});
const stats = [];
createInterface({ input: srv.stderr }).on('line', (l) => {
	try { stats.push(JSON.parse(l)); } catch { process.stderr.write(l + '\n'); }
});

const url = `http://127.0.0.1:${info.port}/game`;
const pin = info.game.pin;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, arg) => new Promise((r) => s.timeout(10_000).emit(ev, arg, (err, res) => r(err ? { error: 'timeout' } : res)));
const pct = (arr, p) => {
	if (!arr.length) return NaN;
	const s = [...arr].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const fmt = (arr) => `p50 ${pct(arr, 50)} ms · p95 ${pct(arr, 95)} ms · max ${Math.max(...arr)} ms`;

const host = io(url, { transports: ['websocket'], auth: { role: 'host', pin, token: info.game.hostToken }, forceNew: true });
let hostState = null;
host.on('state', (s) => (hostState = s));
await new Promise((r, j) => { host.once('connect', r); host.once('connect_error', j); });

// --- dołączanie (wszyscy z jednego IP, jak za NAT-em szkolnej sieci) ---
const players = [];
const joinTimes = [];
const errors = {};
const t0 = Date.now();
await Promise.all(
	Array.from({ length: N }, async (_, i) => {
		await sleep(Math.random() * 3000); // ludzie skanują QR w ciągu kilku sekund
		const start = Date.now();
		const s = io(url, { transports: i < N * POLLING_SHARE ? ['polling'] : ['websocket'], forceNew: true, reconnection: false });
		const p = { s, i, states: [], gotQuestionAt: new Map() };
		s.on('state', (st) => {
			p.last = st;
			if (st.state === 'question' && st.question && !p.gotQuestionAt.has(st.question.index)) p.gotQuestionAt.set(st.question.index, Date.now());
		});
		await new Promise((r) => s.once('connect', r));
		await emit(s, 'check', { pin });
		const res = await emit(s, 'join', { pin, random: true, deviceId: `load-${i}` });
		if (res?.ok) {
			joinTimes.push(Date.now() - start);
			players.push(p);
		} else errors[res?.error || '?'] = (errors[res?.error || '?'] || 0) + 1;
	})
);
const joinWall = Date.now() - t0;
await sleep(300);

// --- gra ---
const fanout = [];
const ackTimes = [];
const answerErrors = {};
for (let q = 0; q < Q; q++) {
	const sentAt = Date.now();
	await emit(host, 'host:next', {}); // lobby/leaderboard -> intro
	// czekamy aż wszyscy dostaną pytanie (po intro 3 s)
	const deadline = Date.now() + 15_000;
	while (players.some((p) => !p.gotQuestionAt.has(q)) && Date.now() < deadline) await sleep(20);
	const opened = Math.min(...players.map((p) => p.gotQuestionAt.get(q) ?? Infinity));
	for (const p of players) if (p.gotQuestionAt.has(q)) fanout.push(p.gotQuestionAt.get(q) - opened);
	const missing = players.filter((p) => !p.gotQuestionAt.has(q)).length;
	if (missing) answerErrors['brak pytania'] = (answerErrors['brak pytania'] || 0) + missing;

	// odpowiedzi rozłożone na ~4 s (dzieci klikają w różnym tempie)
	await Promise.all(
		players.map(async (p) => {
			await sleep(200 + Math.random() * 4000);
			const st = Date.now();
			const r = await emit(p.s, 'answer', { index: q, choice: Math.floor(Math.random() * 4) });
			if (r && 'error' in r) answerErrors[r.error] = (answerErrors[r.error] || 0) + 1;
			else ackTimes.push(Date.now() - st);
		})
	);
	await sleep(300);
	if (hostState?.state === 'question') await emit(host, 'host:next', {}); // zamknij, jeśli nie zamknęło się samo
	await sleep(500); // reveal
	await emit(host, 'host:next', {}); // -> leaderboard
	await sleep(300);
	void sentAt;
}
await emit(host, 'host:next', {}); // koniec
await sleep(500);
const ended = players.filter((p) => p.last?.state === 'ended').length;

for (const p of players) p.s.close();
host.close();
srv.kill();

const cpuPeak = Math.max(...stats.map((s) => s.cpu));
const cpuAvg = Math.round(stats.reduce((a, s) => a + s.cpu, 0) / stats.length);
const rssPeak = Math.max(...stats.map((s) => s.rssMb));

console.log(`\nTest obciążenia: ${N} graczy (${Math.round(POLLING_SHARE * 100)}% polling), ${Q} pytań, serwer na ${useTaskset ? '1 rdzeniu' : 'wszystkich rdzeniach'}`);
console.log(`Dołączyło:            ${players.length}/${N} w ${joinWall} ms ${Object.keys(errors).length ? JSON.stringify(errors) : ''}`);
console.log(`Czas dołączenia:      ${fmt(joinTimes)}`);
console.log(`Rozesłanie pytania:   ${fmt(fanout)} (różnica między pierwszym a ostatnim telefonem)`);
console.log(`Potwierdzenie odp.:   ${fmt(ackTimes)} (${ackTimes.length} odpowiedzi) ${Object.keys(answerErrors).length ? JSON.stringify(answerErrors) : ''}`);
console.log(`Ekran końcowy:        ${ended}/${players.length}`);
console.log(`Serwer CPU:           średnio ${cpuAvg}% · szczyt ${cpuPeak}% jednego rdzenia`);
console.log(`Serwer RAM (RSS):     szczyt ${rssPeak} MB`);

const fail = [];
if (players.length < N) fail.push('nie wszyscy dołączyli');
if (Object.keys(answerErrors).length) fail.push('błędy odpowiedzi');
if (pct(fanout, 95) > 500) fail.push('rozesłanie pytania p95 > 500 ms');
if (pct(ackTimes, 95) > 500) fail.push('potwierdzenie odpowiedzi p95 > 500 ms');
if (ended < players.length) fail.push('nie wszyscy zobaczyli koniec gry');
if (rssPeak > 400) fail.push('RAM > 400 MB');
console.log(fail.length ? `\nNIEZALICZONE: ${fail.join(', ')}` : '\nZALICZONE');
process.exit(fail.length ? 1 : 0);
