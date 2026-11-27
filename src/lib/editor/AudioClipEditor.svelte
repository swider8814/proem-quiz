<script lang="ts">
	import { onMount } from 'svelte';
	import type WaveSurfer from 'wavesurfer.js';
	type RegionsPlugin = ReturnType<(typeof import('wavesurfer.js/dist/plugins/regions.esm.js'))['default']['create']>;
	import { page } from '$app/state';
	import { fmtTime, parseTime, uploadFile } from './model';
	import { panelDict } from '#lib/i18n/panel.js';
	import Icon from '#lib/Icon.svelte';
	const A = $derived(panelDict(page.data.lang).audio);
	const uploadFailed = $derived(panelDict(page.data.lang).editor.uploadFailed);

	type Props = {
		mediaId: string;
		mediaName: string | null;
		durationMs: number | null;
		startMs: number;
		endMs: number;
		loop: boolean;
		revealEndMs: number | null;
		disabled?: boolean;
		/** Bez opcji pytania (zapętlenie, dłuższy fragment po odpowiedzi) – np. dźwięk na podium. */
		simple?: boolean;
		/** Najdłuższy fragment (ms). */
		maxMs?: number;
		onMedia: (m: { id: string; name: string; durationMs: number | null }) => void;
	};
	let {
		mediaId,
		mediaName,
		durationMs,
		startMs = $bindable(),
		endMs = $bindable(),
		loop = $bindable(),
		revealEndMs = $bindable(),
		disabled = false,
		simple = false,
		maxMs = 60_000,
		onMedia
	}: Props = $props();

	let container: HTMLDivElement;
	let ws: WaveSurfer | null = null;
	let regions: RegionsPlugin | null = null;
	let region: ReturnType<RegionsPlugin['addRegion']> | null = null;
	let playing = $state(false);
	let loading = $state(false);
	let uploading = $state(false);
	let err = $state('');
	let startText = $state('');
	let endText = $state('');
	let stopTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		startText = fmtTime(startMs);
		endText = fmtTime(endMs);
	});

	async function build(id: string) {
		ws?.destroy();
		ws = null;
		if (!id) return;
		loading = true;
		const [{ default: WS }, { default: Regions }] = await Promise.all([
			import('wavesurfer.js'),
			import('wavesurfer.js/dist/plugins/regions.esm.js')
		]);
		regions = Regions.create();
		ws = WS.create({
			container,
			url: `/media/${id}`,
			height: 96,
			waveColor: '#c4c8d4',
			progressColor: '#8a90a6',
			cursorColor: '#1b1f3b',
			barWidth: 3,
			barGap: 2,
			barRadius: 2,
			normalize: true,
			plugins: [regions]
		});
		ws.on('decode', () => {
			loading = false;
			const total = (ws?.getDuration() ?? 0) * 1000;
			if (endMs > total) endMs = Math.min(total, startMs + 10_000);
			region = regions!.addRegion({
				start: startMs / 1000,
				end: endMs / 1000,
				color: 'rgba(19,104,206,0.18)',
				drag: !disabled,
				resize: !disabled,
				minLength: 1,
				maxLength: maxMs / 1000
			});
			region.on('update-end', () => {
				startMs = Math.round(region!.start * 1000);
				endMs = Math.round(region!.end * 1000);
			});
		});
		ws.on('error', () => {
			loading = false;
			err = A.loadFailed;
		});
		ws.on('finish', () => (playing = false));
		ws.on('pause', () => (playing = false));
	}

	onMount(() => {
		build(mediaId);
		return () => {
			if (stopTimer) clearTimeout(stopTimer);
			ws?.destroy();
		};
	});

	function syncRegion() {
		region?.setOptions({ start: startMs / 1000, end: endMs / 1000 });
	}

	function applyText(which: 'start' | 'end') {
		const v = parseTime(which === 'start' ? startText : endText);
		if (v === null) return;
		if (which === 'start') startMs = v;
		else endMs = v;
		if (endMs - startMs < 1000) endMs = startMs + 1000;
		if (endMs - startMs > maxMs) endMs = startMs + maxMs;
		syncRegion();
	}

	function play() {
		if (!ws) return;
		if (playing) {
			ws.pause();
			return;
		}
		ws.setTime(startMs / 1000);
		ws.play();
		playing = true;
		if (stopTimer) clearTimeout(stopTimer);
		stopTimer = setTimeout(() => ws?.pause(), endMs - startMs);
	}

	async function pick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		err = '';
		uploading = true;
		try {
			const m = await uploadFile(file, uploadFailed);
			if (m.kind !== 'audio') throw new Error(A.notAudio);
			startMs = 0;
			endMs = Math.min(10_000, maxMs, m.durationMs ?? 10_000);
			revealEndMs = null;
			onMedia({ id: m.id, name: m.name, durationMs: m.durationMs });
			await build(m.id);
		} catch (x) {
			err = (x as Error).message;
		} finally {
			uploading = false;
		}
	}

	const clipLen = $derived(((endMs - startMs) / 1000).toFixed(1));
