<script lang="ts">
	// Liczba „dobiegająca” od poprzedniej wartości do nowej (punkty na tablicy wyników).
	let { from = 0, to, delay = 0, duration = 900 }: { from?: number; to: number; delay?: number; duration?: number } = $props();
	let shown = $state(0);
	$effect(() => {
		const a = from, b = to;
		shown = a;
		if (a === b || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			shown = b;
			return;
		}
		let raf = 0;
		const t0 = performance.now() + delay;
		const step = (t: number) => {
			const k = Math.min(1, Math.max(0, (t - t0) / duration));
			shown = Math.round(a + (b - a) * (1 - (1 - k) ** 3));
			if (k < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	});
</script>

{shown}
