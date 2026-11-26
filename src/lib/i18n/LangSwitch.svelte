<script lang="ts">
	/**
	 * Menu języka panelu (PL / EN / UK). Każda pozycja to osobny formularz POST /lang –
	 * serwer zapisuje ciasteczko i język konta, potem wraca na tę samą stronę.
	 * Nazwy języków w ich własnym języku (bez flag), bieżący oznaczony ptaszkiem.
	 */
	import { page } from '$app/state';
	import Icon from '#lib/Icon.svelte';
	import RowMenu from '#lib/RowMenu.svelte';
	import { PANEL_LANGS, isPanelLang, panelDict } from './panel.js';

	const lang = $derived(isPanelLang(page.data.lang) ? page.data.lang : 'pl');
	const next = $derived(page.url.pathname + page.url.search);
	// Etykieta w bieżącym języku i po angielsku – ktoś, kto przypadkiem przełączył na nieznany język, nadal znajdzie menu.
	const label = $derived(lang === 'en' ? 'Language' : `${panelDict(lang).common.language} / Language`);
</script>

<span class="lang">
	<RowMenu {label}>
		{#snippet trigger()}
			<Icon name="languages" size="1.1em" weight={2} /><span class="code">{lang.toUpperCase()}</span><Icon name="chevronDown" size="0.9em" weight={2} />
		{/snippet}
		{#each PANEL_LANGS as l (l)}
			<form method="POST" action="/lang">
				<input type="hidden" name="lang" value={l} />
				<input type="hidden" name="next" value={next} />
				<button lang={l} aria-current={l === lang ? 'true' : undefined}>
					<span class="name">{panelDict(l).langName}</span>
					{#if l === lang}<Icon name="check" size="1.05em" weight={2.5} />{/if}
				</button>
			</form>
		{/each}
	</RowMenu>
</span>

<style>
	.lang { display: inline-flex; }
	.code { font-weight: 700; letter-spacing: 0.04em; }
	.name { flex: 1; }
	button[aria-current='true'] { font-weight: 700; }
</style>
