<script lang="ts">
	import '#lib/styles/panel.css';
	let { data, form } = $props();
</script>

<svelte:head><title>Nowe hasło · Proem Quiz</title><meta name="referrer" content="no-referrer" /></svelte:head>

<main class="auth">
	<div class="card">
		<h1>Ustaw nowe hasło</h1>
		<p class="muted">Konto: <strong>{data.email}</strong>. Po zmianie wszystkie urządzenia zostaną wylogowane.</p>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<form method="POST">
			<input type="hidden" name="username" autocomplete="username" value={data.email} />
			<label for="password">Nowe hasło (min. 10 znaków)</label>
			<input id="password" name="password" type="password" autocomplete="new-password" minlength="10" required />
			<label for="repeat">Powtórz hasło</label>
			<input id="repeat" name="repeat" type="password" autocomplete="new-password" minlength="10" required />
			<button class="block">Zapisz hasło</button>
		</form>
	</div>
</main>
