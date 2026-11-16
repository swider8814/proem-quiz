<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import Host from '#lib/game/Host.svelte';

	let { data, form } = $props();

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

<svelte:head><title>{data.quiz.title} · Prowadzenie · Proem Quiz</title></svelte:head>

{#if game}
	<div class="overlay">
		<Host pin={game.pin} hostToken={game.hostToken} qr={game.qr} joinHost={game.joinHost} onClosed={closed} />
	</div>
{:else}
	<div class="card start">
		<h1>{data.quiz.title}</h1>
		<p class="muted">{data.quiz.questionCount} pytań. Podłącz komputer do rzutnika i nagłośnienia, a potem uruchom grę.</p>
		{#if form?.error}<p class="error">{form.error}</p>{/if}
		<form method="POST" action="?/start">
			<button disabled={data.quiz.questionCount === 0}>Uruchom grę</button>
		</form>
		<p class="muted small">Sterowanie: spacja / strzałka w prawo – dalej · F – pełny ekran · R – odtwórz fragment ponownie.</p>
		<p><a href="/panel/quizzes/{data.quiz.id}">← Wróć do edycji</a></p>
	</div>
{/if}

<style>
	.overlay { position: fixed; inset: 0; z-index: 50; overflow: auto; }
	.start { max-width: 34rem; margin: 3rem auto; text-align: center; }
	.start button { font-size: 1.2rem; padding: 0.9rem 2rem; background: #26890c; }
	.small { font-size: 0.85rem; }
</style>
