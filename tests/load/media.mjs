// Test obciążenia z obrazkami: pełny serwer (SvelteKit + Socket.IO) na JEDNYM rdzeniu, N telefonów
// naraz pobiera obrazki odpowiedzi (miniatury) w chwili otwarcia pytania i odpowiada.
//   node tests/load/media.mjs [gracze] [pytania]   (wymaga npm run build i ffmpeg)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { io } from 'socket.io-client';
import { makeAdmin, startServer, upload } from '../_helpers.mjs';

const N = Number(process.argv[2] || 300);
const Q = Number(process.argv[3] || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
	const s = [...arr].sort((a, b) => a - b);
	return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN;
};
const fmt = (arr) => `p50 ${pct(arr, 50)} ms · p95 ${pct(arr, 95)} ms · max ${Math.max(...arr)} ms`;

const srv = await startServer();
let pinned = false;
try {
	execFileSync('taskset', ['-cp', '0', String(srv.proc.pid)], { stdio: 'ignore' });
	pinned = true;
} catch {}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pq-loadimg-'));
let exitCode = 1;
try {
	const { browser: admin } = await makeAdmin(srv, 'obciazenie@proem.pl');
	// 4 „zdjęcia z telefonu” 3000×2000 (serwer zmniejsza i robi miniatury)
	const ids = [];
	for (const [i, src] of ['testsrc', 'testsrc2', 'smptebars', 'rgbtestsrc'].entries()) {
		const f = path.join(tmp, `${i}.jpg`);
		execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `${src}=size=3000x2000`, '-frames:v', '1', '-q:v', '2', f]);
		ids.push(JSON.parse((await upload(admin, fs.readFileSync(f), `${i}.jpg`)).text).id);
	}
	const c = await admin.req('/panel?/create', { method: 'POST', form: { title: 'Obciążenie' } });
	const quizId = c.loc.split('/').pop();
	const questions = Array.from({ length: Q }, (_, i) => ({
		type: 'choice', prompt: `Który obrazek? ${i + 1}`, promptTranslation: null, imageMediaId: null, timeLimit: 20, pointsMultiplier: 1,
		data: { type: 'choice', answers: ['', '', '', ''], correct: [i % 4], images: ids }
	}));
	const save = await admin.req(`/panel/api/quizzes/${quizId}`, {
		method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify({ title: 'Obciążenie', description: null, themeId: null, locale: 'pl', settings: { defaultTimeLimit: 20, countdown: 3, streakBonus: true, nicknameMode: 'random-only', teamMode: false, lateJoin: true, phoneAnswerText: true }, questions })
	});
	if (save.status !== 200) throw new Error(`zapis quizu: ${save.text}`);
	const start = await admin.req(`/panel/quizzes/${quizId}/host?/start`, { method: 'POST', form: {}, headers: { accept: 'application/json', 'x-sveltekit-action': 'true' } });
	const flat = JSON.parse(JSON.parse(start.text).data);
	const pin = flat[2];
	const hostToken = flat[3];

	const url = `${srv.base}/game`;
	const host = io(url, { transports: ['websocket'], auth: { role: 'host', pin, token: hostToken }, forceNew: true });
	let hostState = null;
	host.on('state', (s) => (hostState = s));
	await new Promise((r, j) => { host.once('connect', r); host.once('connect_error', j); });
	const emit = (s, ev, arg) => new Promise((r) => s.timeout(10_000).emit(ev, arg, (err, res) => r(err ? { error: 'timeout' } : res)));

	const players = [];
	await Promise.all(Array.from({ length: N }, async (_, i) => {
		await sleep(Math.random() * 3000);
		const s = io(url, { transports: i < N * 0.15 ? ['polling'] : ['websocket'], forceNew: true, reconnection: false });
		const p = { s, i, q: new Map() };
		s.on('state', (st) => {
			if ((st.state === 'intro' || st.state === 'question') && st.question?.answerImages && !p.q.has(st.question.index)) p.q.set(st.question.index, st.question.answerImages);
		});
		await new Promise((r) => s.once('connect', r));
		const res = await emit(s, 'join', { pin, random: true, deviceId: `img-${i}` });
		if (res?.ok) players.push(p);
	}));

	const loadTimes = [];
	const ackTimes = [];
	let bytes = 0;
	let failed = 0;
	for (let q = 0; q < Q; q++) {
		await emit(host, 'host:next', {});
		const deadline = Date.now() + 15_000;
		while (players.some((p) => !p.q.has(q)) && Date.now() < deadline) await sleep(20);
		// Każdy telefon pobiera 4 obrazki naraz (przeglądarka: kilka połączeń równolegle), potem odpowiada.
		await Promise.all(players.map(async (p) => {
			const t = Date.now();
			try {
				const bufs = await Promise.all((p.q.get(q) ?? []).map(async (u) => {
					const r = await fetch(srv.base + u);
					if (!r.ok) throw new Error(String(r.status));
					return r.arrayBuffer();
				}));
				for (const b of bufs) bytes += b.byteLength;
				loadTimes.push(Date.now() - t);
			} catch {
				failed++;
			}
			await sleep(300 + Math.random() * 3000);
			const st = Date.now();
			const r = await emit(p.s, 'answer', { index: q, choice: Math.floor(Math.random() * 4) });
			if (!r?.error) ackTimes.push(Date.now() - st);
		}));
		await sleep(300);
		if (hostState?.state === 'question') await emit(host, 'host:next', {});
		await sleep(300);
		await emit(host, 'host:next', {});
		await sleep(300);
	}
	for (const p of players) p.s.close();
	host.close();

	const perPhone = Math.round(bytes / Math.max(1, loadTimes.length) / 1024);
	console.log(`\nTest obciążenia z obrazkami: ${N} graczy, ${Q} pytań × 4 obrazki, serwer ${pinned ? 'na 1 rdzeniu' : 'bez przypięcia do rdzenia'}`);
	console.log(`Dołączyło:            ${players.length}/${N}`);
	console.log(`Pobranie 4 obrazków:  ${fmt(loadTimes)} (${failed} nieudanych)`);
	console.log(`Dane na telefon:      ${perPhone} KB na pytanie · razem ${(bytes / 1048576).toFixed(1)} MB`);
	console.log(`Potwierdzenie odp.:   ${fmt(ackTimes)}`);
	const fail = [];
	if (players.length < N) fail.push('nie wszyscy dołączyli');
	if (failed) fail.push('nieudane pobrania obrazków');
	if (pct(loadTimes, 95) > 5000) fail.push('obrazki p95 > 5 s');
	if (pct(ackTimes, 95) > 1000) fail.push('odpowiedzi p95 > 1 s');
	if (perPhone > 400) fail.push('za dużo danych na telefon');
	console.log(fail.length ? `\nNIEZALICZONE: ${fail.join(', ')}` : '\nZALICZONE');
	exitCode = fail.length ? 1 : 0;
} catch (e) {
	console.error(e);
} finally {
	srv.stop();
	fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(exitCode);
