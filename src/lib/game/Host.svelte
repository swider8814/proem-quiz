<script lang="ts">
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	const PH = $derived(panelDict(page.data.lang).host);
	import { onMount } from 'svelte';
	import type { Socket } from 'socket.io-client';
	import './game.css';
	import Shape from './Shape.svelte';
	import { ask, gameSocket, keepAwake, remaining } from './client.js';
	import { t } from './i18n.js';
	import { shapeColor, themeVars, type GameTheme } from './theme.js';

	type Props = { pin: string; hostToken: string; qr: string; joinHost: string; onClosed: () => void };
	let { pin, hostToken, qr, joinHost, onClosed }: Props = $props();

	type HQ = {
		index: number; total: number; type: string; timeLimit: number; multiplier: number;
		prompt: string; promptTranslation: string | null; answers?: string[]; items?: { id: string; label: string }[];
		imageUrl?: string | null; audio?: { url: string; loop: boolean; revealUrl: string | null };
	};
	type HS = {
		pin: string; state: 'lobby' | 'intro' | 'question' | 'reveal' | 'leaderboard' | 'ended';
		title: string; locale: string; theme: GameTheme; settings: { teamMode: boolean };
		totalQuestions: number; players?: { id: string; nick: string; connected: boolean }[]; playerCount: number;
		now: number; question?: HQ; deadline?: number | null; answered?: number;
		solution?: { correct?: number[] | boolean; accepted?: string[]; order?: string[] };
		distribution?: { counts?: number[]; correct?: number; wrong?: number };
		ranking?: { id: string; nick: string; score: number; rank: number }[];
	};

	let socket: Socket | null = null;
	let hs = $state<HS | null>(null);
	let offset = $state(0);
	let now = $state(Date.now());
	let answered = $state({ count: 0, total: 0 });
	let error = $state('');
	let audio: HTMLAudioElement | null = null;
	let audioUrl = '';
	let audioStop: ReturnType<typeof setTimeout> | null = null;
	let playing = $state(false);

	const L = $derived(t(hs?.locale));
	const theme = $derived(hs?.theme ?? null);
	const style = $derived(theme?.style ?? 'poster');
	const left = $derived.by(() => {
		void now;
		return remaining(hs?.deadline, offset);
	});
	const q = $derived(hs?.question);

	function stopAudio() {
		if (audioStop) clearTimeout(audioStop);
		audio?.pause();
		playing = false;
	}

	function prepareAudio(url: string) {
		if (audioUrl === url && audio) return;
		stopAudio();
		audio = new Audio(url);
		audio.preload = 'auto';
		audio.load();
		audioUrl = url;
		audio.onplaying = () => (playing = true);
		audio.onpause = () => (playing = false);
		audio.onended = () => (playing = false);
	}

	async function playClip() {
		if (!audio || !q?.audio) return;
		audio.loop = q.audio.loop;
		audio.currentTime = 0;
		try {
			await audio.play();
		} catch {
			error = PH.audioBlocked(L.replay);
		}
	}

	/** Dłuższy fragment po odpowiedzi: plik źródłowy z zakresem "#t=start,end". */
	async function playReveal() {
		const r = q?.audio?.revealUrl;
		if (!r) return;
		const [url, frag] = r.split('#t=');
		const [s, e] = (frag ?? '').split(',').map(Number);
		stopAudio();
		audio = new Audio(url);
		audioUrl = '';
		audio.onplaying = () => (playing = true);
		audio.onpause = () => (playing = false);
		audio.currentTime = Number.isFinite(s) ? s : 0;
		try {
			await audio.play();
			if (Number.isFinite(e) && Number.isFinite(s)) audioStop = setTimeout(stopAudio, (e - s) * 1000);
		} catch {
			/* bez dźwięku */
		}
	}

	function onState(s: HS) {
		offset = s.now - Date.now();
		const prev = hs;
		hs = s;
		answered = { count: s.answered ?? 0, total: s.playerCount };
		const sq = s.question;
		if (s.state === 'intro' && sq?.audio) prepareAudio(sq.audio.url);
		if (s.state === 'question' && sq?.audio && prev?.state !== 'question') {
			prepareAudio(sq.audio.url);
			playClip();
		}
		if (s.state === 'reveal' && prev?.state === 'question') {
			stopAudio();
			if (sq?.audio?.revealUrl) playReveal();
		}
		if (s.state === 'leaderboard' || s.state === 'ended' || s.state === 'lobby') stopAudio();
	}

	onMount(() => {
		socket = gameSocket({ role: 'host', pin, token: hostToken });
		socket.on('state', onState);
		socket.on('answers', (a: { count: number; total: number }) => (answered = a));
		socket.on('connect_error', (e) => {
			if (e.message === 'unauthorized') onClosed();
			else error = PH.noConnection;
		});
		socket.on('connect', () => (error = ''));
		const tick = setInterval(() => (now = Date.now()), 200);
		const unlock = keepAwake();
		return () => {
			clearInterval(tick);
			unlock();
			stopAudio();
			socket?.disconnect();
		};
	});

	async function cmd(name: string, arg?: Record<string, unknown>) {
		const r = await ask<{ ok?: boolean; error?: string }>(socket!, name, arg ?? {});
		if (r.error === 'no-players') error = L.waitingForPlayers;
		else if (r.error && r.error !== 'invalid-state') error = r.error;
		else error = '';
	}

	function next() {
		if (!hs) return;
		if (hs.state === 'question') return cmd('host:skip');
		if (hs.state === 'ended') return;
		cmd('host:next');
	}

	async function closeGame() {
		if (!confirm(PH.closeConfirm)) return;
		await cmd('host:close');
		onClosed();
	}

	function soundTest() {
		try {
			const ctx = new AudioContext();
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.frequency.value = 660;
			g.gain.setValueAtTime(0.2, ctx.currentTime);
			g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
			o.connect(g).connect(ctx.destination);
			o.start();
			o.stop(ctx.currentTime + 0.8);
		} catch {
			/* brak Web Audio */
		}
	}

	function fullscreen() {
		if (document.fullscreenElement) document.exitFullscreen();
		else document.documentElement.requestFullscreen?.().catch(() => {});
	}

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
		if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') {
			e.preventDefault();
			next();
		} else if (e.key === 'f' || e.key === 'F') fullscreen();
		else if ((e.key === 'r' || e.key === 'R') && q?.audio) playClip();
	}

	const isCorrect = (i: number) => {
		const c = hs?.solution?.correct;
		return Array.isArray(c) ? c.includes(i) : false;
	};
	const pinFmt = (p: string) => `${p.slice(0, 3)} ${p.slice(3)}`;
	const maxCount = $derived(Math.max(1, ...(hs?.distribution?.counts ?? [1])));
	const nextLabel = $derived(
		!hs ? '' : hs.state === 'lobby' ? L.start : hs.state === 'question' ? L.skip : hs.state === 'leaderboard' && q && q.index + 1 >= q.total ? L.podium : L.next
	);
