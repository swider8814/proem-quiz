<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import AudioClipEditor from '#lib/editor/AudioClipEditor.svelte';
	import {
		ANSWER_COLORS, TYPE_LABELS, TYPE_SHORT, changeType, newKey, newQuestion, problems, toPayload, uploadFile,
		type EditorQuestion, type QType
	} from '#lib/editor/model.js';

	let { data } = $props();

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
		if (dirty && type !== 'leave' && !confirm('Masz niezapisane zmiany. Wyjść bez zapisywania?')) cancel();
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
		const sentQuestions = $state.snapshot(questions);
		const sentPayload = sentQuestions.map(toPayload);
		try {
			const res = await fetch(`/panel/api/quizzes/${data.quiz.id}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...sentQuiz, questions: sentPayload })
			});
			const out = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(out.error ?? out.message ?? 'Nie udało się zapisać.');
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

	function add() {
		questions.push(newQuestion(addType, quiz.settings.defaultTimeLimit));
		selected = questions.length - 1;
	}
	function remove(i: number) {
		if (!confirm('Usunąć to pytanie?')) return;
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
			const m = await uploadFile(file);
			if (m.kind !== 'image') throw new Error('To nie jest obrazek.');
			media[m.id] = { id: m.id, name: m.name, durationMs: null, kind: 'image' };
			current.imageMediaId = m.id;
		} catch (x) {
			imageError = (x as Error).message;
		}
	}

	const shapes = ['M20 4 L37 34 L3 34 Z', 'M20 2 L38 20 L20 38 L2 20 Z', 'circle', 'square'];
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>{quiz.title} · Edytor · Proem Quiz</title></svelte:head>

<div class="bar card">
	<input class="title" bind:value={quiz.title} maxlength="120" aria-label="Tytuł quizu" disabled={ro} />
	<div class="bar-actions">
		<span class="status muted" aria-live="polite">
			{#if saving}Zapisywanie…{:else if saveError}<span class="err">{saveError}</span>{:else if dirty}Niezapisane zmiany{:else}Zapisano{/if}
		</span>
		<button class="secondary" type="button" onclick={() => (showSettings = !showSettings)} aria-expanded={showSettings}>Ustawienia</button>
		{#if !ro}<button type="button" onclick={save} disabled={saving || !dirty}>Zapisz</button>{/if}
		<a class="btn start" href="/panel/quizzes/{data.quiz.id}/host" class:disabled={dirty || questions.length === 0} aria-disabled={dirty || questions.length === 0}>Uruchom grę</a>
	</div>
</div>
{#if ro}<p class="notice">Masz dostęp tylko do prowadzenia tego quizu – edycja jest wyłączona.</p>{/if}

{#if showSettings}
	<fieldset class="card settings" disabled={ro}>
		<legend class="sr">Ustawienia quizu</legend>
		<label>Motyw
			<select bind:value={quiz.themeId}>
				{#each data.themes as t}<option value={t.id}>{t.name}</option>{/each}
			</select>
		</label>
		<label>Język gry
			<select bind:value={quiz.locale}>
				<option value="pl">Polski</option><option value="en">English</option><option value="uk">Українська</option>
			</select>
		</label>
		<label>Domyślny czas na odpowiedź (s)
			<input type="number" min="5" max="240" bind:value={quiz.settings.defaultTimeLimit} />
		</label>
		<label>Nicki graczy
			<select bind:value={quiz.settings.nicknameMode}>
				<option value="random-or-custom">Losowe lub własne (z filtrem)</option>
				<option value="random-only">Tylko losowe (młodsze dzieci)</option>
			</select>
		</label>
		<label class="check"><input type="checkbox" bind:checked={quiz.settings.teamMode} /> Tryb drużynowy (jeden telefon na drużynę)</label>
		<label class="check"><input type="checkbox" bind:checked={quiz.settings.lateJoin} /> Można dołączyć po rozpoczęciu gry</label>
		<label class="check"><input type="checkbox" bind:checked={quiz.settings.phoneAnswerText} /> Tekst odpowiedzi na telefonach (nie tylko kolory i kształty)</label>
		<label class="check"><input type="checkbox" bind:checked={quiz.settings.streakBonus} /> Bonus za serię poprawnych odpowiedzi</label>
	</fieldset>
{/if}

<div class="layout">
	<aside class="card list">
		<ol>
			{#each questions as q, i (q.key)}
				<li>
					<button type="button" class="item" class:active={i === selected} onclick={() => (selected = i)}>
						<span class="n">{i + 1}</span>
						<span class="t">{q.prompt || 'Bez treści'}</span>
						<span class="type">{TYPE_SHORT[q.type]}</span>
						{#if problems(q).length}<span class="warn" title={problems(q).join(', ')} aria-label="Do uzupełnienia">!</span>{/if}
					</button>
				</li>
			{/each}
		</ol>
		{#if !ro}
			<div class="add">
				<select bind:value={addType} aria-label="Typ nowego pytania">
					{#each Object.entries(TYPE_LABELS) as [t, label]}<option value={t}>{label}</option>{/each}
				</select>
				<button type="button" onclick={add}>+ Dodaj pytanie</button>
			</div>
		{/if}
	</aside>

	<section class="editor">
		{#if !current}
			<div class="card empty">
				<p><strong>Quiz nie ma jeszcze pytań.</strong></p>
				<p class="muted">Wybierz typ po lewej i kliknij „Dodaj pytanie”.</p>
			</div>
		{:else}
			<fieldset class="q" disabled={ro}>
				<legend class="sr">Pytanie {selected + 1}</legend>
				<div class="q-head">
					<label class="grow">Typ pytania
						<select value={current.type} onchange={(e) => setType((e.currentTarget as HTMLSelectElement).value as QType)}>
							{#each Object.entries(TYPE_LABELS) as [t, label]}<option value={t}>{label}</option>{/each}
						</select>
					</label>
					<label>Czas (s)<input type="number" min="5" max="240" bind:value={current.timeLimit} /></label>
					<label>Punkty
						<select bind:value={current.pointsMultiplier}>
							<option value={1}>×1</option><option value={2}>×2</option><option value={0}>bez punktów</option>
						</select>
					</label>
					<div class="q-tools">
						<button type="button" class="secondary" onclick={() => move(selected, -1)} disabled={selected === 0} aria-label="Przesuń w górę">↑</button>
						<button type="button" class="secondary" onclick={() => move(selected, 1)} disabled={selected === questions.length - 1} aria-label="Przesuń w dół">↓</button>
						<button type="button" class="secondary" onclick={() => duplicate(selected)}>Duplikuj</button>
						<button type="button" class="danger" onclick={() => remove(selected)}>Usuń</button>
					</div>
				</div>

				<label>Treść pytania
					<input type="text" bind:value={current.prompt} maxlength="200" placeholder="np. Jaka to kolęda?" />
				</label>
				<label>Tłumaczenie / drugi wiersz (opcjonalnie)
					<input type="text" value={current.promptTranslation ?? ''} oninput={(e) => (current.promptTranslation = (e.currentTarget as HTMLInputElement).value || null)} maxlength="200" placeholder="np. Which Christmas carol is this?" />
				</label>

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

				{#if current.data.type === 'choice' || current.data.type === 'audio'}
					{@const d = current.data}
					<div class="answers">
						{#each d.answers as _, i}
							<div class="answer" class:correct={d.correct.includes(i)}>
								<span class="shape" style:background={ANSWER_COLORS[i]} aria-hidden="true">
									<svg width="18" height="18" viewBox="0 0 40 40">
										{#if shapes[i] === 'circle'}<circle cx="20" cy="20" r="16" fill="#111" />
										{:else if shapes[i] === 'square'}<rect x="5" y="5" width="30" height="30" fill="#111" />
										{:else}<path d={shapes[i]} fill="#111" />{/if}
									</svg>
								</span>
								<input type="text" bind:value={d.answers[i]} maxlength="80" placeholder="Odpowiedź {String.fromCharCode(65 + i)}{i >= 2 ? ' (opcjonalnie)' : ''}" aria-label="Odpowiedź {String.fromCharCode(65 + i)}" />
								<label class="check small"><input type="checkbox" checked={d.correct.includes(i)} onchange={() => toggleCorrect(i)} /> poprawna</label>
							</div>
						{/each}
					</div>
				{:else if current.data.type === 'truefalse'}
					{@const d = current.data}
					<div class="tf" role="radiogroup" aria-label="Poprawna odpowiedź">
						<label class="check"><input type="radio" checked={d.correct} onchange={() => (d.correct = true)} /> Prawda jest poprawna</label>
						<label class="check"><input type="radio" checked={!d.correct} onchange={() => (d.correct = false)} /> Fałsz jest poprawny</label>
					</div>
				{:else if current.data.type === 'text'}
					{@const d = current.data}
					<p class="muted">Akceptowane odpowiedzi (wielkość liter, polskie znaki i interpunkcja nie mają znaczenia):</p>
					{#each d.accepted as _, i}
						<div class="row">
							<input type="text" bind:value={d.accepted[i]} maxlength="80" aria-label="Akceptowana odpowiedź {i + 1}" />
							{#if d.accepted.length > 1}<button type="button" class="secondary" onclick={() => d.accepted.splice(i, 1)} aria-label="Usuń">✕</button>{/if}
						</div>
					{/each}
					{#if d.accepted.length < 10}<button type="button" class="link" onclick={() => d.accepted.push('')}>+ dodaj wariant</button>{/if}
					<label>Tolerancja literówek
						<select bind:value={d.typoTolerance}>
							<option value={0}>Brak – dokładnie</option><option value={1}>1 literówka</option><option value={2}>2 literówki</option>
						</select>
					</label>
				{:else if current.data.type === 'order'}
					{@const d = current.data}
					<p class="muted">Wpisz elementy w POPRAWNEJ kolejności – graczom pokażą się pomieszane.</p>
					{#each d.items as _, i}
						<div class="row">
							<span class="n">{i + 1}.</span>
							<input type="text" bind:value={d.items[i]} maxlength="60" aria-label="Element {i + 1}" />
							{#if d.items.length > 3}<button type="button" class="secondary" onclick={() => d.items.splice(i, 1)} aria-label="Usuń">✕</button>{/if}
						</div>
					{/each}
					{#if d.items.length < 6}<button type="button" class="link" onclick={() => d.items.push('')}>+ dodaj element</button>{/if}
					<label class="check"><input type="checkbox" bind:checked={d.partialCredit} /> Częściowe punkty za część poprawnych pozycji</label>
				{/if}

				<div class="image">
					{#if current.imageMediaId}
						<img src="/media/{current.imageMediaId}" alt="Obrazek do pytania" />
						<button type="button" class="link" onclick={() => (current.imageMediaId = null)}>Usuń obrazek</button>
					{:else}
						<label class="btn secondary file">Dodaj obrazek (PNG, JPG, WEBP)
							<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={pickImage} />
						</label>
					{/if}
					{#if imageError}<p class="error">{imageError}</p>{/if}
				</div>

				{#if problems(current).length}
					<p class="notice">Do uzupełnienia: {problems(current).join(', ')}.</p>
				{/if}
			</fieldset>
		{/if}
	</section>
</div>

<style>
	.bar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 0.75rem 1rem; margin-bottom: 1rem; }
	.title { flex: 1; min-width: 14rem; font-size: 1.25rem; font-weight: 700; border-color: transparent; }
	.title:hover, .title:focus { border-color: #c9cbd3; }
	.bar-actions { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.status { min-width: 8rem; text-align: right; }
	.err { color: var(--danger); }
	.start { background: #26890c; }
	.start.disabled { opacity: 0.4; pointer-events: none; }
	.settings { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: 0.25rem 1.5rem; margin: 0 0 1rem; border: 1px solid var(--line); }
	.settings label { margin-top: 0.5rem; }
	.check { display: flex; align-items: center; gap: 0.5rem; font-weight: 400; }
	.check.small { font-size: 0.8rem; white-space: nowrap; margin: 0; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.layout { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
	.list { flex: 0 1 18rem; padding: 0.75rem; position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow: auto; }
	.list ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.3rem; }
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
	.answers { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); gap: 0.6rem; margin-top: 0.5rem; }
	.answer { display: flex; align-items: center; gap: 0.6rem; background: #fff; border: 2px solid var(--line); border-radius: 0.6rem; padding: 0.35rem 0.6rem; }
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
