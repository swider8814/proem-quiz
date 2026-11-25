<script lang="ts">
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	let { data } = $props();
	const t = $derived(panelDict(page.data.lang));
</script>

<svelte:head><title>{t.security.title} · Proem Quiz</title></svelte:head>

<h1>{t.security.heading}</h1>

{#if data.recoveryUsed}
	<p class="notice">{t.security.recoveryUsed(data.remainingCodes)}</p>
{/if}

<div class="card">
	<h2>{t.security.totp}</h2>
	{#if data.user.totpEnabled}
		<p><span class="tag ok">{t.security.on}</span></p>
		<p>{t.security.codesLeft}: <strong>{data.remainingCodes}</strong> {t.security.of10}.</p>
		{#if data.remainingCodes <= 3}
			<p class="error">{t.security.lowCodes}</p>
		{/if}
		<p>
			<a class="btn" href="/panel/2fa-setup?new">{t.security.newPhone}</a>
		</p>
		<p class="muted">{t.security.reconfigNote}</p>
	{:else}
		<p><span class="tag off">{t.security.off}</span></p>
		<p>{t.security.recommend}</p>
		<p><a class="btn" href="/panel/2fa-setup">{t.security.enable}</a></p>
	{/if}
</div>

<style>
	h2 { font-size: 1.1rem; margin-top: 0; }
</style>
