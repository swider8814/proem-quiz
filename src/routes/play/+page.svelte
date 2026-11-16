<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { Socket } from 'socket.io-client';
	import '#lib/game/game.css';
	import Shape from '#lib/game/Shape.svelte';
	import { ask, deviceId, gameSocket, keepAwake, remaining, store } from '#lib/game/client.js';
	import { errText, t } from '#lib/game/i18n.js';
	import { shapeColor, themeVars, type GameTheme } from '#lib/game/theme.js';

	type Item = { id: string; label: string };
	type Q = {
		index: number; total: number; type: 'choice' | 'truefalse' | 'audio' | 'text' | 'order';
		timeLimit: number; prompt: string; promptTranslation: string | null;
		answers?: string[]; answerCount?: number; items?: Item[];
	};
	type State = {
		pin: string; state: 'lobby' | 'intro' | 'question' | 'reveal' | 'leaderboard' | 'ended';
		title: string; locale: string; theme: GameTheme; teamMode: boolean;
		me: { id: string; nick: string; score: number; streak: number };
		now: number; question?: Q; deadline?: number | null; answered?: boolean;
		rank?: number | null; players?: number; behindBy?: number;
		result?: { correct: boolean; points: number; bonus: number; missed?: boolean };
		solution?: { correct?: number[] | boolean; accepted?: string[]; order?: string[] };
	};

	let socket: Socket | null = null;
	let phase = $state<'pin' | 'nick' | 'game' | 'kicked' | 'replaced'>('pin');
	let pin = $state('');
	let info = $state<{ title: string; locale: string; theme: GameTheme; nicknameMode: string; teamMode: boolean } | null>(null);
	let nick = $state('');
	let suggestion = $state('');
	let ownNick = $state(false);
	let busy = $state(false);
	let error = $state('');
	let gs = $state<State | null>(null);
	let offset = $state(0);
	let now = $state(Date.now());
	let connected = $state(true);
	let sent = $state(false); // odpowiedź wysłana w bieżącym pytaniu
	let textAnswer = $state('');
	let picked = $state<string[]>([]);

	const locale = $derived(gs?.locale ?? info?.locale ?? 'pl');
	const L = $derived(t(locale));
	const theme = $derived(gs?.theme ?? info?.theme ?? null);
	const style = $derived(theme?.style ?? 'poster');
	const team = $derived(gs?.teamMode ?? info?.teamMode ?? false);
	const left = $derived.by(() => {
		void now; // przeliczane co tick
		return remaining(gs?.deadline, offset);
	});
	const q = $derived(gs?.question);
	const answerCount = $derived(q?.answers?.length ?? q?.answerCount ?? 0);

	const sessionKey = (p: string) => `pq:s:${p}`;

	function connect() {
		socket = gameSocket();
		socket.on('connect', async () => {
			connected = true;
			// Po zerwaniu połączenia (Wi-Fi, blokada ekranu) wracamy do gry tym samym tokenem.
			const token = gs ? store.get(sessionKey(gs.pin)) : null;
			if (gs && token) {
				const r = await ask(socket!, 'rejoin', { pin: gs.pin, token });
				if (r.error === 'no-session') leaveGame();
			}
		});
		socket.on('disconnect', () => (connected = false));
		socket.on('state', (s: State) => {
			offset = s.now - Date.now();
			const newQuestion = s.question && (!gs?.question || gs.question.index !== s.question.index || gs.state !== s.state);
			if (s.state === 'intro' && newQuestion) {
				sent = false;
				textAnswer = '';
				picked = [];
				navigator.vibrate?.(80);
			}
			if (s.state === 'question') sent = !!s.answered;
			gs = s;
			phase = 'game';
		});
		socket.on('kicked', () => {
			if (gs) store.del(sessionKey(gs.pin));
			phase = 'kicked';
		});
		socket.on('replaced', () => (phase = 'replaced'));
	}

	function leaveGame() {
		if (gs) store.del(sessionKey(gs.pin));
		store.del('pq:last');
		gs = null;
		phase = 'pin';
	}

	onMount(() => {
		connect();
		const tick = setInterval(() => (now = Date.now()), 200);
		const unlock = keepAwake();
		// Powrót do trwającej gry (odświeżenie strony) albo PIN z kodu QR.
		const qsPin = page.url.searchParams.get('pin')?.replace(/\D/g, '').slice(0, 6) ?? '';
		const last = store.get('pq:last');
		const tryPin = qsPin || last || '';
		const token = tryPin ? store.get(sessionKey(tryPin)) : null;
		(async () => {
			if (tryPin && token) {
				const r = await ask(socket!, 'rejoin', { pin: tryPin, token });
				if (r.ok) return;
				store.del(sessionKey(tryPin));
			}
			if (qsPin.length === 6) {
				pin = qsPin;
				await checkPin();
			}
		})();
		return () => {
			clearInterval(tick);
			unlock();
			socket?.disconnect();
		};
	});

	async function checkPin(e?: Event) {
		e?.preventDefault();
		error = '';
		const p = pin.replace(/\D/g, '');
		if (p.length !== 6) return;
		busy = true;
		const r = await ask<{ ok?: boolean; error?: string; title: string; locale: string; theme: GameTheme; nicknameMode: string; teamMode: boolean; suggestion: string }>(socket!, 'check', { pin: p });
		busy = false;
		if (!r.ok) {
			error = errText(locale, r.error ?? 'default');
			return;
		}
		info = r;
		suggestion = r.suggestion;
		nick = '';
		ownNick = false;
		phase = 'nick';
	}

	async function reroll() {
		const r = await ask<{ nick?: string }>(socket!, 'suggest', { pin });
		if (r.nick) suggestion = r.nick;
	}

	async function join(e: Event) {
		e.preventDefault();
		error = '';
		busy = true;
		const useOwn = ownNick && info?.nicknameMode !== 'random-only';
		const r = await ask<{ ok?: boolean; error?: string; token?: string; pin?: string }>(socket!, 'join', {
			pin,
			nick: useOwn ? nick : suggestion,
			// Podpowiedź z serwera traktujemy jak własny nick (żeby gracz dostał dokładnie to, co widzi).
			random: false,
			deviceId: deviceId()
		});
		busy = false;
		if (!r.ok || !r.token || !r.pin) {
			error = errText(locale, r.error ?? 'default');
			if (r.error === 'nick-taken' && !useOwn) reroll();
			return;
		}
		store.set(sessionKey(r.pin), r.token);
		store.set('pq:last', r.pin);
	}

	async function answer(payload: Record<string, unknown>) {
		if (!q || sent || gs?.state !== 'question') return;
		sent = true;
		const r = await ask<{ ok?: boolean; error?: string }>(socket!, 'answer', { index: q.index, ...payload });
		if (!r.ok && r.error !== 'already') {
			sent = r.error === 'closed';
			if (r.error !== 'closed') error = errText(locale, r.error ?? 'default');
		}
	}

	function pick(id: string) {
		if (picked.includes(id) || !q?.items) return;
		picked = [...picked, id];
	}

	const pts = (n: number) => n.toLocaleString(locale === 'uk' ? 'uk-UA' : locale === 'en' ? 'en-GB' : 'pl-PL');
	const labelOf = (id: string) => q?.items?.find((i) => i.id === id)?.label ?? '';
