<script lang="ts">
	/**
	 * Układanie w kolejności przeciąganiem (palec lub mysz) – bez bibliotek.
	 * Przeciągany element idzie za palcem, pozostałe rozsuwają się; puszczenie zapisuje kolejność.
	 * Strzałki przy każdym elemencie: dla klawiatury, czytnika ekranu i gdy przeciąganie jest niewygodne.
	 */
	import Icon from '#lib/Icon.svelte';

	type Item = { id: string; label: string };
	let { items, order = $bindable(), upLabel, downLabel }: { items: Item[]; order: string[]; upLabel: string; downLabel: string } = $props();

	const labelOf = (id: string) => items.find((i) => i.id === id)?.label ?? '';
	const colorOf = (id: string) => items.findIndex((i) => i.id === id) % 4;

	let listEl: HTMLOListElement;
	let dragId = $state<string | null>(null);
	let from = 0;
	let target = $state(0);
	let dy = $state(0);
	let startY = 0;
	let slot = 0; // wysokość elementu + odstęp
	let centers: number[] = [];
	let settling = $state(false);

	function down(e: PointerEvent, id: string) {
		if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
		const els = [...listEl.children] as HTMLElement[];
		const rects = els.map((el) => el.getBoundingClientRect());
		from = order.indexOf(id);
		target = from;
		centers = rects.map((r) => r.top + r.height / 2);
		const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0;
		slot = rects[from].height + gap;
		startY = e.clientY;
		dy = 0;
		dragId = id;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		navigator.vibrate?.(15);
	}

	function move(e: PointerEvent) {
		if (!dragId) return;
		dy = e.clientY - startY;
		const c = centers[from] + dy;
		let t = from;
		// Zamiana, gdy środek przeciąganego minie połowę drogi do sąsiedniego miejsca.
		while (t < order.length - 1 && c > (centers[t] + centers[t + 1]) / 2) t++;
		while (t > 0 && c < (centers[t] + centers[t - 1]) / 2) t--;
		if (t !== target) navigator.vibrate?.(8);
		target = t;
	}

	function up() {
		if (!dragId) return;
		const next = [...order];
		next.splice(target, 0, next.splice(from, 1)[0]);
		// Bez animacji w chwili zapisu – inaczej elementy „odskoczyłyby” z przesunięcia.
		settling = true;
		order = next;
		dragId = null;
		dy = 0;
		requestAnimationFrame(() => requestAnimationFrame(() => (settling = false)));
	}

	function shift(i: number): number {
		if (!dragId || i === from) return 0;
		if (from < target && i > from && i <= target) return -slot;
		if (target < from && i >= target && i < from) return slot;
		return 0;
	}

	function step(i: number, d: -1 | 1) {
		const j = i + d;
		if (j < 0 || j >= order.length) return;
		const next = [...order];
		[next[i], next[j]] = [next[j], next[i]];
		order = next;
	}
</script>

<ol class="order" bind:this={listEl} class:settling class:dragging={!!dragId}>
	{#each order as id, i (id)}
		<li
			class="g-tile a{colorOf(id)} item"
			class:lifted={dragId === id}
			style:transform={dragId === id ? `translateY(${dy}px) scale(1.03)` : `translateY(${shift(i)}px)`}
			onpointerdown={(e) => down(e, id)}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
		>
			<span class="grip" aria-hidden="true"><span></span><span></span><span></span></span>
			<b class="no">{(dragId === id ? target : i + Math.sign(shift(i))) + 1}.</b>
			<span class="label">{labelOf(id)}</span>
			<span class="arrows">
				<button type="button" class="arrow" onclick={() => step(i, -1)} disabled={i === 0} aria-label="{upLabel}: {labelOf(id)}"><Icon name="up" /></button>
				<button type="button" class="arrow" onclick={() => step(i, 1)} disabled={i === order.length - 1} aria-label="{downLabel}: {labelOf(id)}"><Icon name="down" /></button>
			</span>
		</li>
	{/each}
</ol>

<style>
	.order { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
	.item {
		display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 12px; min-height: 60px;
		font-size: 1.1rem; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab;
		transition: transform 0.2s ease, box-shadow 0.2s;
		position: relative;
	}
	.settling .item, .item.lifted { transition: none; }
	.item.lifted { z-index: 2; cursor: grabbing; box-shadow: 0 12px 24px rgba(0, 0, 0, 0.25); }
	.grip { display: flex; flex-direction: column; gap: 3px; opacity: 0.6; }
	.grip span { width: 16px; height: 3px; border-radius: 2px; background: currentColor; }
	.no { min-width: 1.6em; font-variant-numeric: tabular-nums; }
	.label { flex: 1; font-weight: 800; word-break: break-word; }
	.arrows { display: flex; gap: 6px; }
	.arrow {
		width: 40px; height: 40px; border-radius: 50%; border: 0; padding: 0; cursor: pointer;
		display: inline-flex; align-items: center; justify-content: center; font-size: 1.1rem;
		background: rgba(255, 255, 255, 0.55); color: inherit;
	}
	.arrow:disabled { opacity: 0.3; cursor: default; }
	@media (prefers-reduced-motion: reduce) { .item { transition: none; } }
</style>
