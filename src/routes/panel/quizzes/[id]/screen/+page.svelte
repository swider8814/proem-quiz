<script lang="ts">
	import Host from '#lib/game/Host.svelte';
	import { panelDict } from '#lib/i18n/panel.js';

	let { data } = $props();
	const H = $derived(panelDict(data.lang).host);
</script>

<svelte:head><title>{H.screenTitle} · Proem Quiz</title></svelte:head>

<div class="overlay">
	<Host mode="screen" quizId={data.quizId} />
</div>

<style>
	.overlay { position: fixed; inset: 0; z-index: 50; overflow: hidden; }
</style>
