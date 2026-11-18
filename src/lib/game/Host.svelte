<script lang="ts">
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	const PH = $derived(panelDict(page.data.lang).host);
	import { onMount } from 'svelte';
	import type { Socket } from 'socket.io-client';
	import './game.css';
	import Shape from './Shape.svelte';
	import Icon from '#lib/Icon.svelte';
	import Medal from './Medal.svelte';
	import Avatar from './Avatar.svelte';
	import Confetti from './Confetti.svelte';
	import { fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { Music, playPodium, type MusicKind, type PodiumSound } from './sounds.js';
	import { ask, gameSocket, keepAwake, remaining } from './client.js';
	import { t } from './i18n.js';
	import { logoFor, shapeColor, themeVars, type GameTheme } from './theme.js';

	/**
	 * mode="operator": okno prowadzącego – połączenie z serwerem, sterowanie, dźwięk.
	 * mode="screen": okno dla widzów (projektor) – bez przycisków i bez połączenia z serwerem;
	 * dostaje stan z okna prowadzącego przez BroadcastChannel (ta sama przeglądarka i domena).
	 */
	type Props = {
		mode?: 'operator' | 'screen';
		quizId: string;
		pin?: string; hostToken?: string; qr?: string; joinHost?: string;
		onClosed?: () => void;
	};
	let { mode = 'operator', quizId, pin = '', hostToken = '', qr: qrProp = '', joinHost: joinHostProp = '', onClosed = () => {} }: Props = $props();
	const isScreen = $derived(mode === 'screen');
	let qrRecv = $state('');
	let joinHostRecv = $state('');
	const qr = $derived(isScreen ? qrRecv : qrProp);
	const joinHost = $derived(isScreen ? joinHostRecv : joinHostProp);

	type HQ = {
		index: number; total: number; type: string; timeLimit: number; multiplier: number;
		prompt: string; promptTranslation: string | null; answers?: string[]; items?: { id: string; label: string }[];
		slider?: { min: number; max: number; step: number; unit: string }; text?: string;
		thumbs?: boolean; answerImages?: (string | null)[]; imageUrl?: string | null; audio?: { url: string; loop: boolean; revealUrl: string | null };
	};
	type HS = {
		pin: string; state: 'lobby' | 'intro' | 'question' | 'reveal' | 'leaderboard' | 'ended';
		title: string; locale: string; theme: GameTheme; settings: { teamMode: boolean; podiumSound?: PodiumSound; podiumUrl?: string | null; music?: MusicKind; musicUrl?: string | null; musicLobby?: boolean; musicQuestions?: boolean };
		totalQuestions: number; players?: { id: string; nick: string; avatar?: number; connected: boolean; members?: string[] }[]; playerCount: number;
		now: number; question?: HQ; deadline?: number | null; introEnds?: number | null; answered?: number;
		solution?: { correct?: number[] | boolean; accepted?: string[]; order?: string[]; value?: number; margin?: number; unit?: string };
		distribution?: { counts?: number[]; correct?: number; wrong?: number; average?: number | null };
		ranking?: { id: string; nick: string; avatar?: number; score: number; rank: number; members?: string[] }[];
		standings?: { id: string; nick: string; avatar?: number; score: number; rank: number; connected: boolean }[];
	};
	type ScreenMsg =
		| { t: 'state'; hs: HS; offset: number; answered: { count: number; total: number }; playing: boolean; qr: string; joinHost: string }
		| { t: 'closed' }
		| { t: 'hello' | 'ping' | 'bye' | 'next' | 'replay' | 'op' | 'op-bye' };

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
	/** Odliczanie przed pytaniem: 5, 4, 3, 2, 1. */
	const introLeft = $derived.by(() => {
		void now;
		return Math.max(1, Math.ceil(remaining(hs?.introEnds, offset) / 1000));
	});
	/** Nowy widok = animacja wejścia; pytanie → wyniki zostają na tym samym ekranie. */
	const viewKey = $derived(!hs ? '' : hs.state === 'question' || hs.state === 'reveal' ? `q${q?.index}` : `${hs.state}${q?.index ?? ''}`);
	// Podium: 3. miejsce, potem 2., na końcu 1. z konfetti i fanfarą (ms od wejścia na ekran).
	const PODIUM_DELAY: Record<number, number> = { 2: 700, 1: 2300, 0: 4100 };
	const PODIUM_REST = 5600;
	let showPlayers = $state(false);
	const disconnected = $derived(hs?.standings?.filter((r) => !r.connected).length ?? 0);

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
		if (s.state === 'ended' && prev && prev.state !== 'ended' && s.ranking?.length) fanfare();
		syncMusic();
	}

	// Muzyka w tle (tylko okno prowadzącego): poczekalnia oraz odliczanie i pytania bez własnego audio.
	const music = new Music();
	let musicOff = $state(false);
	function syncMusic() {
		const set = hs?.settings;
		const st = hs?.state;
		const want =
			!musicOff && set && set.music !== 'none' &&
			((st === 'lobby' && set.musicLobby !== false) || ((st === 'intro' || st === 'question') && set.musicQuestions !== false && !hs?.question?.audio));
		if (want) music.play(set.music ?? 'calm', set.musicUrl, st === 'lobby' ? 1 : 0.7);
		else music.stop();
	}
	function toggleMusic() {
		musicOff = !musicOff;
		syncMusic();
	}

	let stopPodium: (() => void) | null = null;
	/** Dźwięk na podium (z ustawień quizu) w chwili pokazania 1. miejsca. */
	function fanfare() {
		stopPodium?.();
		const set = hs?.settings;
		stopPodium = playPodium(set?.podiumSound ?? 'fanfare', { firstAt: PODIUM_DELAY[0], secondAt: PODIUM_DELAY[1], url: set?.podiumUrl });
	}

	function kickPlayer(p: { id: string; nick: string }) {
		if (confirm(PH.kickConfirm(p.nick))) cmd('host:kick', { playerId: p.id });
	}

	function endGame() {
		if (confirm(PH.endConfirm)) cmd('host:end');
	}

	// ── Okno dla widzów ────────────────────────────────────────────────
	// Kanał konkretnej gry (PIN): ten sam quiz prowadzony równocześnie w dwóch salach się nie miesza.
	const channelName = $derived(`pq-screen-${quizId}-${pin}`);
	let channel: BroadcastChannel | null = null;
	let screenSeen = $state(0);
	let screenClosed = $state(false);
	/** Ekran widzów: kiedy ostatnio odezwało się okno prowadzącego (0 = pożegnało się). */
	let opSeen = $state(0);
	const opLost = $derived(isScreen && hs !== null && now - opSeen > 6000);
	const screenOn = $derived(!isScreen && now - screenSeen < 5000);

	function post(m: ScreenMsg) {
		try {
			channel?.postMessage(m);
		} catch {
			/* kanał zamknięty */
		}
	}

	function broadcast() {
		if (!hs) return;
		post({ t: 'state', hs: $state.snapshot(hs) as HS, offset, answered: $state.snapshot(answered), playing, qr, joinHost });
	}

	// Każda zmiana stanu w oknie prowadzącego trafia od razu na ekran widzów.
	$effect(() => {
		if (isScreen || !hs) return;
		void answered.count;
		void playing;
		broadcast();
	});

	function openScreen() {
		const w = window.open(`/panel/quizzes/${quizId}/screen?pin=${pin}`, channelName, 'popup,width=1280,height=720');
		if (!w) {
			error = PH.popupBlocked;
			return;
		}
		// Jeśli przeglądarka zna drugi ekran (Window Management API, Chrome/Edge), przenieś tam okno.
		const wm = window as unknown as { getScreenDetails?: () => Promise<{ screens: { availLeft: number; availTop: number; availWidth: number; availHeight: number; isPrimary: boolean }[]; currentScreen: unknown }> };
		wm.getScreenDetails?.()
			.then((d) => {
				const other = d.screens.find((x) => x !== d.currentScreen && !x.isPrimary) ?? d.screens.find((x) => x !== d.currentScreen);
				if (other && !w.closed) {
					w.moveTo(other.availLeft, other.availTop);
					w.resizeTo(other.availWidth, other.availHeight);
				}
			})
			.catch(() => {});
		w.focus();
	}

	function onChannel(e: MessageEvent<ScreenMsg>) {
		const m = e.data;
		if (!m || typeof m !== 'object') return;
		if (isScreen) {
			opSeen = m.t === 'op-bye' ? 0 : Date.now();
			if (m.t === 'state') {
				offset = m.offset;
				const prevState = hs?.state;
				hs = m.hs;
				answered = m.answered;
				playing = m.playing;
				qrRecv = m.qr;
				joinHostRecv = m.joinHost;
				screenClosed = false;
				if (prevState !== hs.state) wakeCursor();
			} else if (m.t === 'closed') {
				hs = null;
				screenClosed = true;
			}
			return;
		}
		if (m.t === 'hello' || m.t === 'ping') {
			screenSeen = Date.now();
			if (m.t === 'hello') broadcast();
		} else if (m.t === 'bye') screenSeen = 0;
		else if (m.t === 'next') next();
		else if (m.t === 'replay' && q?.audio) playClip();
	}

	// Kursor znika na ekranie widzów po chwili bez ruchu myszy.
	let cursorHidden = $state(false);
	let cursorTimer: ReturnType<typeof setTimeout> | null = null;
	function wakeCursor() {
		cursorHidden = false;
		if (cursorTimer) clearTimeout(cursorTimer);
		cursorTimer = setTimeout(() => (cursorHidden = true), 2500);
	}

	onMount(() => {
		if (typeof BroadcastChannel !== 'undefined') {
			channel = new BroadcastChannel(channelName);
			channel.onmessage = onChannel;
		}
		const tick = setInterval(() => (now = Date.now()), 200);
		if (isScreen) {
			post({ t: 'hello' });
			const ping = setInterval(() => post({ t: 'ping' }), 2000);
			const bye = () => post({ t: 'bye' });
			addEventListener('pagehide', bye);
			wakeCursor();
			const unlock = keepAwake();
			return () => {
				bye();
				removeEventListener('pagehide', bye);
				clearInterval(ping);
				clearInterval(tick);
				if (cursorTimer) clearTimeout(cursorTimer);
				unlock();
				channel?.close();
			};
		}
		// Sygnał życia dla ekranu widzów: bez niego ekran po kilku sekundach przestaje udawać trwającą grę.
		const op = setInterval(() => post({ t: 'op' }), 2000);
		const opBye = () => post({ t: 'op-bye' });
		addEventListener('pagehide', opBye);
		const stopOperator = startOperator(tick);
		return () => {
			clearInterval(op);
			removeEventListener('pagehide', opBye);
			opBye();
			stopOperator();
		};
	});

	function startOperator(tick: ReturnType<typeof setInterval>) {
		socket = gameSocket({ role: 'host', pin, token: hostToken });
		socket.on('state', onState);
		socket.on('answers', (a: { count: number; total: number }) => (answered = a));
		socket.on('connect_error', (e) => {
			if (e.message === 'unauthorized') onClosed();
			else error = PH.noConnection;
		});
		socket.on('connect', () => (error = ''));
		const unlock = keepAwake();
		return () => {
			clearInterval(tick);
			unlock();
			stopAudio();
			music.stop();
			stopPodium?.();
			socket?.disconnect();
			channel?.close();
		};
	}

	async function cmd(name: string, arg?: Record<string, unknown>) {
		const r = await ask<{ ok?: boolean; error?: string }>(socket!, name, arg ?? {});
		if (r.error === 'no-players') error = L.waitingForPlayers;
		else if (r.error && r.error !== 'invalid-state') error = r.error;
		else error = '';
	}

	function next() {
		if (!hs) return;
		if (hs.state === 'question' && q?.type !== 'slide') return cmd('host:skip');
		if (hs.state === 'ended') return;
		cmd('host:next');
	}

	async function closeGame() {
		if (!confirm(PH.closeConfirm)) return;
		await cmd('host:close');
		post({ t: 'closed' });
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
		if (!isScreen) music.resume();
		if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
		if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') {
			e.preventDefault();
			// Pilot/klawiatura działa też, gdy aktywne jest okno widzów – polecenie idzie do prowadzącego.
			if (isScreen) post({ t: 'next' });
			else next();
		} else if (e.key === 'f' || e.key === 'F') fullscreen();
		else if (e.key === 'r' || e.key === 'R') {
			if (isScreen) post({ t: 'replay' });
			else if (q?.audio) playClip();
		}
	}

	const isCorrect = (i: number) => {
		const c = hs?.solution?.correct;
		return Array.isArray(c) ? c.includes(i) : false;
	};
	const pinFmt = (p: string) => `${p.slice(0, 3)} ${p.slice(3)}`;
	const pct = (c: number) => {
		const total = (hs?.distribution?.counts ?? []).reduce((a, b) => a + b, 0);
		return total ? Math.round((c / total) * 100) : 0;
	};
	const fmtNum = (n: number | undefined) => (n == null ? '' : n.toLocaleString(hs?.locale === 'en' ? 'en-GB' : hs?.locale === 'uk' ? 'uk-UA' : 'pl-PL', { maximumFractionDigits: 2 }));
	const maxCount = $derived(Math.max(1, ...(hs?.distribution?.counts ?? [1])));
	const nextLabel = $derived(
		!hs ? '' : hs.state === 'lobby' ? L.start : hs.state === 'question' && q?.type === 'slide' ? L.next : hs.state === 'question' ? L.skip : hs.state === 'leaderboard' && q && q.index + 1 >= q.total ? L.podium : L.next
	);
