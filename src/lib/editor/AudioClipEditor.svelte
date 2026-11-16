<script lang="ts">
	import { onMount } from 'svelte';
	import type WaveSurfer from 'wavesurfer.js';
	type RegionsPlugin = ReturnType<(typeof import('wavesurfer.js/dist/plugins/regions.esm.js'))['default']['create']>;
	import { fmtTime, parseTime, uploadFile } from './model';

	type Props = {
		mediaId: string;
		mediaName: string | null;
		durationMs: number | null;
		startMs: number;
		endMs: number;
		loop: boolean;
		revealEndMs: number | null;
		disabled?: boolean;
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
				maxLength: 60
			});
			region.on('update-end', () => {
				startMs = Math.round(region!.start * 1000);
				endMs = Math.round(region!.end * 1000);
			});
		});
		ws.on('error', () => {
			loading = false;
			err = 'Nie udało się wczytać pliku audio.';
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
		if (endMs - startMs > 60_000) endMs = startMs + 60_000;
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
			const m = await uploadFile(file);
			if (m.kind !== 'audio') throw new Error('To nie jest plik audio.');
			startMs = 0;
			endMs = Math.min(10_000, m.durationMs ?? 10_000);
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
			<span><strong>{mediaName ?? 'Plik audio'}</strong>{#if durationMs}<span class="muted"> · {fmtTime(durationMs)}</span>{/if}</span>
		{:else}
			<span class="muted">Wgraj utwór (MP3, M4A, WAV, OGG, FLAC – do 30 MB)</span>
		{/if}
		{#if !disabled}
			<label class="btn secondary file">
				{uploading ? 'Wysyłanie…' : mediaId ? 'Zmień plik' : 'Wybierz plik'}
				<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac" onchange={pick} disabled={uploading} />
			</label>
		{/if}
	</div>

	{#if err}<p class="error">{err}</p>{/if}

	<div class="wave" class:hidden={!mediaId} bind:this={container}>
		{#if loading}<span class="muted loading">Wczytywanie fali dźwięku…</span>{/if}
	</div>

	{#if mediaId}
		<div class="row controls">
			<button type="button" class="play" onclick={play} aria-label={playing ? 'Zatrzymaj' : 'Odsłuchaj fragment'}>
				{#if playing}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
				{:else}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
				{/if}
			</button>
			<label>Początek
				<input type="text" inputmode="decimal" bind:value={startText} onchange={() => applyText('start')} {disabled} />
			</label>
			<label>Koniec
				<input type="text" inputmode="decimal" bind:value={endText} onchange={() => applyText('end')} {disabled} />
			</label>
			<span class="muted len">Fragment: {clipLen} s · przeciągnij niebieskie pole na fali</span>
		</div>
		<div class="row opts">
			<label class="check"><input type="checkbox" bind:checked={loop} {disabled} /> Odtwarzaj w pętli do końca czasu</label>
			<label class="check">
				<input
					type="checkbox"
					checked={revealEndMs != null}
					onchange={(e) => (revealEndMs = (e.currentTarget as HTMLInputElement).checked ? Math.min(endMs + 20_000, durationMs ?? endMs + 20_000) : null)}
					{disabled}
				/>
				Po odpowiedzi zagraj dłużej
			</label>
			{#if revealEndMs != null}
				<span class="muted">do {fmtTime(revealEndMs)}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.audio { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
	.row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.top { justify-content: space-between; }
	.file { position: relative; overflow: hidden; padding: 0.45rem 0.8rem; font-size: 0.85rem; background: #e7e8ee; color: var(--text); }
	.file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.wave { min-height: 96px; background: #fafafb; border-radius: 0.5rem; position: relative; }
	.wave.hidden { display: none; }
	.loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
	.controls label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; margin: 0; }
	.controls input { width: 6rem; padding: 0.45rem; }
	.play { width: 44px; height: 44px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; background: #1368ce; align-self: flex-end; }
	.len { align-self: flex-end; padding-bottom: 0.5rem; }
	.check { display: flex; align-items: center; gap: 0.4rem; font-weight: 400; margin: 0; }
</style>
