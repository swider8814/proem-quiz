<script lang="ts">
	import '#lib/game/game.css';
	import Shape from '#lib/game/Shape.svelte';
	import { shapeColor, themeVars } from '#lib/game/theme.js';
	import { uploadFile } from '#lib/editor/model.js';
	import { panelDict } from '#lib/i18n/panel.js';

	let { data, form } = $props();
	const D = $derived(panelDict(data.lang));
	const T = $derived(D.themes);
	let t = $state(structuredClone(data.theme));
	let uploadError = $state('');
	let uploading = $state(false);

	const preview = $derived({ name: t.name, style: t.style, colors: t.colors, headingFont: t.headingFont, logoUrl: t.logoLight ? `/media/${t.logoLight}` : null });
	const payload = $derived(JSON.stringify({ name: t.name, style: t.style, headingFont: t.headingFont, colors: t.colors, logoLight: t.logoLight, logoDark: t.logoDark }));
	const colorFields = ['background', 'surface', 'text', 'accent'] as const;

	function applyPreset() {
		const p = data.presets[t.style];
		if (!confirm(T.presetConfirm)) return;
		t.colors = structuredClone(p.colors);
		t.headingFont = p.font;
	}

	async function pickLogo(e: Event, which: 'logoLight' | 'logoDark') {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		uploadError = '';
		uploading = true;
		try {
			const m = await uploadFile(file, D.editor.uploadFailed);
			if (m.kind !== 'image') throw new Error(D.err.logoImage);
			t[which] = m.id;
		} catch (x) {
			uploadError = (x as Error).message;
		} finally {
			uploading = false;
		}
	}
</script>

<svelte:head><title>{t.name} · {T.title} · Proem Quiz</title></svelte:head>