</script>

<svelte:head>
	<title>{gs?.title ?? info?.title ?? 'Proem Quiz'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="game play" data-style={style} style={themeVars(theme)}>
	{#if !connected && phase === 'game'}
		<div class="offline" role="status">{L.reconnecting}</div>
	{/if}

	{#if phase === 'pin'}
		<main class="center">
			{#if theme?.logoUrl}<img class="logo" src={theme.logoUrl} alt="" />{/if}
			<form class="g-box card" onsubmit={checkPin}>
				<label for="pin" class="big-label">{L.enterPin}</label>
				<input
					id="pin"
					class="g-input pin"
					inputmode="numeric"
					autocomplete="one-time-code"
					pattern="[0-9 ]*"
					maxlength="7"
					placeholder="000 000"
					bind:value={pin}
					oninput={() => (pin = pin.replace(/\D/g, '').slice(0, 6))}
				/>
				{#if error}<p class="err" role="alert">{error}</p>{/if}
				<button class="g-btn wide" disabled={busy || pin.length !== 6}>{L.go}</button>
				<p class="hint">{L.pinHint}</p>
			</form>
		</main>
	{:else if phase === 'nick' && info}
		<main class="center">
			<h1 class="title">{info.title}</h1>
			<form class="g-box card" onsubmit={join}>
				<span class="big-label">{team ? L.teamName : L.yourNick}</span>
				{#if !ownNick}
					<div class="nick-show">{suggestion}</div>
					<button type="button" class="g-btn ghost wide" onclick={reroll}>🎲 {L.drawAgain}</button>
					{#if info.nicknameMode !== 'random-only'}
						<button type="button" class="linkish" onclick={() => (ownNick = true)}>{L.ownNick}</button>
					{/if}
				{:else}
					<input class="g-input" maxlength="20" bind:value={nick} autocomplete="off" autocapitalize="words" aria-label={team ? L.teamName : L.yourNick} />
					<button type="button" class="linkish" onclick={() => (ownNick = false)}>🎲 {L.drawAgain}</button>
				{/if}
				{#if error}<p class="err" role="alert">{error}</p>{/if}
				<button class="g-btn wide" disabled={busy || (ownNick && nick.trim().length < 2)}>{L.join}</button>
			</form>
		</main>
	{:else if phase === 'kicked' || phase === 'replaced'}
		<main class="center">
			<div class="g-box card msg">
				<p>{phase === 'kicked' ? L.kicked : L.replaced}</p>
				<button class="g-btn wide" onclick={() => { leaveGame(); location.reload(); }}>{L.go}</button>
			</div>
		</main>
	{:else if gs}
		<header class="top">
			<span class="g-chip nick">{gs.me.nick}</span>
			<span class="g-chip score">{pts(gs.me.score)} {L.points}</span>
		</header>

		{#if gs.state === 'lobby'}
			<main class="center">
				<div class="g-box card msg">
					<p class="huge">{L.youAreIn}</p>
					<p>{L.waitForStart}</p>
				</div>
			</main>
		{:else if (gs.state === 'intro' || gs.state === 'question') && q}
			<div class="qhead">
				<span>{L.question} {q.index + 1} {L.of} {q.total}</span>
				{#if gs.state === 'question'}<span class="secs">{Math.ceil(left / 1000)}</span>{/if}
			</div>
			{#if gs.state === 'question'}
				<div class="bar" aria-hidden="true"><div style:width="{Math.min(100, (left / (q.timeLimit * 1000)) * 100)}%"></div></div>
			{/if}
			<h1 class="prompt">{q.prompt}</h1>
			{#if q.promptTranslation}<p class="translation">{q.promptTranslation}</p>{/if}

			{#if gs.state === 'intro'}
				<main class="center"><p class="huge">{L.getReady}</p></main>
			{:else if sent}
				<main class="center">
					<div class="g-box card msg">
						<p class="huge">{L.answerSent}</p>
						<p>{L.waitOthers}</p>
					</div>
				</main>
			{:else if q.type === 'choice' || q.type === 'audio'}
				<main class="tiles" class:two={answerCount <= 2} class:text={!!q.answers}>
					{#each Array(answerCount) as _, i}
						<button class="g-tile a{i}" onclick={() => answer({ choice: i })} aria-label={q.answers?.[i] ?? `${i + 1}`}>
							{#if style === 'calm'}<span class="badge">{String.fromCharCode(65 + i)}</span>
							{:else}<Shape {i} size={q.answers ? 34 : 72} color={shapeColor(style)} />{/if}
							{#if q.answers}<span class="tile-text">{q.answers[i]}</span>{/if}
						</button>
					{/each}
				</main>
				{#if !q.answers}<p class="hint">{L.lookAtScreen}</p>{/if}
			{:else if q.type === 'truefalse'}
				<main class="tiles two text">
					<button class="g-tile a1" onclick={() => answer({ choice: true })}><Shape i={1} size={34} color={shapeColor(style)} /><span class="tile-text">{L.true}</span></button>
					<button class="g-tile a0" onclick={() => answer({ choice: false })}><Shape i={0} size={34} color={shapeColor(style)} /><span class="tile-text">{L.false}</span></button>
				</main>
			{:else if q.type === 'text'}
				<form class="stack" onsubmit={(e) => { e.preventDefault(); if (textAnswer.trim()) answer({ text: textAnswer.trim() }); }}>
					<input class="g-input" maxlength="80" bind:value={textAnswer} placeholder={L.typeAnswer} autocomplete="off" autocorrect="off" spellcheck="false" aria-label={L.typeAnswer} />
					<button class="g-btn wide" disabled={!textAnswer.trim()}>{L.send}</button>
				</form>
			{:else if q.type === 'order' && q.items}
				<div class="stack">
					<p class="hint">{L.tapInOrder}</p>
					<ol class="picked">
						{#each picked as id, i}<li class="g-box"><b>{i + 1}.</b> {labelOf(id)}</li>{/each}
					</ol>
					<div class="order-items">
						{#each q.items as it, i}
							<button class="g-tile a{i % 4} order-btn" disabled={picked.includes(it.id)} class:dim={picked.includes(it.id)} onclick={() => pick(it.id)}>
								<span class="tile-text">{it.label}</span>
							</button>
						{/each}
					</div>
					<div class="row">
						<button class="g-btn ghost" onclick={() => (picked = [])} disabled={!picked.length}>{L.reset}</button>
						<button class="g-btn grow" disabled={picked.length !== q.items.length} onclick={() => answer({ order: picked })}>{L.send}</button>
					</div>
				</div>
			{/if}
		{:else if gs.state === 'reveal' && gs.result}
			<main class="center result" class:good={gs.result.correct} class:bad={!gs.result.correct}>
				<div class="g-box card msg">
					<p class="huge">{gs.result.missed ? L.missed : gs.result.correct ? L.correct : L.wrong}</p>
					{#if gs.result.points > 0}<p class="g-chip plus">+{pts(gs.result.points)}</p>{/if}
					{#if gs.result.bonus > 0}<p>{L.streak} {gs.me.streak} · +{gs.result.bonus} {L.bonus}</p>{/if}
					{#if gs.rank}<p class="rank">{L.atPlace(gs.rank)}</p>{/if}
				</div>
			</main>
		{:else if gs.state === 'leaderboard' || gs.state === 'ended'}
			<main class="center">
				<div class="g-box card msg">
					{#if gs.state === 'ended'}<p class="huge">{L.gameOver}</p>{/if}
					{#if gs.rank}<p class="place">{gs.rank}.</p><p>{L.place} / {gs.players}</p>{/if}
					<p class="g-chip">{pts(gs.me.score)} {L.points}</p>
					{#if gs.state !== 'ended'}
						<p>{gs.rank === 1 ? L.leader : `${pts(gs.behindBy ?? 0)} ${L.behind}`}</p>
					{:else}
						<p>{L.thanks}</p>
					{/if}
				</div>
			</main>
		{/if}
	{/if}
</div>

<style>
	:global(body) { margin: 0; overscroll-behavior: none; }
	.play {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
		max-width: 560px;
		margin: 0 auto;
	}
	.center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
	.card { width: 100%; padding: 22px; display: flex; flex-direction: column; gap: 14px; }
	.logo { max-height: 64px; max-width: 70%; }
	.big-label { font-size: 1.3rem; font-weight: 900; }
	.pin { font-size: 2.2rem; text-align: center; letter-spacing: 0.25em; font-variant-numeric: tabular-nums; }
	.wide { width: 100%; }
	.hint { text-align: center; font-weight: 600; opacity: 0.8; margin: 0; }
	.err { background: #fff; color: #b0001e; border: 2px solid #b0001e; padding: 10px 12px; font-weight: 800; margin: 0; }
	.title { font-size: 1.6rem; margin: 0; text-align: center; }
	.nick-show { font-size: 1.8rem; font-weight: 900; text-align: center; padding: 8px 0; word-break: break-word; }
	.linkish { background: none; border: 0; font: inherit; font-weight: 700; text-decoration: underline; color: inherit; cursor: pointer; padding: 6px; min-height: 44px; }
	.msg { text-align: center; }
	.msg p { margin: 0; }
	.huge { font-size: 1.9rem; font-weight: 900; }
	.top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
	.nick { max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; }
	.qhead { display: flex; justify-content: space-between; font-weight: 800; }
	.secs { font-size: 1.4rem; font-variant-numeric: tabular-nums; }
	.bar { height: 10px; background: rgba(0, 0, 0, 0.12); border-radius: var(--radius); overflow: hidden; }
	.bar div { height: 100%; background: var(--accent); transition: width 0.2s linear; }
	.prompt { font-size: 1.45rem; margin: 4px 0 0; line-height: 1.2; }
	.translation { margin: 0; font-weight: 600; opacity: 0.8; }
	.tiles { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-height: 52vh; }
	.tiles.text { grid-template-columns: 1fr; }
	.tiles.two:not(.text) { grid-template-columns: 1fr; }
	.tiles .g-tile { justify-content: center; padding: 14px; font-size: 1.25rem; min-height: 72px; }
	.tiles.text .g-tile { justify-content: flex-start; }
	.tile-text { word-break: break-word; }
	.stack { display: flex; flex-direction: column; gap: 12px; }
	.picked { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-height: 20px; }
	.picked li { padding: 10px 12px; font-weight: 800; }
	.order-items { display: grid; grid-template-columns: 1fr; gap: 10px; }
	.order-btn { padding: 14px; min-height: 56px; font-size: 1.1rem; }
	.row { display: flex; gap: 10px; }
	.grow { flex: 1; }
	.result.good :global(.g-box) { background: var(--a3); }
	.result.bad :global(.g-box) { background: var(--a0); }
	.plus { align-self: center; font-size: 1.6rem; }
	.place { font-size: 4rem; font-weight: 900; line-height: 1; }
	.rank { font-weight: 800; }
	.offline { position: fixed; top: env(safe-area-inset-top); left: 0; right: 0; text-align: center; background: #111; color: #fff; padding: 6px; font-weight: 700; z-index: 10; }
	button:focus-visible { outline: 3px solid #111; outline-offset: 3px; }
</style>
