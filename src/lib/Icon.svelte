<script lang="ts">
	/**
	 * Ikony jako SVG zamiast znaków Unicode/emoji (↻ ⛶ → 📺 …). Znaki zależą od czcionek
	 * systemu (Windows, Android, iOS rysują je inaczej i w innej wysokości), więc w przyciskach
	 * potrafiły się rozjeżdżać. SVG ma stały rozmiar 1em i jest wyśrodkowane.
	 *
	 * Rysunki z zestawu Lucide (https://lucide.dev, licencja ISC – static/licenses/lucide.txt),
	 * wklejone jako ścieżki, bez zależności w czasie działania. Nazwa ikony Lucide jest w komentarzu
	 * przy każdej gałęzi – nową ikonę bierz z tego samego zestawu, żeby styl był spójny.
	 * weight – grubość kreski: gra ma grube, „plakatowe” przyciski (2.5), panel cieńsze (2).
	 */
	type Name = 'replay' | 'close' | 'check' | 'fullscreen' | 'next' | 'back' | 'up' | 'down' | 'screen' | 'sound' | 'dice' | 'thumbUp' | 'thumbDown' | 'music' | 'edit' | 'quizzes' | 'palette' | 'users' | 'settings' | 'shield' | 'help' | 'user';
	let { name, size = '1em', weight = 2.5 }: { name: Name; size?: string; weight?: number } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={weight} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
	{#if name === 'replay'}
		<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" />  <!-- rotate-ccw -->
	{:else if name === 'close'}
		<path d="M18 6 6 18" /> <path d="m6 6 12 12" />  <!-- x -->
	{:else if name === 'check'}
		<path d="M20 6 9 17l-5-5" />  <!-- check -->
	{:else if name === 'fullscreen'}
		<path d="M8 3H5a2 2 0 0 0-2 2v3" /> <path d="M21 8V5a2 2 0 0 0-2-2h-3" /> <path d="M3 16v3a2 2 0 0 0 2 2h3" /> <path d="M16 21h3a2 2 0 0 0 2-2v-3" />  <!-- maximize -->
	{:else if name === 'next'}
		<path d="M5 12h14" /> <path d="m12 5 7 7-7 7" />  <!-- arrow-right -->
	{:else if name === 'back'}
		<path d="m12 19-7-7 7-7" /> <path d="M19 12H5" />  <!-- arrow-left -->
	{:else if name === 'up'}
		<path d="m5 12 7-7 7 7" /> <path d="M12 19V5" />  <!-- arrow-up -->
	{:else if name === 'down'}
		<path d="M12 5v14" /> <path d="m19 12-7 7-7-7" />  <!-- arrow-down -->
	{:else if name === 'screen'}
		<rect width="20" height="14" x="2" y="3" rx="2" /> <line x1="8" x2="16" y1="21" y2="21" /> <line x1="12" x2="12" y1="17" y2="21" />  <!-- monitor -->
	{:else if name === 'sound'}
		<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" /> <path d="M16 9a5 5 0 0 1 0 6" /> <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />  <!-- volume-2 -->
	{:else if name === 'dice'}
		<rect width="12" height="12" x="2" y="10" rx="2" ry="2" /> <path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6" /> <path d="M6 18h.01" /> <path d="M10 14h.01" /> <path d="M15 6h.01" /> <path d="M18 9h.01" />  <!-- dices -->
	{:else if name === 'thumbUp'}
		<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /> <path d="M7 10v12" />  <!-- thumbs-up -->
	{:else if name === 'thumbDown'}
		<path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /> <path d="M17 14V2" />  <!-- thumbs-down -->
	{:else if name === 'music'}
		<path d="M21 16V3a1 1 0 0 0-1.28-.96l-10 2.917a1 1 0 0 0-.72.96V19" /> <circle cx="18" cy="16" r="3" /> <circle cx="6" cy="19" r="3" />  <!-- music -->
	{:else if name === 'edit'}
		<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /> <path d="m15 5 4 4" />  <!-- pencil -->
	{:else if name === 'user'}
		<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /> <circle cx="12" cy="7" r="4" />  <!-- user -->
	{:else if name === 'quizzes'}
		<rect width="7" height="7" x="3" y="3" rx="1" /> <rect width="7" height="7" x="14" y="3" rx="1" /> <rect width="7" height="7" x="14" y="14" rx="1" /> <rect width="7" height="7" x="3" y="14" rx="1" />  <!-- layout-grid -->
	{:else if name === 'palette'}
		<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /> <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /> <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /> <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /> <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />  <!-- palette -->
	{:else if name === 'users'}
		<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <path d="M16 3.128a4 4 0 0 1 0 7.744" /> <path d="M22 21v-2a4 4 0 0 0-3-3.87" /> <circle cx="9" cy="7" r="4" />  <!-- users -->
	{:else if name === 'settings'}
		<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /> <circle cx="12" cy="12" r="3" />  <!-- settings -->
	{:else if name === 'shield'}
		<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /> <path d="m9 12 2 2 4-4" />  <!-- shield-check -->
	{:else if name === 'help'}
		<circle cx="12" cy="12" r="10" /> <path d="M9 9.5a3 2.5 0 016 0c0 2-2 2-3 3.5" /> <path d="M12 17h.01" />  <!-- circle-help -->
	{/if}
</svg>

<style>
	.icon { display: block; flex-shrink: 0; }
</style>
