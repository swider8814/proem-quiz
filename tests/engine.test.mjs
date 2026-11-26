// Test silnika gry: prawdziwy serwer Socket.IO + klienci.  Uruchom: node tests/engine.test.mjs
import http from 'node:http';
import { io as connect } from 'socket.io-client';
import { attachRealtime, _resetLimits } from '../server/realtime.js';
import { registry, shuffled } from '../server/game/engine.js';

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
const boards = [];
async function toQuestion() {
	const w = nextState(p1, (s) => s.state === 'question');
	const lb = nextState(host, (s) => s.state === 'leaderboard');
	await emit(host, 'host:next', {}); // -> leaderboard
	boards.push(await lb);
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
// Tablica wyników zna miejsca i punkty sprzed pytania (animacja przesunięć jak w Kahoot)
{
	const [b1, b2] = boards;
	const before = new Map(b1.ranking.map((r) => [r.id, r]));
	ok(b1.ranking.every((r) => r.prevScore === 0 && r.prevRank >= 1), 'pierwsza tablica: punkty sprzed pytania = 0');
	ok(b2.ranking.every((r) => r.prevScore === before.get(r.id)?.score && r.prevRank === before.get(r.id)?.rank), 'druga tablica: poprzednie miejsca i punkty z pierwszej tablicy');
}
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
{
	// Raport (zapisywany w bazie): na graczu tylko nick, miejsce i punkty – bez przebiegu odpowiedzi.
	const rep = registry().get(pin).report().data;
	ok(rep.players.length > 0 && rep.players.every((p) => Object.keys(p).sort().join() === 'nick,rank,score'), 'raport: gracz = tylko nick, miejsce, punkty');
	ok(rep.questions.length > 0 && rep.questions.every((q) => typeof q.answered === 'number'), 'raport: statystyki pytań zbiorcze zostają');
}
// Koniec gry na telefonie: pierwsza trójka i okolice gracza, bez identyfikatorów innych graczy
ok(Array.isArray(fin.top) && fin.top.length >= 1 && fin.top.length <= 3 && fin.top[0].rank === 1, 'koniec gry: telefon dostaje pierwszą trójkę');
ok(Array.isArray(fin.around) && fin.around.some((r) => r.me && r.rank === fin.rank), 'koniec gry: „Twoje okolice” zawierają gracza (me)');
ok([...fin.top, ...fin.around].every((r) => !('id' in r)), 'koniec gry: wiersze rankingu na telefon bez id graczy');
r = await emit(p1new, 'ranking', {});
ok(Array.isArray(r.ranking) && r.ranking.length === fin.players && r.ranking.every((x) => !('id' in x)) && r.ranking.filter((x) => x.me).length === 1, `pełny ranking na żądanie: ${r.ranking?.length} graczy, bez id, „ja” raz`);
await emit(p1new, 'ranking', {});
await emit(p1new, 'ranking', {});
r = await emit(p1new, 'ranking', {});
ok(r.error === 'rate-limited', 'pełny ranking: limit zapytań z jednego telefonu');
r = await emit(mk(), 'ranking', {});
ok(r.error === 'no-session', 'pełny ranking: tylko dla gracza tej gry');

{
	// Pełny ranking przed końcem gry – odmowa
	const g = registry().create({ ...quiz, quizId: 'rk' }, 'user1');
	const pa = mk();
	await emit(pa, 'join', { pin: g.pin, nick: 'Ewa', deviceId: 'rk1' });
	const rr = await emit(pa, 'ranking', {});
	ok(rr.error === 'not-ended', 'pełny ranking przed końcem gry: odmowa');
}

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
	const tb = mk();
	ok((await emit(tb, 'join', { pin: g.pin, nick: 'Stolik 2', deviceId: 'team2', members: ['Basia'] })).ok, 'druga drużyna dołączyła');
	await sleep(100);
	const tm = hostSt.players?.find((p) => p.nick === 'Stolik 1')?.members ?? [];
	ok(JSON.stringify(tm) === JSON.stringify(['Ala', 'Ola', 'Jan', 'Ewa', 'Iza', 'Kuba']), `członkowie oczyszczeni i ograniczeni do 6: ${tm}`);
	const intro = nextState(ta, (x) => x.state === 'intro');
	const t0 = Date.now();
	await emit(h, 'host:next', {});
	const st = await intro;
	ok(Math.abs(st.introEnds - t0 - 8000) < 500 && st.question.answers?.length === 4, `narada: odliczanie 3 s + 5 s, odpowiedzi widoczne (${st.introEnds - t0} ms)`);
	// Raport po grze drużynowej: bez imion członków (review Codexa – dane dzieci)
	const gg = registry().get(g.pin);
	let rep = null;
	gg.onEnd = (r) => (rep = r);
	await emit(h, 'host:end', {});
	await sleep(50);
	ok(rep && rep.data.players.length === 2 && !JSON.stringify(rep).includes('Ala') && !rep.data.players.some((p) => 'members' in p), 'raport drużyny bez imion członków');
	// Ranking na telefon: imiona członków innych drużyn nie trafiają na cudze telefony
	const teamA = gg.activePlayers().find((p) => p.nick === 'Stolik 1');
	const rows = JSON.stringify(gg.fullRanking(teamA));
	ok(rows.includes('Stolik 2') && !rows.includes('Basia') && !rows.includes('Ala'), 'ranking na telefon: bez imion członków drużyn');
	h.close();
	ta.close();
	tb.close();
}

