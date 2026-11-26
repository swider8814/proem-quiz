// Komunikacja na żywo (Socket.IO).
//   /diag – test połączenia (strona /test-ws)
//   /game – gra: prowadzący (auth tokenem z panelu) i gracze (PIN + nick)
//
// Zasady: każde dane od klienta są walidowane co do typu i długości (bez String() na dowolnych
// obiektach), każdy handler ma własną obsługę wyjątków – błędny pakiet nie może zatrzymać procesu.
import { Server } from 'socket.io';
import { registry, tokenMatches } from './game/engine.js';
import { randomNick } from './game/nicks.js';
import { resolveClientIp } from './net.js';

// ── Walidacja ────────────────────────────────────────────────────────────

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Tekst o ograniczonej długości albo null (żadnej konwersji obiektów). */
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const pinOf = (v) => (typeof v === 'string' && /^\d{6}$/.test(v) ? v : null);
const reply = (ack, payload) => {
	if (typeof ack === 'function') {
		try {
			ack(payload);
		} catch {
			/* klient się rozłączył */
		}
	}
};

/** Rejestracja handlera z obsługą wyjątków – błąd w jednym zdarzeniu nie przerywa procesu. */
function on(socket, event, handler) {
	socket.on(event, (arg, ack) => {
		if (typeof arg === 'function' && ack === undefined) {
			ack = arg;
			arg = undefined;
		}
		try {
			handler(arg, ack);
		} catch (err) {
			console.error(`[realtime] błąd w "${event}":`, err);
			reply(ack, { error: 'server-error' });
		}
	});
}

// ── Limity ───────────────────────────────────────────────────────────────

const buckets = new Map();
/** Rezerwuje zdarzenie; true = limit przekroczony. */
function limited(key, max, windowMs) {
	const now = Date.now();
	let b = buckets.get(key);
	if (!b || b.reset <= now) {
		b = { n: 0, reset: now + windowMs };
		buckets.set(key, b);
	}
	if (b.n >= max) return true;
	b.n++;
	return false;
}
/** Czy limit jest wyczerpany (bez zużywania). */
function exhausted(key, max) {
	const b = buckets.get(key);
	return !!b && b.reset > Date.now() && b.n >= max;
}
setInterval(() => {
	const now = Date.now();
	for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
}, 60_000).unref();

// Wiele osób na wydarzeniu wychodzi do internetu przez JEDEN publiczny adres (NAT).
// Dlatego udane dołączenia i powroty liczymy hojnie, a ostro – tylko nieudane próby.
export const LIMITS = {
	// Nietrafione PIN-y z jednego IP. 60/min: literówki ~300 dzieci za jednym NAT-em się mieszczą,
	// a zgadnięcie 6-cyfrowego PIN-u przy kilku aktywnych grach to ~1% na godzinę ciągłych prób.
	pinFail: { max: 60, windowMs: 60_000 },
	rejoinFail: { max: 40, windowMs: 60_000 }, // nieważne tokeny powrotu
	perIpEvents: { max: 2000, windowMs: 60_000 }, // check/join/rejoin/suggest łącznie (≈ 300 osób × kilka zdarzeń)
	socketsPerIp: 600 // jednocześnie otwarte połączenia z jednego IP
};

const socketsByIp = new Map();

function clientIp(socket) {
	return resolveClientIp(socket.handshake.address, socket.handshake.headers['x-forwarded-for']) || 'unknown';
}

/** Ogranicznik zdarzeń na gniazdo (ochrona przed zalewaniem). */
function floodGuard(socket, perSecond = 15) {
	let tokens = perSecond;
	let last = Date.now();
	socket.use((_packet, next) => {
		const now = Date.now();
		tokens = Math.min(perSecond, tokens + ((now - last) / 1000) * perSecond);
		last = now;
		if (tokens < 1) return next(new Error('rate-limited'));
		tokens -= 1;
		next();
	});
}

// ── Serwer ───────────────────────────────────────────────────────────────

