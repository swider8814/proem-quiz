<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Bezpieczeństwo · Proem Quiz</title></svelte:head>

<h1>Bezpieczeństwo konta</h1>

{#if data.recoveryUsed}
	<p class="notice">
		Zalogowano kodem zapasowym. Zostało {data.remainingCodes}. Jeśli zgubiłeś telefon, skonfiguruj weryfikację na nowym
		urządzeniu poniżej.
	</p>
{/if}

<div class="card">
	<h2>Weryfikacja dwuetapowa (TOTP)</h2>
	{#if data.user.totpEnabled}
		<p><span class="tag ok">Włączona</span></p>
		<p>Pozostałe kody zapasowe: <strong>{data.remainingCodes}</strong> z 10.</p>
		{#if data.remainingCodes <= 3}
			<p class="error">Zostało mało kodów zapasowych. Skonfiguruj weryfikację ponownie, żeby dostać nowe.</p>
		{/if}
		<p>
			<a class="btn" href="/panel/2fa-setup?new">Nowy telefon / nowe kody zapasowe</a>
		</p>
		<p class="muted">Po ponownej konfiguracji stary kod w aplikacji i stare kody zapasowe przestaną działać.</p>
	{:else}
		<p><span class="tag off">Wyłączona</span></p>
		<p>Zalecamy włączenie – chroni konto, nawet jeśli ktoś pozna Twoje hasło.</p>
		<p><a class="btn" href="/panel/2fa-setup">Włącz weryfikację dwuetapową</a></p>
	{/if}
</div>

<style>
	h2 { font-size: 1.1rem; margin-top: 0; }
</style>
