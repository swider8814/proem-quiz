<script lang="ts">
	/** Medal za 1.–3. miejsce (SVG – wygląda tak samo na każdym systemie, w przeciwieństwie do emoji). */
	let { place, size = '1.6em' }: { place: number; size?: string } = $props();
	const colors: Record<number, [string, string]> = { 1: ['#ffd23f', '#c99a00'], 2: ['#e3e8ef', '#9aa4b2'], 3: ['#e7a76c', '#a5612a'] };
	const [fill, edge] = $derived(colors[place] ?? colors[3]);
</script>

<svg class="medal" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={String(place)}>
	<path d="M11 2h7l4 12h-7z" fill="#e4002b" /><path d="M29 2h-7l-4 12h7z" fill="#1368ce" />
	<circle cx="20" cy="25" r="13" fill={fill} stroke={edge} stroke-width="2.5" />
	<circle cx="20" cy="25" r="9" fill="none" stroke={edge} stroke-width="1.2" opacity="0.6" />
	<text x="20" y="29.5" text-anchor="middle" font-size="13" font-weight="900" fill="#3a2a00" font-family="inherit">{place}</text>
</svg>

<style>
	.medal { display: block; flex-shrink: 0; overflow: visible; }
</style>
