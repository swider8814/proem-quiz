<script lang="ts">
	import { ask } from '#lib/dialog.svelte.js';
	import { enhance } from '$app/forms';
	import { send } from '#lib/forms.js';
	import BackLink from '#lib/BackLink.svelte';
	import '#lib/game/game.css';
	import Shape from '#lib/game/Shape.svelte';
	import { logoFor, shapeColor, themeVars } from '#lib/game/theme.js';
	import ColorField from '#lib/editor/ColorField.svelte';
	import { uploadFile } from '#lib/editor/model.js';
	import { panelDict } from '#lib/i18n/panel.js';

	let { data, form } = $props();
	const D = $derived(panelDict(data.lang));
	const T = $derived(D.themes);
	let t = $state(structuredClone(data.theme));
	let uploadError = $state('');
	let uploading = $state(false);

	const preview = $derived({ name: t.name, style: t.style, colors: t.colors, headingFont: t.headingFont, logoUrl: t.logoLight ? `/media/${t.logoLight}` : null, logoDarkUrl: t.logoDark ? `/media/${t.logoDark}` : null, decor: t.decor });
	const payload = $derived(JSON.stringify({ name: t.name, style: t.style, headingFont: t.headingFont, colors: t.colors, logoLight: t.logoLight, logoDark: t.logoDark, decor: t.decor }));
	const colorFields = ['background', 'surface', 'text', 'accent'] as const;

	async function applyPreset() {
		const p = data.presets[t.style];
		if (!(await ask(T.presetConfirm))) return;
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

<BackLink href="/panel/themes" label={T.back} />
<h1>{t.name} {#if data.theme.isDefault}<span class="tag ok">{T.default}</span>{/if}</h1>
{#if form?.error}<p class="error">{form.error}</p>{/if}
{#if form?.saved}<p class="success">{D.common.saved}</p>{/if}

<div class="layout">
	<form method="POST" action="?/save" class="card fields" use:enhance={send()}>
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

		<label for="decor">{T.decor}</label>
		<select id="decor" bind:value={t.decor}>
			<option value="none">{T.decorNone}</option>
			<option value="snow">{T.decorSnow}</option>
		</select>

		<fieldset>
			<legend>{T.colors}</legend>
			{#each colorFields as key}
				<ColorField bind:value={t.colors[key]} label={T[key]} />
			{/each}
			{#each t.colors.answers as _, i}
				<ColorField bind:value={t.colors.answers[i]} label={T.answer(String.fromCharCode(65 + i))} />
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
				{#if logoFor(preview)}<img src={logoFor(preview)} alt="" />{:else}<b>{t.name.split(' – ')[0]}</b>{/if}
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
		<form method="POST" action="?/makeDefault" use:enhance={send()}><button class="secondary">{T.makeDefault}</button></form>
		<form method="POST" action="?/delete" use:enhance={send({ confirm: () => ({ message: T.deleteConfirm(data.quizzes), confirmLabel: T.delete, icon: 'trash' }) })}>
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
	/* Podpis zajmuje stałą kolumnę, przyciski w jednej linii; na telefonie podpis nad przyciskami. */
	.logo-row { display: flex; align-items: center; gap: 0.5rem 0.75rem; margin-top: 0.75rem; flex-wrap: wrap; }
	.logo-row > span { flex: 1 1 11rem; }
	.logo-row img { max-height: 2.5rem; max-width: 8rem; background: #eee; padding: 0.2rem; border-radius: 0.3rem; }
	.file { position: relative; overflow: hidden; margin: 0; }
	.file:focus-within { box-shadow: var(--focus); }
	.fields > :global(button.link) { align-self: flex-start; margin: 0.4rem 0 0 -0.65rem; }
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
	.danger-zone { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; margin-top: 1.5rem; }
	/* Telefon: podgląd nad formularzem – zmiany kolorów widać od razu. */
	@media (max-width: 720px) { .previews { order: -1; justify-content: center; } }
</style>
