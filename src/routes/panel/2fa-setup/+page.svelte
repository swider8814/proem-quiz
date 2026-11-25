<script lang="ts">
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	let { data, form } = $props();
	const t = $derived(panelDict(page.data.lang));
	let saved = $state(false);

	function download(codes: string[]) {
		const blob = new Blob([`${t.twofa.fileHeader(data.user.email)}\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
		const a = Object.assign(document.createElement('a'), {
			href: URL.createObjectURL(blob),
			download: t.twofa.fileName
		});
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<svelte:head><title>{t.twofa.title} · Proem Quiz</title></svelte:head>

<div class="wrap">
	{#if form?.recoveryCodes}
		<div class="card">
			<h1>{t.twofa.done}</h1>
			<p>{t.twofa.saveCodes} <strong>{t.twofa.noSecondLook}</strong></p>
			<ol class="codes">
				{#each form.recoveryCodes as c}<li><code>{c}</code></li>{/each}
			</ol>
			<p><button type="button" class="secondary" onclick={() => download(form.recoveryCodes)}>{t.twofa.download}</button></p>
			<label class="check"><input type="checkbox" bind:checked={saved} /> {t.twofa.savedCheck}</label>
			<p><a class="btn" href="/panel" aria-disabled={!saved} class:disabled={!saved}>{t.twofa.toPanel}</a></p>
		</div>
	{:else}
		<div class="card">
			<h1>{t.twofa.title}</h1>
			{#if data.required}
				<p class="notice">{t.twofa.required}</p>
			{/if}
			<ol class="steps">
				<li>{t.twofa.step1}</li>
				<li>
					{t.twofa.step2}
					<div class="qr"><img src={data.qr} alt={t.twofa.qrAlt} width="240" height="240" /></div>
					<details>
						<summary class="muted">{t.twofa.manual}</summary>
						<code class="copy">{data.secret}</code>
					</details>
				</li>
				<li>
					{t.twofa.step3}
					{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
					<form method="POST">
						{#if data.reconfigure}
							<label for="password">{t.twofa.currentPassword}</label>
							<input id="password" name="password" type="password" autocomplete="current-password" required />
							<label for="code">{t.twofa.code}</label>
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
							aria-label={t.twofa.code}
						/>
						<button class="block">{t.twofa.enable}</button>
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
