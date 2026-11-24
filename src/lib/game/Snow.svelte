<script lang="ts">
	// Padający śnieg (motyw świąteczny): same płatki z CSS, bez obsługi kliknięć, wyłączany przy „ogranicz ruch”.
	let { count = 40 }: { count?: number } = $props();
	// Stały „losowy” rozkład (ten sam przy każdym renderze – bez skakania płatków).
	const flakes = $derived(
		Array.from({ length: count }, (_, i) => {
			const r = (n: number) => ((Math.sin((i + 1) * n) * 10000) % 1 + 1) % 1;
			return { left: r(12.9898) * 100, size: 4 + r(78.233) * 8, dur: 9 + r(37.719) * 10, delay: -r(91.17) * 20, sway: 10 + r(5.3) * 30, op: 0.5 + r(3.7) * 0.5 };
		})
	);
</script>

<div class="snow" aria-hidden="true">
	{#each flakes as f, i (i)}
		<span style="left:{f.left}%; width:{f.size}px; height:{f.size}px; animation-duration:{f.dur}s; animation-delay:{f.delay}s; --sway:{f.sway}px; opacity:{f.op}"></span>
	{/each}
</div>

<style>
	.snow { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 1; }
	span { position: absolute; top: -20px; border-radius: 50%; background: #fff; box-shadow: 0 0 6px rgba(255, 255, 255, 0.7); animation: fall linear infinite; will-change: transform; }
	@keyframes fall {
		0% { transform: translate3d(0, -20px, 0); }
		50% { transform: translate3d(var(--sway), 55vh, 0); }
		100% { transform: translate3d(0, 110vh, 0); }
	}
	@media (prefers-reduced-motion: reduce) { .snow { display: none; } }
</style>
