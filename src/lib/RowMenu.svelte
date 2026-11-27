<script lang="ts">
	/**
	 * Menu „Więcej” (ikona ⋯ z Lucide) dla wiersza listy lub karty: rzadsze i niebezpieczne akcje
	 * chowają się tutaj, a w wierszu zostaje najwyżej jedna akcja zależna od stanu.
	 *
	 * Okienko ma `position: fixed` i liczoną pozycję, więc nie ucina go przewijany kontener
	 * (tabela użytkowników ma overflow-x). Otwiera się pod przyciskiem, a gdy brak miejsca – nad nim.
	 * Po załadowaniu strony okienko jest przenoszone do <body>: przodek z `transform` (np. karta quizu
	 * przy :hover) zmieniłby blok odniesienia dla `position: fixed` i menu wylądowałoby obok przycisku.
	 * Zamyka się po kliknięciu poza nim, po Escape (fokus wraca na przycisk), po wybraniu pozycji
	 * (link, przycisk, wysłanie formularza). Pole <select> w środku menu go nie zamyka.
	 *
	 * Pozycje: <a>, <button> lub <form><button>…</button></form>; ikona + tekst. Klasa `danger`
	 * na przycisku = czerwona pozycja, `<hr>` = separator przed akcjami niebezpiecznymi.
	 * Treść jest w DOM cały czas (tylko ukryta), żeby `use:enhance` formularzy działało do końca
	 * wysyłania, także gdy menu już się zamknęło.
	 */
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import Icon from '#lib/Icon.svelte';

	/** trigger – własna zawartość przycisku (np. menu języka: ikona + „PL”); domyślnie ikona ⋯. */
	let { label, children, trigger }: { label: string; children: Snippet; trigger?: Snippet } = $props();
	const id = $props.id();
	let open = $state(false);
	let btn: HTMLButtonElement | undefined = $state();
	let pop: HTMLDivElement | undefined = $state();
	let top = $state(0);
	let left = $state(0);
	let up = $state(false);

	let maxH: number | null = $state(null);

	/** Pod przyciskiem, jeśli się zmieści; inaczej nad nim; gdy nie mieści się nigdzie (telefon
	 * w poziomie, duże powiększenie) – po stronie z większym miejscem, z przewijaniem w środku. */
	function place() {
		if (!btn || !pop) return;
		const r = btn.getBoundingClientRect();
		// Przycisk ⋯ zniknął (np. obrót tabletu ponad breakpoint, gdzie akcje są w pasku) – menu w <body>
		// zostałoby samo na wierzchu, więc zamykamy je.
		if (!btn.getClientRects().length) return close();
		const w = pop.offsetWidth;
		const h = pop.scrollHeight;
		const gap = 6;
		const margin = 8;
		const below = innerHeight - margin - (r.bottom + gap);
		const above = r.top - gap - margin;
		if (h <= below) [up, top, maxH] = [false, r.bottom + gap, null];
		else if (h <= above) [up, top, maxH] = [true, r.top - gap - h, null];
		else if (Math.max(above, below) < 120) [up, top, maxH] = [false, margin, innerHeight - 2 * margin]; // przycisk przy krawędzi: menu może go przykryć
		else if (above > below) [up, top, maxH] = [true, margin, above];
		else [up, top, maxH] = [false, r.bottom + gap, below];
		left = Math.max(margin, Math.min(r.right - w, innerWidth - w - margin));
	}

	async function show() {
		open = true;
		await tick();
		place();
		pop?.querySelector<HTMLElement>('a[href], button:not(:disabled), select')?.focus({ preventScroll: true });
	}

	function close(refocus = false) {
		if (!open) return;
		open = false;
		if (refocus) btn?.focus();
	}

	function onWindowClick(e: MouseEvent) {
		if (open && !pop?.contains(e.target as Node) && !btn?.contains(e.target as Node)) close();
	}

	/** Przenosi okienko do <body> (patrz wyżej); przy zniszczeniu komponentu usuwa je stamtąd. */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	// Tab poza menu (okienko jest w <body>, więc fokus może z niego wyjść daleko od przycisku) – zamknij.
	function onFocusOut(e: FocusEvent) {
		const to = e.relatedTarget as Node | null;
		if (to && !pop?.contains(to) && !btn?.contains(to)) close();
	}

	function onPopClick(e: MouseEvent) {
		// Wybór pozycji zamyka menu; przycisk wysyłający formularz wyśle go mimo to (formularz jest w DOM).
		if ((e.target as Element).closest('a[href], button')) close();
	}

	// Przewijanie (także wewnątrz kontenerów) i zmiana rozmiaru: menu jedzie za przyciskiem.
	$effect(() => {
		if (!open) return;
		const onMove = () => place();
		addEventListener('scroll', onMove, { capture: true, passive: true });
		addEventListener('resize', onMove);
		return () => {
			removeEventListener('scroll', onMove, { capture: true });
			removeEventListener('resize', onMove);
		};
	});
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => open && e.key === 'Escape' && close(true)} />

