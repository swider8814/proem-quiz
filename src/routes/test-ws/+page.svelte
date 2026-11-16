<script lang="ts">
	import { onMount } from 'svelte';
	import { io, type Socket } from 'socket.io-client';

	type Row = { t: string; msg: string; kind?: 'ok' | 'warn' | 'err' };

	let transport = $state('—');
	let connected = $state(false);
	let clients = $state(0);
	let rtt = $state<number[]>([]);
	let log = $state<Row[]>([]);
	let message = $state('Pytanie 1!');
	let socket: Socket;

	const avg = $derived(rtt.length ? Math.round(rtt.reduce((a, b) => a + b, 0) / rtt.length) : null);
	const verdict = $derived(
		!connected
			? { text: 'Brak połączenia', kind: 'err' as const }
			: transport === 'websocket'
				? { text: 'WebSocket działa ✅', kind: 'ok' as const }
				: { text: 'Działa przez long-polling (bez WebSocketów) ⚠️', kind: 'warn' as const }
	);

	function add(msg: string, kind?: Row['kind']) {
		log = [{ t: new Date().toLocaleTimeString(), msg, kind }, ...log].slice(0, 50);
	}

	function ping() {
		const sent = performance.now();
		socket.emit('ping-check', Date.now(), (res: { transport: string }) => {
			const ms = Math.round(performance.now() - sent);
			rtt = [...rtt, ms].slice(-20);
			transport = res.transport;
		});
	}

	onMount(() => {
		socket = io('/diag', { path: '/socket.io' });

		socket.on('connect', () => {
			connected = true;
			transport = socket.io.engine.transport.name;
			add(`Połączono (${transport})`, 'ok');
		});
		socket.io.engine.on('upgrade', (t) => {
			transport = t.name;
			add(`Przełączono na ${t.name}`, 'ok');
		});
		socket.on('connect_error', (e) => add(`Błąd połączenia: ${e.message}`, 'err'));
		socket.on('disconnect', (r) => {
			connected = false;
			add(`Rozłączono: ${r}`, 'warn');
		});
		socket.on('clients', (n: number) => (clients = n));
		socket.on('broadcast', (b: { text: string }) => add(`Odebrano od serwera: „${b.text}”`));

		const timer = setInterval(() => connected && ping(), 2000);
		// Po 5 s sprawdź, czy udało się przejść na WebSocket.
		const check = setTimeout(() => {
			if (connected && socket.io.engine.transport.name !== 'websocket')
				add('Po 5 s nadal long-polling – proxy prawdopodobnie blokuje WebSockety', 'warn');
		}, 5000);

		return () => {
			clearInterval(timer);
			clearTimeout(check);
			socket.disconnect();
		};
	});
</script>

<svelte:head><title>Test połączenia na żywo · Proem Quiz</title></svelte:head>

<main>
	<h1>Test połączenia na żywo</h1>
	<p class="lead">Otwórz tę stronę na kilku telefonach naraz, żeby sprawdzić, czy serwer dociera do wszystkich.</p>

	<div class="verdict {verdict.kind}">{verdict.text}</div>

	<dl>
		<dt>Transport</dt>
		<dd>{transport}</dd>
		<dt>Średnie opóźnienie</dt>
		<dd>{avg === null ? '—' : `${avg} ms`}</dd>
		<dt>Urządzeń połączonych</dt>
		<dd>{clients}</dd>
	</dl>

	<form onsubmit={(e) => { e.preventDefault(); socket.emit('broadcast', message); }}>
		<input bind:value={message} maxlength="100" aria-label="Wiadomość" />
		<button disabled={!connected}>Wyślij do wszystkich</button>
	</form>

	<ol class="log">
		{#each log as row}
			<li class={row.kind}><time>{row.t}</time> {row.msg}</li>
		{/each}
	</ol>
</main>

<style>
	main { max-width: 36rem; margin: 0 auto; padding: 1.25rem; font-family: system-ui, sans-serif; }
	h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
	.lead { color: #555; margin-top: 0; }
	.verdict { padding: 1rem; border-radius: .75rem; font-weight: 600; font-size: 1.1rem; margin: 1rem 0; }
	.verdict.ok { background: #e5f4e4; } .verdict.warn { background: #f9eeda; } .verdict.err { background: #fbebeb; }
	dl { display: grid; grid-template-columns: auto 1fr; gap: .4rem 1rem; }
	dt { color: #666; } dd { margin: 0; font-weight: 600; }
	form { display: flex; gap: .5rem; margin: 1.25rem 0; }
	input { flex: 1; padding: .6rem; font-size: 1rem; border: 1px solid #ccc; border-radius: .5rem; }
	button { padding: .6rem 1rem; font-size: 1rem; border: 0; border-radius: .5rem; background: #1368ce; color: #fff; }
	button:disabled { opacity: .5; }
	.log { list-style: none; padding: 0; font-size: .9rem; }
	.log li { padding: .3rem 0; border-bottom: 1px solid #eee; }
	.log li.ok { color: #26890c; } .log li.warn { color: #a06a00; } .log li.err { color: #c0142f; }
	time { color: #999; font-variant-numeric: tabular-nums; margin-right: .4rem; }
</style>
