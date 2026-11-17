<script lang="ts">
	import '#lib/styles/panel.css';
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	let { data, form } = $props();
	const t = $derived(panelDict(page.data.lang));
</script>

<svelte:head><title>{t.auth.activationTitle} · Proem Quiz</title><!-- strict-origin: token z adresu nie wycieka, a formularz wysyła poprawny nagłówek Origin (przy no-referrer przeglądarka wysyła „Origin: null” i ochrona CSRF odrzuca formularz) --><meta name="referrer" content="strict-origin" /></svelte:head>

<main class="auth">
	<div class="card">
		<h1>{t.auth.welcome(data.name)}</h1>
		<p>{t.auth.setPasswordFor} <strong>{data.email}</strong>.</p>
		{#if data.role === 'admin'}
			<p class="notice">{t.auth.adminNotice}</p>
		{/if}
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<form method="POST">
			<input type="hidden" name="username" autocomplete="username" value={data.email} />
			<label for="password">{t.auth.passwordMin}</label>
			<input id="password" name="password" type="password" autocomplete="new-password" minlength="10" required />
			<label for="repeat">{t.auth.repeat}</label>
			<input id="repeat" name="repeat" type="password" autocomplete="new-password" minlength="10" required />
			<button class="block">{t.auth.activate}</button>
		</form>
	</div>
</main>
