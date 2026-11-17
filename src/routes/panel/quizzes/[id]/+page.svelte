<script lang="ts">
	import Icon from '#lib/Icon.svelte';
	import { beforeNavigate } from '$app/navigation';
	import AudioClipEditor from '#lib/editor/AudioClipEditor.svelte';
	import { Music, playPodium, type MusicKind, type PodiumSound } from '#lib/game/sounds.js';
	import {
		ANSWER_COLORS, QTYPES, changeType, newKey, newQuestion, problems, toPayload, uploadFile,
		type EditorQuestion, type QType
	} from '#lib/editor/model.js';
	import { panelDict } from '#lib/i18n/panel.js';

	let { data } = $props();
	const t = $derived(panelDict(data.lang));
	const E = $derived(t.editor);
	const problemText = (q: EditorQuestion) => problems(q).map((p) => E.problems[p]).join(', ');

	// Stan edytora (kopiowany z danych serwera raz, przy wejściu).
	let quiz = $state(structuredClone(data.quiz));
	let questions = $state<EditorQuestion[]>(
		data.questions.map((q) => {
			const c = structuredClone(q) as unknown as EditorQuestion;
			if (c.data.type === 'audio') c.data.revealEndMs ??= null;
			return { ...c, key: newKey(), promptTranslation: q.promptTranslation ?? null };
		})
	);
	let media = $state<Record<string, { id: string; name: string; durationMs: number | null; kind: string }>>(structuredClone(data.media));
	let selected = $state(0);
	let saving = $state(false);
	let saveError = $state('');
	let savedSnapshot = $state(JSON.stringify({ quiz: data.quiz, questions: data.questions.map(toPayload as never) }));
	let showSettings = $state(false);
	let addType = $state<QType>('choice');

	const current = $derived(questions[selected]);
	const snapshot = $derived(JSON.stringify({ quiz, questions: questions.map(toPayload) }));
	const dirty = $derived(snapshot !== savedSnapshot);
	const ro = $derived(!data.canEdit);

	beforeNavigate(({ cancel, type }) => {
		if (dirty && type !== 'leave' && !confirm(E.leaveConfirm)) cancel();
	});
	$effect(() => {
		const handler = (e: BeforeUnloadEvent) => {
			if (dirty) e.preventDefault();
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	function onKey(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			save();
		}
	}

	async function save() {
		if (ro || saving) return;
		saving = true;
		saveError = '';
		// Zapamiętujemy DOKŁADNIE to, co wysyłamy – zmiany zrobione w trakcie zapisu zostają niezapisane.
		const sentQuiz = $state.snapshot(quiz);
		// Własny dźwięk bez wybranego pliku → serwer zwróci czytelny błąd („wybierz plik”).
		const s = sentQuiz.settings;
		const body = { ...sentQuiz, settings: { ...s, podiumAudio: s.podiumAudio?.mediaId ? s.podiumAudio : null, musicAudio: s.musicAudio?.mediaId ? s.musicAudio : null } };
		const sentQuestions = $state.snapshot(questions);
		const sentPayload = sentQuestions.map(toPayload);
		try {
			const res = await fetch(`/panel/api/quizzes/${data.quiz.id}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...body, questions: sentPayload })
			});
			const out = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(out.error ?? out.message ?? E.saveFailed);
			// ID z serwera przypisujemy po stabilnych kluczach (kolejność mogła się zmienić w trakcie).
			const idByKey = new Map<string, string>(sentQuestions.map((q, i) => [q.key, out.questionIds[i] as string]));
			for (const q of questions) {
				const id = idByKey.get(q.key);
				if (id) q.id = id;
			}
			savedSnapshot = JSON.stringify({ quiz: sentQuiz, questions: sentQuestions.map((q) => toPayload({ ...q, id: idByKey.get(q.key) ?? q.id })) });
		} catch (e) {
			saveError = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	const PODIUM_OPTIONS: PodiumSound[] = ['fanfare', 'triumph', 'drumroll', 'custom', 'none'];
	let stopPreview: (() => void) | null = null;
	function previewPodium() {
		stopPreview?.();
		const kind = quiz.settings.podiumSound;
		if (kind === 'custom') return; // własny plik odsłuchuje się w edytorze fragmentu
		stopPreview = playPodium(kind, { firstAt: kind === 'drumroll' ? 1800 : 0, secondAt: 0 });
	}
	const MUSIC_OPTIONS: MusicKind[] = ['calm', 'upbeat', 'custom', 'none'];
	const previewMusic = new Music();
	let musicPlaying = $state(false);
	let musicTimer: ReturnType<typeof setTimeout> | null = null;
	function toggleMusicPreview() {
		if (musicTimer) clearTimeout(musicTimer);
		if (musicPlaying) {
			previewMusic.stop();
			musicPlaying = false;
			return;
		}
		previewMusic.play(quiz.settings.music);
		musicPlaying = true;
		musicTimer = setTimeout(() => {
			previewMusic.stop();
			musicPlaying = false;
		}, 12_000);
	}
	function chooseMusic() {
		previewMusic.stop();
		musicPlaying = false;
		if (quiz.settings.music === 'custom' && !quiz.settings.musicAudio) quiz.settings.musicAudio = { mediaId: '', startMs: 0, endMs: 30_000 };
	}
	$effect(() => () => previewMusic.stop());

	function choosePodium() {
		if (quiz.settings.podiumSound === 'custom' && !quiz.settings.podiumAudio) {
			quiz.settings.podiumAudio = { mediaId: '', startMs: 0, endMs: 10_000 };
		}
	}

	function add() {
		questions.push(newQuestion(addType, quiz.settings.defaultTimeLimit, quiz.locale));
		selected = questions.length - 1;
	}
	function remove(i: number) {
		if (!confirm(E.removeConfirm)) return;
		questions.splice(i, 1);
		selected = Math.min(selected, questions.length - 1);
	}
	function duplicate(i: number) {
		const copy = { ...structuredClone($state.snapshot(questions[i])), key: newKey(), id: undefined };
		questions.splice(i + 1, 0, copy);
		selected = i + 1;
	}
	function move(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= questions.length) return;
		[questions[i], questions[j]] = [questions[j], questions[i]];
		selected = j;
	}
	// Przeciąganie pytań na liście (mysz). Strzałki ↑↓ zostają – dla klawiatury i telefonu.
	let dragFrom = $state<number | null>(null);
	let dragOver = $state<number | null>(null);
	function dropAt(to: number) {
		const from = dragFrom;
		dragFrom = null;
		dragOver = null;
		if (from === null || from === to || ro) return;
		const cur = questions[selected];
		const [q] = questions.splice(from, 1);
		questions.splice(to, 0, q);
		selected = questions.indexOf(cur);
	}
	function setType(t: QType) {
		questions[selected] = changeType(current, t);
	}
	function toggleCorrect(i: number) {
		const d = current.data;
		if (d.type !== 'choice' && d.type !== 'audio') return;
		d.correct = d.correct.includes(i) ? d.correct.filter((c: number) => c !== i) : [...d.correct, i].sort();
		if (d.correct.length === 0) d.correct = [i];
	}

	let imageError = $state('');
	async function pickImage(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		imageError = '';
		try {
			const m = await uploadFile(file, E.uploadFailed);
			if (m.kind !== 'image') throw new Error(E.notImage);
			media[m.id] = { id: m.id, name: m.name, durationMs: null, kind: 'image' };
			current.imageMediaId = m.id;
		} catch (x) {
			imageError = (x as Error).message;
		}
	}

	let answerImageError = $state('');
	async function pickAnswerImage(e: Event, i: number) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || (current.data.type !== 'choice' && current.data.type !== 'poll')) return;
		answerImageError = '';
		try {
			const m = await uploadFile(file, E.uploadFailed);
			if (m.kind !== 'image') throw new Error(E.notImage);
			media[m.id] = { id: m.id, name: m.name, durationMs: null, kind: 'image' };
			const d = current.data;
			const imgs = d.images ?? d.answers.map(() => null);
			imgs[i] = m.id;
			d.images = imgs;
		} catch (x) {
			answerImageError = (x as Error).message;
		}
	}
	function removeAnswerImage(i: number) {
		if ((current.data.type !== 'choice' && current.data.type !== 'poll') || !current.data.images) return;
		current.data.images[i] = null;
		if (!current.data.images.some(Boolean)) delete current.data.images;
	}

	const shapes = ['M20 4 L37 34 L3 34 Z', 'M20 2 L38 20 L20 38 L2 20 Z', 'circle', 'square'];
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>{quiz.title} · {E.title} · Proem Quiz</title></svelte:head>

<div class="bar card">
	<label class="title-wrap" title={E.quizTitle}>
		<input class="title" bind:value={quiz.title} maxlength="120" aria-label={E.quizTitle} placeholder={E.quizTitle} disabled={ro} />
		{#if !ro}<span class="pen" aria-hidden="true"><Icon name="edit" /></span>{/if}
	</label>
	<div class="bar-actions">
		<span class="status muted" aria-live="polite">
			{#if saving}{E.saving}{:else if saveError}<span class="err">{saveError}</span>{:else if dirty}{E.unsaved}{:else}{E.saved}{/if}
		</span>
		<button class="secondary" type="button" onclick={() => (showSettings = !showSettings)} aria-expanded={showSettings}>{E.settings}</button>
		{#if data.canShare}<a class="btn secondary" href="/panel/quizzes/{data.quiz.id}/share">{E.share}</a>{/if}
		<a class="btn secondary" href="/panel/quizzes/{data.quiz.id}/reports">{E.reports}</a>
		{#if !ro}<button type="button" onclick={save} disabled={saving || !dirty}>{E.save}</button>{/if}
		<a class="btn start" href="/panel/quizzes/{data.quiz.id}/host" class:disabled={dirty || questions.length === 0} aria-disabled={dirty || questions.length === 0}>{E.start}</a>
	</div>
</div>
{#if ro}<p class="notice">{E.readOnly}</p>{/if}

{#if showSettings}
	<fieldset class="card settings" disabled={ro}>
		<legend class="sr">{E.settingsLegend}</legend>
		<label>{E.theme}
			<select bind:value={quiz.themeId}>
				{#each data.themes as th}<option value={th.id}>{th.name}</option>{/each}
			</select>
		</label>
		<label>{E.gameLanguage}
			<select bind:value={quiz.locale}>
				<option value="pl">Polski</option><option value="en">English</option><option value="uk">Українська</option>
			</select>
		</label>
		<label>{E.defaultTime}
			<input type="number" min="5" max="240" bind:value={quiz.settings.defaultTimeLimit} />
		</label>
		<label>{E.countdown}
			<select bind:value={quiz.settings.countdown}>
				<option value={0}>{E.countdownOff}</option>
				{#each [3, 5, 10] as n}<option value={n}>{E.countdownSec(n)}</option>{/each}
			</select>
		</label>
		<div class="podium-set">
			<label>{E.podiumSound}
				<select bind:value={quiz.settings.podiumSound} onchange={choosePodium}>
					{#each PODIUM_OPTIONS as o}<option value={o}>{E.podiumSounds[o]}</option>{/each}
				</select>
			</label>
			{#if quiz.settings.podiumSound !== 'custom' && quiz.settings.podiumSound !== 'none'}
				<button type="button" class="secondary" onclick={previewPodium}>{E.podiumPreview}</button>
			{/if}
		</div>
		{#if quiz.settings.podiumSound === 'custom' && quiz.settings.podiumAudio}
			{@const pa = quiz.settings.podiumAudio}
			<div class="podium-clip">
				<p class="muted">{E.podiumCustomHint}</p>
				{#key pa.mediaId}
					<AudioClipEditor
						mediaId={pa.mediaId}
						mediaName={media[pa.mediaId]?.name ?? null}
						durationMs={media[pa.mediaId]?.durationMs ?? null}
						bind:startMs={pa.startMs}
						bind:endMs={pa.endMs}
						loop={false}
						revealEndMs={null}
						simple
						maxMs={20_000}
						disabled={ro}
						onMedia={(m) => {
							media[m.id] = { ...m, kind: 'audio' };
							pa.mediaId = m.id;
						}}
					/>
				{/key}
			</div>
		{/if}
		<div class="podium-set">
			<label>{E.music}
				<select bind:value={quiz.settings.music} onchange={chooseMusic}>
					{#each MUSIC_OPTIONS as o}<option value={o}>{E.musics[o]}</option>{/each}
				</select>
			</label>
			{#if quiz.settings.music === 'calm' || quiz.settings.music === 'upbeat'}
				<button type="button" class="secondary" onclick={toggleMusicPreview}>{musicPlaying ? E.stop : E.podiumPreview}</button>
			{/if}
		</div>
		{#if quiz.settings.music !== 'none'}
			<div class="music-where">
				<label class="check"><input type="checkbox" bind:checked={quiz.settings.musicLobby} /> {E.musicLobby}</label>
				<label class="check"><input type="checkbox" bind:checked={quiz.settings.musicQuestions} /> {E.musicQuestions}</label>
			</div>
		{/if}
		{#if quiz.settings.music === 'custom' && quiz.settings.musicAudio}
			{@const ma = quiz.settings.musicAudio}
			<div class="podium-clip">
				<p class="muted">{E.musicCustomHint}</p>
				{#key ma.mediaId}
					<AudioClipEditor
						mediaId={ma.mediaId}
						mediaName={media[ma.mediaId]?.name ?? null}
						durationMs={media[ma.mediaId]?.durationMs ?? null}
						bind:startMs={ma.startMs}
						bind:endMs={ma.endMs}
						loop={true}
						revealEndMs={null}
						simple
						maxMs={60_000}
						disabled={ro}
						onMedia={(m) => {
							media[m.id] = { ...m, kind: 'audio' };
							ma.mediaId = m.id;
						}}
					/>
				{/key}
			</div>
		{/if}
		<label>{E.nicknames}
			<select bind:value={quiz.settings.nicknameMode}>
				<option value="random-or-custom">{E.nickRandomOrCustom}</option>
				<option value="random-only">{E.nickRandomOnly}</option>
			</select>
		</label>
		<label class="check"><input type="checkbox" bind:checked={quiz.settings.teamMode} /> {E.teamMode}</label>
		{#if quiz.settings.teamMode}
			<label>{E.teamTalk}
				<select bind:value={quiz.settings.teamTalk}>
					<option value={0}>{E.countdownOff}</option>
					{#each [5, 10, 15, 20] as n}<option value={n}>{E.countdownSec(n)}</option>{/each}
				</select>
			</label>
		{/if}
		<label class="check"><input type="checkbox" bind:checked={quiz.settings.lateJoin} /> {E.lateJoin}</label>
		<label class="check"><input type="checkbox" bind:checked={quiz.settings.phoneAnswerText} /> {E.phoneText}</label>
		<label class="check"><input type="checkbox" bind:checked={quiz.settings.streakBonus} /> {E.streak}</label>
		<label class="check"><input type="checkbox" bind:checked={quiz.settings.shuffleQuestions} /> {E.shuffleQuestions}</label>
		<label class="check"><input type="checkbox" bind:checked={quiz.settings.shuffleAnswers} /> {E.shuffleAnswers}</label>
	</fieldset>
{/if}

<div class="layout">
	<aside class="card list">
		<ol>
			{#each questions as q, i (q.key)}
				<li
					draggable={!ro}
					class:drag-over={dragOver === i && dragFrom !== i}
					class:dragging={dragFrom === i}
					ondragstart={(e) => { dragFrom = i; e.dataTransfer?.setData('text/plain', String(i)); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
					ondragover={(e) => { if (dragFrom !== null) { e.preventDefault(); dragOver = i; } }}
					ondragleave={() => { if (dragOver === i) dragOver = null; }}
					ondrop={(e) => { e.preventDefault(); dropAt(i); }}
					ondragend={() => { dragFrom = null; dragOver = null; }}
				>
					<button type="button" class="item" class:active={i === selected} onclick={() => (selected = i)}>
						<span class="n">{i + 1}</span>
						<span class="t">{q.prompt || E.noPrompt}</span>
						<span class="type">{E.typesShort[q.type]}</span>
						{#if problems(q).length}<span class="warn" title={problemText(q)} aria-label={E.toFill}>!</span>{/if}
					</button>
				</li>
			{/each}
		</ol>
		{#if !ro}
			<div class="add">
				<select bind:value={addType} aria-label={E.newType}>
					{#each QTYPES as qt}<option value={qt}>{E.types[qt]}</option>{/each}
				</select>
				<button type="button" onclick={add}>{E.addQuestion}</button>
			</div>
		{/if}
	</aside>

	<section class="editor">
		{#if !current}
			<div class="card empty">
				<p><strong>{E.noQuestions}</strong></p>
				<p class="muted">{E.noQuestionsHint}</p>
			</div>
		{:else}
			<fieldset class="q" disabled={ro}>
				<legend class="sr">{E.question(selected + 1)}</legend>
				<div class="q-head">
					<label class="grow">{E.type}
						<select value={current.type} onchange={(e) => setType((e.currentTarget as HTMLSelectElement).value as QType)}>
							{#each QTYPES as qt}<option value={qt}>{E.types[qt]}</option>{/each}
						</select>
					</label>
					{#if current.type !== 'slide'}
						<label>{E.time}<input type="number" min="5" max="240" bind:value={current.timeLimit} /></label>
					{/if}
					{#if current.type !== 'slide' && current.type !== 'poll'}
						<label>{E.points}
							<select bind:value={current.pointsMultiplier}>
								<option value={1}>×1</option><option value={2}>×2</option><option value={0}>{E.noPoints}</option>
							</select>
						</label>
					{/if}
					<div class="q-tools">
						<button type="button" class="secondary" onclick={() => move(selected, -1)} disabled={selected === 0} aria-label={E.moveUp}><Icon name="up" /></button>
						<button type="button" class="secondary" onclick={() => move(selected, 1)} disabled={selected === questions.length - 1} aria-label={E.moveDown}><Icon name="down" /></button>
						<button type="button" class="secondary" onclick={() => duplicate(selected)}>{E.duplicate}</button>
						<button type="button" class="danger" onclick={() => remove(selected)}>{E.remove}</button>
					</div>
				</div>

				<label>{current.type === 'slide' ? E.slideTitle : E.prompt}
					<input type="text" bind:value={current.prompt} maxlength="200" placeholder={E.promptPlaceholder} />
				</label>
				<label>{E.translation}
					<input type="text" value={current.promptTranslation ?? ''} oninput={(e) => (current.promptTranslation = (e.currentTarget as HTMLInputElement).value || null)} maxlength="200" placeholder={E.translationPlaceholder} />
				</label>
				{#if current.data.type === 'poll'}<p class="muted">{E.pollHint}</p>{/if}
				{#if current.data.type === 'slide'}
					{@const d = current.data}
					<p class="muted">{E.slideHint}</p>
					<label>{E.slideText}<textarea bind:value={d.text} maxlength="500" rows="4"></textarea></label>
				{/if}
				{#if current.data.type === 'slider'}
					{@const d = current.data}
					<div class="slider-set">
						<label>{E.sliderMin}<input type="number" bind:value={d.min} step="any" /></label>
						<label>{E.sliderMax}<input type="number" bind:value={d.max} step="any" /></label>
						<label>{E.sliderStep}<input type="number" bind:value={d.step} min="0" step="any" /></label>
						<label>{E.sliderCorrect}<input type="number" bind:value={d.correct} step="any" /></label>
						<label>{E.sliderUnit}<input type="text" value={d.unit ?? ''} oninput={(e) => (d.unit = (e.currentTarget as HTMLInputElement).value || undefined)} maxlength="12" /></label>
						<label>{E.sliderMargin}
							<select bind:value={d.margin}>
								{#each ['none', 'low', 'medium', 'high'] as const as m}<option value={m}>{E.margins[m]}</option>{/each}
							</select>
						</label>
					</div>
				{/if}

				{#if current.data.type === 'audio'}
					{#key current.key + current.data.audioMediaId}
						<AudioClipEditor
							mediaId={current.data.audioMediaId}
							mediaName={media[current.data.audioMediaId]?.name ?? null}
							durationMs={media[current.data.audioMediaId]?.durationMs ?? null}
							bind:startMs={current.data.startMs}
							bind:endMs={current.data.endMs}
							bind:loop={current.data.loop}
							bind:revealEndMs={current.data.revealEndMs}
							disabled={ro}
							onMedia={(m) => {
								media[m.id] = { ...m, kind: 'audio' };
								if (current.data.type === 'audio') current.data.audioMediaId = m.id;
							}}
						/>
					{/key}
				{/if}

				{#if current.data.type === 'choice' || current.data.type === 'audio' || current.data.type === 'poll'}
					{@const d = current.data}
					<div class="answers">
						{#each d.answers as _, i}
							<div class="answer" class:correct={d.type !== 'poll' && d.correct.includes(i)}>
								<span class="shape" style:background={ANSWER_COLORS[i]} aria-hidden="true">
									<svg width="18" height="18" viewBox="0 0 40 40">
										{#if shapes[i] === 'circle'}<circle cx="20" cy="20" r="16" fill="#111" />
										{:else if shapes[i] === 'square'}<rect x="5" y="5" width="30" height="30" fill="#111" />
										{:else}<path d={shapes[i]} fill="#111" />{/if}
									</svg>
								</span>
								<input type="text" bind:value={d.answers[i]} maxlength="80" placeholder={(d.type !== 'audio' && d.images?.[i] ? E.caption : E.answer(String.fromCharCode(65 + i))) + (i >= 2 || (d.type !== 'audio' && d.images?.[i]) ? E.optional : '')} aria-label={E.answer(String.fromCharCode(65 + i))} />
								{#if d.type !== 'poll'}
									<label class="check small"><input type="checkbox" checked={d.correct.includes(i)} onchange={() => toggleCorrect(i)} /> {E.correct}</label>
								{/if}
								{#if d.type === 'choice' || d.type === 'poll'}
									<div class="ans-img">
										{#if d.images?.[i]}
											<img src="/media/{d.images[i]}" alt={E.answerImage(String.fromCharCode(65 + i))} />
											<button type="button" class="link" onclick={() => removeAnswerImage(i)} disabled={ro}>{E.removeImage}</button>
										{:else if !ro}
											<label class="link file-link">{E.addAnswerImage}<input type="file" accept="image/*" onchange={(e) => pickAnswerImage(e, i)} /></label>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
					{#if answerImageError}<p class="error">{answerImageError}</p>{/if}
				{:else if current.data.type === 'truefalse'}
					{@const d = current.data}
					<div class="tf" role="radiogroup" aria-label={E.correctAnswer}>
						<label class="check"><input type="radio" checked={d.correct} onchange={() => (d.correct = true)} /> {E.trueCorrect}</label>
						<label class="check"><input type="radio" checked={!d.correct} onchange={() => (d.correct = false)} /> {E.falseCorrect}</label>
					</div>
					<label class="check thumbs"><input type="checkbox" checked={!!d.thumbs} onchange={(e) => (d.thumbs = (e.currentTarget as HTMLInputElement).checked || undefined)} /> <Icon name="thumbUp" /> <Icon name="thumbDown" /> {E.thumbs}</label>
				{:else if current.data.type === 'text'}
					{@const d = current.data}
					<p class="muted">{E.acceptedIntro}</p>
					{#each d.accepted as _, i}
						<div class="row">
							<input type="text" bind:value={d.accepted[i]} maxlength="80" aria-label={E.accepted(i + 1)} />
							{#if d.accepted.length > 1}<button type="button" class="secondary" onclick={() => d.accepted.splice(i, 1)} aria-label={E.remove}><Icon name="close" /></button>{/if}
						</div>
					{/each}
					{#if d.accepted.length < 10}<button type="button" class="link" onclick={() => d.accepted.push('')}>{E.addVariant}</button>{/if}
					<label>{E.typos}
						<select bind:value={d.typoTolerance}>
							<option value={0}>{E.typos0}</option><option value={1}>{E.typos1}</option><option value={2}>{E.typos2}</option>
						</select>
					</label>
				{:else if current.data.type === 'order'}
					{@const d = current.data}
					<p class="muted">{E.orderIntro}</p>
					{#each d.items as _, i}
						<div class="row">
							<span class="n">{i + 1}.</span>
							<input type="text" bind:value={d.items[i]} maxlength="60" aria-label={E.item(i + 1)} />
							{#if d.items.length > 3}<button type="button" class="secondary" onclick={() => d.items.splice(i, 1)} aria-label={E.remove}><Icon name="close" /></button>{/if}
						</div>
					{/each}
					{#if d.items.length < 6}<button type="button" class="link" onclick={() => d.items.push('')}>{E.addItem}</button>{/if}
					<label class="check"><input type="checkbox" bind:checked={d.partialCredit} /> {E.partial}</label>
				{/if}

				<div class="image">
					{#if current.imageMediaId}
						<img src="/media/{current.imageMediaId}" alt={E.imageAlt} />
						<button type="button" class="link" onclick={() => (current.imageMediaId = null)}>{E.removeImage}</button>
					{:else}
						<label class="btn secondary file">{E.addImage}
							<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={pickImage} />
						</label>
					{/if}
					{#if imageError}<p class="error">{imageError}</p>{/if}
				</div>

				{#if problems(current).length}
					<p class="notice">{E.toFillList(problemText(current))}</p>
				{/if}
			</fieldset>
		{/if}
	</section>
</div>

<style>
	.bar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 0.75rem 1rem; margin-bottom: 1rem; }
	/* Nazwa quizu: wyraźnie edytowalna (ołówek, przerywana linia), cała szerokość na telefonie. */
	.title-wrap { flex: 1 1 18rem; min-width: 0; display: flex; align-items: center; gap: 0.4rem; margin: 0; border-bottom: 2px dashed #c9cbd3; }
	.title-wrap:hover, .title-wrap:focus-within { border-bottom-color: #1368ce; }
	.title { flex: 1; min-width: 0; width: 100%; font-size: 1.25rem; font-weight: 700; border: 0; border-radius: 0; background: transparent; padding: 0.35rem 0; box-shadow: none; outline: none; }
	.pen { color: #8a90a6; display: inline-flex; }
	.title-wrap:focus-within .pen { color: #1368ce; }
	.bar-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.status { min-width: 8rem; text-align: right; }
	.err { color: var(--danger); }
	.start { background: #26890c; }
	.start.disabled { opacity: 0.4; pointer-events: none; }
	.settings { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: 0.25rem 1.5rem; margin: 0 0 1rem; border: 1px solid var(--line); }
	.settings label { margin-top: 0.5rem; }
	.podium-set { display: flex; gap: 0.6rem; align-items: flex-end; }
	.podium-set label { flex: 1; }
	.podium-clip { grid-column: 1 / -1; }
	.music-where { display: flex; flex-direction: column; justify-content: flex-end; }
	.podium-clip p { margin: 0.5rem 0; }
	.check { display: flex; align-items: center; gap: 0.5rem; font-weight: 400; }
	.check.small { font-size: 0.8rem; white-space: nowrap; margin: 0; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.layout { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
	.list { flex: 0 1 18rem; padding: 0.75rem; position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow: auto; }
	.list ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.3rem; }
	li[draggable='true'] { cursor: grab; }
	li.dragging { opacity: 0.4; }
	li.drag-over { box-shadow: 0 -3px 0 #1368ce; }
	.item { width: 100%; box-sizing: border-box; display: flex; align-items: center; gap: 0.5rem; padding: 0.55rem; background: #fff; color: var(--text); border: 1px solid var(--line); font-weight: 400; font-size: 0.9rem; text-align: left; }
	.item.active { border-color: #1368ce; background: #eef4fd; }
	.n { width: 1.4rem; color: var(--muted); font-weight: 600; }
	.t { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	.type { font-size: 0.7rem; font-weight: 700; background: #f0efec; padding: 0.1rem 0.35rem; border-radius: 0.25rem; }
	.warn { background: #f9eeda; color: #8a5a00; border-radius: 50%; width: 1.2rem; height: 1.2rem; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; }
	.add { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }
	.editor { flex: 999 1 32rem; min-width: 0; }
	.item, .t { min-width: 0; }
	@media (max-width: 720px) {
		.list { flex: 1 1 100%; position: static; max-height: none; box-sizing: border-box; }
		.status { min-width: 0; text-align: left; }
	}
	.q { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
	.q-head { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; }
	.q-head label { margin: 0; }
	.q-head input { width: 6rem; display: block; margin-top: 0.3rem; }
	.grow { flex: 1; min-width: 12rem; }
	.q-tools { display: flex; gap: 0.35rem; }
	.q-tools button { padding: 0.5rem 0.7rem; font-size: 0.85rem; }
	.slider-set { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 0.4rem 0.8rem; }
	textarea { width: 100%; font: inherit; font-weight: 400; padding: 0.5rem; border: 1px solid var(--line); border-radius: 0.5rem; box-sizing: border-box; }
	.ans-img { flex-basis: 100%; display: flex; align-items: center; gap: 0.6rem; }
	.ans-img img { height: 64px; max-width: 120px; object-fit: contain; border-radius: 0.4rem; background: #fff; border: 1px solid var(--line); }
	.file-link { position: relative; cursor: pointer; color: #1368ce; text-decoration: underline; font-size: 0.9rem; }
	.file-link input { position: absolute; width: 1px; height: 1px; opacity: 0; }
	.answers { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); gap: 0.6rem; margin-top: 0.5rem; }
	.answer { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; background: #fff; border: 2px solid var(--line); border-radius: 0.6rem; padding: 0.35rem 0.6rem; }
	.answer.correct { border-color: #26890c; }
	.answer input[type='text'] { border: 0; padding: 0.4rem 0; }
	.shape { width: 2rem; height: 2rem; border-radius: 0.4rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 2px solid #111; }
	.tf { display: flex; gap: 2rem; padding: 0.5rem 0; }
	.row { display: flex; gap: 0.5rem; align-items: center; }
	.row button { padding: 0.45rem 0.7rem; }
	.image { margin-top: 0.75rem; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
	.image img { max-height: 120px; max-width: 220px; border-radius: 0.5rem; border: 1px solid var(--line); }
	.file { position: relative; overflow: hidden; font-size: 0.9rem; padding: 0.5rem 0.9rem; background: #e7e8ee; color: var(--text); }
	.file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.empty { text-align: center; padding: 3rem; }
</style>