/** @param {import('node:http').Server} httpServer */
export function attachRealtime(httpServer) {
	const origin = process.env.ORIGIN;
	const io = new Server(httpServer, {
		path: '/socket.io',
		serveClient: false,
		pingInterval: 20000,
		pingTimeout: 20000,
		maxHttpBufferSize: 1e4,
		cors: origin ? { origin, credentials: false } : undefined,
		allowRequest: (req, cb) => {
			if (!origin) return cb(null, true);
			const o = req.headers.origin;
			cb(null, !o || o === origin);
		}
	});

	// Limit jednoczesnych połączeń z jednego IP (wspólny dla wszystkich przestrzeni).
	io.engine.on('connection', (rawSocket) => {
		const ip = resolveClientIp(rawSocket.request.socket.remoteAddress, rawSocket.request.headers['x-forwarded-for']) || 'unknown';
		const n = (socketsByIp.get(ip) ?? 0) + 1;
		if (n > LIMITS.socketsPerIp) {
			rawSocket.close();
			return;
		}
		socketsByIp.set(ip, n);
		rawSocket.once('close', () => {
			const left = (socketsByIp.get(ip) ?? 1) - 1;
			if (left <= 0) socketsByIp.delete(ip);
			else socketsByIp.set(ip, left);
		});
	});

	attachDiag(io);
	attachGame(io);
	return io;
}

function attachDiag(io) {
	const diag = io.of('/diag');
	diag.on('connection', (socket) => {
		floodGuard(socket, 5);
		socket.on('error', () => {});
		const transport = () => socket.conn.transport.name;
		socket.emit('hello', { id: socket.id, transport: transport(), serverTime: Date.now(), clients: diag.sockets.size });
		diag.emit('clients', diag.sockets.size);
		socket.conn.on('upgrade', () => socket.emit('upgraded', { transport: transport() }));
		on(socket, 'ping-check', (sentAt, ack) => {
			reply(ack, { sentAt: Number.isFinite(sentAt) ? sentAt : null, serverTime: Date.now(), transport: transport() });
		});
		on(socket, 'broadcast', (text) => {
			const t = str(text, 100);
			if (t === null || limited(`diag:${clientIp(socket)}`, 10, 10_000)) return;
			diag.emit('broadcast', { text: t, at: Date.now() });
		});
		socket.on('disconnect', () => diag.emit('clients', diag.sockets.size));
	});
}

function attachGame(io) {
	const nsp = io.of('/game');
	const games = registry();
	games.io = nsp;

	// Prowadzący uwierzytelnia się już przy połączeniu (dane handshake też walidujemy).
	nsp.use((socket, next) => {
		try {
			const auth = socket.handshake.auth;
			if (isObj(auth) && auth.role === 'host') {
				const ip = clientIp(socket);
				if (exhausted(`hostfail:${ip}`, 10)) return next(new Error('rate-limited'));
				const pin = pinOf(auth.pin);
				const token = str(auth.token, 200);
				const game = pin ? games.get(pin) : null;
				if (!game || !token || !game.hostTokenHash || !tokenMatches(game.hostTokenHash, token)) {
					limited(`hostfail:${ip}`, 10, 60_000);
					return next(new Error('unauthorized'));
				}
				socket.data = { role: 'host', pin: game.pin };
			} else {
				socket.data = { role: 'player', pin: null, playerId: null };
			}
			next();
		} catch {
			next(new Error('invalid'));
		}
	});

	nsp.on('connection', (socket) => {
		floodGuard(socket);
		socket.on('error', () => {});
		if (socket.data.role === 'host') return hostConnection(socket, games);
		playerConnection(socket, games);
	});
}

