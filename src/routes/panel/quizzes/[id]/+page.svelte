<script lang="ts">
	import Icon from '#lib/Icon.svelte';
	import RowMenu from '#lib/RowMenu.svelte';
	import HelpTip from '#lib/help/HelpTip.svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import AudioClipEditor from '#lib/editor/AudioClipEditor.svelte';
	import { BUILTIN_MUSIC, Music, playPodium, type MusicKind, type PodiumSound } from '#lib/game/sounds.js';
	import {
		ANSWER_COLORS, QTYPES, changeType, newKey, newQuestion, problems, toPayload, uploadFile,
		type EditorQuestion, type QType
	} from '#lib/editor/model.js';
	import { panelDict } from '#lib/i18n/panel.js';

	let { data } = $props();
	const t = $derived(panelDict(data.lang));
	const S = $derived(t.editor.set);
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
	// Telefon: lista pytań chowa się pod przyciskiem „Pytanie 2 z 12 · lista”.
	let listOpen = $state(false);
	const QUICK_TIMES = [10, 20, 30, 60];

	const current = $derived(questions[selected]);
	const snapshot = $derived(JSON.stringify({ quiz, questions: questions.map(toPayload) }));
	const dirty = $derived(snapshot !== savedSnapshot);
	const ro = $derived(!data.canEdit);

	// Wyjście z niezapisanymi zmianami: własne okno z trzema wyborami (zapisz i wyjdź / wyjdź bez zapisu /
	// zostań). Nawigację wstrzymujemy i powtarzamy po decyzji. Zamknięcie karty ('leave') obsługuje
	// przeglądarka (beforeunload), a wysłania formularza (np. „Wyloguj”) nie da się powtórzyć jako GET,
	// więc tam zostaje zwykłe pytanie tak/nie.
	let leaveDialog: HTMLDialogElement | undefined = $state();
	let leaveTo: URL | null = null;
	let leaving = false;
	let leaveError = $state('');
	beforeNavigate(({ cancel, type, to }) => {
		if (leaving || !dirty || type === 'leave') return;
		if (type === 'form' || !to) {
			if (!confirm(E.leaveConfirm)) cancel();
			return;
		}
		cancel();
		leaveTo = to.url;
		leaveError = '';
		leaveDialog?.showModal();
	});
	function leaveNow() {
		const url = leaveTo;
		leaveDialog?.close();
		if (!url) return;
		leaving = true;
		if (url.origin !== location.origin) location.href = url.href;
		else goto(url).finally(() => (leaving = false));
	}
	async function saveAndLeave() {
		await save();
		if (saveError || dirty) {
			leaveError = saveError || E.saveFailed;
			return;
		}
		leaveNow();
	}
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

	// Wersja startowa edycji; po każdym zapisie aktualizowana z odpowiedzi serwera (nie z `data`).
	// svelte-ignore state_referenced_locally
	let version = data.version;

	/** Jeden PUT. Zwraca komunikat konfliktu (409), gdy ktoś inny zapisał quiz w międzyczasie. */
	async function putOnce(force: boolean): Promise<string | null> {
		// Zapamiętujemy DOKŁADNIE to, co wysyłamy – zmiany zrobione w trakcie zapisu zostają niezapisane.
		const sentQuiz = $state.snapshot(quiz);
		// Własny dźwięk bez wybranego pliku → serwer zwróci czytelny błąd („wybierz plik”).
		const s = sentQuiz.settings;
		const body = { ...sentQuiz, settings: { ...s, podiumAudio: s.podiumAudio?.mediaId ? s.podiumAudio : null, musicAudio: s.musicAudio?.mediaId ? s.musicAudio : null } };
		const sentQuestions = $state.snapshot(questions);
		const sentPayload = sentQuestions.map(toPayload);
		const res = await fetch(`/panel/api/quizzes/${data.quiz.id}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...body, questions: sentPayload, ...(force ? {} : { expectedVersion: version }) })
		});
		const out = await res.json().catch(() => ({}));
		if (res.status === 409 && out.conflict) return out.error ?? E.saveFailed;
		if (!res.ok) throw new Error(out.error ?? out.message ?? E.saveFailed);
		version = out.version;
		// ID z serwera przypisujemy po stabilnych kluczach (kolejność mogła się zmienić w trakcie).
		const idByKey = new Map<string, string>(sentQuestions.map((q, i) => [q.key, out.questionIds[i] as string]));
		for (const q of questions) {
			const id = idByKey.get(q.key);
			if (id) q.id = id;
		}
		savedSnapshot = JSON.stringify({ quiz: sentQuiz, questions: sentQuestions.map((q) => toPayload({ ...q, id: idByKey.get(q.key) ?? q.id })) });
		return null;
	}

	async function save() {
		if (ro || saving) return;
		// Blokada trwa przez CAŁY zapis – także podczas pytania o konflikt i zapisu wymuszonego, żeby drugi
		// zapis (przycisk, Ctrl+S) nie wszedł pomiędzy i nie został potem nadpisany starszą migawką.
		saving = true;
		saveError = '';
		try {
			const conflict = await putOnce(false);
			if (conflict) {
				// Ktoś zapisał quiz w międzyczasie: zmiany w edytorze zostają; nadpisanie tylko po potwierdzeniu.
				if (confirm(E.saveConflictAsk)) {
					const again = await putOnce(true);
					if (again) saveError = again;
				} else saveError = conflict;
			}
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
		stopPreview = playPodium(kind, { firstAt: 0 });
	}
	const MUSIC_OPTIONS: MusicKind[] = [...BUILTIN_MUSIC, 'custom', 'none'];
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
		listOpen = false;
	}
	function remove(i: number) {
		if (!confirm(E.removeConfirmN(i + 1, questions[i].prompt.trim().slice(0, 60)))) return;
		questions.splice(i, 1);
		// Usunięcie pytania przed zaznaczonym przesuwa zaznaczenie, żeby edytor został przy tym samym pytaniu.
		if (i < selected) selected--;
		selected = Math.max(0, Math.min(selected, questions.length - 1));
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
		if (current.data.alts) current.data.alts[i] = null;
		if (!current.data.images.some(Boolean)) {
			delete current.data.images;
			delete current.data.alts;
		}
	}

	function setAnswerAlt(i: number, v: string) {
		if (current.data.type !== 'choice' && current.data.type !== 'poll') return;
		const alts = current.data.alts ?? current.data.answers.map(() => null);
		alts[i] = v;
		current.data.alts = alts;
	}

	const shapes = ['M20 4 L37 34 L3 34 Z', 'M20 2 L38 20 L20 38 L2 20 Z', 'circle', 'square'];
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>{quiz.title} · {E.title} · Proem Quiz</title></svelte:head>

<dialog class="leave" bind:this={leaveDialog} aria-labelledby="leave-title" aria-describedby="leave-text">
	<h2 id="leave-title">{E.leaveTitle}</h2>
	<p id="leave-text">{E.leaveText}</p>
	{#if leaveError}<p class="error" role="alert">{leaveError}</p>{/if}
	<div class="leave-actions">
		<button type="button" onclick={saveAndLeave} disabled={saving}><Icon name="save" weight={2} />{saving ? E.saving : E.saveAndLeave}</button>
		<button type="button" class="danger" onclick={leaveNow} disabled={saving}>{E.leaveDiscard}</button>
		<button type="button" class="secondary" onclick={() => leaveDialog?.close()} disabled={saving}>{E.leaveStay}</button>
	</div>
</dialog>

<div class="ed">
<header class="bar">
	<a class="back" href="/panel"><Icon name="back" /><span>{t.nav.quizzes}</span></a>
	<label class="title-wrap" title={E.quizTitle}>
		<input class="title" bind:value={quiz.title} maxlength="120" aria-label={E.quizTitle} placeholder={E.quizTitle} disabled={ro} />
		{#if !ro}<span class="pen" aria-hidden="true"><Icon name="edit" /></span>{/if}
	</label>
	<!-- Telefon: ustawienia, udostępnianie i raporty w menu ⋯ obok tytułu (na szerokim ekranie – przyciski niżej). -->
	<div class="more-narrow">
		<RowMenu label={E.moreActions}>
			<button type="button" onclick={() => (showSettings = !showSettings)}><Icon name="settings" weight={2} />{E.settings}</button>
			{#if data.canShare}<a href="/panel/quizzes/{data.quiz.id}/share"><Icon name="share" weight={2} />{E.share}</a>{/if}
			<a href="/panel/quizzes/{data.quiz.id}/reports"><Icon name="chart" weight={2} />{E.reports}</a>
		</RowMenu>
	</div>
	<div class="bar-actions" class:ro>
		<!-- Stan zapisu pokazuje sam przycisk „Zapisz”; tu zostaje komunikat dla czytników ekranu i błąd zapisu. -->
		<span class="status" class:sr={!saveError} aria-live="polite">
			{#if saving}{E.saving}{:else if saveError}<span class="err">{saveError}</span>{:else if dirty}{E.unsaved}{:else}{E.saved}{/if}
		</span>
		<button class="secondary wide" type="button" onclick={() => (showSettings = !showSettings)} aria-expanded={showSettings}><Icon name="settings" weight={2} />{E.settings}</button>
		{#if data.canShare}<a class="btn secondary wide" href="/panel/quizzes/{data.quiz.id}/share"><Icon name="share" weight={2} />{E.share}</a>{/if}
		<a class="btn secondary wide" href="/panel/quizzes/{data.quiz.id}/reports"><Icon name="chart" weight={2} />{E.reports}</a>
		{#if !ro}
			<button type="button" class="save" class:clean={!dirty && !saving && !saveError} onclick={() => save()} disabled={saving || !dirty}>
				{#if saving}<Icon name="save" weight={2} />{E.saving}
				{:else if dirty || saveError}<Icon name="save" weight={2} />{E.save}
				{:else}<Icon name="check" weight={2.5} />{E.saved}{/if}
			</button>
		{/if}
		<a class="btn start" href="/panel/quizzes/{data.quiz.id}/host" class:disabled={dirty || questions.length === 0} aria-disabled={dirty || questions.length === 0}>
			<Icon name="play" weight={2} />{E.start}
		</a>
	</div>
</header>

<div class="below">
{#if ro}<p class="notice">{E.readOnly}</p>{/if}

{#if showSettings}
	<fieldset class="settings" disabled={ro}>
		<legend class="sr">{E.settingsLegend}</legend>
		<div class="sgrid">

		<section class="sgroup">
			<h3>{S.look}</h3>
			<div class="srow">
				<div class="stext"><label for="s-theme">{E.theme}</label><p class="hint">{S.themeHint}</p></div>
				<div class="sctl">
					<select id="s-theme" bind:value={quiz.themeId}>
						{#each data.themes as th}<option value={th.id}>{th.name}</option>{/each}
					</select>
				</div>
			</div>
			<div class="srow">
				<div class="stext"><label for="s-lang">{E.gameLanguage}</label><p class="hint">{S.langHint}</p></div>
				<div class="sctl">
					<select id="s-lang" bind:value={quiz.locale}>
						<option value="pl">Polski</option><option value="en">English</option><option value="uk">Українська</option>
					</select>
				</div>
			</div>
			<label class="srow toggle">
				<span class="stext"><span class="lbl">{S.playerLang}</span><span class="hint">{S.playerLangHint}</span></span>
				<input class="switch" type="checkbox" bind:checked={quiz.settings.playerLanguage} />
			</label>
		</section>

		<section class="sgroup">
			<h3>{S.flow}</h3>
			<div class="srow">
				<div class="stext"><label for="s-time">{E.defaultTime}</label><p class="hint">{S.timeHint}</p></div>
				<div class="sctl"><input id="s-time" type="number" min="5" max="240" bind:value={quiz.settings.defaultTimeLimit} /></div>
			</div>
			<div class="srow">
				<div class="stext"><label for="s-count">{E.countdown}</label><p class="hint">{S.countdownHint}</p></div>
				<div class="sctl">
					<select id="s-count" bind:value={quiz.settings.countdown}>
						<option value={0}>{E.countdownOff}</option>
						{#each [3, 5, 10] as n}<option value={n}>{E.countdownSec(n)}</option>{/each}
					</select>
				</div>
			</div>
			<label class="srow toggle">
				<span class="stext"><span class="lbl">{S.shuffleQ}</span><span class="hint">{S.shuffleQHint}</span></span>
				<input class="switch" type="checkbox" bind:checked={quiz.settings.shuffleQuestions} />
			</label>
			<label class="srow toggle">
				<span class="stext"><span class="lbl">{S.shuffleA}</span><span class="hint">{S.shuffleAHint}</span></span>
				<input class="switch" type="checkbox" bind:checked={quiz.settings.shuffleAnswers} />
			</label>
			<label class="srow toggle">
				<span class="stext"><span class="lbl">{S.streak}</span><span class="hint">{S.streakHint}</span></span>
				<input class="switch" type="checkbox" bind:checked={quiz.settings.streakBonus} />
			</label>
		</section>

		<section class="sgroup">
			<h3>{S.players}</h3>
			<label class="srow toggle">
				<span class="stext"><span class="lbl">{S.avatars}</span><span class="hint">{S.avatarsHint}</span></span>
				<input class="switch" type="checkbox" bind:checked={quiz.settings.avatars} />
			</label>
			<div class="srow">
				<div class="stext"><label for="s-nick">{E.nicknames}<HelpTip id="nick" /></label><p class="hint">{S.nickHint}</p></div>
				<div class="sctl">
					<select id="s-nick" bind:value={quiz.settings.nicknameMode}>
						<option value="random-or-custom">{E.nickRandomOrCustom}</option>
						<option value="random-only">{E.nickRandomOnly}</option>
						<option value="custom-only">{E.nickCustomOnly}</option>
					</select>
				</div>
			</div>
			<label class="srow toggle">
				<span class="stext"><span class="lbl">{S.lateJoin}</span><span class="hint">{S.lateJoinHint}</span></span>
				<input class="switch" type="checkbox" bind:checked={quiz.settings.lateJoin} />
			</label>
			<label class="srow toggle">
				<span class="stext"><span class="lbl">{S.phoneText}</span><span class="hint">{S.phoneTextHint}</span></span>
				<input class="switch" type="checkbox" bind:checked={quiz.settings.phoneAnswerText} />
			</label>
			<label class="srow toggle">
				<span class="stext"><span class="lbl">{S.team}<HelpTip id="team" /></span><span class="hint">{S.teamHint}</span></span>
				<input class="switch" type="checkbox" bind:checked={quiz.settings.teamMode} />
			</label>
			{#if quiz.settings.teamMode}
				<div class="srow sub">
					<div class="stext"><label for="s-talk">{E.teamTalk}</label><p class="hint">{S.teamTalkHint}</p></div>
					<div class="sctl">
						<select id="s-talk" bind:value={quiz.settings.teamTalk}>
							<option value={0}>{E.countdownOff}</option>
							{#each [5, 10, 15, 20] as n}<option value={n}>{E.countdownSec(n)}</option>{/each}
						</select>
					</div>
				</div>
			{/if}
		</section>

		<section class="sgroup">
			<h3>{S.sound}</h3>
			<div class="srow">
				<div class="stext"><label for="s-music">{E.music}</label><p class="hint">{S.musicHint}</p></div>
				<div class="sctl with-btn">
					<select id="s-music" bind:value={quiz.settings.music} onchange={chooseMusic}>
						{#each MUSIC_OPTIONS as o}<option value={o}>{E.musics[o]}</option>{/each}
					</select>
					{#if quiz.settings.music !== 'custom' && quiz.settings.music !== 'none'}
						<button type="button" class="secondary" onclick={toggleMusicPreview}>{musicPlaying ? E.stop : E.podiumPreview}</button>
					{/if}
				</div>
			</div>
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
			<div class="srow">
				<div class="stext"><label for="s-podium">{E.podiumSound}</label><p class="hint">{S.podiumHint}</p></div>
				<div class="sctl with-btn">
					<select id="s-podium" bind:value={quiz.settings.podiumSound} onchange={choosePodium}>
						{#each PODIUM_OPTIONS as o}<option value={o}>{E.podiumSounds[o]}</option>{/each}
					</select>
					{#if quiz.settings.podiumSound !== 'custom' && quiz.settings.podiumSound !== 'none'}
						<button type="button" class="secondary" onclick={previewPodium}>{E.podiumPreview}</button>
					{/if}
				</div>
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
		</section>
		</div>
	</fieldset>
{/if}

{#if questions.length}
	<div class="qnav">
		<button type="button" class="secondary" onclick={() => (selected = Math.max(0, selected - 1))} disabled={selected === 0} aria-label={E.prevQ}><Icon name="back" /></button>
		<button type="button" class="secondary grow" onclick={() => (listOpen = !listOpen)} aria-expanded={listOpen} aria-controls="q-list">{listOpen ? E.hideList : E.listToggle(selected + 1, questions.length)}</button>
		<button type="button" class="secondary" onclick={() => (selected = Math.min(questions.length - 1, selected + 1))} disabled={selected === questions.length - 1} aria-label={E.nextQ}><Icon name="next" /></button>
		{#if !ro}<button type="button" class="qnav-add" onclick={add} aria-label={E.addQuestion} title={E.addQuestion}><Icon name="plus" /></button>{/if}
	</div>
{/if}

<div class="layout">
	<aside class="list" id="q-list" class:open={listOpen || questions.length === 0}>
		<div class="list-in">
		<p class="list-head"><strong>{E.questionsCount(questions.length)}</strong>{#if !ro && questions.length > 1}<span>{E.dragHint}</span>{/if}</p>
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
					<button type="button" class="item" class:active={i === selected} class:todo={problems(q).length > 0} aria-current={i === selected ? 'true' : undefined} onclick={() => { selected = i; listOpen = false; }}>
						<span class="n">{i + 1}</span>
						<span class="t">{q.prompt || E.noPrompt}</span>
						<span class="type">{E.typesShort[q.type]}</span>
						{#if problems(q).length}<span class="warn" title={problemText(q)} aria-label={E.toFill}>!</span>{/if}
					</button>
					{#if !ro}
						<div class="item-menu">
							<RowMenu label={E.questionMenu(i + 1)}>
								<button type="button" onclick={() => duplicate(i)}><Icon name="copy" weight={2} />{E.duplicate}</button>
								<button type="button" onclick={() => move(i, -1)} disabled={i === 0}><Icon name="up" weight={2} />{E.moveUp}</button>
								<button type="button" onclick={() => move(i, 1)} disabled={i === questions.length - 1}><Icon name="down" weight={2} />{E.moveDown}</button>
								<hr />
								<button type="button" class="danger" onclick={() => remove(i)}><Icon name="trash" weight={2} />{E.remove}</button>
							</RowMenu>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
		{#if !ro}
			<div class="add">
				<select bind:value={addType} aria-label={E.newType}>
					{#each QTYPES as qt}<option value={qt}>{E.types[qt]}</option>{/each}
				</select>
				<button type="button" onclick={add}><Icon name="plus" weight={2} />{E.addQuestion}</button>
			</div>
		{/if}
		</div>
	</aside>

	{#if !current}
		<section class="editor">
			<div class="card empty">
				<p><strong>{E.noQuestions}</strong></p>
				<p class="muted">{E.noQuestionsHint}</p>
			</div>
		</section>
	{:else}
		<section class="editor">
			<fieldset class="q" disabled={ro}>
				<legend class="sr">{E.question(selected + 1)}</legend>
				<label class="prompt">{current.type === 'slide' ? E.slideTitle : E.prompt}
					<input type="text" bind:value={current.prompt} maxlength="200" placeholder={current.type === 'slide' ? E.slidePlaceholder : E.promptPlaceholder} />
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
							<div class="answer" class:correct={d.type !== 'poll' && d.correct.includes(i)} style:background={ANSWER_COLORS[i]}>
								<span class="shape" aria-hidden="true">
									<svg width="20" height="20" viewBox="0 0 40 40">
										{#if shapes[i] === 'circle'}<circle cx="20" cy="20" r="16" fill="currentColor" />
										{:else if shapes[i] === 'square'}<rect x="5" y="5" width="30" height="30" fill="currentColor" />
										{:else}<path d={shapes[i]} fill="currentColor" />{/if}
									</svg>
								</span>
								<input type="text" bind:value={d.answers[i]} maxlength="80" placeholder={(d.type !== 'audio' && d.images?.[i] ? E.caption : E.answer(String.fromCharCode(65 + i))) + (i >= 2 || (d.type !== 'audio' && d.images?.[i]) ? E.optional : '')} aria-label={E.answer(String.fromCharCode(65 + i))} />
								<!-- Drugi wiersz: „poprawna” i obrazek – pole odpowiedzi ma całą szerokość (podpowiedź nie jest ucięta). -->
								<div class="ans-img">
									{#if d.type !== 'poll'}
										<label class="check small"><input type="checkbox" checked={d.correct.includes(i)} onchange={() => toggleCorrect(i)} /> {E.correct}</label>
									{/if}
									{#if d.type === 'choice' || d.type === 'poll'}
										{#if d.images?.[i]}
											<img src="/media/{d.images[i]}" alt={d.alts?.[i] || E.answerImage(String.fromCharCode(65 + i))} />
											<button type="button" class="link" onclick={() => removeAnswerImage(i)} disabled={ro}>{E.removeImage}</button>
											<!-- Opis obrazka dla czytnika ekranu (VoiceOver/TalkBack) – bez niego, gdy nie ma podpisu, słychać tylko literę. -->
											<input type="text" class="img-alt" maxlength="150" value={d.alts?.[i] ?? ''} oninput={(e) => setAnswerAlt(i, (e.currentTarget as HTMLInputElement).value)} placeholder={E.answerAltPh} aria-label={E.imageAltFor(String.fromCharCode(65 + i))} disabled={ro} />
											{#if !d.answers[i]?.trim() && !d.alts?.[i]?.trim()}<span class="img-alt-hint">{E.imageAltMissing}</span>{/if}
										{:else if !ro}
											<label class="link file-link"><Icon name="plus" weight={2} size="0.95em" />{E.addAnswerImage}<input type="file" accept="image/*" onchange={(e) => pickAnswerImage(e, i)} /></label>
										{/if}
									{/if}
								</div>
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
					{#if d.accepted.length < 10}<button type="button" class="link" onclick={() => d.accepted.push('')}><Icon name="plus" weight={2} size="0.95em" />{E.addVariant}</button>{/if}
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
					{#if d.items.length < 6}<button type="button" class="link" onclick={() => d.items.push('')}><Icon name="plus" weight={2} size="0.95em" />{E.addItem}</button>{/if}
					<label class="check"><input type="checkbox" bind:checked={d.partialCredit} /> {E.partial}</label>
				{/if}


				{#if problems(current).length}
					<p class="notice">{E.toFillList(problemText(current))}</p>
				{/if}
			</fieldset>
		</section>

		<aside class="props-wrap">
			<fieldset class="props" disabled={ro}>
				<legend class="sr">{E.question(selected + 1)}</legend>
				<label>{E.type}
					<select value={current.type} onchange={(e) => setType((e.currentTarget as HTMLSelectElement).value as QType)}>
						{#each QTYPES as qt}<option value={qt}>{E.types[qt]}</option>{/each}
					</select>
				</label>
				{#if current.type !== 'slide'}
					<div class="field">
						<label for="q-time">{E.time}</label>
						<div class="time">
							<div class="seg" role="group" aria-label={E.time}>
								{#each QUICK_TIMES as n}
									<button type="button" class="secondary" aria-pressed={current.timeLimit === n} onclick={() => (current.timeLimit = n)}>{n}</button>
								{/each}
							</div>
							<!-- Własny czas: puste, gdy wybrany jest jeden z przycisków (wcześniej wyglądało jak piąty przycisk z tą samą liczbą). -->
							<input id="q-time" type="number" min="5" max="240" inputmode="numeric" placeholder={E.timeOther} aria-label={E.timeOtherLabel}
								value={QUICK_TIMES.includes(current.timeLimit) ? '' : current.timeLimit}
								oninput={(e) => { const v = Number((e.currentTarget as HTMLInputElement).value); if (v >= 5 && v <= 240) current.timeLimit = Math.round(v); }} />
						</div>
					</div>
				{/if}
				{#if current.type !== 'slide' && current.type !== 'poll'}
					<div class="field">
						<span class="lbl" id="q-points">{E.points}<HelpTip id="points" /></span>
						<div class="seg" role="group" aria-labelledby="q-points">
							<button type="button" class="secondary" aria-pressed={current.pointsMultiplier === 0} onclick={() => (current.pointsMultiplier = 0)}>{E.pointsNone}</button>
							<button type="button" class="secondary" aria-pressed={current.pointsMultiplier === 1} onclick={() => (current.pointsMultiplier = 1)}>{E.pointsNormal}</button>
							<button type="button" class="secondary" aria-pressed={current.pointsMultiplier === 2} onclick={() => (current.pointsMultiplier = 2)}>{E.pointsDouble}</button>
						</div>
					</div>
				{/if}
				<label>{E.translation}<HelpTip id="translation" />
					<input type="text" value={current.promptTranslation ?? ''} oninput={(e) => (current.promptTranslation = (e.currentTarget as HTMLInputElement).value || null)} maxlength="200" placeholder={E.translationPlaceholder} />
				</label>
				<div class="image">
					{#if current.imageMediaId}
						<img src="/media/{current.imageMediaId}" alt={E.imageAlt} />
						<button type="button" class="link" onclick={() => (current.imageMediaId = null)}>{E.removeImage}</button>
					{:else}
						<label class="btn secondary file">{E.addImage}
							<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={pickImage} />
						</label>
						<span class="muted formats">{E.imageFormats}</span>
					{/if}
					{#if imageError}<p class="error">{imageError}</p>{/if}
				</div>


				<div class="q-tools">
					<button type="button" class="secondary" onclick={() => move(selected, -1)} disabled={selected === 0} aria-label={E.moveUp}><Icon name="up" /></button>
					<button type="button" class="secondary" onclick={() => move(selected, 1)} disabled={selected === questions.length - 1} aria-label={E.moveDown}><Icon name="down" /></button>
					<button type="button" class="secondary grow" onclick={() => duplicate(selected)}><Icon name="copy" weight={2} />{E.duplicate}</button>
					<button type="button" class="danger grow" onclick={() => remove(selected)}><Icon name="trash" weight={2} />{E.remove}</button>
				</div>
			</fieldset>
		</aside>
		{#if !ro}
			<!-- Telefon: lista pytań jest zwinięta, więc dodawanie kolejnego pytania jest też na dole edytora. -->
			<div class="add add-mobile">
				<select bind:value={addType} aria-label={E.newType}>
					{#each QTYPES as qt}<option value={qt}>{E.types[qt]}</option>{/each}
				</select>
				<button type="button" onclick={add}><Icon name="plus" weight={2} />{E.addQuestion}</button>
			</div>
		{/if}
	{/if}
</div>
</div>
</div>
<style>
	.ed { min-height: 100vh; display: flex; flex-direction: column; }
	.bar { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; padding: 0.6rem 1.25rem; background: var(--surface); border-bottom: 1px solid var(--line); }
	.back { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.75rem; padding: 0 0.6rem; border-radius: var(--radius-s); color: #4b5064; font-weight: 600; text-decoration: none; }
	.back:hover { background: var(--soft); }
	/* Nazwa quizu: wyraźnie edytowalna (ołówek), cała szerokość na telefonie. */
	.title-wrap { flex: 1 1 14rem; min-width: 0; display: flex; align-items: center; gap: 0.4rem; margin: 0; padding: 0 0.6rem; border-radius: var(--radius-s); background: var(--bg); border: 1px solid transparent; }
	.title-wrap:hover, .title-wrap:focus-within { border-color: var(--link); }
	.title { flex: 1; min-width: 0; width: 100%; min-height: 2.75rem; font-family: var(--display); font-size: 1.3rem; font-weight: 700; border: 0; border-radius: 0; background: transparent; padding: 0; box-shadow: none; outline: none; }
	.title:focus { box-shadow: none; }
	.pen { color: #767b8c; display: inline-flex; }
	.title-wrap:focus-within .pen { color: var(--link); }
	.bar-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-left: auto; }
	.status { font-size: 0.87rem; font-weight: 600; color: var(--muted); display: inline-flex; align-items: center; gap: 0.4rem; }
	/* „Zapisano” w przycisku: wyłączony, ale czytelny (zielony), a nie wyszarzony jak zwykły disabled. */
	.save.clean:disabled { opacity: 1; background: #effaf3; border-color: #cfe9d9; color: #1f6b3a; }
	.more-narrow { display: none; }
	.err { color: var(--danger); }
	.start.disabled { opacity: 0.4; pointer-events: none; }
	.below { flex: 1; display: flex; flex-direction: column; }
	.below > .notice { margin: 1rem 1.25rem; }
	/* Ustawienia: grupy (karty) z wierszami „opis po lewej, kontrolka po prawej”; na telefonie jedno pod drugim. */
	.settings { margin: 1rem 1.25rem; padding: 0; border: 0; min-width: 0; }
	/* Grupy jako osobne karty (bez drugiej ramki dookoła): 1 kolumna na telefonie, 2 na laptopie, więcej na dużym ekranie. */
	.sgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 30rem), 1fr)); align-items: start; gap: 1rem; max-width: 70rem; margin: 0 auto; }
	.sgroup { border: 1px solid var(--line); border-radius: var(--radius); padding: 0.25rem 1.25rem 0.75rem; background: var(--surface); box-shadow: var(--shadow); min-width: 0; }
	.sgroup h3 { margin: 1rem 0 0.25rem; font-size: 1rem; font-family: var(--display); }
	.srow { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.7rem 0; border-top: 1px solid #ecedf2; margin: 0; font-weight: 400; font-size: 1rem; }
	.sgroup h3 + .srow { border-top: 0; }
	.srow.sub { padding-left: 1rem; border-top-style: dashed; }
	.stext { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
	.stext label, .stext .lbl { font-weight: 600; margin: 0; font-size: 1rem; }
	.hint { margin: 0; color: var(--muted); font-size: 0.85rem; line-height: 1.35; }
	/* Wiersz z listą lub polem: opis nad kontrolką, kontrolka na całą szerokość – nazwy opcji nie są ucinane,
	   a opis nie ściska się w wąskiej kolumnie. Przełączniki zostają po prawej (są małe). */
	.srow:not(.toggle) { flex-direction: column; align-items: stretch; gap: 0.5rem; }
	.sctl { min-width: 0; }
	.sctl select, .sctl input[type='number'] { width: 100%; }
	.sctl.with-btn { display: flex; gap: 0.5rem; }
	.sctl.with-btn select { flex: 1; min-width: 0; }
	.sctl.with-btn button { flex: none; }
	.toggle { cursor: pointer; }
	.switch { appearance: none; -webkit-appearance: none; flex: none; width: 2.75rem; height: 1.6rem; border-radius: 999px; background: #c9ccd8; position: relative; cursor: pointer; transition: background 0.15s; margin: 0; padding: 0; border: 0; }
	.switch::after { content: ''; position: absolute; top: 0.2rem; left: 0.2rem; width: 1.2rem; height: 1.2rem; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); transition: transform 0.15s; }
	.switch:checked { background: #26890c; }
	.switch:checked::after { transform: translateX(1.15rem); }
	.switch:focus-visible { box-shadow: var(--focus); }
	.switch:disabled { opacity: 0.5; }
	.podium-clip { padding: 0 0 0.75rem; }
	.podium-clip p { margin: 0.5rem 0; }
		.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

	/* Trzy panele: lista pytań | pytanie | właściwości. */
	.layout { flex: 1; display: flex; align-items: stretch; align-content: flex-start; flex-wrap: wrap; }
	.qnav { display: none; }
	.grow { flex: 1; min-width: 0; }
	.list { flex: 0 0 17rem; box-sizing: border-box; background: var(--surface); border-right: 1px solid var(--line); min-width: 0; }
	.list-in { position: sticky; top: 4.1rem; box-sizing: border-box; max-height: calc(100vh - 4.1rem); overflow: auto; padding: 1rem; }
	.list-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.25rem 0.75rem; margin: 0 0.25rem 0.6rem; font-size: 0.75rem; color: var(--muted); }
	.list-head strong { text-transform: uppercase; letter-spacing: 0.05em; }
	.list ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.4rem; }
	li[draggable='true'] { cursor: grab; }
	li.dragging { opacity: 0.4; }
	li.drag-over { box-shadow: 0 -3px 0 var(--link); }
	.item { width: 100%; min-height: 3.25rem; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.6rem; background: #fff; color: var(--text); border: 1px solid var(--line); border-radius: 0.75rem; font-weight: 600; font-size: 0.93rem; text-align: left; min-width: 0; }
	.item:hover:not(:disabled) { filter: none; background: var(--bg); }
	.item.todo { border-color: #e0a23a; background: #fff7e3; }
	.item.active { border: 2px solid var(--accent); background: var(--soft); padding: calc(0.5rem - 1px) calc(0.6rem - 1px); }
	/* Wiersz listy: pytanie + menu ⋯ (duplikuj, przesuń, usuń) – na telefonie lista to jedyne miejsce
	   pod ręką, bo panel z przyciskami pytania jest na samym dole edytora. */
	.list li { display: flex; align-items: center; gap: 0.25rem; min-width: 0; }
	.list li .item { flex: 1; }
	.item-menu { flex: none; display: flex; }
	.item-menu :global(.trigger:not(.on)) { background: transparent; border-color: transparent; color: var(--muted); }
	.item-menu :global(.trigger:not(.on):hover:not(:disabled)) { background: var(--bg); color: var(--text); }
	/* Okno „Niezapisane zmiany”. */
	.leave { box-sizing: border-box; width: min(26rem, calc(100vw - 2rem)); padding: 1.4rem; border: 1px solid var(--line-strong); border-radius: var(--radius); background: #fff; color: var(--text); box-shadow: 0 24px 60px rgba(27, 31, 59, 0.25); }
	.leave::backdrop { background: rgba(27, 31, 59, 0.45); }
	.leave h2 { margin: 0 0 0.5rem; font-size: 1.2rem; }
	.leave p { margin: 0 0 1rem; color: var(--muted); }
	.leave .error { color: var(--danger); margin: 0 0 1rem; }
	.leave-actions { display: flex; flex-direction: column; gap: 0.5rem; }
	.leave-actions button { width: 100%; justify-content: center; min-height: 2.75rem; }
	.n { width: 1.4rem; flex: none; font-weight: 700; }
	.t { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	.type { flex: none; font-size: 0.68rem; font-weight: 700; color: #4b5064; background: #fff; border: 1px solid var(--line-strong); padding: 0.1rem 0.35rem; border-radius: 0.3rem; }
	.warn { flex: none; background: #fdf0d0; color: #6b4300; border-radius: 50%; width: 1.3rem; height: 1.3rem; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; }
	.add { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--line-strong); }
	/* Po regule .add (ta sama waga selektora) – inaczej blok z telefonu pokazywał się na komputerze jako czwarta kolumna. */
	.add.add-mobile { display: none; }
	.editor { flex: 999 1 26rem; min-width: 0; box-sizing: border-box; padding: 1.5rem clamp(1rem, 3vw, 2.5rem) 2rem; }
	.q { max-width: 52rem; margin: 0 auto; border: 1px solid var(--line); background: var(--surface); border-radius: 1.25rem; box-shadow: var(--shadow); padding: clamp(1rem, 3vw, 2rem); display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
	.q > label, .q :global(label) { margin-top: 0; }
	.prompt input { min-height: 4rem; font-family: var(--display); font-size: clamp(1.25rem, 2.2vw, 1.75rem); font-weight: 700; text-align: center; border-radius: 0.75rem; }
	.slider-set { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 0.75rem 0.8rem; align-items: end; }
	.slider-set label { display: flex; flex-direction: column; gap: 0.35rem; margin: 0; }
	.slider-set label > :global(input), .slider-set label > select { margin: 0; }
	/* Lista tolerancji ma długie opcje („Mała (±5% zakresu)”) – osobny wiersz na całą szerokość, żeby nie były ucięte.
	   Nie „span 2”: przy jednej kolumnie (telefon) tworzyło niejawną drugą kolumnę i siatka wychodziła poza kartę. */
	.slider-set label:has(select) { grid-column: 1 / -1; }
	/* Akcje tekstowe pod polami („+ dodaj wariant”) przy lewej krawędzi, a nie na środku. */
	.q > :global(button.link) { align-self: flex-start; margin-left: -0.65rem; }
	textarea { width: 100%; }

	/* Odpowiedzi: duże kolorowe pola jak na ekranie gry; poprawna ma twardy cień. */
	.answers { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(17rem, 100%), 1fr)); gap: 0.9rem; margin-top: 0.5rem; }
	.answer { display: flex; flex-wrap: wrap; align-items: center; align-content: flex-start; gap: 0.5rem 0.75rem; min-height: 4.5rem; box-sizing: border-box; border: 3px solid var(--accent); border-radius: 0.9rem; padding: 0.5rem 0.9rem; color: #0b0d1a; min-width: 0; }
	.answer.correct { box-shadow: 5px 5px 0 var(--accent); }
	.answer input[type='text'] { flex: 1 1 calc(100% - 3rem); min-width: 0; border: 0; padding: 0.3rem 0; background: transparent; font-size: 1.15rem; font-weight: 700; color: #0b0d1a; box-shadow: none; }
	.answer input[type='text']::placeholder { color: rgba(11, 13, 26, 0.72); font-weight: 500; }
	.answer input[type='text']:focus { box-shadow: 0 2px 0 #0b0d1a; border-radius: 0; }
	.shape { display: flex; flex: none; color: #0b0d1a; }
	.check.small { flex: none; gap: 0.45rem; min-height: 2rem; margin: 0; padding: 0 0.65rem 0 0.45rem; border-radius: 0.5rem; background: #fff; color: var(--text); font-size: 0.85rem; font-weight: 700; white-space: nowrap; }
	.ans-img { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
	/* Opis obrazka: osobny, mały biały wiersz – czytelny na każdym kolorze odpowiedzi (nie dziedziczy dużego pola podpisu). */
	.answer .ans-img input.img-alt[type='text'] { flex: 1 1 100%; min-width: 0; margin: 0; padding: 0.4rem 0.6rem; border: 0; border-radius: 0.5rem; background: rgba(255, 255, 255, 0.92); color: #0b0d1a; font-size: 0.85rem; font-weight: 500; }
	.answer .ans-img input.img-alt[type='text']::placeholder { color: rgba(11, 13, 26, 0.6); }
	.answer .ans-img input.img-alt[type='text']:focus { box-shadow: 0 0 0 2px #0b0d1a; border-radius: 0.5rem; }
	.img-alt-hint { flex-basis: 100%; font-size: 0.78rem; font-weight: 600; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45); }
	.ans-img img { height: 64px; max-width: 120px; object-fit: contain; border-radius: 0.4rem; background: #fff; border: 2px solid var(--accent); }
	.ans-img :global(button.link), .file-link { position: relative; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; min-height: 2rem; padding: 0 0.65rem; border-radius: 0.5rem; background: #fff; color: var(--text); text-decoration: none; font-size: 0.85rem; font-weight: 600; margin: 0; }
	.ans-img :global(button.link:hover:not(:disabled)), .file-link:hover { background: var(--soft); }
	.file-link:focus-within { box-shadow: 0 0 0 2px #0b0d1a; }
	.file-link input { position: absolute; width: 1px; height: 1px; opacity: 0; }
	.tf { display: flex; flex-wrap: wrap; gap: 0 2rem; }
	.row { display: flex; gap: 0.5rem; align-items: center; }

	.props-wrap { flex: 1 1 19rem; max-width: 100%; box-sizing: border-box; background: var(--surface); border-left: 1px solid var(--line); }
	.props { position: sticky; top: 4.1rem; margin: 0; border: 0; padding: 1.25rem; display: flex; flex-direction: column; gap: 1.1rem; min-width: 0; }
	.props label, .props .lbl { display: block; margin: 0; font-size: 0.87rem; font-weight: 600; }
	.props label > select, .props label > input { margin-top: 0.4rem; }
	.field { display: flex; flex-direction: column; gap: 0.4rem; }
	.time { display: flex; gap: 0.4rem; }
	.time input { width: 4.75rem; flex: none; }
	.seg { flex: 1; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 0.35rem; }
	.seg button { padding: 0 0.4rem; font-weight: 500; font-size: 0.9rem; }
	.seg button[aria-pressed='true'] { border: 2px solid var(--accent); background: var(--soft); font-weight: 700; }
	.image { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.image img { max-height: 120px; max-width: 100%; border-radius: 0.5rem; border: 1px solid var(--line); }
	/* display: flex – inaczej reguła „.props label { display: block }” zdejmuje wyśrodkowanie tekstu w przycisku. */
	.props label.file { display: flex; position: relative; overflow: hidden; flex: 1; font-size: 0.93rem; border-style: dashed; border-color: #9ea3b5; }
	.file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.props label.file:focus-within { box-shadow: var(--focus); }
	.formats { flex-basis: 100%; margin-top: -0.35rem; font-size: 0.8rem; }
	.q-tools { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: auto; padding-top: 1rem; border-top: 1px solid var(--line); }
	.q-tools button { padding-inline: 0.7rem; }
	.q-tools .grow { flex: 1 1 5.5rem; }
	.empty { text-align: center; padding: 3rem; max-width: 40rem; margin: 0 auto; }

	@media (max-width: 1100px) {
		.props-wrap { border-left: 0; border-top: 1px solid var(--line); }
		.props { position: static; }
	}
	@media (max-width: 860px) {
		/* Pasek zostaje przyklejony także na telefonie: iOS 26 (aplikacja z ekranu głównego) barwi pasek statusu
		   przyklejonym nagłówkiem – bez niego pod paskiem statusu widać szare rozmycie. Przy okazji Zapisz / Uruchom grę zawsze pod ręką. */
		.bar { padding: 0.6rem 1rem; }
		.back span { display: none; }
		.back { border: 1px solid var(--line-strong); width: 44px; min-height: 44px; padding: 0; justify-content: center; }
		/* Telefon/tablet: rząd 1 – wróć, tytuł, ⋯; rząd 2 – Zapisz i Uruchom grę po połowie. */
		.bar { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; }
		.title-wrap { flex-basis: auto; }
		.more-narrow { display: block; }
		.bar-actions { grid-column: 1 / -1; margin-left: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.bar-actions.ro { grid-template-columns: minmax(0, 1fr); }
		.bar-actions .wide { display: none; }
		.bar-actions .status:not(.sr) { grid-column: 1 / -1; }
		.bar-actions .save, .bar-actions .start { width: 100%; min-height: 44px; justify-content: center; }
		.settings, .below > .notice { margin-inline: 1rem; }
		.qnav { display: flex; gap: 0.5rem; padding: 0.6rem 1rem; background: var(--surface); border-bottom: 1px solid var(--line); }
		.qnav button:not(.grow) { width: 44px; padding: 0; flex: none; }
		.qnav .qnav-add { font-size: 1.5rem; font-weight: 700; line-height: 1; }
		.add.add-mobile { display: flex; flex: 1 1 100%; margin: 0; padding: 1rem; border-top: 1px dashed var(--line-strong); background: var(--surface); }
		.list { display: none; flex: 1 1 100%; border-right: 0; border-bottom: 1px solid var(--line); }
		.list-in { position: static; max-height: none; }
		.list.open { display: block; }
		.editor { padding: 1rem; }
		.q { padding: 1rem; border-radius: 1rem; }
		.answer { min-height: 4rem; }
	}
</style>
