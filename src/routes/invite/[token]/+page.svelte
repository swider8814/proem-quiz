<script lang="ts">
	import '#lib/styles/panel.css';
	let { data, form } = $props();
</script>

<svelte:head><title>Aktywacja konta · Proem Quiz</title></svelte:head>

<main class="auth">
	<div class="card">
		<h1>Witaj, {data.name}!</h1>
		<p>Ustaw hasło do konta <strong>{data.email}</strong>.</p>
		{#if data.role === 'admin'}
			<p class="notice">
				Masz rolę administratora. Po ustawieniu hasła poprosimy Cię o skonfigurowanie aplikacji z kodami
				(np. Google Authenticator) – przygotuj telefon.
			</p>
		{/if}
		{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
		<form method="POST">
			<input type="hidden" name="username" autocomplete="username" value={data.email} />
			<label for="password">Hasło (min. 10 znaków)</label>
			<input id="password" name="password" type="password" autocomplete="new-password" minlength="10" required />
			<label for="repeat">Powtórz hasło</label>
			<input id="repeat" name="repeat" type="password" autocomplete="new-password" minlength="10" required />
			<button class="block">Aktywuj konto</button>
		</form>
	</div>
</main>