<button
	type="button"
	class="trigger secondary"
	class:custom={!!trigger}
	class:on={open}
	bind:this={btn}
	aria-label={label}
	title={label}
	aria-haspopup="true"
	aria-expanded={open}
	aria-controls={id}
	onclick={() => (open ? close() : show())}
>
	{#if trigger}{@render trigger()}{:else}<Icon name="more" weight={2.5} />{/if}
</button>
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="pop" class:up {id} use:portal bind:this={pop} hidden={!open} style:top="{top}px" style:left="{left}px" style:max-height={maxH === null ? null : `${maxH}px`} onclick={onPopClick} onfocusout={onFocusOut} onsubmit={() => close()}>
	{@render children()}
</div>

<style>
	.trigger { width: 2.5rem; min-height: 2.5rem; padding: 0; flex: none; font-size: 1.15rem; }
	.trigger.custom { width: auto; gap: 0.3rem; padding: 0 0.6rem; font-size: 0.87rem; }
	/* Także przy :hover – iOS zostawia hover po dotknięciu, a jasne tło ukrywało białe kropki. */
	.trigger.on, .trigger.on:hover:not(:disabled) { background: var(--accent); border-color: var(--accent); color: #fff; }
	.pop { position: fixed; z-index: 60; min-width: 13rem; max-width: calc(100vw - 1rem); box-sizing: border-box; display: flex; flex-direction: column; padding: 0.35rem; background: #fff; border: 1px solid var(--line-strong); border-radius: 0.75rem; box-shadow: 0 12px 32px rgba(27, 31, 59, 0.18); overflow-y: auto; overscroll-behavior: contain; text-align: left; white-space: normal; transform-origin: top right; animation: pop-in var(--dur-fast) var(--ease-out); }
	.pop[hidden] { display: none; }
	.pop.up { transform-origin: bottom right; }
	.pop :global(form) { display: block; margin: 0; }
	/* box-sizing: link (<a>) ma domyślnie content-box i z paddingiem był wyższy od przycisków. */
	.pop :global(a), .pop :global(button) { box-sizing: border-box; display: flex; width: 100%; align-items: center; justify-content: flex-start; gap: 0.65rem; line-height: 1.25; min-height: 2.5rem; padding: 0.4rem 0.7rem; border: 0; border-radius: 0.5rem; background: none; color: var(--text); font-size: 0.95rem; font-weight: 500; text-align: left; text-decoration: none; white-space: nowrap; }
	.pop :global(a:hover), .pop :global(button:hover:not(:disabled)) { background: var(--soft); filter: none; }
	.pop :global(button.danger) { color: var(--danger); }
	.pop :global(button.danger:hover:not(:disabled)) { background: #fdf1f3; }
	.pop :global(hr) { width: 100%; margin: 0.3rem 0; border: 0; border-top: 1px solid var(--line); }
	.pop :global(label) { margin: 0.2rem 0.7rem 0.4rem; font-size: 0.85rem; }
	.pop :global(select) { margin-top: 0.3rem; }
	/* Telefon i każdy ekran dotykowy (także iPhone w poziomie i tablet). */
	@media (max-width: 720px), (pointer: coarse) {
		.trigger { width: 44px; min-height: 44px; }
		.trigger.custom { width: auto; }
		.pop :global(a), .pop :global(button) { min-height: 44px; }
	}
</style>
