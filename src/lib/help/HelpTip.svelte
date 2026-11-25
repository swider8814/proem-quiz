<script lang="ts">
	// Mały przycisk „?” przy mniej oczywistej opcji: krótka podpowiedź + link do sekcji Pomocy.
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	import { HELP_TIPS, type HelpTipId } from './content.js';

	let { id }: { id: HelpTipId } = $props();
	const lang = $derived(page.data.lang === 'en' ? 'en' : 'pl');
	const t = $derived(panelDict(page.data.lang));
	const tip = $derived(HELP_TIPS[id]);
	let open = $state(false);
	const uid = `tip-${Math.random().toString(36).slice(2, 9)}`;
</script>

<span class="helptip">
	<button type="button" class="q" aria-expanded={open} aria-controls={uid} aria-label={t.help.tipLabel} onclick={() => (open = !open)}>?</button>
	{#if open}
		<span class="pop" id={uid} role="note">
			{tip[lang]}
			<a href={`/panel/help#${tip.section}`}>{t.help.more}</a>
		</span>
	{/if}
</span>

<style>
	.helptip { position: relative; display: inline-flex; vertical-align: middle; margin-left: 0.35rem; }
	.q { flex: none; width: 1.35rem; height: 1.35rem; min-height: 0; min-width: 0; padding: 0; border-radius: 50%; border: 1px solid var(--line-strong); background: var(--surface); color: var(--muted); font-size: 0.8rem; font-weight: 700; line-height: 1; cursor: pointer; }
	.q:hover, .q[aria-expanded='true'] { color: var(--text); border-color: var(--text); }
	.pop { position: absolute; z-index: 20; top: calc(100% + 0.4rem); left: -0.5rem; width: min(18rem, 80vw); padding: 0.7rem 0.85rem; border: 1px solid var(--line-strong); border-radius: var(--radius-s); background: var(--surface); box-shadow: 0 8px 24px rgba(27, 31, 59, 0.12); font-size: 0.85rem; font-weight: 400; line-height: 1.45; color: var(--text); text-transform: none; letter-spacing: normal; white-space: normal; }
	.pop a { display: block; margin-top: 0.4rem; color: var(--link); font-weight: 600; }
</style>
