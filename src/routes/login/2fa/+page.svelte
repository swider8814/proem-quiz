<script lang="ts">
	import '#lib/styles/panel.css';
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	let { form } = $props();
	const t = $derived(panelDict(page.data.lang));
	let recovery = $state(false);
	$effect(() => {
		if (form?.recovery) recovery = true;
	});
</script>

<svelte:head><title>{t.auth.codeTitle} · Proem Quiz</title></svelte:head>

<main class="auth">
	<div class="card">
		<h1>{recovery ? t.auth.recoveryHeading : t.auth.appHeading}</h1>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<form method="POST">
			<input type="hidden" name="mode" value={recovery ? 'recovery' : 'totp'} />
			{#if recovery}
				<label for="code">{t.auth.recoveryLabel}</label>
				<input id="code" name="code" type="text" autocomplete="off" required />
			{:else}
				<label for="code">{t.auth.totpLabel}</label>
				<input
					id="code"
					name="code"
					class="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					pattern="[0-9 ]{'{'}6,7{'}'}"
					maxlength="7"
					required
				/>
			{/if}
			<button class="block">{t.auth.confirm}</button>
		</form>
		<p class="muted">
			<button type="button" class="link" onclick={() => (recovery = !recovery)}>
				{recovery ? t.auth.useApp : t.auth.useRecovery}
			</button>
		</p>
	</div>
	<form method="POST" action="/logout"><button class="link">{t.auth.cancelLogout}</button></form>
</main>
