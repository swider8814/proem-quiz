<script lang="ts">
	/**
	 * Ikony jako SVG zamiast znaków Unicode/emoji (↻ ⛶ → 📺 …). Znaki zależą od czcionek
	 * systemu (Windows, Android, iOS rysują je inaczej i w innej wysokości), więc w przyciskach
	 * potrafiły się rozjeżdżać. SVG ma stały rozmiar 1em i jest wyśrodkowane.
	 */
	type Name = 'replay' | 'close' | 'check' | 'fullscreen' | 'next' | 'back' | 'up' | 'down' | 'screen' | 'sound' | 'dice';
	let { name, size = '1em' }: { name: Name; size?: string } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
	{#if name === 'replay'}
		<path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v6h6" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6L6 18" />
	{:else if name === 'check'}
		<path d="M4 12.5l5 5L20 6.5" />
	{:else if name === 'fullscreen'}
		<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
	{:else if name === 'next'}
		<path d="M4 12h15M13 6l6 6-6 6" />
	{:else if name === 'back'}
		<path d="M20 12H5M11 6l-6 6 6 6" />
	{:else if name === 'up'}
		<path d="M12 20V5M6 11l6-6 6 6" />
	{:else if name === 'down'}
		<path d="M12 4v15M6 13l6 6 6-6" />
	{:else if name === 'screen'}
		<rect x="2.5" y="4" width="19" height="12.5" rx="1.5" /><path d="M8 20.5h8M12 16.5v4" />
	{:else if name === 'sound'}
		<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9a4.2 4.2 0 0 1 0 6M18.6 6.5a8 8 0 0 1 0 11" />
	{:else if name === 'dice'}
		<rect x="3.5" y="3.5" width="17" height="17" rx="3" /><circle cx="8.5" cy="8.5" r="0.6" fill="currentColor" /><circle cx="15.5" cy="15.5" r="0.6" fill="currentColor" /><circle cx="12" cy="12" r="0.6" fill="currentColor" /><circle cx="15.5" cy="8.5" r="0.6" fill="currentColor" /><circle cx="8.5" cy="15.5" r="0.6" fill="currentColor" />
	{/if}
</svg>

<style>
	.icon { display: block; flex-shrink: 0; }
</style>
