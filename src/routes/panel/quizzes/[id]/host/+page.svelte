<script lang="ts">
	import { onMount } from 'svelte';
	import HelpTip from '#lib/help/HelpTip.svelte';
	import { replaceState } from '$app/navigation';
	import Host from '#lib/game/Host.svelte';
	import { panelDict } from '#lib/i18n/panel.js';

	let { data, form } = $props();
	const H = $derived(panelDict(data.lang).host);

	type Game = { pin: string; hostToken: string; qr: string; joinHost: string };
	const key = $derived(`pq:host:${data.quiz.id}`);
	let game = $state<Game | null>(null);

	$effect(() => {
		if (form?.game) {
			game = form.game;
			// Odświeżenie karty nie gubi gry (sessionStorage = tylko ta karta przeglądarki).
			try {
				sessionStorage.setItem(key, JSON.stringify(form.game));
			} catch {
				/* tryb prywatny */
			}
			// Adres bez "?/start" – odświeżenie strony nie uruchomi drugiej gry.
			setTimeout(() => replaceState(`/panel/quizzes/${data.quiz.id}/host`, {}), 0);
		}
	});

	onMount(() => {
		if (game) return;
		try {
			const saved = sessionStorage.getItem(key);
			if (saved) game = JSON.parse(saved);
		} catch {
			/* nic */
		}
	});

	function closed() {
		try {
			sessionStorage.removeItem(key);
		} catch {
			/* nic */
		}
		game = null;
	}
</script>

<svelte:head><title>{data.quiz.title} · {H.title} · Proem Quiz</title></svelte:head>

{#if game}
	<div class="overlay">
		<Host quizId={data.quiz.id} pin={game.pin} hostToken={game.hostToken} qr={game.qr} joinHost={game.joinHost} onClosed={closed} />
	</div>
{:else}
	<div class="card start">
		<h1>{data.quiz.title}</h1>
		<p class="muted">{H.questions(data.quiz.questionCount)}<HelpTip id="screen" /></p>
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<form method="POST" action="?/start">
			<button disabled={data.quiz.questionCount === 0}>{H.start}</button>
		</form>
		<p class="muted small">{H.keys}</p>
		<p><a href="/panel/quizzes/{data.quiz.id}">{H.backToEdit}</a></p>
	</div>
{/if}

<style>
	.overlay { position: fixed; inset: 0; z-index: 50; overflow: hidden; }
	.start { max-width: 34rem; margin: 3rem auto; text-align: center; }
	.start button { font-size: 1.2rem; padding: 0.9rem 2rem; background: #26890c; }
	.small { font-size: 0.85rem; }
</style>
