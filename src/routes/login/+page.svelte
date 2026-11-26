<script lang="ts">
	import { enhance } from '$app/forms';
	import { send } from '#lib/forms.js';
	import '#lib/styles/panel.css';
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	import LangSwitch from '#lib/i18n/LangSwitch.svelte';
	let { form } = $props();
	const t = $derived(panelDict(page.data.lang));
</script>

<svelte:head><title>{t.auth.loginTitle} · Proem Quiz</title></svelte:head>

<main class="auth">
	<div class="card">
		<h1>{t.auth.signIn}</h1>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<form method="POST" use:enhance={send()}>
			<label for="email">{t.common.email}</label>
			<input id="email" name="email" type="email" autocomplete="username" required value={form?.email ?? ''} />
			<label for="password">{t.auth.password}</label>
			<input id="password" name="password" type="password" autocomplete="current-password" required />
			<button class="block">{t.auth.submit}</button>
		</form>
		<p class="muted"><a href="/login/forgot">{t.auth.forgot}</a></p>
	</div>
	<p class="muted">{t.auth.noAccount}</p>
	<div class="lang-row"><LangSwitch /></div>
</main>