function hostConnection(socket, games) {
	const game = games.get(socket.data.pin);
	if (!game) return socket.disconnect(true);
	socket.join(game.hostRoom);
	socket.emit('state', game.hostView());

	const command = (event, fn) =>
		on(socket, event, (arg, ack) => {
			const g = games.get(socket.data.pin);
			if (!g) return reply(ack, { error: 'no-game' });
			const err = fn(g, isObj(arg) ? arg : {});
			reply(ack, err ? { error: err } : { ok: true });
		});
	const playerIdOf = (a) => str(a.playerId, 20);

	command('host:next', (g) => g.next());
	command('host:skip', (g) => (g.state === 'question' ? g.closeQuestion() : 'invalid-state'));
	command('host:end', (g) => g.end());
	command('host:kick', (g, a) => {
		const id = playerIdOf(a);
		return id && g.kick(id) ? null : 'not-found';
	});
	command('host:rename', (g, a) => {
		const id = playerIdOf(a);
		return id && g.renameRandom(id) ? null : 'not-found';
	});
	command('host:close', (g) => {
		games.remove(g.pin);
		return null;
	});
}

function playerConnection(socket, games) {
	const ip = clientIp(socket);
	const overIpBudget = () => limited(`ipev:${ip}`, LIMITS.perIpEvents.max, LIMITS.perIpEvents.windowMs);
	const pinBlocked = () => exhausted(`pinfail:${ip}`, LIMITS.pinFail.max);
	const pinMiss = () => limited(`pinfail:${ip}`, LIMITS.pinFail.max, LIMITS.pinFail.windowMs);
	/**
	 * Wspólne wyszukanie gry po PIN-ie dla zdarzeń, które ujawniają, czy gra istnieje (check, suggest, join):
	 * ten sam budżet nietrafionych PIN-ów z IP i ta sama odpowiedź po jego wyczerpaniu – żadne zdarzenie
	 * nie może posłużyć do dalszego zgadywania PIN-ów, gdy pozostałe są już zablokowane.
	 */
	const findGame = (arg, { allowEnded }) => {
		if (overIpBudget() || pinBlocked()) return { error: 'rate-limited' };
		const pin = isObj(arg) ? pinOf(arg.pin) : null;
		const game = pin ? games.get(pin) : null;
		if (!game || (!allowEnded && game.state === 'ended')) {
			pinMiss();
			return { error: 'no-game' };
		}
		return { game };
	};

	/** Przypięcie gniazda do gracza. Gniazdo może reprezentować tylko JEDNEGO gracza. */
	function bind(game, player) {
		if (player.socketId && player.socketId !== socket.id) {
			const old = game.io.sockets.get(player.socketId);
			old?.emit('replaced');
			old?.disconnect(true);
		}
		player.socketId = socket.id;
		player.connected = true;
		socket.data.pin = game.pin;
		socket.data.playerId = player.id;
		socket.join(game.playerRoom);
		game.sendPlayerState(player);
		if (game.state === 'lobby') game.broadcastLobby();
		else game.hostSoon(); // prowadzący widzi, że gracz wrócił
	}

	const boundTo = () => (socket.data.playerId ? { pin: socket.data.pin, playerId: socket.data.playerId } : null);
	const currentGame = () => (socket.data.pin ? games.get(socket.data.pin) : null);

	on(socket, 'check', (arg, ack) => {
		const found = findGame(arg, { allowEnded: false });
		if (!found.game) return reply(ack, found);
		const game = found.game;
		reply(ack, {
			ok: true,
			title: game.quiz.title,
			locale: game.quiz.locale,
			theme: game.quiz.theme,
			nicknameMode: game.quiz.settings.nicknameMode,
			teamMode: game.quiz.settings.teamMode,
			avatars: game.quiz.settings.avatars !== false,
			playerLanguage: game.quiz.settings.playerLanguage !== false,
			suggestion: randomNick(game.quiz.locale, game.takenNicks())
		});
	});

	on(socket, 'suggest', (arg, ack) => {
		const found = findGame(arg, { allowEnded: false });
		if (!found.game) return reply(ack, found);
		reply(ack, { nick: randomNick(found.game.quiz.locale, found.game.takenNicks()) });
	});

	on(socket, 'join', (arg, ack) => {
		if (!isObj(arg)) return reply(ack, { error: 'invalid' });
		if (boundTo()) return reply(ack, { error: 'already-joined' });
		const found = findGame(arg, { allowEnded: true }); // zakończona gra: addPlayer odpowie „game-ended”
		if (!found.game) return reply(ack, found);
		const game = found.game;
		const nick = arg.nick === undefined ? '' : str(arg.nick, 100);
		if (nick === null) return reply(ack, { error: 'invalid' });
		// Członkowie drużyny: tylko tablica krótkich napisów (resztę odrzucamy po cichu).
		const members = Array.isArray(arg.members) ? arg.members.slice(0, 20).map((m) => str(m, 40)).filter((m) => m !== null) : [];
		const res = game.addPlayer({
			nick,
			random: arg.random === true,
			deviceId: str(arg.deviceId, 64),
			avatar: Number.isInteger(arg.avatar) ? arg.avatar : undefined,
			members
		});
		if ('error' in res) return reply(ack, { error: res.error });
		reply(ack, { ok: true, token: res.token, pin: game.pin });
		bind(game, res.player);
	});

	on(socket, 'rejoin', (arg, ack) => {
		if (!isObj(arg)) return reply(ack, { error: 'invalid' });
		if (overIpBudget() || exhausted(`rejoinfail:${ip}`, LIMITS.rejoinFail.max)) return reply(ack, { error: 'rate-limited' });
		const pin = pinOf(arg.pin);
		const token = str(arg.token, 200);
		const game = pin ? games.get(pin) : null;
		const player = game && token ? game.findByToken(token) : null;
		if (!game || !player) {
			limited(`rejoinfail:${ip}`, LIMITS.rejoinFail.max, LIMITS.rejoinFail.windowMs);
			return reply(ack, { error: 'no-session' });
		}
		// Gniazdo przypięte do innego gracza nie może "przeskoczyć" na kolejnego.
		const bound = boundTo();
		if (bound && (bound.pin !== game.pin || bound.playerId !== player.id)) return reply(ack, { error: 'already-joined' });
		reply(ack, { ok: true });
		bind(game, player);
	});

	on(socket, 'answer', (arg, ack) => {
		const game = currentGame();
		const player = game?.players.get(socket.data.playerId);
		if (!game || !player || player.kicked || player.socketId !== socket.id) return reply(ack, { error: 'no-session' });
		if (!isObj(arg)) return reply(ack, { error: 'invalid' });
		reply(ack, game.submitAnswer(player, arg));
	});

	// Pełny ranking na telefon – tylko po zakończeniu gry i tylko dla gracza tej gry.
	on(socket, 'ranking', (_arg, ack) => {
		const game = currentGame();
		const player = game?.players.get(socket.data.playerId);
		if (!game || !player || player.kicked || player.socketId !== socket.id) return reply(ack, { error: 'no-session' });
		if (game.state !== 'ended') return reply(ack, { error: 'not-ended' });
		if (limited(`ranking:${socket.id}`, 3, 10_000)) return reply(ack, { error: 'rate-limited' });
		reply(ack, { ranking: game.fullRanking(player) });
	});

	on(socket, 'leave', (_arg, ack) => {
		const game = currentGame();
		const player = game?.players.get(socket.data.playerId);
		if (game && player && player.socketId === socket.id) {
			game.removePlayer(player); // gracz sam wyszedł – rekord znika z pamięci
			game.broadcastLobby();
		}
		reply(ack, { ok: true });
		socket.disconnect(true);
	});

	socket.on('disconnect', () => {
		try {
			const game = currentGame();
			const player = game?.players.get(socket.data.playerId);
			if (game && player && player.socketId === socket.id) {
				player.connected = false;
				player.socketId = null;
				if (game.state === 'lobby') game.broadcastLobby();
				else {
					game.io.to(game.hostRoom).emit('answers', { count: game.answeredCount(), total: game.connectedCount() });
					game.hostSoon(); // prowadzący widzi rozłączonego gracza
				}
			}
		} catch (err) {
			console.error('[realtime] błąd przy rozłączeniu:', err);
		}
	});
}

/** Tylko dla testów (tests/engine.test.mjs – limity zgadywania PIN-ów). */
export const _resetLimits = () => buckets.clear();
