<script lang="ts">
	import '#lib/styles/panel.css';
	let { form } = $props();
	let recovery = $state(false);
	$effect(() => {
		if (form?.recovery) recovery = true;
	});
</script>

<svelte:head><title>Kod weryfikacyjny · Proem Quiz</title></svelte:head>

<main class="auth">
	<div class="card">
		<h1>{recovery ? 'Kod zapasowy' : 'Kod z aplikacji'}</h1>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<form method="POST">
			<input type="hidden" name="mode" value={recovery ? 'recovery' : 'totp'} />
			{#if recovery}
				<label for="code">Jeden z kodów zapasowych (np. ABCDE-12345)</label>
				<input id="code" name="code" type="text" autocomplete="off" required />
			{:else}
				<label for="code">6-cyfrowy kod z aplikacji uwierzytelniającej</label>
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
			<button class="block">Potwierdź</button>
		</form>
		<p class="muted">
			<button type="button" class="link" onclick={() => (recovery = !recovery)}>
				{recovery ? 'Wpisz kod z aplikacji' : 'Nie masz telefonu? Użyj kodu zapasowego'}
			</button>
		</p>
	</div>
	<form method="POST" action="/logout"><button class="link">Anuluj i wyloguj</button></form>
</main>