</script>

<svelte:window onkeydown={onKey} onpointerdown={() => !isScreen && music.resume()} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="game host"
	class:screen={isScreen}
	class:nocursor={isScreen && cursorHidden}
	data-style={style}
	style={themeVars(theme)}
	onmousemove={isScreen ? wakeCursor : undefined}
	ondblclick={isScreen ? fullscreen : undefined}
>
	{#if !hs || opLost}
		{#if isScreen}
			<div class="center screen-wait">
				<p class="big">{screenClosed ? PH.screenEnded : PH.screenWaiting}</p>
				<p>{PH.screenHint}</p>
			</div>
		{:else}
			<p class="center big">{PH.connecting}</p>
		{/if}
	{:else}
		<header class="bar">
			<span class="brand">{#if logoFor(theme)}<img src={logoFor(theme)} alt="" />{:else}{(theme?.name ?? 'Proem').split(' – ')[0]}{/if}</span>
			{#if q && hs.state !== 'lobby' && q.type !== 'slide'}<span class="g-chip">{L.question} {q.index + 1} {L.of} {q.total}</span>{/if}
			<span class="g-chip pinchip">PIN {pinFmt(hs.pin)}</span>
		</header>

		<div class="main">
		<div class="view">
		{#key viewKey}
		<div class="stage" in:fly={{ y: 28, duration: 450 }}>

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
					<li class="g-chip player" class:off={!p.connected} in:scale={{ start: 0.6, duration: 300, easing: backOut }}>
						{#if p.avatar != null}<Avatar id={p.avatar} size="1.7em" animated />{/if}
						<span>{p.nick}{#if p.members?.length}<small class="members"> · {p.members.join(', ')}</small>{/if}</span>
						{#if !isScreen}
						<button class="mini" onclick={() => cmd('host:rename', { playerId: p.id })} aria-label="{L.randomNick}: {p.nick}" title={L.randomNick}><Icon name="replay" /></button>
						<button class="mini" onclick={() => kickPlayer(p)} aria-label="{L.removePlayer}: {p.nick}" title={L.removePlayer}><Icon name="close" /></button>
						{/if}
					</li>
				{:else}
					<li class="waiting">{L.waitingForPlayers}</li>
				{/each}
			</ul>
		{:else if hs.state === 'intro' && q}
			<section class="intro">
				<div class="g-box promptbox" in:scale={{ start: 0.9, duration: 500, easing: backOut }}>
					<h1>{q.prompt}</h1>
					{#if q.promptTranslation}<p class="tr">{q.promptTranslation}</p>{/if}
				</div>
				<div class="cd-wrap" aria-live="polite">
					{#key introLeft}
						<div class="cd g-box" in:scale={{ start: 1.6, duration: 450, easing: backOut }}>{introLeft}</div>
					{/key}
				</div>
				{#if hs.settings.teamMode && q.slider}
					<p class="listen">{L.teamTalk}</p>
					<p class="listen big-range">{fmtNum(q.slider.min)} – {fmtNum(q.slider.max)}{q.slider.unit ? ` ${q.slider.unit}` : ''}</p>
				{:else if hs.settings.teamMode && (q.answers || q.items)}
					<p class="listen">{L.teamTalk}</p>
					<div class="answers talk">
						{#each q.answers ?? q.items?.map((x) => x.label) ?? [] as a, i}
							<div class="g-tile a{i % 4}" in:scale={{ start: 0.85, delay: 200 + i * 90, duration: 350, easing: backOut }}>
								{#if q.answerImages?.[i]}<img class="ans-img" src={q.answerImages[i]} alt={a || String.fromCharCode(65 + i)} />{/if}
								{a}
							</div>
						{/each}
					</div>
				{:else}
					<p class="listen">{L.getReady}</p>
				{/if}
			</section>
		{:else if hs.state === 'question' && q?.type === 'slide'}
			<section class="slide">
				<h1 class="slide-title" in:fly={{ y: -20, duration: 500 }}>{q.prompt}</h1>
				{#if q.promptTranslation}<p class="tr">{q.promptTranslation}</p>{/if}
				{#if q.imageUrl}<img class="slide-img" src={q.imageUrl} alt="" in:scale={{ start: 0.92, delay: 150, duration: 500 }} />{/if}
				{#if q.text}<p class="slide-text g-box" in:fly={{ y: 20, delay: 250, duration: 500 }}>{q.text}</p>{/if}
			</section>
		{:else if (hs.state === 'question' || hs.state === 'reveal') && q}
			<section class="question">
				<div class="g-box promptbox">
					<h1>{q.prompt}</h1>
					{#if q.promptTranslation}<p class="tr">{q.promptTranslation}</p>{/if}
				</div>
				<div class="mid">
					{#if hs.state === 'question'}
						<div class="timer g-box">{Math.ceil(left / 1000)}</div>
					{:else}<div class="timer-space"></div>{/if}
					<div class="media" class:done={hs.state === 'reveal'}>
						{#if q.imageUrl}<img src={q.imageUrl} alt="" />{/if}
						{#if q.audio}
							<div class="eq" class:on={playing} aria-hidden="true">
								{#each Array(24) as _, i}<span style:animation-delay="{(i % 7) * 0.09}s"></span>{/each}
							</div>
							{#if hs.state !== 'reveal'}<p class="listen">{L.listen}</p>{/if}
							{#if !isScreen}<button class="g-btn ghost small" onclick={playClip}><Icon name="replay" /> {L.replay}</button>{/if}
						{/if}
						{#if hs.state === 'reveal' && hs.distribution?.counts}
							<div class="dist">
								{#each hs.distribution.counts as c, i}
									<div class="col">
										<span class="num">{c}{#if q.type === 'poll'}<small class="pct"> · {pct(c)}%</small>{/if}</span>
										<div class="barv a{q.type === 'truefalse' ? 1 - i : i}" class:dim={q.type !== 'poll' && hs.solution && !(q.type === 'truefalse' ? (i === 0) === hs.solution.correct : isCorrect(i))} style:height="{(c / maxCount) * 100}%"></div>
									</div>
								{/each}
							</div>
						{:else if hs.state === 'reveal' && q.type === 'slider' && hs.solution}
							<div class="slider-res" in:scale={{ start: 0.8, duration: 500, easing: backOut }}>
								<span class="label">{L.correctAnswer}</span>
								<span class="big-val g-box">{fmtNum(hs.solution.value)}{q.slider?.unit ? ` ${q.slider.unit}` : ''}</span>
								{#if hs.distribution?.average != null}<span>{L.average}: <b>{fmtNum(hs.distribution.average)}</b></span>{/if}
								<span>{L.closeEnough(hs.distribution?.correct ?? 0)}</span>
							</div>
						{:else if hs.state === 'question' && q.type === 'slider' && q.slider}
							<p class="listen big-range">{fmtNum(q.slider.min)} – {fmtNum(q.slider.max)}{q.slider.unit ? ` ${q.slider.unit}` : ''}</p>
						{:else if hs.state === 'reveal' && hs.distribution}
							<p class="listen">{hs.distribution.correct} {L.correctCount} · {hs.distribution.wrong} {L.wrongCount}</p>
						{/if}
					</div>
					<div class="count g-box"><span class="n">{answered.count}</span><span>{L.answers}</span></div>
				</div>
					{#if q.answers}
						<div class="answers" class:with-images={!!q.answerImages}>
							{#each q.answers as a, i}
								<div class="g-tile a{i}" class:dim={hs.state === 'reveal' && q.type !== 'poll' && !isCorrect(i)} in:scale={{ start: 0.85, delay: 120 + i * 90, duration: 350, easing: backOut }}>
									{#if style === 'calm'}<span class="badge">{String.fromCharCode(65 + i)}</span>
									{:else}<Shape {i} size={40} color={shapeColor(style)} />{/if}
									{#if q.answerImages?.[i]}<img class="ans-img" src={q.answerImages[i]} alt={a || String.fromCharCode(65 + i)} />{/if}
									{#if a}<span>{a}</span>{/if}
									{#if hs.state === 'reveal' && isCorrect(i)}<span class="tick"><Icon name="check" /></span>{/if}
								</div>
							{/each}
						</div>
					{:else if q.type === 'truefalse'}
						<div class="answers">
							<div class="g-tile a1" class:dim={hs.state === 'reveal' && hs.solution?.correct !== true} in:scale={{ start: 0.85, delay: 120, duration: 350, easing: backOut }}>{#if q.thumbs}<span class="thumb" aria-label={L.true}><Icon name="thumbUp" size="2.6em" /></span>{:else}<Shape i={1} size={40} color={shapeColor(style)} /><span>{L.true}</span>{/if}</div>
							<div class="g-tile a0" class:dim={hs.state === 'reveal' && hs.solution?.correct !== false} in:scale={{ start: 0.85, delay: 210, duration: 350, easing: backOut }}>{#if q.thumbs}<span class="thumb" aria-label={L.false}><Icon name="thumbDown" size="2.6em" /></span>{:else}<Shape i={0} size={40} color={shapeColor(style)} /><span>{L.false}</span>{/if}</div>
						</div>
					{:else if q.type === 'order' && q.items}
						<div class="answers list">
							{#if hs.state === 'reveal' && hs.solution?.order}
								<p class="label">{L.correctOrder}:</p>
								{#each hs.solution.order as id, i}<div class="g-tile a{i % 4}" in:fly={{ x: -30, delay: i * 120, duration: 350 }}><b>{i + 1}.</b> {q.items.find((x) => x.id === id)?.label}</div>{/each}
							{:else}
								{#each q.items as it, i}<div class="g-tile a{i % 4}" in:scale={{ start: 0.85, delay: 120 + i * 90, duration: 350, easing: backOut }}>{it.label}</div>{/each}
							{/if}
						</div>
					{:else if q.type === 'text' && hs.state === 'reveal' && hs.solution?.accepted}
						<div class="answers list"><p class="label">{L.accepted}:</p><div class="g-tile a3" in:scale={{ start: 0.85, duration: 350, easing: backOut }}>{hs.solution.accepted.join(' / ')}</div></div>
					{/if}
			</section>
		{:else if hs.state === 'leaderboard' || hs.state === 'ended'}
			<section class="board">
				<h1>{hs.state === 'ended' ? L.podium : L.leaderboard}</h1>
				{#if hs.state === 'ended' && hs.ranking?.length}
					<div class="podium">
						{#each [1, 0, 2] as idx}
							{#if hs.ranking[idx]}
								<div class="step s{idx + 1}" in:fly={{ y: 260, delay: PODIUM_DELAY[idx], duration: 800, easing: backOut }}>
									<div class="pod-top">
										{#if hs.ranking[idx].avatar != null}<Avatar id={hs.ranking[idx].avatar ?? 0} size="4.2em" animated />{/if}
										<Medal place={idx + 1} size="2.6em" />
									</div>
									<span class="who">{hs.ranking[idx].nick}</span>
									{#if hs.ranking[idx].members?.length}<span class="members">{hs.ranking[idx].members?.join(', ')}</span>{/if}
									<div class="g-box block"><span class="place">{idx + 1}</span><span>{hs.ranking[idx].score}</span></div>
								</div>
							{:else}
								<div class="step"></div>
							{/if}
						{/each}
					</div>
					<Confetti delay={PODIUM_DELAY[0] + 150} />
				{/if}
				<div class="board-row">
				<ol class="rank">
					{#each hs.ranking?.slice(hs.state === 'ended' ? 3 : 0) ?? [] as r, i (r.id)}
						<li class="g-box" class:top={r.rank <= 3} in:fly={{ x: -50, delay: (hs.state === 'ended' ? PODIUM_REST : 150) + i * 110, duration: 400 }}>
							{#if r.rank <= 3}<Medal place={r.rank} />{:else}<span class="pos">{r.rank}.</span>{/if}
							{#if r.avatar != null}<Avatar id={r.avatar} size="1.6em" />{/if}
							<span class="nm">{r.nick}{#if r.members?.length}<small class="members"> · {r.members.join(', ')}</small>{/if}</span><span class="sc">{r.score}</span>
						</li>
					{/each}
				</ol>
				{#if hs.state === 'leaderboard'}
					<!-- Między pytaniami: kod do powrotu dla tych, którzy wypadli z gry (np. „wstecz” na telefonie). -->
					<div class="rejoin g-box" in:fly={{ y: 20, delay: 500, duration: 400 }}>
						<img class="qr-sm" src={qr} alt={PH.qrAlt} />
						<p class="lead">{L.joinAt} <strong>{joinHost}</strong><br />PIN <strong>{pinFmt(hs.pin)}</strong></p>
						<p class="hint">{L.rejoinHint}</p>
						{#if disconnected > 0}<p class="g-chip">{L.disconnected(disconnected)}</p>{/if}
					</div>
				{/if}
				</div>
			</section>
		{/if}

		</div>
		{/key}
		</div>
		{#if !isScreen && hs.state !== 'lobby' && hs.standings && (screenOn || showPlayers)}
			<aside class="side g-box" aria-label={PH.liveRanking} transition:fly={{ x: 60, duration: 300 }}>
				<h2>{PH.liveRanking}</h2>
				<ol>
					{#each hs.standings as r (r.id)}
						<li class:off={!r.connected}>
							<span class="pos">{r.rank}.</span>{#if r.avatar != null}<Avatar id={r.avatar} size="1.3em" />{/if}<span class="nm">{r.nick}</span><span class="sc">{r.score}</span>
							<button class="mini" onclick={() => kickPlayer(r)} aria-label="{L.removePlayer}: {r.nick}" title={L.removePlayer}><Icon name="close" /></button>
						</li>
					{/each}
				</ol>
			</aside>
		{/if}
		</div>

		{#if !isScreen}
		<footer class="controls">
			{#if error}<span class="err" role="alert">{error}</span>{/if}
			{#if screenOn}<span class="g-chip screen-on"><Icon name="screen" /> {PH.screenConnected}</span>{/if}
			<span class="spacer"></span>
			{#if hs.state !== 'lobby' && !screenOn}
				<button class="g-btn ghost" onclick={() => (showPlayers = !showPlayers)} aria-pressed={showPlayers}>{showPlayers ? PH.hidePlayers : PH.showPlayers}</button>
			{/if}
			<button class="g-btn ghost" onclick={openScreen}><Icon name="screen" /> {PH.openScreen}</button>
			{#if hs.state === 'lobby'}<button class="g-btn ghost" onclick={soundTest}><Icon name="sound" /> {L.soundTest}</button>{/if}
			{#if hs.settings.music && hs.settings.music !== 'none'}
				<button class="g-btn ghost" onclick={toggleMusic} aria-pressed={!musicOff}><Icon name="music" /> {musicOff ? PH.musicOn : PH.musicOff}</button>
			{/if}
			<button class="g-btn ghost" onclick={fullscreen} title="F"><Icon name="fullscreen" /> {L.fullscreen}</button>
			{#if hs.state === 'ended'}
				<a class="g-btn ghost" href="/panel/quizzes/{quizId}/reports" target="_blank" rel="noopener">{PH.report}</a>
				<button class="g-btn" onclick={closeGame}>{L.endGame}</button>
			{:else}
				<button class="g-btn ghost" onclick={endGame}>{L.endGame}</button>
				<button class="g-btn" onclick={next} title="Spacja">{nextLabel} <Icon name="next" /></button>
			{/if}
		</footer>
		{/if}
	{/if}
</div>

<style>
	:global(body) { margin: 0; }
	.host { height: 100vh; height: 100dvh; min-height: 0; overflow: hidden; display: flex; flex-direction: column; padding: 2vh 3vw; gap: 2vh; font-size: clamp(14px, 1.4vw, 28px); }
	/* Treść zawsze mieści się w oknie – przyciski prowadzącego nie wyjeżdżają poza ekran. */
	.main { flex: 1; min-height: 0; display: flex; gap: 2vw; }
	.view { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 2vh; }
	.side { width: clamp(14em, 22vw, 22em); display: flex; flex-direction: column; min-height: 0; padding: 1em; font-size: 0.85em; }
	.side h2 { margin: 0 0 0.5em; font-size: 1.2em; }
	.side ol { list-style: none; margin: 0; padding: 0; overflow: auto; display: flex; flex-direction: column; gap: 0.3em; }
	.side li { display: flex; gap: 0.5em; font-weight: 700; }
	.side li.off { opacity: 0.5; }
	.side .sc { font-variant-numeric: tabular-nums; }
	.screen.nocursor, .screen.nocursor * { cursor: none; }
	.screen-wait { text-align: center; padding: 2em; }
	.screen-on { font-size: 0.8em; display: inline-flex; align-items: center; gap: 0.4em; }
	.tick { display: inline-flex; }
	.answers.with-images .g-tile { min-height: 0; padding: 0.6vh 1.2vw; }
	.ans-img { height: 13vh; max-width: 40%; object-fit: contain; background: #fff; border-radius: 0.3em; }
	.pod-top { display: flex; align-items: flex-end; gap: 0.2em; }
	.player { display: inline-flex; align-items: center; gap: 0.4em; }
	.members { font-weight: 600; opacity: 0.75; font-size: 0.8em; }
	.answers.talk { width: 100%; }
	.answers.talk .g-tile { min-height: 7vh; font-size: 1.2em; }
	.slide { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3vh; text-align: center; }
	.slide-title { margin: 0; font-size: 3.2em; line-height: 1.1; }
	.slide-img { max-height: 45vh; max-width: 80%; object-fit: contain; }
	.slide-text { margin: 0; padding: 1em 1.5em; font-size: 1.5em; max-width: 70%; white-space: pre-line; }
	.slider-res { display: flex; flex-direction: column; align-items: center; gap: 1vh; font-size: 1.2em; }
	.big-val { font-size: 2.6em; font-weight: 900; padding: 0.2em 0.8em; }
	.big-range { font-size: 2em; }
	.pct { font-size: 0.7em; opacity: 0.8; }
	.thumb { display: flex; justify-content: center; flex: 1; }
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
	.mini { border: 0; background: rgba(0, 0, 0, 0.12); color: inherit; border-radius: 50%; width: 1.8em; height: 1.8em; padding: 0; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font: inherit; font-size: 0.8em; }
	.waiting { font-weight: 800; font-size: 1.3em; opacity: 0.8; }
	.stage { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 2vh; }
	.intro { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3vh; text-align: center; }
	.intro .promptbox { max-width: 90%; }
	.cd-wrap { height: 9em; display: grid; place-items: center; }
	.cd { width: 7em; height: 7em; border-radius: 50%; display: grid; place-items: center; font-size: 1.6em; font-weight: 900; background: var(--accent); }
	.cd { font-size: 3.2em; width: 2.6em; height: 2.6em; font-variant-numeric: tabular-nums; }
	.side li { align-items: center; }
	.side .mini { margin-left: 0.2em; }
	.rank li.top { font-size: 1.3em; }
	.board-row { display: flex; gap: 2.5vw; align-items: flex-start; justify-content: center; width: 100%; min-height: 0; }
	.board-row .rank { flex: 0 1 auto; }
	.rejoin { width: 15em; flex-shrink: 0; padding: 1em; display: flex; flex-direction: column; align-items: center; gap: 0.5em; text-align: center; font-size: 0.85em; }
	.rejoin p { margin: 0; }
	.rejoin .hint { font-weight: 700; }
	.qr-sm { width: 9em; height: 9em; image-rendering: pixelated; background: #fff; padding: 0.3em; }
	.barv { animation: grow 0.7s cubic-bezier(0.2, 0.8, 0.3, 1.2) both; transform-origin: bottom; }
	@keyframes grow { from { transform: scaleY(0); } }
	.question { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 2vh; }
	.promptbox { padding: 1.5vh 2vw; text-align: center; }
	.promptbox h1 { margin: 0; font-size: 2.3em; line-height: 1.1; }
	.tr { margin: 0.3em 0 0; font-size: 1.1em; opacity: 0.75; }
	.mid { flex: 1; display: flex; align-items: center; gap: 2vw; min-height: 0; }
	.timer { width: 4.5em; height: 4.5em; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.6em; font-weight: 900; background: var(--accent); flex-shrink: 0; }
	.timer-space { width: 7em; flex-shrink: 0; }
	.media { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1vh; min-height: 0; height: 100%; overflow: hidden; }
	.media.done .eq { height: 3em; }
	.media img { max-height: 34vh; max-width: 100%; object-fit: contain; }
	.listen { font-weight: 800; font-size: 1.2em; margin: 0; }
	.small { font-size: 0.8em; min-height: 40px; padding: 0.4em 1em; }
	.eq { display: flex; align-items: flex-end; gap: 0.35em; height: 6em; }
	.eq span { width: 0.6em; height: 20%; background: var(--accent); border: calc(var(--bw) / 2) solid var(--line); }
	.eq.on span { animation: eq 0.6s ease-in-out infinite alternate; }
	@keyframes eq { from { height: 15%; } to { height: 100%; } }
	.dist { display: flex; gap: 2vw; align-items: flex-end; flex: 1 1 26vh; min-height: 6vh; max-height: 26vh; }
	.col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; width: 5vw; }
	.num { font-weight: 900; font-size: 1.4em; }
	.barv { width: 100%; min-height: 6px; border: var(--bw) solid var(--line); }
	.barv.a0 { background: var(--a0); } .barv.a1 { background: var(--a1); } .barv.a2 { background: var(--a2); } .barv.a3 { background: var(--a3); }
	.barv.dim { opacity: 0.3; }
	.answers { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5vh 1.2vw; }
	.answers .g-tile { min-height: 9vh; padding: 0 1.5vw; font-size: 1.5em; cursor: default; }
	.answers.list { grid-template-columns: 1fr 1fr; }
	.label { grid-column: 1 / -1; margin: 0; font-weight: 800; }
	.tick { margin-left: auto; font-size: 1.4em; }
	.board { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 2vh; }
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
