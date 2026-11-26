<script lang="ts">
	import { enhance } from '$app/forms';
	import { send } from '#lib/forms.js';
	import BackLink from '#lib/BackLink.svelte';
	import '#lib/styles/panel.css';
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	import LangSwitch from '#lib/i18n/LangSwitch.svelte';
	let { form } = $props();
	const t = $derived(panelDict(page.data.lang));
</script>

<svelte:head><title>{t.auth.resetTitle} · Proem Quiz</title></svelte:head>

<main class="auth">
	<div class="card">
		<BackLink href="/login" label={t.auth.backToLogin} />
		<h1>{t.auth.forgot}</h1>
		{#if form?.sent}
			<p class="success" role="status">{t.auth.forgotSent}</p>
		{:else}
			<p class="muted">{t.auth.forgotIntro}</p>
			{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
			<form method="POST" use:enhance={send()}>
				<label for="email">{t.common.email}</label>
				<input id="email" name="email" type="email" autocomplete="username" required />
				<button class="block">{t.auth.sendLink}</button>
			</form>
		{/if}
	</div>
	<div class="lang-row"><LangSwitch /></div>
</main>
