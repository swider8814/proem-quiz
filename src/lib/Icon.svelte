<script lang="ts">
	/**
	 * Ikony jako SVG zamiast znaków Unicode/emoji (↻ ⛶ → 📺 …). Znaki zależą od czcionek
	 * systemu (Windows, Android, iOS rysują je inaczej i w innej wysokości), więc w przyciskach
	 * potrafiły się rozjeżdżać. SVG ma stały rozmiar 1em i jest wyśrodkowane.
	 */
	type Name = 'replay' | 'close' | 'check' | 'fullscreen' | 'next' | 'back' | 'up' | 'down' | 'screen' | 'sound' | 'dice' | 'thumbUp' | 'thumbDown' | 'music' | 'edit' | 'quizzes' | 'palette' | 'users' | 'settings' | 'shield' | 'help';
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
	{:else if name === 'thumbUp'}
		<path d="M7 10v11H3V10z" /><path d="M7 10l4-8a2.5 2.5 0 0 1 3 2.6L13.4 9H19a2 2 0 0 1 2 2.3l-1.3 7.7A2.5 2.5 0 0 1 17.2 21H7" />
	{:else if name === 'thumbDown'}
		<path d="M17 14V3h4v11z" /><path d="M17 14l-4 8a2.5 2.5 0 0 1-3-2.6l.6-4.4H5a2 2 0 0 1-2-2.3L4.3 5A2.5 2.5 0 0 1 6.8 3H17" />
	{:else if name === 'edit'}
		<path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" />
	{:else if name === 'music'}
		<path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" />
	{:else if name === 'dice'}
		<rect x="3.5" y="3.5" width="17" height="17" rx="3" /><circle cx="8.5" cy="8.5" r="0.6" fill="currentColor" /><circle cx="15.5" cy="15.5" r="0.6" fill="currentColor" /><circle cx="12" cy="12" r="0.6" fill="currentColor" /><circle cx="15.5" cy="8.5" r="0.6" fill="currentColor" /><circle cx="8.5" cy="15.5" r="0.6" fill="currentColor" />
	{:else if name === 'quizzes'}
		<rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
	{:else if name === 'palette'}
		<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.1-.5-1.3.3-2.4 1.7-2.4H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5z" /><circle cx="7.5" cy="11" r="0.9" fill="currentColor" /><circle cx="10.5" cy="7" r="0.9" fill="currentColor" /><circle cx="15.5" cy="7.5" r="0.9" fill="currentColor" />
	{:else if name === 'users'}
		<circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-3.6 3.2-6 6.5-6s6 2.4 6.5 6" /><path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2 .8 3.2 2.8 3.5 5.6" />
	{:else if name === 'settings'}
		<circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
	{:else if name === 'shield'}
		<path d="M12 3l8 3v5.5c0 4.8-3.3 8.4-8 9.5-4.7-1.1-8-4.7-8-9.5V6z" /><rect x="9" y="11" width="6" height="5" rx="1" /><path d="M10.2 11V9.6a1.8 1.8 0 0 1 3.6 0V11" />
	{:else if name === 'help'}
		<circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.6" /><circle cx="12" cy="17" r="0.6" fill="currentColor" />
	{/if}
</svg>

<style>
	.icon { display: block; flex-shrink: 0; }
</style>
