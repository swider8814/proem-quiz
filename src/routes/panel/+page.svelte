<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/Icon.svelte';
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
	let renaming = $state(false);

	// Menu „Więcej” na karcie (<details>): kliknięcie poza nim lub Escape je zamyka.
	function closeMenus(e: Event) {
		for (const d of document.querySelectorAll<HTMLDetailsElement>('details.more[open]')) {
			if (e.type === 'keydown' || !d.contains(e.target as Node)) d.open = false;
		}
	}
</script>

<svelte:head><title>{t.list.title} · Proem Quiz</title></svelte:head>
<svelte:window onclick={closeMenus} onkeydown={(e) => e.key === 'Escape' && closeMenus(e)} />

<div class="head">
	<h1>{t.list.title}</h1>
	<form method="POST" action="?/create" class="new">
		{#if current}<input type="hidden" name="folder" value={current.id} />{/if}
		<input name="title" type="text" placeholder={t.list.newTitle} aria-label={t.list.newTitle} required maxlength="120" />
		<button>{t.list.create}</button>
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
			<a class="chip" class:on={data.folder === 'none'} href={href({ f: 'none', p: 1 })}>{t.list.noFolder} <span>{data.noFolderCount}</span></a>
			{#each data.folders as f (f.id)}
				<a class="chip folder" class:on={data.folder === f.id} href={href({ f: f.id, p: 1 })}>{f.name} <span>{f.count}</span></a>
			{/each}
			{#if newFolderOpen}
				<form method="POST" action="?/folderCreate" class="inline">
					<!-- svelte-ignore a11y_autofocus -->
					<input name="name" type="text" placeholder={t.list.folderNamePh} aria-label={t.list.folderNamePh} required maxlength="60" autofocus />
					<button>{t.list.addFolder}</button>
					<button type="button" class="secondary" aria-label={t.common.cancel ?? 'OK'} onclick={() => (newFolderOpen = false)}><Icon name="close" /></button>
				</form>
			{:else}
				<button type="button" class="chip add" onclick={() => (newFolderOpen = true)}>+ {t.list.newFolder}</button>
			{/if}
		</nav>

		<form method="GET" action="/panel" class="search">
			{#if data.folder !== 'all'}<input type="hidden" name="f" value={data.folder} />{/if}
			<input name="q" type="search" value={data.query} placeholder={t.list.search} aria-label={t.list.search} maxlength="100" />
			<button class="secondary">{t.list.searchBtn}</button>
			{#if data.query}<a class="btn secondary" href={href({ q: '', p: 1 })}>{t.list.clearSearch}</a>{/if}
		</form>
	</div>

	{#if current}
		<div class="folder-bar">
			{#if renaming}
				<form method="POST" action={act('folderRename')} class="inline" use:enhance={() => async ({ update }) => { await update(); renaming = false; }}>
					<input type="hidden" name="id" value={current.id} />
					<input name="name" type="text" value={current.name} aria-label={t.list.folderNamePh} required maxlength="60" />
					<button>{t.common.save ?? 'OK'}</button>
					<button type="button" class="secondary" aria-label={t.common.cancel ?? 'OK'} onclick={() => (renaming = false)}><Icon name="close" /></button>
				</form>
			{:else}
				<strong>{current.name}</strong>
				<button type="button" class="link" onclick={() => (renaming = true)}>{t.list.renameFolder}</button>
				<form method="POST" action="?/folderDelete" onsubmit={(e) => { if (!confirm(t.list.confirmDeleteFolder(current.name))) e.preventDefault(); }}>
					<input type="hidden" name="id" value={current.id} /><button class="link danger-link">{t.list.deleteFolder}</button>
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
							<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z" /></svg>{t.list.run}
						</a>
						<a class="btn secondary" href="/panel/quizzes/{q.id}">{t.list.edit}</a>
						<details class="more">
							<summary aria-label="{t.list.more}: {q.title}"><span aria-hidden="true">⋯</span></summary>
							<div class="pop">
								<a class="btn secondary" href="/panel/quizzes/{q.id}/reports">{t.list.reports}</a>
								{#if q.canEdit}<form method="POST" action="?/duplicate"><input type="hidden" name="id" value={q.id} /><button class="secondary">{t.list.duplicate}</button></form>{/if}
								{#if data.folders.length}
									<form method="POST" action={act('move')} use:enhance class="move">
										<input type="hidden" name="id" value={q.id} />
										<label>{t.list.moveTo}
											<select name="folder" aria-label="{t.list.moveTo}: {q.title}" value={q.folderId ?? ''} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
												<option value="">{t.list.noFolder}</option>
												{#each data.folders as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
											</select>
										</label>
									</form>
								{/if}
								{#if q.mine || data.user.role === 'admin'}
									<form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(t.list.confirmDelete(q.title))) e.preventDefault(); }}>
										<input type="hidden" name="id" value={q.id} /><button class="danger">{t.common.remove}</button>
									</form>
								{/if}
							</div>
						</details>
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
	.btn.disabled { opacity: 0.4; pointer-events: none; }
	.more { position: relative; }
	.more summary { list-style: none; display: flex; align-items: center; justify-content: center; width: 2.75rem; height: 100%; min-height: 2.75rem; box-sizing: border-box; border: 1px solid var(--line-strong); border-radius: var(--radius-s); background: #fff; font-weight: 700; font-size: 1.2rem; cursor: pointer; }
	.more summary::-webkit-details-marker { display: none; }
	.more summary:hover, .more[open] summary { background: var(--soft); }
	.pop { position: absolute; right: 0; bottom: calc(100% + 0.4rem); z-index: 20; width: 14rem; box-sizing: border-box; display: flex; flex-direction: column; gap: 0.4rem; padding: 0.6rem; background: #fff; border: 1px solid var(--line-strong); border-radius: 0.75rem; box-shadow: 0 12px 32px rgba(27, 31, 59, 0.18); transform-origin: bottom right; animation: pop-in var(--dur-fast) var(--ease-out); }
	.pop .btn, .pop button { width: 100%; }
	.pop label { margin: 0.2rem 0 0; }
	.pop select { margin-top: 0.3rem; }
	.danger-link { color: var(--danger) !important; }
	.empty { text-align: center; padding: 2.5rem; }
	.pager { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap; }
</style>
