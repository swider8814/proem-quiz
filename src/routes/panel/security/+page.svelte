<script lang="ts">
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	let { data, form } = $props();
	const t = $derived(panelDict(page.data.lang));
</script>

<svelte:head><title>{t.security.title} · Proem Quiz</title></svelte:head>

<h1>{t.security.heading}</h1>

{#if data.recoveryUsed}
	<p class="notice">{t.security.recoveryUsed(data.remainingCodes)}</p>
{/if}

<div class="card">
	<h2>{t.security.profile}</h2>
	{#if form?.nameSaved}<p class="success">{t.security.nameSaved}</p>{/if}
	{#if form?.nameError}<p class="error">{form.nameError}</p>{/if}
	<form method="POST" action="?/name" class="name-form">
		<label for="my-name">{t.users.name}</label>
		<div class="row">
			<input id="my-name" name="name" type="text" required minlength="2" maxlength="80" autocomplete="name" value={data.user.name} />
			<button>{t.common.save}</button>
		</div>
		<p class="muted">{t.security.nameNote}</p>
	</form>
</div>

<div class="card">
	<h2>{t.security.totp}</h2>
	{#if data.user.totpEnabled}
		<p><span class="tag ok">{t.security.on}</span></p>
		<p class="codes"><span>{t.security.codesLeft}</span> <span><strong>{data.remainingCodes}</strong> {t.security.of10}</span></p>
		<div class="meter" aria-hidden="true">{#each Array(10) as _, i}<span class:on={i < data.remainingCodes}></span>{/each}</div>
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

{#if data.mail}
	<div class="card">
		<h2>{t.security.password}</h2>
		<p class="muted">{t.security.passwordNote}</p>
		<p><a class="btn secondary" href="/login/forgot">{t.security.passwordBtn}</a></p>
	</div>
{/if}

<style>
	h2 { margin-top: 0; }
	.card { max-width: 40rem; margin-bottom: 1.5rem; }
	.codes { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem; }
	.name-form .row { display: flex; gap: 0.75rem; }
	.name-form .row input { flex: 1; min-width: 0; }
	.meter { display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; margin-bottom: 1rem; }
	.meter span { height: 0.6rem; border-radius: 3px; background: var(--line-strong); }
	.meter span.on { background: var(--accent); }
</style>