</script>

<div class="audio card">
	<div class="row top">
		{#if mediaId}
			<span><strong>{mediaName ?? A.file}</strong>{#if durationMs}<span class="muted"> · {fmtTime(durationMs)}</span>{/if}</span>
		{:else}
			<span class="muted">{A.uploadHint}</span>
		{/if}
		{#if !disabled}
			<label class="btn secondary file">
				{uploading ? panelDict(page.data.lang).common.uploading : mediaId ? A.change : A.choose}
				<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac" onchange={pick} disabled={uploading} />
			</label>
		{/if}
	</div>

	{#if err}<p class="error">{err}</p>{/if}

	<div class="wave" class:hidden={!mediaId} bind:this={container}>
		{#if loading}<span class="muted loading">{A.loadingWave}</span>{/if}
	</div>

	{#if mediaId}
		<div class="row controls">
			<button type="button" class="play" onclick={play} aria-label={playing ? A.stop : A.listen}>
				<Icon name={playing ? 'pause' : 'play'} size="1.15em" weight={2.5} />
			</button>
			<label>{A.start}
				<input type="text" inputmode="decimal" bind:value={startText} onchange={() => applyText('start')} {disabled} />
			</label>
			<label>{A.end}
				<input type="text" inputmode="decimal" bind:value={endText} onchange={() => applyText('end')} {disabled} />
			</label>
			<span class="muted len">{A.clip(clipLen)}</span>
		</div>
		{#if !simple}
		<div class="row opts">
			<label class="check"><input type="checkbox" bind:checked={loop} {disabled} /> {A.loop}</label>
			<label class="check">
				<input
					type="checkbox"
					checked={revealEndMs != null}
					onchange={(e) => (revealEndMs = (e.currentTarget as HTMLInputElement).checked ? Math.min(endMs + 20_000, durationMs ?? endMs + 20_000) : null)}
					{disabled}
				/>
				{A.revealLonger}
			</label>
			{#if revealEndMs != null}
				<span class="muted">{A.until(fmtTime(revealEndMs))}</span>
			{/if}
		</div>
		{/if}
	{/if}
</div>

<style>
	.audio { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
	.row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.top { justify-content: space-between; }
	.file { position: relative; overflow: hidden; flex: none; margin: 0; padding: 0.45rem 0.9rem; font-size: 0.93rem; }
	.file:focus-within { box-shadow: var(--focus); }
	.file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.wave { min-height: 96px; background: #fafafb; border-radius: 0.5rem; position: relative; }
	.wave.hidden { display: none; }
	.loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
	.controls label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; margin: 0; }
	.controls input { width: 6rem; padding: 0.45rem; }
	.play { width: 44px; height: 44px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; background: var(--accent); align-self: flex-end; }
	.len { align-self: flex-end; padding-bottom: 0.5rem; }
	.opts { gap: 0 1.5rem; }
</style>
