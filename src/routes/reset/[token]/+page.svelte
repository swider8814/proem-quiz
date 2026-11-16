<script lang="ts">
	import '#lib/styles/panel.css';
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	let { data, form } = $props();
	const t = $derived(panelDict(page.data.lang));
</script>

<svelte:head><title>{t.auth.newPasswordTitle} · Proem Quiz</title><meta name="referrer" content="no-referrer" /></svelte:head>

<main class="auth">
	<div class="card">
		<h1>{t.auth.setNewPassword}</h1>
		<p class="muted">{t.auth.account}: <strong>{data.email}</strong>. {t.auth.resetNote}</p>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<form method="POST">
			<input type="hidden" name="username" autocomplete="username" value={data.email} />
			<label for="password">{t.auth.newPassword}</label>
			<input id="password" name="password" type="password" autocomplete="new-password" minlength="10" required />
			<label for="repeat">{t.auth.repeat}</label>
			<input id="repeat" name="repeat" type="password" autocomplete="new-password" minlength="10" required />
			<button class="block">{t.auth.savePassword}</button>
		</form>
	</div>
</main>