// Ankieta, suwak i slajd
{
	const qz = {
		...quiz, quizId: 'types', settings: { ...quiz.settings, countdown: 0 },
		questions: [
			{ id: 's1', type: 'slide', prompt: 'Witajcie!', timeLimit: 20, multiplier: 1, data: { type: 'slide', text: 'Zaczynamy' } },
			{ id: 'p1', type: 'poll', prompt: 'Ulubiona kolęda?', timeLimit: 20, multiplier: 1, data: { answers: ['Cicha noc', 'Lulajże'] } },
			{ id: 'r1', type: 'slider', prompt: 'Ile dni ma grudzień?', timeLimit: 20, multiplier: 1, data: { min: 0, max: 100, step: 1, correct: 31, margin: 'low', unit: 'dni' } }
		]
	};
	const g = registry().create(qz, 'user1');
	const h = connect(URL, { auth: { role: 'host', pin: g.pin, token: g.hostToken }, transports: ['websocket'] });
	let hs = null;
	h.on('state', (x) => (hs = x));
	await nextState(h);
	const a = mk();
	const b = mk();
	await emit(a, 'join', { pin: g.pin, nick: 'Ania', deviceId: 'ty1' });
	await emit(b, 'join', { pin: g.pin, nick: 'Bartek', deviceId: 'ty2' });
	const slide = nextState(a, (x) => x.state === 'question');
	await emit(h, 'host:next', {});
	const sl = await slide;
	ok(sl.question.type === 'slide' && sl.question.text === 'Zaczynamy' && sl.deadline === null, 'slajd: bez czasu, z tekstem');
	ok((await emit(a, 'answer', { index: 0, choice: 0 })).error === 'invalid', 'slajd: odpowiedź odrzucona');
	ok((await emit(h, 'host:skip', {})).error === 'invalid-state', 'slajd: „zakończ pytanie” nie działa');
	const poll = nextState(a, (x) => x.state === 'question' && x.question.index === 1);
	await emit(h, 'host:next', {}); // slajd → od razu następne pytanie
	const pq = await poll;
	ok(pq.question.type === 'poll' && pq.question.answers.length === 2, 'po slajdzie od razu ankieta');
	const pr = nextState(a, (x) => x.state === 'reveal');
	await emit(a, 'answer', { index: 1, choice: 1 });
	await emit(b, 'answer', { index: 1, choice: 1 });
	const prv = await pr;
	ok(prv.result.poll && prv.result.voted && prv.me.score === 0, 'ankieta: bez punktów, głos policzony');
	{
		const gg = registry().get(g.pin);
		const times = [...gg.players.values()].map((p) => p.totalTime);
		ok(times.every((t) => t === 0), `ankieta nie zmienia czasu rozstrzygającego remisy (review Codexa): ${times}`);
	}
	await sleep(50);
	ok(JSON.stringify(hs.distribution.counts) === '[0,2]', `ankieta: rozkład głosów ${JSON.stringify(hs.distribution.counts)}`);
	await emit(h, 'host:next', {}); // ranking
	const sq = nextState(a, (x) => x.state === 'question' && x.question.index === 2);
	await emit(h, 'host:next', {});
	const sv = await sq;
	ok(sv.question.slider?.max === 100 && sv.question.slider.unit === 'dni' && sv.question.correct === undefined, 'suwak: zakres bez poprawnej wartości');
	ok((await emit(a, 'answer', { index: 2, value: 101 })).error === 'invalid', 'suwak: wartość spoza zakresu odrzucona');
	ok((await emit(a, 'answer', { index: 2, value: '31' })).error === 'invalid', 'suwak: tekst zamiast liczby odrzucony');
	ok((await emit(a, 'answer', { index: 2, value: 30.5 })).error === 'invalid', 'suwak: wartość poza krokiem odrzucona (review Codexa)');
	const rr = nextState(a, (x) => x.state === 'reveal');
	const rb = nextState(b, (x) => x.state === 'reveal');
	await emit(a, 'answer', { index: 2, value: 31 });
	await emit(b, 'answer', { index: 2, value: 34 });
	const [ra, rb2] = await Promise.all([rr, rb]);
	ok(ra.result.correct && rb2.result.correct && ra.result.points > rb2.result.points && rb2.result.points > 0, `suwak: dokładnie ${ra.result.points} > blisko ${rb2.result.points} > 0`);
	ok(ra.solution.value === 31 && rb2.result.value === 34, 'suwak: wynik pokazuje poprawną wartość i odpowiedź gracza');
	h.close();
	a.close();
	b.close();
}

