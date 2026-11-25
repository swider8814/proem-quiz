<script lang="ts">
	import { uploadFile } from '#lib/editor/model.js';
	let { data, form } = $props();
	let orgName = $state(data.settings.orgName);
	let orgLogo = $state<string | null>(data.settings.orgLogo);
	let err = $state('');
	let uploading = $state(false);

	async function pick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		err = '';
		uploading = true;
		try {
			const m = await uploadFile(file);
			if (m.kind !== 'image') throw new Error('Logo musi być obrazkiem (PNG, JPG, WEBP).');
			orgLogo = m.id;
		} catch (x) {
			err = (x as Error).message;
		} finally {
			uploading = false;
		}
	}
</script>

<svelte:head><title>Ustawienia · Proem Quiz</title></svelte:head>

<h1>Ustawienia</h1>
{#if form?.error}<p class="error">{form.error}</p>{/if}
{#if form?.saved}<p class="success">Zapisano. Odśwież stronę, żeby zobaczyć nowe logo w nagłówku.</p>{/if}

<form method="POST" class="card">
	<h2>Organizacja</h2>
	<label for="orgName">Nazwa (w nagłówku panelu, gdy nie ma logo)</label>
	<input id="orgName" name="orgName" type="text" maxlength="60" bind:value={orgName} required />
	<input type="hidden" name="orgLogo" value={orgLogo ?? ''} />
	<label for="logo">Logo w panelu (PNG, JPG lub WEBP, najlepiej jasne na ciemne tło)</label>
	<div class="logo-row">
		{#if orgLogo}<img src="/media/{orgLogo}" alt="Logo organizacji" /><button type="button" class="link" onclick={() => (orgLogo = null)}>Usuń</button>{/if}
		<label class="btn secondary file">{uploading ? 'Wysyłanie…' : 'Wybierz plik'}
			<input id="logo" type="file" accept="image/png,image/jpeg,image/webp" onchange={pick} disabled={uploading} />
		</label>
	</div>
	{#if err}<p class="error">{err}</p>{/if}
	<button class="save">Zapisz</button>
</form>

<div class="card mail">
	<h2>E-maile (SendGrid)</h2>
	{#if data.mail}
		<p><span class="tag ok">Skonfigurowane</span> Nadawca: <code>{data.mailFrom}</code></p>
	{:else}
		<p><span class="tag warn">Nieskonfigurowane</span> Zaproszenia trzeba przekazywać ręcznie (link w panelu), a reset hasła przez e-mail nie działa.</p>
		<p class="muted">Dodaj na serwerze w <code>.env</code>: <code>SENDGRID_API_KEY</code>, <code>MAIL_FROM</code> (adres zweryfikowany w SendGrid), opcjonalnie <code>MAIL_FROM_NAME</code>, i zrestartuj aplikację.</p>
	{/if}
</div>

<style>
	h2 { font-size: 1.1rem; margin-top: 0; }
	.card { margin-bottom: 1.5rem; max-width: 40rem; }
	.logo-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.logo-row img { max-height: 3rem; max-width: 12rem; background: #1b1f3b; padding: 0.4rem; border-radius: 0.4rem; }
	.file { position: relative; overflow: hidden; padding: 0.45rem 0.8rem; font-size: 0.85rem; background: #e7e8ee; color: var(--text); }
	.file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.save { margin-top: 1.25rem; }
</style>
