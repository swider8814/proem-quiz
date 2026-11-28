<script lang="ts">
	/**
	 * Jedno okno z pytaniem na całą aplikację (patrz `dialog.svelte.ts`). <dialog> z showModal():
	 * warstwa „top layer” jest nad wszystkim – także nad ekranem prowadzącego (overlay z z-index)
	 * i w trybie pełnoekranowym, więc okno nie wyrzuca z pełnego ekranu jak natywne confirm().
	 * Style są samodzielne (bez zmiennych panelu), bo okno pojawia się też na ekranie gry.
	 */
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import { answer, askDefaults, dialogState } from '#lib/dialog.svelte.js';
	import { panelDict } from '#lib/i18n/panel.js';

	const id = $props.id();
	let el: HTMLDialogElement | undefined = $state();
	const req = $derived(dialogState.current);

	$effect(() => {
		const c = panelDict(page.data?.lang).common;
		askDefaults.confirm = c.confirmAction;
		askDefaults.cancel = c.cancel;
	});

	$effect(() => {
		if (!el) return;
		if (req && !el.open) {
			el.showModal();
			// Przy akcji niszczącej fokus na „Anuluj” – Enter/spacja z rozpędu niczego nie usunie.
			const danger = req.actions.some((a) => a.kind === 'danger');
			const target = el.querySelector<HTMLButtonElement>(danger ? 'button.secondary' : 'button.primary') ?? el.querySelector('button');
			target?.focus();
		} else if (!req && el.open) el.close();
	});

	// Esc (zdarzenie cancel → close) = brak wyboru.
	function onClose() {
		if (dialogState.current) answer(null);
	}
	// Kliknięcie w przyciemnione tło (poza okienkiem) = anuluj.
	function onBackdrop(e: MouseEvent) {
		if (e.target === el) answer(null);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog class="pq-dialog" bind:this={el} onclose={onClose} onclick={onBackdrop} aria-labelledby={req?.title ? `${id}-t` : undefined} aria-describedby="{id}-m">
	{#if req}
		<div class="box">
			{#if req.title}<h2 id="{id}-t">{req.title}</h2>{/if}
			<p id="{id}-m" class:lead={!req.title}>{req.message}</p>
			<div class="actions">
				{#each req.actions as a (a.id)}
					<button type="button" class={a.kind ?? 'secondary'} data-action={a.id} onclick={() => answer(a.id)}>
						{#if a.icon}<Icon name={a.icon} weight={2} />{/if}{a.label}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</dialog>

<style>
	.pq-dialog {
		box-sizing: border-box; width: min(27rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); padding: 0;
		border: 1px solid #d5d8e2; border-radius: 1rem; background: #fff; color: #1b1f3b;
		box-shadow: 0 24px 60px rgba(27, 31, 59, 0.25);
		font-family: 'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.45;
	}
	.pq-dialog[open] { animation: pq-dlg-in 160ms cubic-bezier(0.22, 1, 0.36, 1); }
	.pq-dialog::backdrop { background: rgba(27, 31, 59, 0.45); }
	@keyframes pq-dlg-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
	@media (prefers-reduced-motion: reduce) { .pq-dialog[open] { animation: none; } }
	.box { padding: 1.4rem; }
	h2 { margin: 0 0 0.5rem; font-family: 'Space Grotesk Variable', 'Inter Variable', Inter, system-ui, sans-serif; font-size: 1.2rem; font-weight: 700; letter-spacing: -0.01em; }
	p { margin: 0 0 1.2rem; color: #5b6072; white-space: pre-line; overflow-wrap: anywhere; }
	p.lead { color: #1b1f3b; font-size: 1.02rem; font-weight: 500; }
	.actions { display: flex; flex-direction: column; gap: 0.5rem; }
	button {
		box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; width: 100%; min-height: 2.75rem;
		padding: 0.55rem 1rem; border: 1px solid transparent; border-radius: 0.625rem; font: inherit; font-weight: 600; cursor: pointer;
		transition: background-color 140ms, border-color 140ms;
	}
	button:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(27, 79, 184, 0.35); }
	.primary { background: #1b1f3b; border-color: #1b1f3b; color: #fff; }
	.primary:hover { background: #2b3160; }
	.danger { background: #a3102a; border-color: #a3102a; color: #fff; }
	.danger:hover { background: #8a0d23; border-color: #8a0d23; }
	.secondary { background: #fff; color: #1b1f3b; border-color: #d5d8e2; }
	.secondary:hover { background: #f4f5f8; }
	/* Szerszy ekran i dwa przyciski: obok siebie, potwierdzenie po prawej (jak w systemowych oknach). */
	@media (min-width: 560px) {
		.actions:has(> :nth-child(2):last-child) { flex-direction: row-reverse; }
		.actions:has(> :nth-child(2):last-child) button { width: auto; flex: 1; }
	}
	@media (max-width: 720px), (pointer: coarse) { button { min-height: 44px; } }
</style>