// Awatary: wybrany zostaje, niepoprawny → losowy z zakresu
{
	const g = registry().create({ ...quiz, quizId: 'av' }, 'user1');
	const h = connect(URL, { auth: { role: 'host', pin: g.pin, token: g.hostToken }, transports: ['websocket'] });
	let hs = null;
	h.on('state', (x) => (hs = x));
	await nextState(h);
	const a = mk();
	const b = mk();
	await emit(a, 'join', { pin: g.pin, nick: 'Awa', deviceId: 'av1', avatar: 5 });
	await emit(b, 'join', { pin: g.pin, nick: 'Bwa', deviceId: 'av2', avatar: 999 });
	await sleep(100);
	const pa = hs.players.find((p) => p.nick === 'Awa');
	const pb = hs.players.find((p) => p.nick === 'Bwa');
	ok(pa.avatar === 5 && Number.isInteger(pb.avatar) && pb.avatar >= 0 && pb.avatar < 24, `awatary: wybrany ${pa.avatar}, losowy ${pb.avatar}`);
	h.close();
	a.close();
	b.close();
}
// Postacie wyłączone w ustawieniach quizu: telefon wie, że ma nie pokazywać wyboru; gracz bez postaci
{
	const g = registry().create({ ...quiz, quizId: 'noav', settings: { ...quiz.settings, avatars: false } }, 'user1');
	const h = connect(URL, { auth: { role: 'host', pin: g.pin, token: g.hostToken }, transports: ['websocket'] });
	let hs = null;
	h.on('state', (x) => (hs = x));
	await nextState(h);
	const a = mk();
	const chk = await emit(a, 'check', { pin: g.pin });
	ok(chk.ok && chk.avatars === false, 'postacie wyłączone: telefon dostaje avatars=false');
	await emit(a, 'join', { pin: g.pin, nick: 'Bezpostaci', deviceId: 'noav1', avatar: 5 });
	await sleep(100);
	const p = hs.players.find((x) => x.nick === 'Bezpostaci');
	ok(p && p.avatar == null, `postacie wyłączone: gracz bez postaci (${p?.avatar})`);
	const b = mk();
	const chk2 = await emit(b, 'check', { pin: (registry().create({ ...quiz, quizId: 'avon' }, 'user1')).pin });
	ok(chk2.ok && chk2.avatars === true, 'domyślnie postacie włączone (avatars=true)');
	h.close();
	a.close();
	b.close();
}

