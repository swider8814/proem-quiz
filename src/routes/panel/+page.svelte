<script lang="ts">
	import { enhance } from '$app/forms';
	import { flushSync } from 'svelte';
	import { send } from '#lib/forms.js';
	import Icon from '#lib/Icon.svelte';
	import RowMenu from '#lib/RowMenu.svelte';
	import { panelDict } from '#lib/i18n/panel.js';
	let { data, form } = $props();
	const t = $derived(panelDict(data.lang));
	const fmt = (d: Date | string) => new Date(d).toLocaleDateString(t.list.dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
	const current = $derived(data.folders.find((f) => f.id === data.folder) ?? null);
	/** Adres listy z zachowaniem filtra i wyszukiwania. */
	const href = (o: { f?: string; q?: string; p?: number }) => {
		const sp = new URLSearchParams();
		const f = o.f ?? data.folder;
		const q = o.q ?? data.query;
		if (f !== 'all') sp.set('f', f);
		if (q) sp.set('q', q);
		if (o.p && o.p > 1) sp.set('p', String(o.p));
		const s = sp.toString();
		return s ? `/panel?${s}` : '/panel';
	};
	// Akcje formularzy z zachowaniem bieżącego filtra/strony (po zapisie lista zostaje ta sama).
	const act = (name: string) => {
		const s = href({ p: data.page }).split('?')[1];
		return s ? `?${s}&/${name}` : `?/${name}`;
	};
	let newFolderOpen = $state(false);
	let folderInput: HTMLInputElement | undefined = $state();
	/** Pole nazwy folderu z kursorem od razu – synchronicznie, żeby iOS otworzył klawiaturę. */
	function openNewFolder() {
		flushSync(() => (newFolderOpen = !newFolderOpen));
		if (newFolderOpen) folderInput?.focus();
	}
	// Telefon: pole nowego quizu i wyszukiwarka chowają się pod ikonami przy nagłówku „Quizy”.
	let createOpen = $state(false);
	// svelte-ignore state_referenced_locally
	let searchOpen = $state(!!data.query);
	const empty = $derived(data.total === 0 && data.folders.length === 0);
	let newTitle: HTMLInputElement | undefined = $state();
	let searchInput: HTMLInputElement | undefined = $state();
	/** Rozwija pole (telefon) i od razu stawia w nim kursor, żeby można było pisać.
	 * Synchronicznie (flushSync, bez await): iOS Safari otwiera klawiaturę tylko wtedy, gdy focus()
	 * pada jeszcze w obsłudze dotknięcia. */
	function reveal(which: 'create' | 'search') {
		flushSync(() => {
			if (which === 'create') createOpen = !createOpen;
			else searchOpen = !searchOpen;
		});
		if (which === 'create' && createOpen) newTitle?.focus();
		if (which === 'search' && searchOpen) searchInput?.focus();
	}
	let renaming = $state(false);

</script>

<svelte:head><title>{t.list.title} · Proem Quiz</title></svelte:head>

<div class="head">
	<h1>{t.list.title}</h1>
	<!-- Tylko telefon: lupa i plus rozwijają wyszukiwarkę i pole nowego quizu (na szerokim ekranie są widoczne zawsze). -->
	<div class="head-tools">
		{#if !empty}
			<button type="button" class="secondary" class:on={searchOpen} aria-label={t.list.search} title={t.list.search} aria-expanded={searchOpen} aria-controls="list-search" onclick={() => reveal('search')}><Icon name="search" weight={2} /></button>
		{/if}
		{#if !empty}<button type="button" class:on={createOpen} aria-label={t.list.create} title={t.list.create} aria-expanded={createOpen} aria-controls="list-new" onclick={() => reveal('create')}><Icon name="plus" weight={2.25} /></button>{/if}
	</div>
	<form method="POST" action="?/create" class="new" class:open={createOpen || empty} id="list-new" use:enhance={send()}>
		{#if current}<input type="hidden" name="folder" value={current.id} />{/if}
		<input bind:this={newTitle} name="title" type="text" placeholder={t.list.newTitle} aria-label={t.list.newTitle} required maxlength="120" />
		<button><Icon name="plus" weight={2} />{t.list.create}</button>
	</form>
</div>

{#if form?.error}<p class="error">{form.error}</p>{/if}
{#if form?.message}<p class="success">{form.message}</p>{/if}

{#if data.total === 0 && data.folders.length === 0}
	<div class="card empty">
		<p><strong>{t.list.empty}</strong></p>
		<p class="muted">{t.list.emptyHint}</p>
	</div>
{:else}
	<div class="filters">
		<nav class="folders" aria-label={t.list.folders}>
			<a class="chip" class:on={data.folder === 'all'} href={href({ f: 'all', p: 1 })}>{t.list.allQuizzes} <span>{data.total}</span></a>
			{#if data.mineCount !== null}<a class="chip" class:on={data.folder === 'mine'} href={href({ f: 'mine', p: 1 })}>{t.list.mineQuizzes} <span>{data.mineCount}</span></a>{/if}
			<!-- „Bez folderu” ma sens dopiero, gdy są foldery i coś poza nimi (albo ten widok jest otwarty). -->
			{#if (data.folders.length && data.noFolderCount) || data.folder === 'none'}<a class="chip" class:on={data.folder === 'none'} href={href({ f: 'none', p: 1 })}>{t.list.noFolder} <span>{data.noFolderCount}</span></a>{/if}
			{#each data.folders as f (f.id)}
				<a class="chip folder" class:on={data.folder === f.id} href={href({ f: f.id, p: 1 })}>{f.name} <span>{f.count}</span></a>
			{/each}
			<button type="button" class="chip add" class:on={newFolderOpen} title={t.list.newFolder} aria-expanded={newFolderOpen} aria-controls="new-folder" onclick={openNewFolder}><Icon name="folderPlus" weight={2} /><span class="add-lbl">{t.list.newFolder}</span></button>
		</nav>
		<!-- Pod rzędem filtrów, nie w nim: na telefonie rząd przewija się w bok i pole wypadałoby poza ekran. -->
		{#if newFolderOpen}
			<form method="POST" action="?/folderCreate" class="inline new-folder" id="new-folder" use:enhance={send()}>
				<input bind:this={folderInput} name="name" type="text" placeholder={t.list.folderNamePh} aria-label={t.list.folderNamePh} required maxlength="60" />
				<button>{t.list.addFolder}</button>
				<button type="button" class="secondary" aria-label={t.common.cancel ?? 'OK'} onclick={() => (newFolderOpen = false)}><Icon name="close" /></button>
			</form>
		{/if}

		<form method="GET" action="/panel" class="search" class:open={searchOpen} id="list-search">
			{#if data.folder !== 'all'}<input type="hidden" name="f" value={data.folder} />{/if}
			<input bind:this={searchInput} name="q" type="search" value={data.query} placeholder={t.list.search} aria-label={t.list.search} maxlength="100" />
			<button class="secondary" title={t.list.searchBtn}><Icon name="search" weight={2} /><span class="lbl">{t.list.searchBtn}</span></button>
			{#if data.query}<a class="btn secondary" href={href({ q: '', p: 1 })} title={t.list.clearSearch}><Icon name="close" weight={2} /><span class="lbl">{t.list.clearSearch}</span></a>{/if}
		</form>
	</div>

	{#if current}
		<div class="folder-bar">
			{#if renaming}
				<form method="POST" action={act('folderRename')} class="inline" use:enhance={send({ after: () => (renaming = false) })}>
					<input type="hidden" name="id" value={current.id} />
					<input name="name" type="text" value={current.name} aria-label={t.list.folderNamePh} required maxlength="60" />
					<button>{t.common.save ?? 'OK'}</button>
					<button type="button" class="secondary" aria-label={t.common.cancel ?? 'OK'} onclick={() => (renaming = false)}><Icon name="close" /></button>
				</form>
			{:else}
				<strong>{current.name}</strong>
				<button type="button" class="link" onclick={() => (renaming = true)}><Icon name="edit" weight={2} size="0.95em" />{t.list.renameFolder}</button>
				<form method="POST" action="?/folderDelete" use:enhance={send({ confirm: () => ({ message: t.list.confirmDeleteFolder(current.name), confirmLabel: t.list.deleteFolder, icon: 'trash' }) })}>
					<input type="hidden" name="id" value={current.id} /><button class="link danger-link"><Icon name="trash" weight={2} size="0.95em" />{t.list.deleteFolder}</button>
				</form>
			{/if}
		</div>
	{/if}

	{#if data.quizzes.length === 0}
		<p class="muted">{t.list.noResults}</p>
	{:else}
		{#if data.query || data.pages > 1}<p class="muted count">{t.list.found(data.found)}</p>{/if}
		<ul class="list">
			{#each data.quizzes as q (q.id)}
				<li class="card" class:draft={q.questionCount === 0}>
					<a class="cover" href="/panel/quizzes/{q.id}" tabindex="-1" aria-hidden="true" style:background={q.cover?.background ?? '#eef0f6'}>
						<span class="pills">
							<span class="pill">{q.themeName ?? t.list.defaultTheme}</span>
							<span class="pill dark">{t.list.questions(q.questionCount)}</span>
						</span>
						{#if q.cover}<span class="tiles">{#each q.cover.answers as c}<span style:background={c}></span>{/each}</span>{/if}
					</a>
					<div class="info">
						<a class="title" href="/panel/quizzes/{q.id}">{q.title}</a>
						<span class="muted">
							{t.list.changed(fmt(q.updatedAt))}
							{#if !q.mine}· {t.list.author(q.ownerName)}{/if}
						</span>
					</div>
					<div class="actions">
						<a class="btn run" href="/panel/quizzes/{q.id}/host" aria-disabled={q.questionCount === 0} class:disabled={q.questionCount === 0}>
							<Icon name="play" weight={2} />{t.list.run}
						</a>
						<a class="btn secondary" href="/panel/quizzes/{q.id}"><Icon name="edit" weight={2} />{t.list.edit}</a>
						<RowMenu label="{t.list.more}: {q.title}">
							<a href="/panel/quizzes/{q.id}/reports"><Icon name="chart" weight={2} />{t.list.reports}</a>
							{#if q.canEdit}<form method="POST" action="?/duplicate" use:enhance={send()}><input type="hidden" name="id" value={q.id} /><button><Icon name="copy" weight={2} />{t.list.duplicate}</button></form>{/if}
							{#if data.folders.length}
								<form method="POST" action={act('move')} use:enhance={send()} class="move">
									<input type="hidden" name="id" value={q.id} />
									<label><span class="move-lbl"><Icon name="folderInput" weight={2} />{t.list.moveTo}</span>
										<select name="folder" aria-label="{t.list.moveTo}: {q.title}" value={q.folderId ?? ''} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
											<option value="">{t.list.noFolder}</option>
											{#each data.folders as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
										</select>
									</label>
								</form>
							{/if}
							{#if q.mine || data.user.role === 'admin'}
								<hr />
								<form method="POST" action="?/delete" use:enhance={send({ confirm: () => ({ message: t.list.confirmDelete(q.title), confirmLabel: t.common.remove, icon: 'trash' }) })}>
									<input type="hidden" name="id" value={q.id} /><button class="danger"><Icon name="trash" weight={2} />{t.common.remove}</button>
								</form>
							{/if}
						</RowMenu>
					</div>
				</li>
			{/each}
		</ul>
		{#if data.pages > 1}
			<nav class="pager" aria-label={t.list.pagination}>
				{#if data.page > 1}<a class="btn secondary" href={href({ p: data.page - 1 })}>{t.list.prev}</a>{:else}<span class="btn secondary disabled">{t.list.prev}</span>{/if}
				<span class="muted">{t.list.pageOf(data.page, data.pages)}</span>
				{#if data.page < data.pages}<a class="btn secondary" href={href({ p: data.page + 1 })}>{t.list.next}</a>{:else}<span class="btn secondary disabled">{t.list.next}</span>{/if}
			</nav>
		{/if}
	{/if}
{/if}

<style>
	.head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
	h1 { margin: 0; }
	.new { display: flex; gap: 0.5rem; flex: 1 1 20rem; max-width: 30rem; min-width: 0; }
	.new input { flex: 1; min-width: 0; }
	@media (max-width: 520px) { .new { flex-basis: 100%; max-width: none; } }
	.filters { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 0.75rem 1.5rem; margin-bottom: 1.25rem; }
	.folders { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; flex: 1 1 20rem; min-width: 0; }
	.chip { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.25rem; padding: 0 0.9rem; border-radius: 999px; background: #fff; color: var(--text); text-decoration: none; font-size: 0.93rem; font-weight: 500; border: 1px solid var(--line-strong); }
	.chip span { background: var(--soft); border-radius: 999px; padding: 0 0.45rem; font-size: 0.8rem; color: var(--text); }
	.chip:hover { background: var(--soft); filter: none; }
	.chip.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
	.chip.add { background: none; border: 1px dashed #9ea3b5; }
	.chip.folder { max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.inline { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
	.inline input { width: 14rem; max-width: 60vw; }
	.new-folder { flex: 1 1 100%; }
	.chip.add.on { border-style: solid; background: var(--soft); }
	.folder-bar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
	.search { display: flex; gap: 0.5rem; flex: 0 1 24rem; flex-wrap: wrap; }
	.search input { flex: 1; min-width: 10rem; }
	.count { margin: 0 0 0.5rem; }
	.list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(18.5rem, 100%), 1fr)); gap: 1.25rem; }
	.list li { display: flex; flex-direction: column; padding: 0; min-width: 0; transition: box-shadow 0.15s, transform 0.15s; }
	.list li:hover { box-shadow: 0 2px 4px rgba(27, 31, 59, 0.06), 0 10px 24px rgba(27, 31, 59, 0.08); transform: translateY(-1px); }
	.list li.draft { border-style: dashed; border-color: #b9bdcb; }
	.cover { display: flex; flex-direction: column; justify-content: space-between; gap: 0.6rem; height: 6rem; box-sizing: border-box; padding: 0.75rem; border-radius: calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0 0; text-decoration: none; }
	.pills { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; min-width: 0; }
	.pill { background: #fff; color: var(--text); font-size: 0.78rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: 0.4rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
	.pill.dark { background: var(--accent); color: #fff; flex: none; }
	.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.3rem; }
	.tiles span { height: 0.9rem; border-radius: 0.25rem; border: 2px solid rgba(17, 17, 17, 0.85); }
	.info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.35rem; padding: 1rem 1rem 0.75rem; }
	.title { font-weight: 700; font-size: 1.1rem; line-height: 1.3; color: var(--text); text-decoration: none; overflow-wrap: anywhere; }
	.title:hover { text-decoration: underline; }
	.actions { display: flex; gap: 0.5rem; align-items: stretch; padding: 0 1rem 1rem; }
	.actions > .btn { flex: 1; padding-inline: 0.5rem; }
	.actions > :global(.trigger) { width: 2.75rem; min-height: 2.75rem; }
	.btn.disabled { opacity: 0.4; pointer-events: none; }
	.danger-link { color: var(--danger) !important; }
	.folder-bar .link { display: inline-flex; align-items: center; gap: 0.35rem; }
	.move-lbl { display: flex; align-items: center; gap: 0.65rem; font-weight: 500; }
	.empty { text-align: center; padding: 2.5rem; }
	.pager { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap; }
	.head-tools { display: none; }
	/* Telefon: „Quizy” + lupa + plus w jednym rzędzie; pola rozwijane; filtry w jednym rzędzie przewijanym w bok. */
	@media (max-width: 720px) {
		.head { flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
		.head h1 { flex: 1; margin: 0; }
		.head-tools { display: flex; gap: 0.5rem; }
		.actions > :global(.trigger) { width: 44px; min-height: 44px; }
		.head-tools button { width: 44px; min-height: 44px; padding: 0; flex: none; }
		.head-tools button.secondary.on, .head-tools button.secondary.on:hover:not(:disabled) { background: var(--accent); border-color: var(--accent); color: #fff; }
		.new:not(.open), .search:not(.open) { display: none; }
		/* Siatka z kolumną minmax(0, 1fr): długi rząd filtrów nie rozpycha strony w bok. */
		.filters { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.75rem; }
		.search { order: -1; flex-wrap: nowrap; }
		.search input { min-width: 0; }
		.new-folder { flex-wrap: nowrap; }
		.new-folder input { flex: 1; width: auto; min-width: 0; max-width: none; }
		.search > .secondary { width: 44px; padding: 0; flex: none; justify-content: center; }
		.search .lbl { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
		.folders { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-inline: -1rem; padding-inline: 1rem; flex: none; }
		.folders::-webkit-scrollbar { display: none; }
		.folders > * { flex: none; }
		.chip.add { width: 2.25rem; padding: 0; justify-content: center; }
		.add-lbl { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	}
</style>
