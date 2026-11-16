<script lang="ts">
	let { data, form } = $props();
	let saved = $state(false);

	function download(codes: string[]) {
		const blob = new Blob(
			[`Proem Quiz – kody zapasowe (${data.user.email})\nKażdy kod działa tylko raz.\n\n${codes.join('\n')}\n`],
			{ type: 'text/plain' }
		);
		const a = Object.assign(document.createElement('a'), {
			href: URL.createObjectURL(blob),
			download: 'proem-quiz-kody-zapasowe.txt'
		});
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<svelte:head><title>Weryfikacja dwuetapowa · Proem Quiz</title></svelte:head>

<div class="wrap">
	{#if form?.recoveryCodes}
		<div class="card">
			<h1>Gotowe – weryfikacja dwuetapowa włączona ✅</h1>
			<p>
				Zapisz te <strong>kody zapasowe</strong> w bezpiecznym miejscu (np. menedżer haseł). Każdy działa raz i
				pozwala zalogować się, gdy nie masz telefonu. <strong>Nie zobaczysz ich ponownie.</strong>
			</p>
			<ol class="codes">
				{#each form.recoveryCodes as c}<li><code>{c}</code></li>{/each}
			</ol>
			<p><button type="button" class="secondary" onclick={() => download(form.recoveryCodes)}>Pobierz jako plik .txt</button></p>
			<label class="check"><input type="checkbox" bind:checked={saved} /> Zapisałem kody w bezpiecznym miejscu</label>
			<p><a class="btn" href="/panel" aria-disabled={!saved} class:disabled={!saved}>Przejdź do panelu</a></p>
		</div>
	{:else}
		<div class="card">
			<h1>Weryfikacja dwuetapowa</h1>
			{#if data.required}
				<p class="notice">Konta administratorów muszą mieć włączoną weryfikację dwuetapową. Skonfiguruj ją, żeby przejść dalej.</p>
			{/if}
			<ol class="steps">
				<li>
					Zainstaluj na telefonie aplikację z kodami, np. <strong>Google Authenticator</strong>,
					<strong>Microsoft Authenticator</strong>, <strong>Aegis</strong> lub <strong>2FAS</strong>.
				</li>
				<li>
					Zeskanuj w niej kod QR:
					<div class="qr"><img src={data.qr} alt="Kod QR do aplikacji uwierzytelniającej" width="240" height="240" /></div>
					<details>
						<summary class="muted">Nie możesz zeskanować? Wpisz klucz ręcznie</summary>
						<code class="copy">{data.secret}</code>
					</details>
				</li>
				<li>
					Wpisz 6-cyfrowy kod, który pokazała aplikacja:
					{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
					<form method="POST">
						{#if data.reconfigure}
							<label for="password">Obecne hasło (potwierdzenie zmiany)</label>
							<input id="password" name="password" type="password" autocomplete="current-password" required />
							<label for="code">Kod z aplikacji</label>
						{/if}
						<input
							id="code"
							name="code"
							class="code"
							type="text"
							inputmode="numeric"
							autocomplete="one-time-code"
							maxlength="7"
							required
							aria-label="Kod z aplikacji"
						/>
						<button class="block">Włącz weryfikację</button>
					</form>
				</li>
			</ol>
		</div>
	{/if}
</div>

<style>
	.wrap { max-width: 34rem; }
	h1 { font-size: 1.4rem; margin-top: 0; }
	.steps { padding-left: 1.2rem; }
	.steps li { margin-bottom: 1.2rem; }
	.qr { margin: 0.8rem 0; }
	.qr img { border: 1px solid var(--line); border-radius: 0.5rem; }
	.codes { columns: 2; font-size: 1.1rem; }
	.codes li { margin: 0.3rem 0; }
	.check { display: flex; gap: 0.5rem; align-items: center; font-weight: 400; }
	.btn.disabled { opacity: 0.4; pointer-events: none; }
</style>
