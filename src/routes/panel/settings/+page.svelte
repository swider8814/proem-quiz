<script lang="ts">
	import { enhance } from '$app/forms';
	import { send } from '#lib/forms.js';
	import { uploadFile } from '#lib/editor/model.js';
	import { panelDict } from '#lib/i18n/panel.js';
	let { data, form } = $props();
	const D = $derived(panelDict(data.lang));
	const S = $derived(D.settings);
	let orgName = $state(data.settings.orgName);
	let orgLogo = $state<string | null>(data.settings.orgLogo);
	let err = $state('');
	let uploading = $state(false);
	const gb = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`);

	async function pick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		err = '';
		uploading = true;
		try {
			const m = await uploadFile(file, D.editor.uploadFailed);
			if (m.kind !== 'image') throw new Error(D.err.logoImage);
			orgLogo = m.id;
		} catch (x) {
			err = (x as Error).message;
		} finally {
			uploading = false;
		}
	}
</script>

<svelte:head><title>{S.title} · Proem Quiz</title></svelte:head>

<h1>{S.title}</h1>
{#if form?.error}<p class="error">{form.error}</p>{/if}
{#if form?.saved}<p class="success">{S.savedLogo}</p>{/if}

<form method="POST" class="card" use:enhance={send()}>
	<h2>{S.org}</h2>
	<label for="orgName">{S.orgName}</label>
	<input id="orgName" name="orgName" type="text" maxlength="60" bind:value={orgName} required />
	<input type="hidden" name="orgLogo" value={orgLogo ?? ''} />
	<label for="logo">{S.logo}</label>
	<div class="logo-row">
		{#if orgLogo}<img src="/media/{orgLogo}" alt={S.logoAlt} /><button type="button" class="link" onclick={() => (orgLogo = null)}>{D.common.remove}</button>{/if}
		<label class="btn secondary file">{uploading ? D.common.uploading : D.common.chooseFile}
			<input id="logo" type="file" accept="image/png,image/jpeg,image/webp" onchange={pick} disabled={uploading} />
		</label>
	</div>
	{#if err}<p class="error">{err}</p>{/if}
	<button class="save">{D.common.save}</button>
</form>

<div class="card mail">
	<h2>{S.mail}</h2>
	{#if data.mail}
		<p><span class="tag ok">{S.configured}</span> {S.sender}: <code>{data.mailFrom}</code></p>
	{:else}
		<p><span class="tag warn">{S.notConfigured}</span> {S.notConfiguredNote}</p>
		<p class="muted">{S.howTo}</p>
	{/if}
</div>

<div class="card">
	<h2>{S.backup}</h2>
	{#if !data.backup}
		<p><span class="tag warn">—</span> {S.backupNone}</p>
	{:else}
		<p>
			{S.lastBackup}: <strong>{new Date(data.backup.at).toLocaleString(S.dateLocale)}</strong>
			{#if data.backup.snapshotOk}<span class="tag ok">OK</span>{:else}<span class="tag off">✕</span>{/if}
			<span class="muted">· {(data.backup.snapshotBytes / 1024).toFixed(0)} KB</span>
		</p>
		<p>
			{S.driveLabel}:
			{#if data.backup.drive === 'ok'}<span class="tag ok">{S.driveOk}</span>
			{:else if data.backup.drive === 'failed'}<span class="tag off">{S.driveFailed}</span>
			{:else}<span class="tag warn">{S.driveOff}</span>{/if}
		</p>
		{#if !data.backup.snapshotOk}<p class="error">{S.backupFailed}</p>{/if}
		{#if data.backup.stale}<p class="error">{S.backupStale}</p>{/if}
		<p class="muted">{S.nasNote}</p>
	{/if}
</div>

<div class="card about">
	<h2>{S.about}</h2>
	<dl>
		<dt>{S.version}</dt><dd><strong>{data.about.label}</strong></dd>
		<dt>{S.builtAt}</dt><dd>{data.about.builtAt ?? '—'}</dd>
		<dt>{S.commit}</dt><dd>{#if data.about.commitUrl}<a href={data.about.commitUrl} target="_blank" rel="noopener"><code>{data.about.short}</code></a>{:else}—{/if}</dd>
		<dt>{S.startedAt}</dt><dd>{data.about.startedAt}</dd>
		<dt>{S.mediaUsed}</dt><dd>{gb(data.about.media.used)} / {gb(data.about.media.quota)}</dd>
		<dt>{S.diskFree}</dt><dd>{data.about.media.free == null ? '—' : gb(data.about.media.free)}</dd>
		<dt>Node.js</dt><dd>{data.about.node}</dd>
	</dl>
</div>

<style>
	h2 { margin-top: 0; }
	.about dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 1.25rem; margin: 0; }
	.about dt { color: var(--muted); }
	.about dd { margin: 0; font-variant-numeric: tabular-nums; }
	.card { margin-bottom: 1.5rem; max-width: 40rem; }
	.logo-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.logo-row img { max-height: 3rem; max-width: 12rem; background: #1b1f3b; padding: 0.4rem; border-radius: 0.4rem; }
	.file { position: relative; overflow: hidden; }
	.file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.save { margin-top: 1.25rem; }
</style>
