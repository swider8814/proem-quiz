<script lang="ts">
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';
	import ConfirmDialog from '#lib/ConfirmDialog.svelte';

	let { children }: LayoutProps = $props();

	// Znacznik zakończonej hydratacji – testy przeglądarkowe czekają na niego przed kliknięciem
	// (klik przed hydratacją trafia w martwy przycisk albo wysyła formularz bez JavaScriptu).
	onMount(() => {
		document.documentElement.dataset.hydrated = '';
	});
</script>

{@render children()}
<ConfirmDialog />
