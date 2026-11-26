<script lang="ts">
	import { sliderMid } from '#lib/game/slider.js';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { Socket } from 'socket.io-client';
	import '#lib/game/game.css';
	import Icon from '#lib/Icon.svelte';
	import Shape from '#lib/game/Shape.svelte';
	import Medal from '#lib/game/Medal.svelte';
	import OrderList from '#lib/game/OrderList.svelte';
	import Avatar, { AVATAR_COUNT } from '#lib/game/Avatar.svelte';
	import Snow from '#lib/game/Snow.svelte';
	import { pushState } from '$app/navigation';
	import { fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { ask, deviceId, gameSocket, keepAwake, remaining, resumePlayer, store } from '#lib/game/client.js';
	import { errText, t } from '#lib/game/i18n.js';
	import { logoFor, shapeColor, themeVars, type GameTheme } from '#lib/game/theme.js';

	type Item = { id: string; label: string };
	type Q = {
		index: number; total: number; type: 'choice' | 'truefalse' | 'audio' | 'text' | 'order' | 'poll' | 'slider' | 'slide'; thumbs?: boolean; slider?: { min: number; max: number; step: number; unit: string }; answerImages?: (string | null)[];
		timeLimit: number; prompt: string; promptTranslation: string | null;
		answers?: string[]; answerCount?: number; items?: Item[];
	};
	type Row = { nick: string; avatar?: number; score: number; rank: number; members?: string[]; me?: boolean };
	type State = {
		pin: string; state: 'lobby' | 'intro' | 'question' | 'reveal' | 'leaderboard' | 'ended';
		title: string; locale: string; theme: GameTheme; teamMode: boolean;
		me: { id: string; nick: string; avatar?: number; score: number; streak: number };
		now: number; question?: Q; deadline?: number | null; introEnds?: number | null; answered?: boolean;
		rank?: number | null; players?: number; behindBy?: number;
		top?: Row[]; around?: Row[];
		result?: { correct: boolean | null; points: number; bonus: number; missed?: boolean; poll?: boolean; voted?: boolean; value?: number };
		solution?: { correct?: number[] | boolean; accepted?: string[]; order?: string[]; value?: number; unit?: string };
	};

	let socket: Socket | null = null;
	// Koniec gry: pełna lista na żądanie („Pokaż wszystkich”).
	let allRows = $state<Row[] | null>(null);
	let loadingAll = $state(false);
	async function showAll() {
		if (!socket || loadingAll) return;
		loadingAll = true;
		const r = await ask<{ ranking?: Row[]; error?: string }>(socket, 'ranking', {});
		loadingAll = false;
		if (r?.ranking) {
			allRows = r.ranking;
			requestAnimationFrame(() => document.querySelector('.all .me')?.scrollIntoView({ block: 'center' }));
		}
	}
	/** Pierwsza trójka + okolice gracza, bez powtórzeń; null w miejscu przerwy w numeracji („…”). */
	const endRows = $derived.by(() => {
		const byRank = new Map<number, Row>();
		for (const r of [...(gs?.top ?? []), ...(gs?.around ?? [])]) byRank.set(r.rank, r);
		const sorted = [...byRank.values()].sort((a, b) => a.rank - b.rank);
		const out: (Row | null)[] = [];
		for (const r of sorted) {
			const prev = out[out.length - 1];
			if (prev && r.rank > prev.rank + 1) out.push(null);
			out.push(r);
		}
		return out;
	});
	let phase = $state<'pin' | 'nick' | 'game' | 'kicked' | 'replaced'>('pin');
	let pin = $state('');
	let info = $state<{ title: string; locale: string; theme: GameTheme; nicknameMode: string; teamMode: boolean; avatars?: boolean } | null>(null);
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
	let members = $state<string[]>(['']);
	let avatar = $state(Math.floor(Math.random() * AVATAR_COUNT));
	let sliderVal = $state<number | null>(null);
	let toast = $state('');
	let toastTimer: ReturnType<typeof setTimeout> | null = null;

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
	const introLeft = $derived.by(() => {
		void now;
		return Math.max(1, Math.ceil(remaining(gs?.introEnds, offset) / 1000));
	});

	// Przycisk „wstecz” w trakcie gry nie wyrzuca z gry: trzymamy dodatkowy wpis w historii
	// (płytka nawigacja SvelteKit), a po cofnięciu przywracamy go i pokazujemy podpowiedź.
	let guardArmed = false;
	$effect(() => {
		// Po zakończeniu gry „wstecz” znowu działa normalnie (review Codexa).
		if (phase !== 'game' || gs?.state === 'ended') return;
		if (page.state.guard) return;
		if (guardArmed) {
			toast = L.stayInGame;
			if (toastTimer) clearTimeout(toastTimer);
			toastTimer = setTimeout(() => (toast = ''), 3500);
		}
		guardArmed = true;
		pushState('', { guard: true });
	});
	const answerCount = $derived(q?.answers?.length ?? q?.answerCount ?? 0);

	const sessionKey = (p: string) => `pq:s:${p}`;

	function connect() {
		socket = gameSocket();
		socket.on('connect', async () => {
			connected = true;
			// Po końcu gry zostaje ekran wyników – serwer mógł już zamknąć grę, nie ma do czego wracać.
			if (gs?.state === 'ended') return;
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
			// Nowe pytanie (z odliczaniem albo bez – wtedy od razu stan „question”).
			const newQuestion = !!s.question && (s.state === 'intro' || s.state === 'question') && (!gs?.question || gs.question.index !== s.question.index || (gs.state !== 'intro' && gs.state !== 'question'));
			if (newQuestion) {
				sent = false;
				textAnswer = '';
				picked = s.question?.items?.map((it) => it.id) ?? [];
				sliderVal = null;
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

	/** Telefon: postacie w jednym rzędzie przewijanym w bok – wylosowana na starcie ma być widoczna. */
	function showSelected(el: HTMLElement) {
		const sel = el.querySelector<HTMLElement>('.av.sel');
		if (sel && el.scrollWidth > el.clientWidth) el.scrollLeft = sel.offsetLeft - (el.clientWidth - sel.offsetWidth) / 2;
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
		let destroyed = false;
		(async () => {
			if (tryPin && token) {
				const res = await resumePlayer(
					() => ask(socket!, 'rejoin', { pin: tryPin, token }),
					() => store.del(sessionKey(tryPin)),
					// Gracz sam zaczął dołączać (zatwierdził PIN) albo już jest w grze – nie ponawiamy i nie nadpisujemy ekranu.
					{ shouldStop: () => destroyed || manualPin || phase !== 'pin' || gs !== null }
				);
				if (res === 'ok' || res === 'cancelled' || destroyed || phase !== 'pin') return;
			}
			if (qsPin.length === 6) {
				pin = qsPin;
				await checkPin();
			}
		})();
		return () => {
			destroyed = true;
			clearInterval(tick);
			unlock();
			socket?.disconnect();
		};
	});

	/** Gracz zatwierdził PIN – automatyczny powrót do poprzedniej gry przestaje być ponawiany. */
	let manualPin = false;

	async function checkPin(e?: Event) {
		e?.preventDefault();
		manualPin = true;
		error = '';
		const p = pin.replace(/\D/g, '');
		if (p.length !== 6) return;
		busy = true;
		const r = await ask<{ ok?: boolean; error?: string; title: string; locale: string; theme: GameTheme; nicknameMode: string; teamMode: boolean; avatars?: boolean; suggestion: string }>(socket!, 'check', { pin: p });
		busy = false;
		// Wysłana wcześniej próba powrotu (token) zdążyła wygrać – gracz jest już w swojej grze, nie zmieniamy ekranu.
		if (gs) return;
		if (!r.ok) {
			error = errText(locale, r.error ?? 'default');
			return;
		}
		info = r;
		suggestion = r.suggestion;
		nick = '';
		ownNick = r.nicknameMode === 'custom-only'; // tylko własny nick: od razu pole do wpisania
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
			deviceId: deviceId(),
			avatar: info?.avatars === false ? undefined : avatar,
			members: team ? members.map((m) => m.trim()).filter(Boolean) : undefined
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

	const pts = (n: number) => n.toLocaleString(locale === 'uk' ? 'uk-UA' : locale === 'en' ? 'en-GB' : 'pl-PL');
</script>

{#snippet row(r: Row)}
	<li class:me={r.me}>
		<span class="rk">{r.rank}.</span>
		{#if r.avatar != null}<Avatar id={r.avatar} size="1.5rem" />{/if}
		<span class="nk">{r.nick}{#if r.me}<small> · {L.you}</small>{/if}</span>
		<span class="pt">{pts(r.score)}</span>
	</li>
{/snippet}


<svelte:head>
	<title>{gs?.title ?? info?.title ?? 'Proem Quiz'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="game play" data-style={style} style={themeVars(theme)}>
	{#if theme?.decor === 'snow'}<Snow count={18} />{/if}
	{#if !connected && phase === 'game' && gs?.state !== 'ended'}
		<div class="offline" role="status">{L.reconnecting}</div>
	{/if}
	{#if toast}<div class="toast" role="status" transition:fly={{ y: 30, duration: 250 }}>{toast}</div>{/if}

	{#if phase === 'pin'}
		<main class="center" in:fly={{ y: 24, duration: 380 }}>
			{#if logoFor(theme)}<img class="logo" src={logoFor(theme)} alt="" />{/if}
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
		<main class="center" in:fly={{ y: 24, duration: 380 }}>
			<h1 class="title">{info.title}</h1>
			<form class="g-box card" onsubmit={join}>
				{#if info.avatars !== false}
					<span class="big-label">{L.pickAvatar}</span>
					<div class="avatars" role="radiogroup" aria-label={L.pickAvatar} use:showSelected>
						{#each Array(AVATAR_COUNT) as _, i}
							<button type="button" class="av" class:sel={avatar === i} role="radio" aria-checked={avatar === i} aria-label={L.avatarNames[i] ?? `${L.pickAvatar} ${i + 1}`} onclick={() => (avatar = i)}>
								<Avatar id={i} size="100%" animated={avatar === i} />
								{#if avatar === i}<span class="av-check" aria-hidden="true"><Icon name="check" /></span>{/if}
							</button>
						{/each}
					</div>
				{/if}
				<span class="big-label">{team ? L.teamName : L.yourNick}</span>
				{#if !ownNick}
					<!-- Podgląd: postać + nick tak, jak zobaczy je prowadzący. -->
					<div class="nick-show">{#if info.avatars !== false}<Avatar id={avatar} size="1.5em" animated />{/if}<span>{suggestion}</span></div>
					<button type="button" class="g-btn ghost wide" onclick={reroll}><Icon name="dice" /> {L.drawAgain}</button>
					{#if info.nicknameMode !== 'random-only'}
						<button type="button" class="linkish" onclick={() => (ownNick = true)}>{L.ownNick}</button>
					{/if}
				{:else}
					<input class="g-input" maxlength="20" bind:value={nick} autocomplete="off" autocapitalize="words" aria-label={team ? L.teamName : L.yourNick} />
					{#if info.nicknameMode !== 'custom-only'}
						<button type="button" class="linkish" onclick={() => (ownNick = false)}><Icon name="dice" /> {L.drawAgain}</button>
					{/if}
				{/if}
				{#if team}
					<span class="big-label small-label">{L.members}</span>
					{#each members as _, i}
						<input class="g-input member" maxlength="20" bind:value={members[i]} autocomplete="off" autocapitalize="words" placeholder={L.memberName(i + 1)} aria-label={L.memberName(i + 1)} />
					{/each}
					{#if members.length < 6}
						<button type="button" class="linkish" onclick={() => members.push('')}>+ {L.addMember}</button>
					{/if}
				{/if}
				{#if error}<p class="err" role="alert">{error}</p>{/if}
				<!-- Pasek przypięty do dołu ekranu: po 24 postaciach przycisk nie może uciekać poza ekran telefonu.
				     Tło karty pod spodem – przewijana treść chowa się pod paskiem, zamiast prześwitywać. -->
				<div class="join-bar">
					<button class="g-btn wide join" disabled={busy || (ownNick && nick.trim().length < 2)}>{L.join}</button>
				</div>
			</form>
		</main>
	{:else if phase === 'kicked' || phase === 'replaced'}
		<main class="center" in:fly={{ y: 24, duration: 380 }}>
			<div class="g-box card msg">
				<p>{phase === 'kicked' ? L.kicked : L.replaced}</p>
				<button class="g-btn wide" onclick={() => { leaveGame(); location.reload(); }}>{L.go}</button>
			</div>
		</main>
	{:else if gs}
		<header class="top">
			<span class="g-chip nick">{#if gs.me.avatar != null}<Avatar id={gs.me.avatar} size="1.6em" />{/if}<span class="nick-text">{gs.me.nick}</span></span>
			<!-- Na rankingu i na końcu punkty są w środku ekranu – bez powtarzania ich w nagłówku. -->
			{#if gs.state !== 'leaderboard' && gs.state !== 'ended'}<span class="g-chip score">{pts(gs.me.score)} {L.points}</span>{/if}
		</header>

		{#if gs.state === 'lobby'}
			<main class="center" in:fly={{ y: 24, duration: 380 }}>
				<div class="g-box card msg">
					<p class="huge">{L.youAreIn}</p>
					<p>{L.waitForStart}</p>
				</div>
			</main>
		{:else if gs.state === 'question' && q?.type === 'slide'}
			<main class="center" in:fly={{ y: 24, duration: 380 }}>
				<div class="g-box card msg">
					<p class="huge">{L.slideLook}</p>
					<p>{q.prompt}</p>
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

			{#if gs.state === 'intro' && team && q.slider}
				<main class="center talk" in:fly={{ y: 24, duration: 380 }}>
					<p class="huge">{L.teamTalk}</p>
					{#key introLeft}<div class="cd g-box" in:scale={{ start: 1.6, duration: 450, easing: backOut }}>{introLeft}</div>{/key}
					<p class="slider-val g-box">{pts(q.slider.min)} – {pts(q.slider.max)}{q.slider.unit ? ` ${q.slider.unit}` : ''}</p>
				</main>
			{:else if gs.state === 'intro' && team && (q.answers || q.items || q.answerImages)}
				<!-- Narada drużyny: odpowiedzi widać, ale jeszcze nie można odpowiadać. -->
				<main class="center talk" in:fly={{ y: 24, duration: 380 }}>
					<p class="huge">{L.teamTalk}</p>
					{#key introLeft}<div class="cd g-box" in:scale={{ start: 1.6, duration: 450, easing: backOut }}>{introLeft}</div>{/key}
					<ul class="talk-list">
						{#each q.answers ?? q.items?.map((x) => x.label) ?? q.answerImages?.map(() => '') ?? [] as a, i}
							<li class="g-tile a{i % 4}">
								{#if q.answerImages?.[i]}<img class="talk-img" src={q.answerImages[i]} alt="" />{/if}
								{a}
							</li>
						{/each}
					</ul>
				</main>
			{:else if gs.state === 'intro'}
				<main class="center" in:fly={{ y: 24, duration: 380 }}>
					<p class="huge">{L.getReady}</p>
					{#key introLeft}<div class="cd g-box" in:scale={{ start: 1.6, duration: 450, easing: backOut }}>{introLeft}</div>{/key}
				</main>
			{:else if sent}
				<main class="center" in:fly={{ y: 24, duration: 380 }}>
					<div class="g-box card msg">
						<p class="huge">{q.type === 'poll' ? L.voted : L.answerSent}</p>
						<p>{L.waitOthers}</p>
					</div>
				</main>
			{:else if q.type === 'slider' && q.slider}
				{@const sl = q.slider}
				<main class="center slider-q">
					<p class="slider-val g-box">{pts(sliderVal ?? sliderMid(sl))}{sl.unit ? ` ${sl.unit}` : ''}</p>
					<input
						class="range"
						type="range"
						min={sl.min}
						max={sl.max}
						step={sl.step}
						value={sliderVal ?? sliderMid(sl)}
						oninput={(e) => (sliderVal = Number((e.currentTarget as HTMLInputElement).value))}
						aria-label={L.yourAnswer}
					/>
					<div class="range-ends"><span>{pts(sl.min)}</span><span>{pts(sl.max)}</span></div>
					<button class="g-btn wide" onclick={() => answer({ value: sliderVal ?? sliderMid(sl) })}>{L.send}</button>
				</main>
			{:else if q.type === 'choice' || q.type === 'audio' || q.type === 'poll'}
				<main class="tiles" class:two={answerCount <= 2} class:text={!!q.answers && !q.answerImages} class:pics={!!q.answerImages}>
					{#each Array(answerCount) as _, i}
						<button class="g-tile a{i}" in:scale={{ start: 0.8, delay: i * 70, duration: 320, easing: backOut }} onclick={() => answer({ choice: i })} aria-label={q.answers?.[i] || String.fromCharCode(65 + i)}>
							{#if q.answerImages?.[i]}
								<img class="pic" src={q.answerImages[i]} alt="" />
								{#if q.answers?.[i]}<span class="tile-text">{q.answers[i]}</span>{/if}
							{:else}
								{#if style === 'calm'}<span class="badge">{String.fromCharCode(65 + i)}</span>
								{:else}<Shape {i} size={q.answers ? 34 : 72} color={shapeColor(style)} />{/if}
								{#if q.answers}<span class="tile-text">{q.answers[i]}</span>{/if}
							{/if}
						</button>
					{/each}
				</main>
				{#if !q.answers}<p class="hint">{L.lookAtScreen}</p>{/if}
			{:else if q.type === 'truefalse'}
				<main class="tiles two text">
					{#if q.thumbs}
						<button class="g-tile a1 thumb" aria-label={L.true} onclick={() => answer({ choice: true })} in:scale={{ start: 0.8, duration: 320, easing: backOut }}><Icon name="thumbUp" size="5rem" /></button>
						<button class="g-tile a0 thumb" aria-label={L.false} onclick={() => answer({ choice: false })} in:scale={{ start: 0.8, delay: 70, duration: 320, easing: backOut }}><Icon name="thumbDown" size="5rem" /></button>
					{:else}
						<button class="g-tile a1" onclick={() => answer({ choice: true })}><Shape i={1} size={34} color={shapeColor(style)} /><span class="tile-text">{L.true}</span></button>
						<button class="g-tile a0" onclick={() => answer({ choice: false })}><Shape i={0} size={34} color={shapeColor(style)} /><span class="tile-text">{L.false}</span></button>
					{/if}
				</main>
			{:else if q.type === 'text'}
				<form class="stack" onsubmit={(e) => { e.preventDefault(); if (textAnswer.trim()) answer({ text: textAnswer.trim() }); }}>
					<input class="g-input" maxlength="80" bind:value={textAnswer} placeholder={L.typeAnswer} autocomplete="off" autocorrect="off" spellcheck="false" aria-label={L.typeAnswer} />
					<button class="g-btn wide" disabled={!textAnswer.trim()}>{L.send}</button>
				</form>
			{:else if q.type === 'order' && q.items}
				<div class="stack">
					<p class="hint left">{L.dragToOrder}</p>
					<OrderList items={q.items} bind:order={picked} upLabel={L.moveUp} downLabel={L.moveDown} />
					<button class="g-btn wide" disabled={picked.length !== q.items.length} onclick={() => answer({ order: picked })}>{L.send}</button>
				</div>
			{/if}
		{:else if gs.state === 'reveal' && gs.result?.poll}
			<main class="center" in:scale={{ start: 0.9, duration: 420, easing: backOut }}>
				<div class="g-box card msg">
					<p class="huge">{gs.result.voted ? L.voteCounted : L.noVote}</p>
				</div>
			</main>
		{:else if gs.state === 'reveal' && gs.result}
			<main class="center result" in:scale={{ start: 0.9, duration: 420, easing: backOut }} class:good={gs.result.correct} class:bad={!gs.result.correct}>
				<div class="g-box card msg">
					<p class="huge">{gs.result.missed ? L.missed : gs.result.correct ? L.correct : L.wrong}</p>
					<!-- result.points zawiera bonus – tu pokazujemy osobno punkty za odpowiedź i bonus za serię -->
					{#if gs.result.points - gs.result.bonus > 0}<p class="g-chip plus">+{pts(gs.result.points - gs.result.bonus)}</p>{/if}
					{#if gs.result.bonus > 0}<p>{L.streak} {gs.me.streak} · +{gs.result.bonus} {L.bonus}</p>{/if}
					{#if gs.result.value != null && gs.solution?.value != null}
						<p>{L.yourAnswer}: <b>{pts(gs.result.value)}</b> · {L.correctAnswer}: <b>{pts(gs.solution.value)}</b>{gs.solution.unit ? ` ${gs.solution.unit}` : ''}</p>
					{/if}
					{#if gs.rank}<p class="rank">{L.atPlace(gs.rank)}</p>{/if}
				</div>
			</main>
		{:else if gs.state === 'leaderboard' || gs.state === 'ended'}
			<main class="center" in:fly={{ y: 24, duration: 380 }}>
				<div class="g-box card msg">
					{#if gs.state === 'ended'}<p class="huge">{L.gameOver}</p>{/if}
					{#if gs.me.avatar != null && !(gs.state === 'ended' && gs.rank && gs.rank <= 3)}<div class="medal-wrap"><Avatar id={gs.me.avatar} size="4.5rem" animated /></div>{/if}
					{#if gs.rank}
						{#if gs.state === 'ended' && gs.rank <= 3}<div class="medal-wrap" in:scale={{ start: 0.3, duration: 700, delay: 300, easing: backOut }}><Medal place={gs.rank} size="5rem" /></div>{/if}
						<p class="place">{gs.rank}.</p><p>{L.place}{#if gs.players} · {L.inGame(gs.players)}{/if}</p>
					{/if}
					<p class="g-chip">{pts(gs.me.score)} {L.points}</p>
					{#if gs.state !== 'ended'}
						<p>{gs.rank === 1 ? L.leader : `${pts(gs.behindBy ?? 0)} ${L.behind}`}</p>
					{:else}
						<p>{L.thanks}</p>
					{/if}
				</div>
				{#if gs.state === 'ended' && endRows.length}
					<div class="g-box card ranks">
						{#if allRows}
							<ol class="rows all">
								{#each allRows as r (r.rank)}{@render row(r)}{/each}
							</ol>
							<button type="button" class="linkish" onclick={() => (allRows = null)}>{L.hideAll}</button>
						{:else}
							<ol class="rows">
								{#each endRows as r, i (r ? r.rank : `gap-${i}`)}
									{#if r}{@render row(r)}{:else}<li class="gap" aria-hidden="true">⋯</li>{/if}
								{/each}
							</ol>
							{#if (gs.players ?? 0) > endRows.filter(Boolean).length}
								<button type="button" class="g-btn ghost" onclick={showAll} disabled={loadingAll}>{L.showAll(gs.players ?? 0)}</button>
							{/if}
						{/if}
					</div>
				{/if}
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
		/* Tło na całą szerokość okna; treść w kolumnie (telefon → tablet → komputer). */
		--col: 560px;
	}
	.play > :not(.offline):not(.toast):not(.snow) { width: 100%; max-width: var(--col); margin-inline: auto; }
	.card { max-width: 480px; }
	@media (min-width: 700px) {
		.play { --col: 720px; gap: 16px; padding-top: 28px; padding-bottom: 28px; }
		.prompt { font-size: 1.8rem; }
		.tiles { min-height: 46vh; }
		.tiles .g-tile { font-size: 1.4rem; }
	}
	@media (min-width: 1100px) {
		.play { --col: 900px; }
		.prompt { font-size: 2.1rem; }
	}
	.center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
	.card { width: 100%; padding: 22px; display: flex; flex-direction: column; gap: 14px; }
	.logo { max-height: 64px; max-width: 70%; }
	.big-label { font-size: 1.3rem; font-weight: 900; }
	.pin { font-size: 2.2rem; text-align: center; letter-spacing: 0.25em; font-variant-numeric: tabular-nums; }
	.wide { width: 100%; }
	.join-bar { position: sticky; bottom: 0; z-index: 5; margin: 0 -22px -22px; padding: 12px 22px max(16px, env(safe-area-inset-bottom)); background: var(--surface); border-top: 2px solid rgba(0, 0, 0, 0.1); border-radius: 0 0 var(--radius) var(--radius); }
	.hint.left { text-align: left; }
	.hint { text-align: center; font-weight: 600; opacity: 0.8; margin: 0; }
	.err { background: #fff; color: #b0001e; border: 2px solid #b0001e; padding: 10px 12px; font-weight: 800; margin: 0; }
	.title { font-size: 1.6rem; margin: 0; text-align: center; }
	.nick-show { font-size: 1.8rem; font-weight: 900; text-align: center; padding: 8px 0; display: flex; align-items: center; justify-content: center; gap: 0.35em; }
	/* Nick zawija się między słowami, nie w środku słowa (obok postaci jest mniej miejsca). */
	.nick-show span { flex: 0 1 auto; min-width: 0; overflow-wrap: break-word; }
	@media (max-width: 519px) { .nick-show { font-size: 1.55rem; } }
	.linkish { background: none; border: 0; font: inherit; font-weight: 700; text-decoration: underline; color: inherit; cursor: pointer; padding: 6px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 0.4em; }
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
	.row { display: flex; gap: 10px; }
	.grow { flex: 1; }
	.result.good :global(.g-box) { background: var(--a3); }
	.result.bad :global(.g-box) { background: var(--a0); }
	.plus { align-self: center; font-size: 1.6rem; }
	.cd { width: 7rem; height: 7rem; border-radius: 50%; display: grid; place-items: center; font-size: 3.4rem; font-weight: 900; background: var(--accent); font-variant-numeric: tabular-nums; }
	.tiles .g-tile.thumb { justify-content: center; }
	.tiles.pics .g-tile { flex-direction: column; justify-content: center; gap: 6px; padding: 8px; }
	.pic { width: 100%; flex: 1; min-height: 0; max-height: 22vh; object-fit: contain; background: #fff; border-radius: 6px; }
	.small-label { font-size: 1rem; }
	.member { font-size: 1.05rem; }
	.talk-list { list-style: none; margin: 0; padding: 0; width: 100%; display: grid; gap: 8px; }
	.talk-img { height: 56px; max-width: 40%; object-fit: contain; background: #fff; border-radius: 6px; margin-right: 10px; }
	.talk-list li { padding: 10px 14px; font-weight: 800; justify-content: flex-start; min-height: 0; cursor: default; }
	.slider-q { gap: 20px; }
	.slider-val { font-size: 2.6rem; font-weight: 900; padding: 8px 24px; margin: 0; font-variant-numeric: tabular-nums; }
	.range { width: 100%; height: 14px; margin: 18px 0; -webkit-appearance: none; appearance: none; background: rgba(0, 0, 0, 0.15); border-radius: 7px; touch-action: none; }
	.range::-webkit-slider-thumb { -webkit-appearance: none; width: 44px; height: 44px; border-radius: 50%; background: var(--accent); border: 3px solid #111; cursor: grab; }
	.range::-moz-range-thumb { width: 44px; height: 44px; border-radius: 50%; background: var(--accent); border: 3px solid #111; cursor: grab; }
	.range-ends { width: 100%; display: flex; justify-content: space-between; font-weight: 700; opacity: 0.8; }
	/* 5 kolumn na telefonie (kafelki ≥ 40 px dla dzieci), 8 na szerszym ekranie. minmax(0, 1fr) + min-width: 0 – kafelki nigdy nie
	   rozpychają siatki (iOS Safari); wysokość z szerokości obrazka, bez procentowej wysokości SVG. */
	.avatars { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin-bottom: 4px; }
	@media (min-width: 520px) { .avatars { grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 8px; } }
	/* Telefon: jeden rząd przewijany w bok (ucięta ostatnia postać podpowiada, że jest ich więcej) – dzięki temu
	   nick i „Dołącz do gry” mieszczą się na ekranie nawet na iPhonie SE. Odstęp u góry na znaczek ✓. */
	@media (max-width: 519px) {
		.avatars { display: flex; overflow-x: auto; scroll-snap-type: x proximity; gap: 8px; margin: 0 -22px 4px; padding: 10px 22px 8px; scrollbar-width: none; }
		.avatars::-webkit-scrollbar { display: none; }
		/* Stała szerokość i padding w px – procentowy padding liczy się od szerokości całego rzędu. */
		.avatars .av { flex: 0 0 68px; padding: 8px; scroll-snap-align: center; }
	}
	/* Wybrana postać: wyraźnie w każdym motywie (kolor akcentu, czarna ramka, znaczek ✓), pozostałe przygaszone. */
	.av { position: relative; border: 3px solid transparent; border-radius: 12px; background: rgba(0, 0, 0, 0.04); padding: 6%; margin: 0; cursor: pointer; display: block; width: 100%; min-width: 0; min-height: 0; height: auto; line-height: 0; box-shadow: none; opacity: 0.55; transition: opacity 0.15s, transform 0.15s, background 0.15s; }
	/* Margines wokół rysunku: uszy (zając, lis) i kołysanie wybranej postaci nie dotykają ramki. */
	.av :global(svg) { display: block; width: 100%; height: auto; overflow: visible; }
	.av.sel { opacity: 1; border-color: #111; background: var(--accent, #ffc93c); transform: scale(1.06); box-shadow: 0 3px 0 #111; }
	.av-check { position: absolute; top: -7px; right: -7px; width: 20px; height: 20px; border-radius: 50%; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; line-height: 1; font-size: 14px; }
	@media (prefers-reduced-motion: reduce) { .av, .av.sel { transition: none; transform: none; } }
	.nick { display: inline-flex; align-items: center; gap: 6px; }
	.nick-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.medal-wrap { display: flex; justify-content: center; }
	.toast { position: fixed; left: 50%; bottom: max(20px, env(safe-area-inset-bottom)); transform: translateX(-50%); width: min(92vw, 420px); background: #111; color: #fff; padding: 12px 16px; border-radius: 12px; font-weight: 700; text-align: center; z-index: 20; }
	.place { font-size: 4rem; font-weight: 900; line-height: 1; }
	/* Koniec gry: pierwsza trójka i okolice gracza, pełna lista na żądanie. */
	.ranks { gap: 10px; }
	.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
	.rows.all { max-height: 55vh; overflow-y: auto; overscroll-behavior: contain; }
	.rows li { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; font-weight: 700; }
	.rows li.me { background: var(--accent); color: #111; }
	.rows .rk { min-width: 2.6ch; text-align: right; font-variant-numeric: tabular-nums; }
	.rows .nk { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.rows .nk small { font-weight: 600; opacity: 0.8; }
	.rows .pt { font-variant-numeric: tabular-nums; }
	.rows .gap { justify-content: center; padding: 0; opacity: 0.5; letter-spacing: 0.2em; }
	.rank { font-weight: 800; }
	.offline { position: sticky; top: 0; align-self: stretch; border-radius: 10px; text-align: center; background: #111; color: #fff; padding: 6px; font-weight: 700; z-index: 10; }
	button:focus-visible { outline: 3px solid #111; outline-offset: 3px; }
</style>
