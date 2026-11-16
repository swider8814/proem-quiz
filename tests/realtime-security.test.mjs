// Testy regresji Socket.IO na prawdziwym serwerze w OSOBNYM procesie.   node tests/realtime-security.test.mjs
import { spawn } from 'node:child_process';
import { io as connect } from 'socket.io-client';
import { finish, ok, sleep } from './_helpers.mjs';

const proc = spawn(process.execPath, ['tests/_rt-server.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
let errLog = '';
proc.stderr.on('data', (d) => (errLog += d));
const info = await new Promise((r) => proc.stdout.once('data', (d) => r(JSON.parse(String(d)))));
const URL = `http://127.0.0.1:${info.port}`;
const alive = () => proc.exitCode === null && proc.signalCode === null;

const mk = (opts = {}) => connect(`${URL}/game`, { transports: ['websocket'], forceNew: true, ...opts });
const emit = (s, ev, arg) => Promise.race([new Promise((r) => s.emit(ev, arg, r)), sleep(1500).then(() => ({ timeout: true }))]);
const waitState = (s, pred) =>
	new Promise((r) => {
		const h = (st) => {
			if (pred(st)) {
				s.off('state', h);
				r(st);
			}
		};
		s.on('state', h);
	});

try {
	// ── #2: złośliwe dane nie zatrzymują procesu ──────────────────────────
	const evil = mk();
	await new Promise((r) => evil.on('connect', r));
	const payloads = [
		{ pin: { toString: 1 } }, { pin: { toString: null, valueOf: null } }, { pin: [1, 2] }, { pin: 123456 },
		{ pin: info.g1.pin, nick: { toString: 1 } }, { pin: info.g1.pin, nick: ['a'] }, { pin: info.g1.pin, deviceId: { x: 1 } },
		{ pin: info.g1.pin, token: { toString: 1 } }, null, 'x', 42, [], { index: { valueOf: 1 } }, { playerId: { toString: 1 } }
	];
	for (const ev of ['check', 'suggest', 'join', 'rejoin', 'answer', 'leave-not-exist', 'host:kick']) {
		for (const p of payloads) await emit(evil, ev, p);
	}
	await emit(evil, 'answer', { index: 0, order: [{ toString: 1 }] });
	// Prowadzący ze złośliwym handshake
	const evilHost = mk({ auth: { role: 'host', pin: { toString: 1 }, token: { toString: 1 } } });
	const hostErr = await new Promise((r) => evilHost.on('connect_error', (e) => r(e.message)));
	ok(hostErr === 'unauthorized' || hostErr === 'invalid', `#2 złośliwy handshake prowadzącego odrzucony (${hostErr})`);
	evilHost.close();
	// /diag
	const diag = connect(`${URL}/diag`, { transports: ['websocket'], forceNew: true });
	await new Promise((r) => diag.on('connect', r));
	diag.emit('ping-check', { toString: 1 }, () => {});
	diag.emit('broadcast', { toString: 1 });
	diag.emit('broadcast', ['x']);
	await sleep(300);
	ok(alive(), '#2 serwer przeżył złośliwe pakiety (osobny proces)');
	const good = mk();
	const r = await emit(good, 'check', { pin: info.g1.pin });
	ok(r.ok === true, '#2 po ataku serwer nadal obsługuje poprawne żądania');
	ok(!/TypeError|uncaught/i.test(errLog), '#2 brak nieobsłużonych wyjątków w logu');
	evil.close();
	diag.close();
	good.close();

	// ── #11: 300 graczy z jednego IP (NAT) + powrót po zerwaniu Wi-Fi ────
	const host = mk({ auth: { role: 'host', pin: info.g1.pin, token: info.g1.hostToken } });
	let hostLast = null;
	host.on('state', (s) => (hostLast = s));
	await new Promise((r) => host.on('connect', r));
	const N = 300;
	const players = [];
	const tokens = [];
	for (let i = 0; i < N; i++) {
		const s = mk();
		players.push(s);
	}
	await Promise.all(players.map((s) => (s.connected ? null : new Promise((r) => s.on('connect', r)))));
	const joins = await Promise.all(players.map((s, i) => emit(s, 'check', { pin: info.g1.pin }).then(() => emit(s, 'join', { pin: info.g1.pin, nick: `Gracz ${i}`, deviceId: `d${i}` }))));
	joins.forEach((j) => tokens.push(j.token));
	const joined = joins.filter((j) => j.ok).length;
	ok(joined === N, `#11 ${joined}/${N} graczy z jednego IP dołączyło`);
	// Zerwanie Wi-Fi: wszyscy rozłączeni i z powrotem
	players.forEach((s) => s.disconnect());
	await sleep(300);
	const back = players.map(() => mk());
	await Promise.all(back.map((s) => new Promise((r) => s.on('connect', r))));
	const rejoins = await Promise.all(back.map((s, i) => emit(s, 'rejoin', { pin: info.g1.pin, token: tokens[i] })));
	const rejoined = rejoins.filter((j) => j.ok).length;
	ok(rejoined === N, `#11 ${rejoined}/${N} graczy wróciło po zerwaniu połączenia`);
	// Zgadywanie PIN-ów nadal blokowane
	const brute = mk();
	await new Promise((r) => brute.on('connect', r));
	let blocked = false;
	for (let i = 0; i < 80 && !blocked; i++) {
		const x = await emit(brute, 'check', { pin: String(100000 + i).padStart(6, '0') });
		if (x.error === 'rate-limited' || x.timeout) blocked = true;
		await sleep(68);
	}
	ok(blocked, '#11 zgadywanie PIN-ów nadal blokowane');
	// Poprawne dołączenie z tego samego IP po zablokowaniu zgadywania – nadal działa? (NAT: inni gracze)
	// Oczekiwane: blokada dotyczy IP, więc i poprawne PIN-y czekają minutę – kompromis na rzecz ochrony.

	// ── #7: wynik ukryty do końca pytania (także po ponownym połączeniu) ─
	const qState = waitState(back[0], (s) => s.state === 'question');
	await emit(host, 'host:next', {});
	await qState;
	const a = await emit(back[0], 'answer', { index: 0, choice: 1 });
	ok(a.ok, '#7 odpowiedź przyjęta');
	const spy = mk();
	await new Promise((r) => spy.on('connect', r));
	const spyState = waitState(spy, () => true);
	await emit(spy, 'rejoin', { pin: info.g1.pin, token: tokens[0] });
	const st = await spyState;
	ok(st.state === 'question' && st.me.score === 0 && st.me.streak === 0, `#7 po rejoin w trakcie pytania wynik sprzed odpowiedzi (score=${st.me.score})`);
	const rename = waitState(spy, () => true);
	await emit(host, 'host:rename', { playerId: st.me.id });
	const afterRename = await rename;
	ok(afterRename.me.score === 0, '#7 zmiana nicka też nie zdradza wyniku');

	// ── #17: jedno gniazdo = jeden gracz ──────────────────────────────────
	const sock = mk();
	await new Promise((r) => sock.on('connect', r));
	await emit(sock, 'rejoin', { pin: info.g1.pin, token: tokens[1] });
	const sw = await emit(sock, 'rejoin', { pin: info.g1.pin, token: tokens[2] });
	ok(sw.error === 'already-joined', '#17 przełączenie gniazda na innego gracza odrzucone');
	const sw2 = await emit(sock, 'join', { pin: info.g2.pin, nick: 'Inny' });
	ok(sw2.error === 'already-joined', '#17 przełączenie do innej gry odrzucone');
	const sameAgain = await emit(sock, 'rejoin', { pin: info.g1.pin, token: tokens[1] });
	ok(sameAgain.ok, '#17 ponowny rejoin tego samego gracza działa');

	ok(alive(), 'serwer działa do końca testu');
	[...back, host, spy, sock, brute].forEach((s) => s.close());
} catch (e) {
	ok(false, `wyjątek w teście: ${e.stack}`);
} finally {
	proc.kill('SIGKILL');
}
process.exit(finish() ? 1 : 0);
