// Komunikacja na żywo (Socket.IO).
//   /diag – test połączenia (strona /test-ws)
//   /game – gra: prowadzący (auth tokenem z panelu) i gracze (PIN + nick)
import { Server } from 'socket.io';
import { registry, tokenMatches } from './game/engine.js';
import { randomNick } from './game/nicks.js';

// ── Limity ───────────────────────────────────────────────────────────────

const buckets = new Map();
/** true = przekroczony limit */
function limited(key, max, windowMs) {
	const now = Date.now();
	const b = buckets.get(key);
	if (!b || b.reset < now) {
		buckets.set(key, { n: 1, reset: now + windowMs });
		return false;
	}
	b.n++;
	return b.n > max;
}
setInterval(() => {
	const now = Date.now();
	for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

function clientIp(socket) {
	if (process.env.TRUST_PROXY === '1') {
		const xff = socket.handshake.headers['x-forwarded-for'];
		const last = typeof xff === 'string' ? xff.split(',').pop()?.trim() : null;
		if (last) return last;
	}
	return socket.handshake.address;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

/** Prosty ogranicznik zdarzeń na gniazdo (ochrona przed zalewaniem). */
function floodGuard(socket, perSecond = 15) {
	let tokens = perSecond;
	let last = Date.now();
	socket.use((packet, next) => {
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
		maxHttpBufferSize: 1e4, // 10 kB – odpowiedzi są malutkie
		// W produkcji tylko nasza domena (ochrona przed podpięciem z obcej strony).
		cors: origin ? { origin, credentials: false } : undefined,
		allowRequest: (req, cb) => {
			if (!origin) return cb(null, true);
			const o = req.headers.origin;
			cb(null, !o || o === origin);
		}
	});

	attachDiag(io);
	attachGame(io);
	return io;
}

function attachDiag(io) {
	const diag = io.of('/diag');
	diag.on('connection', (socket) => {
		floodGuard(socket, 5);
		const transport = () => socket.conn.transport.name;
		socket.emit('hello', { id: socket.id, transport: transport(), serverTime: Date.now(), clients: diag.sockets.size });
		diag.emit('clients', diag.sockets.size);
		socket.conn.on('upgrade', () => socket.emit('upgraded', { transport: transport() }));
		socket.on('ping-check', (sentAt, ack) => reply(ack, { sentAt, serverTime: Date.now(), transport: transport() }));
		socket.on('broadcast', (text) => {
			if (limited(`diag:${clientIp(socket)}`, 10, 10_000)) return;
			diag.emit('broadcast', { text: String(text).slice(0, 100), at: Date.now() });
		});
		socket.on('disconnect', () => diag.emit('clients', diag.sockets.size));
	});
}

function attachGame(io) {
	const nsp = io.of('/game');
	const games = registry();
	games.io = nsp;

	// Prowadzący uwierzytelnia się już przy połączeniu.
	nsp.use((socket, next) => {
		const auth = socket.handshake.auth;
		if (isObj(auth) && auth.role === 'host') {
			const game = games.get(String(auth.pin ?? ''));
			if (!game || !game.hostTokenHash || !tokenOk(game, auth.token)) {
				limited(`hostfail:${clientIp(socket)}`, 10, 60_000);
				return next(new Error('unauthorized'));
			}
			socket.data = { role: 'host', pin: game.pin };
		} else {
			socket.data = { role: 'player', pin: null, playerId: null };
		}
		next();
	});

	nsp.on('connection', (socket) => {
		floodGuard(socket);
		socket.on('error', () => {});
		if (socket.data.role === 'host') return hostConnection(socket, games);
		playerConnection(socket, games);
	});
}

const tokenOk = (game, candidate) => !!game.hostTokenHash && tokenMatches(game.hostTokenHash, candidate);

function hostConnection(socket, games) {
	const game = games.get(socket.data.pin);
	if (!game) return socket.disconnect(true);
	socket.join(game.hostRoom);
	socket.emit('state', game.hostView());

	const guard = (fn) => (arg, ack) => {
		const g = games.get(socket.data.pin);
		if (!g) return reply(ack, { error: 'no-game' });
		const err = fn(g, isObj(arg) ? arg : {});
		reply(ack, err ? { error: err } : { ok: true });
	};

	socket.on('host:next', guard((g) => g.next()));
	socket.on('host:skip', guard((g) => (g.state === 'question' ? g.closeQuestion() : 'invalid-state')));
	socket.on('host:end', guard((g) => g.end()));
	socket.on('host:kick', guard((g, a) => (g.kick(String(a.playerId ?? '')) ? null : 'not-found')));
	socket.on('host:rename', guard((g, a) => (g.renameRandom(String(a.playerId ?? '')) ? null : 'not-found')));
	socket.on('host:close', guard((g) => {
		games.remove(g.pin);
		return null;
	}));
}

function playerConnection(socket, games) {
	const ip = clientIp(socket);

	/** Wspólne przypięcie gniazda do gracza (join i rejoin). */
	function bind(game, player) {
		// Jeden aktywny telefon na gracza – stare połączenie jest zamykane.
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
	}

	const currentGame = () => (socket.data.pin ? games.get(socket.data.pin) : null);

	// Sprawdzenie PIN-u przed wpisaniem nicka.
	socket.on('check', (arg, ack) => {
		if (limited(`pin:${ip}`, 20, 60_000)) return reply(ack, { error: 'rate-limited' });
		const game = isObj(arg) ? games.get(String(arg.pin ?? '')) : null;
		if (!game || game.state === 'ended') return reply(ack, { error: 'no-game' });
		reply(ack, {
			ok: true,
			title: game.quiz.title,
			locale: game.quiz.locale,
			theme: game.quiz.theme,
			nicknameMode: game.quiz.settings.nicknameMode,
			teamMode: game.quiz.settings.teamMode,
			suggestion: randomNick(game.quiz.locale, game.takenNicks())
		});
	});

	socket.on('suggest', (arg, ack) => {
		if (limited(`suggest:${ip}`, 60, 60_000)) return reply(ack, { error: 'rate-limited' });
		const game = isObj(arg) ? games.get(String(arg.pin ?? '')) : null;
		if (!game) return reply(ack, { error: 'no-game' });
		reply(ack, { nick: randomNick(game.quiz.locale, game.takenNicks()) });
	});

	socket.on('join', (arg, ack) => {
		if (!isObj(arg)) return reply(ack, { error: 'invalid' });
		if (limited(`join:${ip}`, 30, 60_000)) return reply(ack, { error: 'rate-limited' });
		if (socket.data.playerId) return reply(ack, { error: 'already-joined' });
		const game = games.get(String(arg.pin ?? ''));
		if (!game) {
			limited(`pin:${ip}`, 20, 60_000);
			return reply(ack, { error: 'no-game' });
		}
		// Wybrany losowy nick z podpowiedzi przechodzi jako "własny", ale jest z naszej listy – i tak filtrujemy.
		const res = game.addPlayer({
			nick: typeof arg.nick === 'string' ? arg.nick : '',
			random: arg.random === true,
			deviceId: typeof arg.deviceId === 'string' ? arg.deviceId : null
		});
		if ('error' in res) return reply(ack, { error: res.error });
		reply(ack, { ok: true, token: res.token, pin: game.pin });
		bind(game, res.player);
	});

	socket.on('rejoin', (arg, ack) => {
		if (!isObj(arg)) return reply(ack, { error: 'invalid' });
		if (limited(`rejoin:${ip}`, 30, 60_000)) return reply(ack, { error: 'rate-limited' });
		const game = games.get(String(arg.pin ?? ''));
		const player = game?.findByToken(arg.token);
		if (!game || !player) return reply(ack, { error: 'no-session' });
		reply(ack, { ok: true });
		bind(game, player);
	});

	socket.on('answer', (arg, ack) => {
		const game = currentGame();
		const player = game?.players.get(socket.data.playerId);
		if (!game || !player || player.kicked) return reply(ack, { error: 'no-session' });
		if (!isObj(arg)) return reply(ack, { error: 'invalid' });
		reply(ack, game.submitAnswer(player, arg));
	});

	socket.on('leave', (_arg, ack) => {
		const game = currentGame();
		const player = game?.players.get(socket.data.playerId);
		if (game && player) {
			player.kicked = true; // gracz sam wyszedł
			player.connected = false;
			game.broadcastLobby();
		}
		reply(ack, { ok: true });
		socket.disconnect(true);
	});

	socket.on('disconnect', () => {
		const game = currentGame();
		const player = game?.players.get(socket.data.playerId);
		if (game && player && player.socketId === socket.id) {
			player.connected = false;
			player.socketId = null;
			if (game.state === 'lobby') game.broadcastLobby();
			else game.io.to(game.hostRoom).emit('answers', { count: game.answeredCount(), total: game.connectedCount() });
		}
	});
}