<p><a href="/panel/themes">{T.back}</a></p>
<h1>{t.name} {#if data.theme.isDefault}<span class="tag ok">{T.default}</span>{/if}</h1>
{#if form?.error}<p class="error">{form.error}</p>{/if}
{#if form?.saved}<p class="success">{D.common.saved}</p>{/if}

<div class="layout">
	<form method="POST" action="?/save" class="card fields">
		<input type="hidden" name="theme" value={payload} />
		<label for="name">{T.name}</label>
		<input id="name" type="text" bind:value={t.name} maxlength="60" />

		<label for="style">{T.screenStyle}</label>
		<select id="style" bind:value={t.style}>
			{#each Object.entries(data.styles) as [k, label]}<option value={k}>{label}</option>{/each}
		</select>
		<button type="button" class="link" onclick={applyPreset}>{T.loadPreset}</button>

		<label for="font">{T.font}</label>
		<select id="font" bind:value={t.headingFont}>
			{#each data.fonts as f}<option value={f}>{f}</option>{/each}
		</select>

		<fieldset>
			<legend>{T.colors}</legend>
			{#each colorFields as key}
				<label class="color"><input type="color" bind:value={t.colors[key]} /> {T[key]} <code>{t.colors[key]}</code></label>
			{/each}
			{#each t.colors.answers as _, i}
				<label class="color"><input type="color" bind:value={t.colors.answers[i]} /> {T.answer(String.fromCharCode(65 + i))} <code>{t.colors.answers[i]}</code></label>
			{/each}
		</fieldset>

		<fieldset>
			<legend>{T.logo}</legend>
			{#each [['logoLight', T.logoLight], ['logoDark', T.logoDark]] as [key, label]}
				{@const k = key as 'logoLight' | 'logoDark'}
				<div class="logo-row">
					<span>{label}</span>
					{#if t[k]}<img src="/media/{t[k]}" alt="" /><button type="button" class="link" onclick={() => (t[k] = null)}>{D.common.remove}</button>{/if}
					<label class="btn secondary file">{uploading ? D.common.uploading : D.common.chooseFile}
						<input type="file" accept="image/png,image/jpeg,image/webp" onchange={(e) => pickLogo(e, k)} disabled={uploading} />
					</label>
				</div>
			{/each}
			{#if uploadError}<p class="error">{uploadError}</p>{/if}
			<p class="muted small">{T.logoPublic}</p>
		</fieldset>

		<button class="save">{T.saveTheme}</button>
	</form>

	<section class="previews" aria-label={T.preview}>
		<div class="game pv host" data-style={t.style} style={themeVars(preview)}>
			<div class="pv-top">
				{#if preview.logoUrl}<img src={preview.logoUrl} alt="" />{:else}<b>{t.name.split(' – ')[0]}</b>{/if}
				<span class="g-chip">PIN 482 913</span>
			</div>
			<div class="g-box pv-q">{T.pvQuestion}</div>
			<div class="pv-tiles">
				{#each T.pvAnswers as a, i}
					<div class="g-tile a{i}">
						{#if t.style === 'calm'}<span class="badge">{String.fromCharCode(65 + i)}</span>{:else}<Shape {i} size={18} color={shapeColor(t.style)} />{/if}
						{a}
					</div>
				{/each}
			</div>
		</div>
		<div class="game pv phone" data-style={t.style} style={themeVars(preview)}>
			<span class="g-chip">{T.pvNick}</span>
			<div class="pv-ptiles">
				{#each [0, 1, 2, 3] as i}<div class="g-tile a{i}"><Shape {i} size={26} color={shapeColor(t.style)} /></div>{/each}
			</div>
			<button class="g-btn" type="button">{T.pvJoin}</button>
		</div>
	</section>
</div>

<div class="card danger-zone">
	{#if !data.theme.isDefault}
		<form method="POST" action="?/makeDefault"><button class="secondary">{T.makeDefault}</button></form>
		<form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(T.deleteConfirm(data.quizzes))) e.preventDefault(); }}>
			<button class="danger">{T.delete}</button>
		</form>
	{:else}
		<p class="muted">{T.isDefaultNote}</p>
	{/if}
</div>

<style>
	.layout { display: flex; gap: 1.5rem; align-items: flex-start; flex-wrap: wrap; }
	.fields { flex: 1 1 22rem; display: flex; flex-direction: column; }
	fieldset { border: 1px solid var(--line); border-radius: 0.5rem; margin: 1rem 0 0; padding: 0.5rem 1rem 1rem; }
	legend { font-weight: 700; }
	.color { display: flex; align-items: center; gap: 0.6rem; font-weight: 400; margin: 0.5rem 0 0; }
	.color input { width: 2.6rem; height: 2rem; padding: 0; border: 1px solid #c9cbd3; border-radius: 0.3rem; background: none; }
	.logo-row { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.6rem; flex-wrap: wrap; }
	.logo-row img { max-height: 2.5rem; max-width: 8rem; background: #eee; padding: 0.2rem; border-radius: 0.3rem; }
	.file { position: relative; overflow: hidden; padding: 0.45rem 0.8rem; font-size: 0.85rem; background: #e7e8ee; color: var(--text); }
	.file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.small { font-size: 0.8rem; }
	.save { margin-top: 1.25rem; align-self: flex-start; }
	.previews { flex: 1 1 26rem; display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
	.pv { min-height: auto; border-radius: 0.75rem; border: 1px solid var(--line, #ddd); padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
	.host { flex: 1 1 18rem; aspect-ratio: 16 / 10; font-size: 0.8rem; }
	.phone { width: 11rem; aspect-ratio: 9 / 17; font-size: 0.8rem; }
	.pv-top { display: flex; justify-content: space-between; align-items: center; }
	.pv-top img { max-height: 1.8rem; max-width: 50%; }
	.pv-q { padding: 0.5rem; text-align: center; font-weight: 900; font-size: 1.1rem; }
	.pv-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: auto; }
	.pv-tiles .g-tile { padding: 0.5rem; font-size: 0.8rem; cursor: default; }
	.pv-ptiles { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; flex: 1; }
	.pv-ptiles .g-tile { justify-content: center; cursor: default; }
	.phone .g-btn { font-size: 0.85rem; min-height: 0; padding: 0.5em; }
	.danger-zone { display: flex; gap: 1rem; align-items: center; margin-top: 1.5rem; }
</style>