</script>

<svelte:window onkeydown={onKey} />

<div class="game host" data-style={style} style={themeVars(theme)}>
	{#if !hs}
		<p class="center big">{PH.connecting}</p>
	{:else}
		<header class="bar">
			<span class="brand">{#if theme?.logoUrl}<img src={theme.logoUrl} alt="" />{:else}{(theme?.name ?? 'Proem').split(' – ')[0]}{/if}</span>
			{#if q && hs.state !== 'lobby'}<span class="g-chip">{L.question} {q.index + 1} {L.of} {q.total}</span>{/if}
			<span class="g-chip pinchip">PIN {pinFmt(hs.pin)}</span>
		</header>

		{#if hs.state === 'lobby'}
			<section class="lobby">
				<div class="g-box join">
					<div>
						<p class="lead">{L.joinAt} <strong>{joinHost}</strong> {L.andEnterPin}:</p>
						<p class="pin">{pinFmt(hs.pin)}</p>
					</div>
					<img class="qr" src={qr} alt={PH.qrAlt} />
				</div>
				<div class="count g-box">
					<span class="n">{hs.playerCount}</span>
					<span>{hs.settings.teamMode ? L.teams : L.players}</span>
				</div>
			</section>
			<ul class="players">
				{#each hs.players ?? [] as p (p.id)}
					<li class="g-chip player" class:off={!p.connected}>
						<span>{p.nick}</span>
						<button class="mini" onclick={() => cmd('host:rename', { playerId: p.id })} aria-label="{L.randomNick}: {p.nick}" title={L.randomNick}>↻</button>
						<button class="mini" onclick={() => cmd('host:kick', { playerId: p.id })} aria-label="{L.removePlayer}: {p.nick}" title={L.removePlayer}>✕</button>
					</li>
				{:else}
					<li class="waiting">{L.waitingForPlayers}</li>
				{/each}
			</ul>
		{:else if (hs.state === 'intro' || hs.state === 'question' || hs.state === 'reveal') && q}
			<section class="question">
				<div class="g-box promptbox">
					<h1>{q.prompt}</h1>
					{#if q.promptTranslation}<p class="tr">{q.promptTranslation}</p>{/if}
				</div>
				<div class="mid">
					{#if hs.state === 'question'}
						<div class="timer g-box">{Math.ceil(left / 1000)}</div>
					{:else}<div class="timer-space"></div>{/if}
					<div class="media">
						{#if q.imageUrl}<img src={q.imageUrl} alt="" />{/if}
						{#if q.audio}
							<div class="eq" class:on={playing} aria-hidden="true">
								{#each Array(24) as _, i}<span style:animation-delay="{(i % 7) * 0.09}s"></span>{/each}
							</div>
							<p class="listen">{hs.state === 'intro' ? L.getReady : L.listen}</p>
							<button class="g-btn ghost small" onclick={playClip}>↻ {L.replay}</button>
						{/if}
						{#if hs.state === 'intro' && !q.audio && !q.imageUrl}<p class="listen big">{L.getReady}</p>{/if}
						{#if hs.state === 'reveal' && hs.distribution?.counts}
							<div class="dist">
								{#each hs.distribution.counts as c, i}
									<div class="col">
										<span class="num">{c}</span>
										<div class="barv a{i}" class:dim={hs.solution && !(q.type === 'truefalse' ? (i === 0) === hs.solution.correct : isCorrect(i))} style:height="{(c / maxCount) * 100}%"></div>
									</div>
								{/each}
							</div>
						{:else if hs.state === 'reveal' && hs.distribution}
							<p class="listen">{hs.distribution.correct} {L.correctCount} · {hs.distribution.wrong} {L.wrongCount}</p>
						{/if}
					</div>
					{#if hs.state !== 'intro'}
						<div class="count g-box"><span class="n">{answered.count}</span><span>{L.answers}</span></div>
					{:else}<div class="timer-space"></div>{/if}
				</div>
				{#if hs.state !== 'intro'}
					{#if q.answers}
						<div class="answers">
							{#each q.answers as a, i}
								<div class="g-tile a{i}" class:dim={hs.state === 'reveal' && !isCorrect(i)}>
									{#if style === 'calm'}<span class="badge">{String.fromCharCode(65 + i)}</span>
									{:else}<Shape {i} size={40} color={shapeColor(style)} />{/if}
									<span>{a}</span>
									{#if hs.state === 'reveal' && isCorrect(i)}<span class="tick">✓</span>{/if}
								</div>
							{/each}
						</div>
					{:else if q.type === 'truefalse'}
						<div class="answers">
							<div class="g-tile a1" class:dim={hs.state === 'reveal' && hs.solution?.correct !== true}><Shape i={1} size={40} color={shapeColor(style)} /><span>{L.true}</span></div>
							<div class="g-tile a0" class:dim={hs.state === 'reveal' && hs.solution?.correct !== false}><Shape i={0} size={40} color={shapeColor(style)} /><span>{L.false}</span></div>
						</div>
					{:else if q.type === 'order' && q.items}
						<div class="answers list">
							{#if hs.state === 'reveal' && hs.solution?.order}
								<p class="label">{L.correctOrder}:</p>
								{#each hs.solution.order as id, i}<div class="g-tile a{i % 4}"><b>{i + 1}.</b> {q.items.find((x) => x.id === id)?.label}</div>{/each}
							{:else}
								{#each q.items as it, i}<div class="g-tile a{i % 4}">{it.label}</div>{/each}
							{/if}
						</div>
					{:else if q.type === 'text' && hs.state === 'reveal' && hs.solution?.accepted}
						<div class="answers list"><p class="label">{L.accepted}:</p><div class="g-tile a3">{hs.solution.accepted.join(' / ')}</div></div>
					{/if}
				{/if}
			</section>
		{:else if hs.state === 'leaderboard' || hs.state === 'ended'}
			<section class="board">
				<h1>{hs.state === 'ended' ? L.podium : L.leaderboard}</h1>
				{#if hs.state === 'ended' && hs.ranking?.length}
					<div class="podium">
						{#each [1, 0, 2] as idx}
							{#if hs.ranking[idx]}
								<div class="step s{idx + 1}">
									<span class="who">{hs.ranking[idx].nick}</span>
									<div class="g-box block"><span class="place">{idx + 1}</span><span>{hs.ranking[idx].score}</span></div>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
				<ol class="rank">
					{#each hs.ranking?.slice(hs.state === 'ended' ? 3 : 0) ?? [] as r (r.id)}
						<li class="g-box"><span class="pos">{r.rank}.</span><span class="nm">{r.nick}</span><span class="sc">{r.score}</span></li>
					{/each}
				</ol>
			</section>
		{/if}

		<footer class="controls">
			{#if error}<span class="err" role="alert">{error}</span>{/if}
			<span class="spacer"></span>
			{#if hs.state === 'lobby'}<button class="g-btn ghost" onclick={soundTest}>🔊 {L.soundTest}</button>{/if}
			<button class="g-btn ghost" onclick={fullscreen} title="F">⛶ {L.fullscreen}</button>
			{#if hs.state === 'ended'}
				<button class="g-btn" onclick={closeGame}>{L.endGame}</button>
			{:else}
				<button class="g-btn ghost" onclick={() => cmd('host:end')}>{L.endGame}</button>
				<button class="g-btn" onclick={next} title="Spacja">{nextLabel} →</button>
			{/if}
		</footer>
	{/if}
</div>

<style>
	:global(body) { margin: 0; }
	.host { min-height: 100vh; display: flex; flex-direction: column; padding: 2vh 3vw; gap: 2vh; font-size: clamp(14px, 1.4vw, 28px); }
	.center { margin: auto; }
	.big { font-size: 2em; font-weight: 900; }
	.bar { display: flex; align-items: center; justify-content: space-between; gap: 1em; }
	.brand { font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
	.brand img { max-height: 3em; display: block; }
	.pinchip { font-size: 1.1em; letter-spacing: 0.06em; }
	.lobby { display: flex; gap: 2vw; }
	.join { flex: 1; display: flex; align-items: center; gap: 2vw; padding: 2vh 2vw; }
	.lead { margin: 0; font-size: 1.2em; font-weight: 700; }
	.pin { margin: 0; font-size: 5.5em; font-weight: 900; letter-spacing: 0.08em; line-height: 1; font-variant-numeric: tabular-nums; }
	.qr { margin-left: auto; width: 11em; height: 11em; image-rendering: pixelated; background: #fff; padding: 0.3em; }
	.count { width: 9em; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1em; }
	.count .n { font-size: 3.5em; font-weight: 900; line-height: 1; }
	.players { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.6em; align-content: flex-start; flex: 1; overflow: auto; }
	.player { font-size: 1.15em; }
	.player.off { opacity: 0.5; }
	.mini { border: 0; background: rgba(0, 0, 0, 0.12); color: inherit; border-radius: 50%; width: 1.8em; height: 1.8em; cursor: pointer; font: inherit; font-size: 0.8em; }
	.waiting { font-weight: 800; font-size: 1.3em; opacity: 0.8; }
	.question { flex: 1; display: flex; flex-direction: column; gap: 2vh; }
	.promptbox { padding: 1.5vh 2vw; text-align: center; }
	.promptbox h1 { margin: 0; font-size: 2.3em; line-height: 1.1; }
	.tr { margin: 0.3em 0 0; font-size: 1.1em; opacity: 0.75; }
	.mid { flex: 1; display: flex; align-items: center; gap: 2vw; min-height: 0; }
	.timer { width: 4.5em; height: 4.5em; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.6em; font-weight: 900; background: var(--accent); flex-shrink: 0; }
	.timer-space { width: 7em; flex-shrink: 0; }
	.media { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1vh; min-height: 0; height: 100%; }
	.media img { max-height: 34vh; max-width: 100%; object-fit: contain; }
	.listen { font-weight: 800; font-size: 1.2em; margin: 0; }
	.small { font-size: 0.8em; min-height: 40px; padding: 0.4em 1em; }
	.eq { display: flex; align-items: flex-end; gap: 0.35em; height: 6em; }
	.eq span { width: 0.6em; height: 20%; background: var(--accent); border: calc(var(--bw) / 2) solid var(--line); }
	.eq.on span { animation: eq 0.6s ease-in-out infinite alternate; }
	@keyframes eq { from { height: 15%; } to { height: 100%; } }
	.dist { display: flex; gap: 2vw; align-items: flex-end; height: 26vh; }
	.col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; width: 5vw; }
	.num { font-weight: 900; font-size: 1.4em; }
	.barv { width: 100%; min-height: 6px; border: var(--bw) solid var(--line); }
	.barv.a0 { background: var(--a0); } .barv.a1 { background: var(--a1); } .barv.a2 { background: var(--a2); } .barv.a3 { background: var(--a3); }
	.barv.dim { opacity: 0.3; }
	.answers { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5vh 1.2vw; }
	.answers .g-tile { min-height: 11vh; padding: 0 1.5vw; font-size: 1.5em; cursor: default; }
	.answers.list { grid-template-columns: 1fr 1fr; }
	.label { grid-column: 1 / -1; margin: 0; font-weight: 800; }
	.tick { margin-left: auto; font-size: 1.4em; }
	.board { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2vh; }
	.board h1 { margin: 0; font-size: 2.5em; }
	.podium { display: flex; align-items: flex-end; gap: 2vw; }
	.step { display: flex; flex-direction: column; align-items: center; gap: 0.5em; width: 14vw; }
	.who { font-weight: 900; font-size: 1.3em; text-align: center; word-break: break-word; }
	.block { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 800; }
	.s1 .block { height: 24vh; background: var(--accent); } .s2 .block { height: 17vh; } .s3 .block { height: 12vh; }
	.place { font-size: 3em; font-weight: 900; line-height: 1; }
	.rank { list-style: none; padding: 0; margin: 0; width: min(60vw, 900px); display: flex; flex-direction: column; gap: 1vh; }
	.rank li { display: flex; align-items: center; gap: 1em; padding: 0.6em 1em; font-weight: 800; font-size: 1.2em; }
	.nm { flex: 1; }
	.controls { display: flex; align-items: center; gap: 0.8em; }
	.controls .g-btn { font-size: 0.85em; }
	.spacer { flex: 1; }
	.err { font-weight: 800; background: #fff; color: #b0001e; padding: 0.3em 0.8em; }
</style>
