<script lang="ts">
	import '#lib/styles/panel.css';
	let { form } = $props();
</script>

<svelte:head><title>Logowanie · Proem Quiz</title></svelte:head>

<main class="auth">
	<div class="card">
		<h1>Zaloguj się</h1>
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<form method="POST">
			<label for="email">E-mail</label>
			<input id="email" name="email" type="email" autocomplete="username" required value={form?.email ?? ''} />
			<label for="password">Hasło</label>
			<input id="password" name="password" type="password" autocomplete="current-password" required />
			<button class="block">Zaloguj</button>
		</form>
		<p class="muted"><a href="/login/forgot">Nie pamiętasz hasła?</a></p>
	</div>
	<p class="muted">Konta zakłada administrator. Nie masz dostępu? Napisz do niego.</p>
</main>
