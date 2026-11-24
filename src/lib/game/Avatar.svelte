<script lang="ts" module>
	/** Liczba awatarów (zwierzaki narysowane od zera z prostych kształtów). */
	export const AVATAR_COUNT = 12;
</script>

<script lang="ts">
	import { AVATAR_ART } from './avatar-art.js';
	/**
	 * Awatar gracza: własne, proste zwierzaki (bez cudzych postaci) – rysunki w avatar-art.ts.
	 * animated – delikatne kołysanie i mruganie (wyłączane przy „ogranicz ruch”).
	 */
	let { id, size = '2.4em', animated = false, label = '' }: { id: number; size?: string; animated?: boolean; label?: string } = $props();
	const art = $derived(AVATAR_ART[((id % AVATAR_ART.length) + AVATAR_ART.length) % AVATAR_ART.length]);
</script>

<svg class="avatar" class:animated width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}>
	<!-- Stałe rysunki z kodu aplikacji, nie dane od użytkownika. -->
	<g class="body">{@html art}</g>
</svg>

<style>
	.avatar { display: block; flex-shrink: 0; overflow: visible; }
	.animated .body { animation: bob 2.4s ease-in-out infinite; transform-origin: 50% 90%; }
	.animated :global(.eyes) { animation: blink 4.5s infinite; transform-origin: 50% 50%; transform-box: fill-box; }
	@keyframes bob { 0%, 100% { transform: rotate(-4deg) translateY(0); } 50% { transform: rotate(4deg) translateY(-3px); } }
	@keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
	@media (prefers-reduced-motion: reduce) { .animated .body, .animated :global(.eyes) { animation: none; } }
</style>