// Losowa kolejność pytań i odpowiedzi
{
	const base = {
		...quiz,
		settings: { ...quiz.settings, shuffleQuestions: true, shuffleAnswers: true },
		questions: [
			{ id: 'sl', type: 'slide', prompt: 'Start', timeLimit: 20, multiplier: 1, data: { type: 'slide', text: '' } },
			...Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, type: 'choice', prompt: `P${i}`, timeLimit: 20, multiplier: 1, data: { answers: ['a', 'b', 'c', 'd'], correct: [i % 4], images: ['m0', null, 'm2', null], alts: ['opis a', null, 'opis c', null] } }))
		]
	};
	let orderChanged = false;
	let answersChanged = false;
	let consistent = true;
	let altsFollow = true;
	for (let n = 0; n < 50; n++) {
		const s = shuffled(base);
		if (s.questions[0].id !== 'sl') consistent = false;
		if (s.questions.map((q) => q.id).join() !== base.questions.map((q) => q.id).join()) orderChanged = true;
		for (const q of s.questions.slice(1)) {
			const orig = base.questions.find((x) => x.id === q.id);
			if (q.data.answers.join() !== 'a,b,c,d') answersChanged = true;
			if ([...q.data.answers].sort().join() !== 'a,b,c,d') consistent = false;
			if (q.data.answers[q.data.correct[0]] !== orig.data.answers[orig.data.correct[0]]) consistent = false;
			q.data.answers.forEach((a, i) => { if (q.data.images[i] !== orig.data.images[orig.data.answers.indexOf(a)]) consistent = false; });
			q.data.answers.forEach((a, i) => { if (q.data.alts[i] !== orig.data.alts[orig.data.answers.indexOf(a)]) altsFollow = false; });
		}
	}
	ok(orderChanged && answersChanged, 'tasowanie zmienia kolejność pytań i odpowiedzi');
	ok(consistent, 'tasowanie: slajd na miejscu, poprawna odpowiedź i obrazki idą za odpowiedzią');
	ok(altsFollow, 'tasowanie: opisy obrazków (czytnik ekranu) idą za obrazkami (review Codexa)');
	ok(shuffled(quiz) === quiz, 'bez ustawień – bez zmian');
}

// Tryb „tylko własny nick”: losowy nick nie przechodzi, wpisane imię tak (te same zasady filtra).
{
	const g = registry().get(registry().create({ ...quiz, quizId: 'own', settings: { ...quiz.settings, nicknameMode: 'custom-only' } }, 'user1').pin);
	ok(g.addPlayer({ random: true, deviceId: 'own1' }).error === 'nick-short', 'tylko własny: prośba o losowy nick bez imienia odrzucona');
	const own = g.addPlayer({ nick: 'Marta', random: true, deviceId: 'own2' });
	ok(own.player?.nick === 'Marta', 'tylko własny: wpisane imię użyte (nawet z random=true)');
	ok(g.addPlayer({ nick: 'k.u.r.w.a', deviceId: 'own3' }).error === 'nick-blocked', 'tylko własny: filtr słów działa');
	const ro = registry().get(registry().create({ ...quiz, quizId: 'ro', settings: { ...quiz.settings, nicknameMode: 'random-only' } }, 'user1').pin);
	ok(ro.addPlayer({ nick: 'Marta', deviceId: 'ro1' }).player?.nick !== 'Marta', 'tylko losowe: wpisany nick ignorowany (bez zmian)');
}

// Rotacja składu: definitywne wyjście usuwa rekord i historię odpowiedzi z pamięci (limit 300 dotyczy aktywnych).
{
	const g = registry().get(registry().create({ ...quiz, quizId: 'rot' }, 'user1').pin);
	let joined = 0;
	for (let i = 0; i < 1000; i++) {
		const r = g.addPlayer({ random: true, deviceId: `rot${i}` });
		if (!r.player) break;
		joined++;
		if (i % 2) g.kick(r.player.id);
		else g.removePlayer(r.player); // „Opuść grę”
	}
	ok(joined === 1000 && g.players.size === 0, `rotacja 1000 graczy: dołączyło ${joined}, w pamięci ${g.players.size} rekordów`);
	ok(g.bannedDevices.size === 500 && g.addPlayer({ random: true, deviceId: 'rot1' }).error === 'removed', 'wyrzucone urządzenie nadal zablokowane');
	ok(g.addPlayer({ random: true, deviceId: 'rot0' }).player !== undefined, 'gracz, który sam wyszedł, może dołączyć ponownie');
}

