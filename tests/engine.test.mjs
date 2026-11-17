// Test silnika gry: prawdziwy serwer Socket.IO + klienci.  Uruchom: node tests/engine.test.mjs
import http from 'node:http';
import { io as connect } from 'socket.io-client';
import { attachRealtime } from '../server/realtime.js';
import { registry } from '../server/game/engine.js';

const server = http.createServer();
attachRealtime(server);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${server.address().port}/game`;

let fails = 0;
const ok = (c, m) => { process.stderr.write(`${c ? '✔' : '✘'} ${m}\n`); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, arg) => new Promise((r) => s.emit(ev, arg, r));
const nextState = (s, pred = () => true) => new Promise((r) => {
	const h = (st) => { if (pred(st)) { s.off('state', h); r(st); } };
	s.on('state', h);
});

const quiz = {
	quizId: 'q1', title: 'Test', locale: 'pl', theme: {}, blockedWords: ['zakazane'],
	settings: { streakBonus: true, nicknameMode: 'random-or-custom', teamMode: false, lateJoin: true, phoneAnswerText: true },
	questions: [
		{ id: 'a', type: 'choice', prompt: '2+2?', timeLimit: 5, multiplier: 1, data: { answers: ['3', '4', '5', '22'], correct: [1] } },
		{ id: 'b', type: 'audio', prompt: 'Jaka to kolęda?', timeLimit: 5, multiplier: 2, data: { answers: ['Cicha noc', 'Inna'], correct: [0], clipUrl: '/media/x.mp3', loop: false } },
		{ id: 'c', type: 'text', prompt: 'Stolica Polski?', timeLimit: 5, multiplier: 1, data: { accepted: ['Warszawa'], typoTolerance: 1 } },
		{ id: 'd', type: 'order', prompt: 'Ułóż', timeLimit: 5, multiplier: 1, data: { items: ['I', 'like', 'cats'], partialCredit: false } },
		{ id: 'e', type: 'truefalse', prompt: 'Ziemia jest płaska', timeLimit: 5, multiplier: 1, data: { correct: false } }
	]
};

const { pin, hostToken } = registry().create(quiz, 'user1');

// Prowadzący: zły token
const bad = connect(URL, { auth: { role: 'host', pin, token: 'zly' }, transports: ['websocket'] });
const badErr = await new Promise((r) => bad.on('connect_error', (e) => r(e.message)));
ok(badErr === 'unauthorized', 'prowadzący ze złym tokenem odrzucony');
bad.close();

const host = connect(URL, { auth: { role: 'host', pin, token: hostToken }, transports: ['websocket'] });
let hostLast = null;
host.on('state', (s) => (hostLast = s));
const hostWait = async (pred) => { for (let i = 0; i < 100; i++) { if (hostLast && pred(hostLast)) return hostLast; await sleep(30); } throw new Error('timeout'); };
const hostLobby = await nextState(host);
ok(hostLobby.state === 'lobby' && hostLobby.pin === pin, 'prowadzący połączony, poczekalnia');

const mk = () => connect(URL, { transports: ['websocket'] });
const [p1, p2, p3, p4] = [mk(), mk(), mk(), mk()];

let r = await emit(p1, 'check', { pin: '000000' });
ok(r.error === 'no-game', 'zły PIN');
r = await emit(p1, 'check', { pin });
ok(r.ok && r.suggestion, 'PIN poprawny + podpowiedź nicka');

r = await emit(p1, 'join', { pin, nick: 'Kasia', deviceId: 'dev1' });
ok(r.ok && r.token, 'gracz 1 dołączył z własnym nickiem');
const p1token = r.token;
r = await emit(p2, 'join', { pin, nick: 'kasia', deviceId: 'dev2' });
ok(r.error === 'nick-taken', 'zajęty nick odrzucony');
r = await emit(p2, 'join', { pin, nick: 'k.u.r.w.a', deviceId: 'dev2' });
ok(r.error === 'nick-blocked', 'wulgarny nick odrzucony');
r = await emit(p2, 'join', { pin, nick: 'ZAKAZANE słowo', deviceId: 'dev2' });
ok(r.error === 'nick-blocked', 'słowo z listy admina odrzucone');
r = await emit(p2, 'join', { pin, random: true, deviceId: 'dev2' });
ok(r.ok, 'gracz 2 z losowym nickiem');
r = await emit(p3, 'join', { pin, nick: 'Troll', deviceId: 'dev3' });
ok(r.ok, 'gracz 3 dołączył');
r = await emit(p4, 'join', { pin, nick: 'Ola', deviceId: 'dev4' });

let hs = await hostWait((s) => s.players?.length === 4);
const troll = hs.players.find((p) => p.nick === 'Troll');
const p3kicked = new Promise((res) => p3.on('kicked', res));
r = await emit(host, 'host:kick', { playerId: troll.id });
await p3kicked;
ok(r.ok, 'prowadzący usunął gracza');
const p3b = mk();
r = await emit(p3b, 'join', { pin, nick: 'Troll2', deviceId: 'dev3' });
ok(r.error === 'removed', 'usunięte urządzenie nie wraca');

const olaId = (await hostWait((s) => s.players?.length === 3)).players.find((p) => p.nick === 'Ola').id;
r = await emit(host, 'host:rename', { playerId: olaId });
ok(r.ok, 'prowadzący zmienił nick na losowy');

// Gracz bez uprawnień nie steruje grą
r = await Promise.race([emit(p1, 'host:next', {}), sleep(400).then(() => 'ignored')]);
ok(r === 'ignored' && hostLast.state === 'lobby', 'gracz nie może wysyłać poleceń prowadzącego');

// Pytanie 1
const p1q = nextState(p1, (s) => s.state === 'question');
const hostQ = nextState(host, (s) => s.state === 'question');
r = await emit(host, 'host:next', {});
ok(r.ok, 'start gry');
const st = await p1q;
const hq = await hostQ;
ok(!JSON.stringify(st).includes('correct') && !JSON.stringify(hq).includes('"correct"'), 'poprawna odpowiedź NIE jest wysyłana w trakcie pytania');
r = await emit(p1, 'answer', { index: 0, choice: 99 });
ok(r.error === 'invalid', 'odpowiedź spoza zakresu odrzucona');
r = await emit(p1, 'answer', { index: 0, choice: 1 });
ok(r.ok, 'odpowiedź przyjęta');
r = await emit(p1, 'answer', { index: 0, choice: 1 });
ok(r.error === 'already', 'drugi raz nie można');
await sleep(1500);
const p1reveal = nextState(p1, (s) => s.state === 'reveal');
await emit(p2, 'answer', { index: 0, choice: 1 });
await emit(p4, 'answer', { index: 0, choice: 0 });
const rv = await p1reveal;
ok(rv.result.correct && rv.result.points > 900, `szybka poprawna odpowiedź: ${rv.result.points} pkt`);

// Kolejne pytania – przejście przez leaderboard
async function toQuestion() {
	const w = nextState(p1, (s) => s.state === 'question');
	await emit(host, 'host:next', {}); // -> leaderboard
	await emit(host, 'host:next', {}); // -> intro
	return w;
}
let q = await toQuestion();
ok(q.question.type === 'audio' && !q.question.audio, 'gracz nie dostaje pliku audio');
const rvAudio = nextState(p1, (s) => s.state === 'reveal');
await Promise.all([emit(p1, 'answer', { index: 1, choice: 0 }), emit(p2, 'answer', { index: 1, choice: 1 }), emit(p4, 'answer', { index: 1, choice: 0 })]);
const ra = await rvAudio;
ok(ra.result.points > 1800, `mnożnik ×2: ${ra.result.points} pkt`);

q = await toQuestion();
const rvText = nextState(p1, (s) => s.state === 'reveal');
await Promise.all([emit(p1, 'answer', { index: 2, text: '  warszwa! ' }), emit(p2, 'answer', { index: 2, text: 'Kraków' }), emit(p4, 'answer', { index: 2, text: 'WARSZAWA' })]);
ok((await rvText).result.correct, 'tekst z literówką i bez wielkich liter zaliczony');

q = await toQuestion();
const items = q.question.items;
ok(items.length === 3 && items.every((i) => i.id && i.label), 'pytanie "kolejność": pomieszane elementy z losowymi id');
const byLabel = (l) => items.find((i) => i.label === l).id;
const rvOrder = nextState(p1, (s) => s.state === 'reveal');
await Promise.all([
	emit(p1, 'answer', { index: 3, order: [byLabel('I'), byLabel('like'), byLabel('cats')] }),
	emit(p2, 'answer', { index: 3, order: [byLabel('cats'), byLabel('like'), byLabel('I')] }),
	emit(p4, 'answer', { index: 3, order: ['x', 'y', 'z'] }).then((res) => ok(res.error === 'invalid', 'zmyślone id odrzucone'))
]);
await emit(host, 'host:skip', {});
const ro = await rvOrder;
ok(ro.result.correct, 'poprawna kolejność zaliczona');

q = await toQuestion();
r = await emit(p1, 'answer', { index: 4, choice: 'false' });
ok(r.error === 'invalid', 'prawda/fałsz: zły typ odrzucony');
const rvTf = nextState(p1, (s) => s.state === 'reveal');
await Promise.all([emit(p1, 'answer', { index: 4, choice: false }), emit(p2, 'answer', { index: 4, choice: true }), emit(p4, 'answer', { index: 4, choice: false })]);
const tf = await rvTf;
ok(tf.result.bonus > 0, `seria 5 poprawnych → bonus ${tf.result.bonus}`);

// Ponowne połączenie gracza
p1.disconnect();
const p1new = mk();
r = await emit(p1new, 'rejoin', { pin, token: p1token });
ok(r.ok, 'gracz wrócił po rozłączeniu (token)');
r = await emit(mk(), 'rejoin', { pin, token: 'falszywy' });
ok(r.error === 'no-session', 'fałszywy token odrzucony');

const endState = nextState(p1new, (s) => s.state === 'ended');
await emit(host, 'host:next', {}); // leaderboard
await emit(host, 'host:next', {}); // ended (ostatnie pytanie)
const fin = await endState;
ok(fin.rank === 1, `koniec gry: Kasia na miejscu ${fin.rank} z ${fin.me.score} pkt`);

// Odliczanie z ustawień quizu: 0 = od razu pytanie, 3 s = intro z czasem końca odliczania
for (const cd of [0, 3]) {
	const g = registry().create({ ...quiz, quizId: `cd${cd}`, settings: { ...quiz.settings, countdown: cd } }, 'user1');
	const h = connect(URL, { auth: { role: 'host', pin: g.pin, token: g.hostToken }, transports: ['websocket'] });
	await nextState(h);
	let hostSt = null;
	h.on('state', (x) => (hostSt = x));
	const pa = mk();
	const pb = mk();
	await emit(pa, 'join', { pin: g.pin, nick: `Ala${cd}`, deviceId: `cda${cd}` });
	await emit(pb, 'join', { pin: g.pin, nick: `Ola${cd}`, deviceId: `cdb${cd}` });
	const first = nextState(pa, (st) => st.state === 'intro' || st.state === 'question');
	const t0 = Date.now();
	await emit(h, 'host:next', {});
	const st = await first;
	if (cd === 0) ok(st.state === 'question', 'bez odliczania: od razu pytanie');
	else ok(st.state === 'intro' && Math.abs(st.introEnds - t0 - 3000) < 500, `odliczanie 3 s: koniec za ${st.introEnds - t0} ms`);
	if (cd === 0) {
		// Wyrzucenie w trakcie pytania: gdy pozostali już odpowiedzieli, pytanie się kończy
		await emit(pa, 'answer', { index: 0, choice: 1 });
		const pbId = (hostSt?.standings ?? []).find((x) => x.nick === 'Ola0')?.id;
		const reveal = nextState(pa, (x) => x.state === 'reveal');
		const kr = await emit(h, 'host:kick', { playerId: pbId });
		ok(kr.ok !== false && !kr.error, 'wyrzucenie w trakcie pytania');
		const rv = await Promise.race([reveal, sleep(2000).then(() => null)]);
		ok(rv?.state === 'reveal', 'po wyrzuceniu jedynego brakującego gracza od razu wyniki');
	}
	h.close();
	pa.close();
	pb.close();
}

// Tryb drużynowy: członkowie drużyny, filtr imion, czas na naradę wydłuża odliczanie
{
	const g = registry().create({ ...quiz, quizId: 'team', settings: { ...quiz.settings, teamMode: true, countdown: 3, teamTalk: 5 } }, 'user1');
	const h = connect(URL, { auth: { role: 'host', pin: g.pin, token: g.hostToken }, transports: ['websocket'] });
	let hostSt = null;
	h.on('state', (x) => (hostSt = x));
	await nextState(h);
	const ta = mk();
	let jr = await emit(ta, 'join', { pin: g.pin, nick: 'Stolik 1', deviceId: 'team1', members: ['Ala', 'zakazane'] });
	ok(jr.error === 'nick-blocked', 'drużyna: niecenzuralne imię członka odrzucone');
	jr = await emit(ta, 'join', { pin: g.pin, nick: 'Stolik 1', deviceId: 'team1', members: ['Ala', '  Ola ', { x: 1 }, 'B'.repeat(500), '', 'Jan', 'Ewa', 'Iza', 'Kuba', 'Zosia'] });
	ok(jr.ok, 'drużyna dołączyła z członkami');
	await sleep(100);
	const tm = hostSt.players?.find((p) => p.nick === 'Stolik 1')?.members ?? [];
	ok(JSON.stringify(tm) === JSON.stringify(['Ala', 'Ola', 'Jan', 'Ewa', 'Iza', 'Kuba']), `członkowie oczyszczeni i ograniczeni do 6: ${tm}`);
	const intro = nextState(ta, (x) => x.state === 'intro');
	const t0 = Date.now();
	await emit(h, 'host:next', {});
	const st = await intro;
	ok(Math.abs(st.introEnds - t0 - 8000) < 500 && st.question.answers?.length === 4, `narada: odliczanie 3 s + 5 s, odpowiedzi widoczne (${st.introEnds - t0} ms)`);
	h.close();
	ta.close();
}

// PIN brute force
const brute = mk();
let limitedHit = false;
for (let i = 0; i < 70; i++) {
	const res = await Promise.race([emit(brute, 'check', { pin: String(100000 + i) }), sleep(300).then(() => ({ error: 'dropped' }))]);
	if (res.error === 'rate-limited' || res.error === 'dropped') { limitedHit = true; break; }
}
ok(limitedHit, 'zgadywanie PIN-ów blokowane');

process.stderr.write(fails ? `\n${fails} BŁĘDÓW\n` : '\nWszystko OK\n');
process.exit(fails ? 1 : 0);
