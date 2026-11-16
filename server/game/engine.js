// Silnik gry na żywo. Cały stan w pamięci procesu; czas i punkty liczy WYŁĄCZNIE serwer.
// Zasada bezpieczeństwa: poprawne odpowiedzi nie opuszczają serwera przed końcem pytania.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { cleanNick, textMatches } from './text.js';
import { isProfane } from './profanity.js';
import { randomNick } from './nicks.js';

export const INTRO_MS = 3000;
const GRACE_MS = 600; // opóźnienie sieci przy odpowiedzi tuż przed końcem
const MAX_PLAYERS = 300;
const MAX_GAMES_PER_USER = 3;
const IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const ENDED_TTL_MS = 15 * 60 * 1000;

const sha = (s) => createHash('sha256').update(String(s)).digest();
const token = () => randomBytes(24).toString('base64url');
const shortId = () => randomBytes(6).toString('base64url');

/** Porównanie tokenów w stałym czasie. */
export function tokenMatches(hash, candidate) {
	if (typeof candidate !== 'string' || candidate.length > 200) return false;
	return timingSafeEqual(hash, sha(candidate));
}

function shuffle(arr) {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/**
 * @typedef {{
 *   id: string, type: 'choice'|'truefalse'|'audio'|'text'|'order', prompt: string,
 *   promptTranslation?: string|null, imageUrl?: string|null, timeLimit: number, multiplier: number, data: any
 * }} QuestionSnap
 * @typedef {{
 *   quizId: string, title: string, locale: 'pl'|'en'|'uk',
 *   settings: { streakBonus: boolean, nicknameMode: 'random-or-custom'|'random-only', teamMode: boolean },
 *   theme: any, blockedWords: string[], questions: QuestionSnap[]
 * }} QuizSnapshot
 */

export class Game {
	/** @param {QuizSnapshot} quiz @param {string} ownerId */
	constructor(pin, quiz, ownerId, io) {
		this.pin = pin;
		this.quiz = quiz;
		this.ownerId = ownerId;
		this.io = io;
		this.hostTokenHash = null;
		/** @type {'lobby'|'intro'|'question'|'reveal'|'leaderboard'|'ended'} */
		this.state = 'lobby';
		this.index = -1;
		this.openedAt = 0;
		this.deadline = 0;
		this.timer = null;
		/** @type {Map<string, any>} */
		this.players = new Map();
		this.bannedDevices = new Set();
		this.lastActivity = Date.now();
		this.endedAt = 0;
		// Kolejność elementów w pytaniach "order" – losowe id per gra, żeby id nie zdradzały kolejności.
		this.orderMaps = new Map();
		quiz.questions.forEach((q, i) => {
			if (q.type === 'order') {
				const items = q.data.items.map((label) => ({ id: shortId(), label }));
				this.orderMaps.set(i, { correct: items.map((it) => it.id), shuffled: shuffle(items) });
			}
		});
	}

	issueHostToken() {
		const t = token();
		this.hostTokenHash = sha(t);
		return t;
	}

	get hostRoom() { return `h:${this.pin}`; }
	get playerRoom() { return `p:${this.pin}`; }
	get question() { return this.quiz.questions[this.index]; }
	touch() { this.lastActivity = Date.now(); }

	// ── Gracze ──────────────────────────────────────────────────────────

	takenNicks(exceptId) {
		return new Set([...this.players.values()].filter((p) => p.id !== exceptId && !p.kicked).map((p) => p.nick.toLowerCase()));
	}

	/** @returns {{ error: string } | { player: any, token: string }} */
	addPlayer({ nick, random, deviceId }) {
		if (this.state === 'ended') return { error: 'game-ended' };
		if (deviceId && this.bannedDevices.has(deviceId)) return { error: 'removed' };
		const active = [...this.players.values()].filter((p) => !p.kicked).length;
		if (active >= MAX_PLAYERS) return { error: 'full' };

		let finalNick;
		if (random || this.quiz.settings.nicknameMode === 'random-only') {
			finalNick = randomNick(this.quiz.locale, this.takenNicks());
		} else {
			finalNick = cleanNick(nick);
			if (finalNick.length < 2) return { error: 'nick-short' };
			if (isProfane(finalNick, this.quiz.blockedWords)) return { error: 'nick-blocked' };
			if (this.takenNicks().has(finalNick.toLowerCase())) return { error: 'nick-taken' };
		}
		const t = token();
		const player = {
			id: shortId(),
			tokenHash: sha(t),
			deviceId: typeof deviceId === 'string' ? deviceId.slice(0, 64) : null,
			nick: finalNick,
			score: 0,
			streak: 0,
			totalTime: 0,
			answers: new Map(), // index -> { value, correct, points, elapsed }
			socketId: null,
			connected: false,
			kicked: false,
			joinedAt: Date.now()
		};
		this.players.set(player.id, player);
		this.touch();
		return { player, token: t };
	}

	findByToken(t) {
		for (const p of this.players.values()) if (!p.kicked && tokenMatches(p.tokenHash, t)) return p;
		return null;
	}

	kick(playerId) {
		const p = this.players.get(playerId);
		if (!p || p.kicked) return false;
		p.kicked = true;
		if (p.deviceId) this.bannedDevices.add(p.deviceId);
		if (p.socketId) {
			const s = this.io.sockets.get(p.socketId);
			s?.emit('kicked');
			s?.leave(this.playerRoom);
			s?.disconnect(true);
		}
		this.broadcastLobby();
		return true;
	}

	renameRandom(playerId) {
		const p = this.players.get(playerId);
		if (!p || p.kicked) return false;
		p.nick = randomNick(this.quiz.locale, this.takenNicks(p.id));
		this.sendPlayerState(p);
		this.broadcastLobby();
		return true;
	}

	activePlayers() {
		return [...this.players.values()].filter((p) => !p.kicked);
	}

	// ── Przebieg gry ────────────────────────────────────────────────────

	clearTimer() {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}

	/** Polecenie "dalej" od prowadzącego. */
	next() {
		this.touch();
		switch (this.state) {
			case 'lobby':
				if (this.activePlayers().length === 0) return 'no-players';
				return this.startQuestion(0);
			case 'reveal':
				this.state = 'leaderboard';
				this.broadcastAll();
				return null;
			case 'leaderboard':
				return this.index + 1 < this.quiz.questions.length ? this.startQuestion(this.index + 1) : this.end();
			case 'question':
				return this.closeQuestion();
			default:
				return 'invalid-state';
		}
	}

	startQuestion(i) {
		this.clearTimer();
		this.index = i;
		this.state = 'intro';
		this.broadcastAll();
		this.timer = setTimeout(() => this.openQuestion(), INTRO_MS);
		return null;
	}

	openQuestion() {
		this.state = 'question';
		this.openedAt = Date.now();
		this.deadline = this.openedAt + this.question.timeLimit * 1000;
		this.broadcastAll();
		this.timer = setTimeout(() => this.closeQuestion(), this.deadline - Date.now() + GRACE_MS);
	}

	closeQuestion() {
		if (this.state !== 'question') return 'invalid-state';
		this.clearTimer();
		// Brak odpowiedzi = seria przerwana.
		for (const p of this.activePlayers()) if (!p.answers.has(this.index)) p.streak = 0;
		this.state = 'reveal';
		this.broadcastAll();
		return null;
	}

	end() {
		this.clearTimer();
		this.state = 'ended';
		this.endedAt = Date.now();
		this.broadcastAll();
		return null;
	}

	// ── Odpowiedzi ──────────────────────────────────────────────────────

	/** @returns {{ ok: true } | { error: string }} */
	submitAnswer(player, payload) {
		if (this.state !== 'question') return { error: 'closed' };
		if (!payload || payload.index !== this.index) return { error: 'stale' };
		if (player.answers.has(this.index)) return { error: 'already' };
		const now = Date.now();
		if (now > this.deadline + GRACE_MS) return { error: 'closed' };

		const q = this.question;
		const check = this.evaluate(q, payload);
		if (!check) return { error: 'invalid' };

		const elapsed = Math.min(Math.max(now - this.openedAt, 0), q.timeLimit * 1000);
		let points = 0;
		if (check.fraction > 0) {
			const speed = 1 - 0.5 * (elapsed / (q.timeLimit * 1000));
			points = Math.round(1000 * speed * check.fraction) * q.multiplier;
		}
		const correct = check.fraction === 1;
		if (correct) player.streak += 1;
		else player.streak = 0;
		let bonus = 0;
		if (correct && this.quiz.settings.streakBonus && player.streak >= 3 && q.multiplier > 0) {
			bonus = Math.min(100 * (player.streak - 2), 500);
		}
		player.answers.set(this.index, { value: check.value, correct, points: points + bonus, bonus, elapsed });
		player.score += points + bonus;
		player.totalTime += elapsed;
		this.touch();

		const answered = this.answeredCount();
		this.io.to(this.hostRoom).emit('answers', { count: answered, total: this.connectedCount() });
		// Wszyscy obecni odpowiedzieli -> nie czekamy do końca czasu.
		const waitingFor = this.activePlayers().filter((p) => p.connected || p.answers.has(this.index)).length;
		if (answered >= waitingFor) this.closeQuestion();
		return { ok: true };
	}

	/** Walidacja + ocena. Zwraca null przy niepoprawnym formacie. */
	evaluate(q, payload) {
		const d = q.data;
		switch (q.type) {
			case 'choice':
			case 'audio': {
				const c = payload.choice;
				if (!Number.isInteger(c) || c < 0 || c >= d.answers.length) return null;
				return { value: c, fraction: d.correct.includes(c) ? 1 : 0 };
			}
			case 'truefalse': {
				if (typeof payload.choice !== 'boolean') return null;
				return { value: payload.choice, fraction: payload.choice === d.correct ? 1 : 0 };
			}
			case 'text': {
				if (typeof payload.text !== 'string') return null;
				const text = payload.text.slice(0, 80);
				return { value: text, fraction: textMatches(text, d.accepted, d.typoTolerance ?? 0) ? 1 : 0 };
			}
			case 'order': {
				const map = this.orderMaps.get(this.index);
				const order = payload.order;
				if (!Array.isArray(order) || order.length !== map.correct.length) return null;
				if (new Set(order).size !== order.length || !order.every((id) => map.correct.includes(id))) return null;
				const good = order.filter((id, i) => map.correct[i] === id).length;
				const fraction = good === order.length ? 1 : d.partialCredit ? good / order.length : 0;
				return { value: order, fraction };
			}
		}
		return null;
	}

	answeredCount() {
		return this.activePlayers().filter((p) => p.answers.has(this.index)).length;
	}
	connectedCount() {
		return this.activePlayers().filter((p) => p.connected).length;
	}

	// ── Widoki stanu (co kto widzi) ─────────────────────────────────────

	ranking() {
		return this.activePlayers()
			.sort((a, b) => b.score - a.score || a.totalTime - b.totalTime || a.joinedAt - b.joinedAt)
			.map((p, i) => ({ id: p.id, nick: p.nick, score: p.score, rank: i + 1 }));
	}

	/** Pytanie BEZ poprawnych odpowiedzi. forHost = pełna treść; dla gracza – tylko to, czego potrzebuje. */
	publicQuestion(forHost) {
		const q = this.question;
		if (!q) return null;
		const base = {
			index: this.index,
			total: this.quiz.questions.length,
			type: q.type,
			timeLimit: q.timeLimit,
			multiplier: q.multiplier,
			prompt: q.prompt,
			promptTranslation: q.promptTranslation ?? null
		};
		const d = q.data;
		if (q.type === 'choice' || q.type === 'audio') base.answers = d.answers;
		if (q.type === 'order') base.items = this.orderMaps.get(this.index).shuffled;
		if (forHost) {
			base.imageUrl = q.imageUrl ?? null;
			if (q.type === 'audio') {
				base.audio = { url: d.clipUrl, loop: !!d.loop, revealUrl: d.revealUrl ?? null };
			}
		}
		return base;
	}

	/** Poprawna odpowiedź – tylko po zamknięciu pytania. */
	solution() {
		const q = this.question;
		const d = q.data;
		switch (q.type) {
			case 'choice':
			case 'audio': return { correct: d.correct };
			case 'truefalse': return { correct: d.correct };
			case 'text': return { accepted: d.accepted };
			case 'order': return { order: this.orderMaps.get(this.index).correct };
		}
	}

	distribution() {
		const q = this.question;
		const answers = this.activePlayers().map((p) => p.answers.get(this.index)).filter(Boolean);
		if (q.type === 'choice' || q.type === 'audio') {
			const counts = q.data.answers.map(() => 0);
			for (const a of answers) counts[a.value]++;
			return { counts };
		}
		if (q.type === 'truefalse') {
			return { counts: [answers.filter((a) => a.value === true).length, answers.filter((a) => a.value === false).length] };
		}
		return { correct: answers.filter((a) => a.correct).length, wrong: answers.filter((a) => !a.correct).length };
	}

	hostView() {
		const v = {
			pin: this.pin,
			state: this.state,
			title: this.quiz.title,
			locale: this.quiz.locale,
			theme: this.quiz.theme,
			settings: this.quiz.settings,
			totalQuestions: this.quiz.questions.length,
			players: this.state === 'lobby' ? this.activePlayers().map((p) => ({ id: p.id, nick: p.nick, connected: p.connected })) : undefined,
			playerCount: this.activePlayers().length,
			now: Date.now()
		};
		if (['intro', 'question', 'reveal'].includes(this.state)) {
			v.question = this.publicQuestion(true);
			v.deadline = this.state === 'question' ? this.deadline : null;
			v.answered = this.answeredCount();
		}
		if (this.state === 'reveal') {
			v.solution = this.solution();
			v.distribution = this.distribution();
		}
		if (this.state === 'leaderboard' || this.state === 'ended') v.ranking = this.ranking().slice(0, this.state === 'ended' ? 10 : 5);
		return v;
	}

	playerView(p) {
		const v = {
			pin: this.pin,
			state: this.state,
			title: this.quiz.title,
			locale: this.quiz.locale,
			theme: this.quiz.theme,
			teamMode: this.quiz.settings.teamMode,
			me: { id: p.id, nick: p.nick, score: p.score, streak: p.streak },
			now: Date.now()
		};
		if (this.state === 'intro' || this.state === 'question') {
			v.question = this.publicQuestion(false);
			v.deadline = this.state === 'question' ? this.deadline : null;
			v.answered = p.answers.has(this.index);
		}
		if (this.state === 'reveal' || this.state === 'leaderboard' || this.state === 'ended') {
			const ranking = this.ranking();
			const mine = ranking.find((r) => r.id === p.id);
			v.rank = mine?.rank ?? null;
			v.players = ranking.length;
			const ahead = mine && mine.rank > 1 ? ranking[mine.rank - 2] : null;
			v.behindBy = ahead ? ahead.score - p.score : 0;
			if (this.state === 'reveal') {
				const a = p.answers.get(this.index);
				v.result = a ? { correct: a.correct, points: a.points, bonus: a.bonus } : { correct: false, points: 0, bonus: 0, missed: true };
				v.question = this.publicQuestion(false);
				v.solution = this.solution();
			}
		}
		return v;
	}

	sendPlayerState(p) {
		if (p.socketId) this.io.sockets.get(p.socketId)?.emit('state', this.playerView(p));
	}

	broadcastLobby() {
		this.io.to(this.hostRoom).emit('state', this.hostView());
	}

	broadcastAll() {
		this.io.to(this.hostRoom).emit('state', this.hostView());
		for (const p of this.activePlayers()) this.sendPlayerState(p);
	}

	dispose() {
		this.clearTimer();
		this.io.in(this.playerRoom).disconnectSockets(true);
		this.io.in(this.hostRoom).disconnectSockets(true);
	}
}

// ── Rejestr gier ─────────────────────────────────────────────────────────

export class GameRegistry {
	constructor() {
		/** @type {Map<string, Game>} */
		this.games = new Map();
		this.io = null; // ustawiane w realtime.js
		setInterval(() => this.sweep(), 60_000).unref();
	}

	newPin() {
		for (let i = 0; i < 100; i++) {
			const pin = String(randomInt(100000, 1000000));
			if (!this.games.has(pin)) return pin;
		}
		throw new Error('Brak wolnych PIN-ów');
	}

	/** @param {QuizSnapshot} quiz */
	create(quiz, ownerId) {
		if (!this.io) throw new Error('Serwer gry nie jest uruchomiony');
		const mine = [...this.games.values()].filter((g) => g.ownerId === ownerId && g.state !== 'ended');
		// Najstarsza gra tego prowadzącego jest zamykana, gdy przekroczy limit.
		if (mine.length >= MAX_GAMES_PER_USER) {
			const oldest = mine.sort((a, b) => a.lastActivity - b.lastActivity)[0];
			this.remove(oldest.pin);
		}
		const game = new Game(this.newPin(), quiz, ownerId, this.io);
		this.games.set(game.pin, game);
		return { pin: game.pin, hostToken: game.issueHostToken() };
	}

	get(pin) {
		return typeof pin === 'string' ? this.games.get(pin) ?? null : null;
	}

	remove(pin) {
		const g = this.games.get(pin);
		if (g) {
			g.dispose();
			this.games.delete(pin);
		}
	}

	sweep() {
		const now = Date.now();
		for (const g of this.games.values()) {
			if ((g.state === 'ended' && now - g.endedAt > ENDED_TTL_MS) || now - g.lastActivity > IDLE_TTL_MS) {
				this.remove(g.pin);
			}
		}
	}
}

/** Jeden rejestr na proces – wspólny dla SvelteKit i Socket.IO. */
export function registry() {
	globalThis.__proemQuizGames ??= new GameRegistry();
	return globalThis.__proemQuizGames;
}
