<script lang="ts">
	import { page } from '$app/state';
	import { panelDict, type PanelLang } from './panel.js';

	let { light = false }: { light?: boolean } = $props();
	const lang = $derived((page.data.lang ?? 'pl') as PanelLang);
	const other = $derived<PanelLang>(lang === 'pl' ? 'en' : 'pl');
</script>

<form method="POST" action="/lang" class="lang" class:light>
	<input type="hidden" name="lang" value={other} />
	<input type="hidden" name="next" value={page.url.pathname + page.url.search} />
	<button class="link" lang={other} aria-label={other === 'en' ? 'Change language to English' : 'Zmień język na polski'}>
		{panelDict(lang).nav.switchTo}
	</button>
</form>

<style>
	.lang { display: inline; margin: 0; }
	.lang button { font-size: 0.85rem; }
	.light button { color: #cfd3f5; }
</style>
