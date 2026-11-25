<script lang="ts">
	import '#lib/styles/panel.css';
	let { form } = $props();
</script>

<svelte:head><title>Reset hasła · Proem Quiz</title></svelte:head>

<main class="auth">
	<div class="card">
		<h1>Nie pamiętasz hasła?</h1>
		{#if form?.sent}
			<p class="success" role="status">
				Jeśli konto z tym adresem istnieje, wysłaliśmy na nie link do ustawienia nowego hasła (ważny 1 godzinę).
				Sprawdź też folder spam.
			</p>
			<p><a href="/login">← Wróć do logowania</a></p>
		{:else}
			<p class="muted">Podaj adres e-mail konta. Wyślemy link do ustawienia nowego hasła.</p>
			{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
			<form method="POST">
				<label for="email">E-mail</label>
				<input id="email" name="email" type="email" autocomplete="username" required />
				<button class="block">Wyślij link</button>
			</form>
			<p><a href="/login">← Wróć do logowania</a></p>
		{/if}
	</div>
</main>