// Rozesłanie stanu do 300 telefonów: ranking liczony raz, a nie osobno dla każdego gracza (review Codexa).
{
	const g = registry().get(registry().create({ ...quiz, quizId: 'rank' }, 'user1').pin);
	const players = [];
	for (let i = 0; i < 300; i++) players.push(g.addPlayer({ random: true, deviceId: `rk${i}` }).player);
	players.forEach((p, i) => { p.score = (i * 37) % 1000; p.socketId = `fake${i}`; });
	const sent = [];
	g.io = { to: () => ({ emit() {} }), sockets: { get: (id) => ({ emit: (_ev, v) => sent.push([id, v]) }) }, in: () => ({ disconnectSockets() {} }) };
	g.state = 'leaderboard';
	g.index = 0;
	let calls = 0;
	const orig = g.ranking.bind(g);
	g.ranking = () => { calls++; return orig(); };
	g.broadcastAll();
	ok(sent.length === 300 && calls <= 3, `rozesłanie do 300 telefonów: ${calls} sortowań rankingu (wcześniej ~300)`);
	const best = players.reduce((a, b) => (b.score > a.score ? b : a));
	const v = sent.find(([id]) => id === best.socketId)[1];
	ok(v.rank === 1 && v.players === 300 && v.behindBy === 0, 'miejsce i dystans liczone poprawnie z jednego rankingu');
	const second = sent.map(([, x]) => x).find((x) => x.rank === 2);
	ok(second && second.behindBy === best.score - second.me.score, 'drugi gracz: poprawna strata do pierwszego');
	g.state = 'ended';
	g.io = { to: () => ({ emit() {} }), sockets: { get: () => undefined }, in: () => ({ disconnectSockets() {} }) };
}

// PIN brute force: wspólny budżet nietrafień dla check, suggest i join (review Codexa).
// Wymagamy jawnej odpowiedzi „rate-limited” – sam brak odpowiedzi nie jest dowodem działania limitu.
{
	const live = registry().create({ ...quiz, quizId: 'brute' }, 'user1').pin;
	// Tylko PIN-y, pod którymi na pewno nie ma gry (rejestr losuje z tego samego zakresu) – review Codexa.
	let nextPin = 100000;
	const freePin = () => {
		while (registry().get(String(nextPin))) nextPin++;
		return String(nextPin++);
	};
	const guess = async (ev, n) => {
		for (let i = 0; i < n; i++) {
			await sleep(80); // poniżej ogranicznika 15 zdarzeń/s na gniazdo (floodGuard) – inaczej zdarzenia byłyby gubione
			const res = await emit(brute, ev, { pin: freePin() });
			if (res.error === 'rate-limited') return i;
			if (res.error !== 'no-game') return `nieoczekiwane: ${JSON.stringify(res)}`;
		}
		return null;
	};
	const brute = mk();
	_resetLimits();
	const viaCheck = await guess('check', 70);
	ok(typeof viaCheck === 'number' && viaCheck >= 55, `zgadywanie PIN-ów przez check blokowane (po ${viaCheck} próbach)`);
	for (const ev of ['check', 'suggest', 'join']) {
		await sleep(80);
		const res = await emit(brute, ev, { pin: live, random: true });
		ok(res.error === 'rate-limited', `po wyczerpaniu budżetu ${ev} z prawdziwym PIN-em też „rate-limited” (${JSON.stringify(res)})`);
	}
	_resetLimits();
	const viaSuggest = await guess('suggest', 70);
	ok(typeof viaSuggest === 'number' && viaSuggest >= 55, `nietrafione PIN-y w suggest liczą się do tego samego budżetu (po ${viaSuggest})`);
	await sleep(80);
	ok((await emit(brute, 'check', { pin: live })).error === 'rate-limited', 'po zgadywaniu przez suggest check też zablokowany');
	_resetLimits();
	brute.close();
}

process.stderr.write(fails ? `\n${fails} BŁĘDÓW\n` : '\nWszystko OK\n');
process.exit(fails ? 1 : 0);
