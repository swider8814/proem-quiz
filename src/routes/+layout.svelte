<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Znacznik zakończonej hydratacji – testy przeglądarkowe czekają na niego przed kliknięciem
	// (klik przed hydratacją trafia w martwy przycisk albo wysyła formularz bez JavaScriptu).
	onMount(() => {
		document.documentElement.dataset.hydrated = '';
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
