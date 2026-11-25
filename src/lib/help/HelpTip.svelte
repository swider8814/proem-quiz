<script lang="ts">
	// Mały przycisk „?” przy mniej oczywistej opcji: krótka podpowiedź + link do sekcji Pomocy.
	// Dymek ma position: fixed i liczone położenie – zawsze mieści się w oknie (także na telefonie,
	// gdy „?” jest przy prawej krawędzi), a gdy pod przyciskiem brakuje miejsca, otwiera się nad nim.
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	import { HELP_TIPS, type HelpTipId } from './content.js';

	let { id }: { id: HelpTipId } = $props();
	const lang = $derived(page.data.lang === 'en' ? 'en' : 'pl');
	const t = $derived(panelDict(page.data.lang));
	const tip = $derived(HELP_TIPS[id]);
	let open = $state(false);
	let btn: HTMLButtonElement | undefined = $state();
	let pop: HTMLElement | undefined = $state();
	let pos = $state({ left: 0, top: 0 });
	const uid = `tip-${Math.random().toString(36).slice(2, 9)}`;
	const MARGIN = 8;

	function place() {
		if (!btn || !pop) return;
		const b = btn.getBoundingClientRect();
		const w = pop.offsetWidth;
		const h = pop.offsetHeight;
		const vw = document.documentElement.clientWidth;
		const vh = window.innerHeight;
		const left = Math.min(Math.max(MARGIN, b.left - MARGIN), vw - w - MARGIN);
		const below = b.bottom + 6;
		const top = below + h > vh - MARGIN && b.top - 6 - h >= MARGIN ? b.top - 6 - h : below;
		pos = { left: Math.max(MARGIN, left), top };
	}

	$effect(() => {
		if (!open) return;
		place();
		const close = () => (open = false);
		const onDown = (e: PointerEvent) => {
			const el = e.target as Node;
			if (!pop?.contains(el) && !btn?.contains(el)) close();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				close();
				btn?.focus();
			}
		};
		window.addEventListener('resize', place);
		window.addEventListener('scroll', close, { capture: true, passive: true });
		document.addEventListener('pointerdown', onDown, true);
		document.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', close, { capture: true });
			document.removeEventListener('pointerdown', onDown, true);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

<span class="helptip">
	<button bind:this={btn} type="button" class="q" aria-expanded={open} aria-controls={uid} aria-label={t.help.tipLabel} onclick={(e) => { e.preventDefault(); open = !open; }}>?</button>
	{#if open}
		<span bind:this={pop} class="pop" id={uid} role="note" style:left="{pos.left}px" style:top="{pos.top}px">
			{tip[lang]}
			<a href={`/panel/help#${tip.section}`}>{t.help.more}</a>
		</span>
	{/if}
</span>

<style>
	/* Środek „?” na wysokości środka wielkich liter etykiety (samo middle wypada ~1,5 px za nisko). */
	.helptip { display: inline-flex; vertical-align: middle; position: relative; top: -0.12em; margin-left: 0.35rem; }
	.q { flex: none; width: 1.35rem; height: 1.35rem; min-height: 0; min-width: 0; padding: 0; border-radius: 50%; border: 1px solid var(--line-strong); background: var(--surface); color: var(--muted); font-size: 0.8rem; font-weight: 700; line-height: 1; cursor: pointer; }
	.q:hover, .q[aria-expanded='true'] { color: var(--text); border-color: var(--text); }
	.pop { position: fixed; z-index: 50; width: min(18rem, calc(100vw - 16px)); box-sizing: border-box; padding: 0.7rem 0.85rem; border: 1px solid var(--line-strong); border-radius: var(--radius-s); background: var(--surface); box-shadow: 0 8px 24px rgba(27, 31, 59, 0.12); font-size: 0.85rem; font-weight: 400; line-height: 1.45; color: var(--text); text-transform: none; letter-spacing: normal; white-space: normal; text-align: left; }
	.pop a { display: block; margin-top: 0.4rem; color: var(--link); font-weight: 600; }
</style>
