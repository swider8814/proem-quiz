<script lang="ts">
	import { enhance } from '$app/forms';
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
</script>

<svelte:head><title>{t.list.title} · Proem Quiz</title></svelte:head>

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
	<nav class="folders" aria-label={t.list.folders}>
		<a class="chip" class:on={data.folder === 'all'} href={href({ f: 'all', p: 1 })}>{t.list.allQuizzes} <span>{data.total}</span></a>
		<a class="chip" class:on={data.folder === 'none'} href={href({ f: 'none', p: 1 })}>{t.list.noFolder} <span>{data.noFolderCount}</span></a>
		{#each data.folders as f (f.id)}
			<a class="chip folder" class:on={data.folder === f.id} href={href({ f: f.id, p: 1 })}>📁 {f.name} <span>{f.count}</span></a>
		{/each}
		{#if newFolderOpen}
			<form method="POST" action="?/folderCreate" class="inline">
				<!-- svelte-ignore a11y_autofocus -->
				<input name="name" type="text" placeholder={t.list.folderNamePh} aria-label={t.list.folderNamePh} required maxlength="60" autofocus />
				<button>{t.list.addFolder}</button>
				<button type="button" class="secondary" onclick={() => (newFolderOpen = false)}>✕</button>
			</form>
		{:else}
			<button type="button" class="chip add" onclick={() => (newFolderOpen = true)}>＋ {t.list.newFolder}</button>
		{/if}
	</nav>

	{#if current}
		<div class="folder-bar">
			{#if renaming}
				<form method="POST" action={act('folderRename')} class="inline" use:enhance={() => async ({ update }) => { await update(); renaming = false; }}>
					<input type="hidden" name="id" value={current.id} />
					<input name="name" type="text" value={current.name} aria-label={t.list.folderNamePh} required maxlength="60" />
					<button>{t.common.save ?? 'OK'}</button>
					<button type="button" class="secondary" onclick={() => (renaming = false)}>✕</button>
				</form>
			{:else}
				<strong>📁 {current.name}</strong>
				<button type="button" class="link" onclick={() => (renaming = true)}>{t.list.renameFolder}</button>
				<form method="POST" action="?/folderDelete" onsubmit={(e) => { if (!confirm(t.list.confirmDeleteFolder(current.name))) e.preventDefault(); }}>
					<input type="hidden" name="id" value={current.id} /><button class="link danger-link">{t.list.deleteFolder}</button>
				</form>
			{/if}
		</div>
	{/if}

	<form method="GET" action="/panel" class="search">
		{#if data.folder !== 'all'}<input type="hidden" name="f" value={data.folder} />{/if}
		<input name="q" type="search" value={data.query} placeholder={t.list.search} aria-label={t.list.search} maxlength="100" />
		<button class="secondary">{t.list.searchBtn}</button>
		{#if data.query}<a class="btn secondary" href={href({ q: '', p: 1 })}>{t.list.clearSearch}</a>{/if}
	</form>

	{#if data.quizzes.length === 0}
		<p class="muted">{t.list.noResults}</p>
	{:else}
		{#if data.query || data.pages > 1}<p class="muted count">{t.list.found(data.found)}</p>{/if}
		<ul class="list">
			{#each data.quizzes as q (q.id)}
				<li class="card">
					<div class="info">
						<a class="title" href="/panel/quizzes/{q.id}">{q.title}</a>
						<span class="muted">
							{t.list.questions(q.questionCount)}
							· {q.themeName ?? t.list.defaultTheme} · {t.list.changed(fmt(q.updatedAt))}
							{#if !q.mine}· {t.list.author(q.ownerName)}{/if}
						</span>
					</div>
					<div class="actions">
						<a class="btn" href="/panel/quizzes/{q.id}/host" aria-disabled={q.questionCount === 0} class:disabled={q.questionCount === 0}>{t.list.run}</a>
						<a class="btn secondary" href="/panel/quizzes/{q.id}">{t.list.edit}</a>
						<a class="btn secondary" href="/panel/quizzes/{q.id}/reports">{t.list.reports}</a>
						{#if q.canEdit}<form method="POST" action="?/duplicate"><input type="hidden" name="id" value={q.id} /><button class="secondary">{t.list.duplicate}</button></form>{/if}
						{#if data.folders.length}
							<form method="POST" action={act('move')} use:enhance class="move">
								<input type="hidden" name="id" value={q.id} />
								<select name="folder" aria-label="{t.list.moveTo}: {q.title}" value={q.folderId ?? ''} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
									<option value="">📂 {t.list.noFolder}</option>
									{#each data.folders as f (f.id)}<option value={f.id}>📁 {f.name}</option>{/each}
								</select>
							</form>
						{/if}
						{#if q.mine || data.user.role === 'admin'}
							<form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(t.list.confirmDelete(q.title))) e.preventDefault(); }}>
								<input type="hidden" name="id" value={q.id} /><button class="link danger-link">{t.common.remove}</button>
							</form>
						{/if}
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
	.head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
	h1 { margin: 0; }
	.new { display: flex; gap: 0.5rem; flex: 1 1 20rem; max-width: 30rem; min-width: 0; }
	.new input { flex: 1; min-width: 0; }
	@media (max-width: 520px) { .new { flex-basis: 100%; max-width: none; } }
	.folders { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 0.9rem; }
	.chip { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.85rem; border-radius: 999px; background: #ecedf2; color: var(--text); text-decoration: none; font-size: 0.92rem; font-weight: 600; border: 2px solid transparent; }
	.chip span { background: rgba(0, 0, 0, 0.08); border-radius: 999px; padding: 0 0.45rem; font-size: 0.8rem; }
	.chip:hover { background: #e0e2ea; filter: none; }
	.chip.on { background: #fff6d6; border-color: #f5b700; }
	.chip.add { background: none; border: 2px dashed #c9ccd8; color: #555; }
	.chip.folder { max-width: 16rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.inline { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
	.inline input { width: 14rem; max-width: 60vw; }
	.inline button { padding: 0.45rem 0.8rem; font-size: 0.9rem; }
	.folder-bar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
	.search { display: flex; gap: 0.5rem; margin-bottom: 1rem; max-width: 30rem; flex-wrap: wrap; }
	.search input { flex: 1; min-width: 10rem; }
	.search button, .search .btn { padding: 0.5rem 0.9rem; font-size: 0.9rem; }
	.count { margin: 0 0 0.5rem; }
	.list { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
	.list li { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 1rem 1.25rem; }
	.list li { border-left: 4px solid #f5b700; transition: box-shadow 0.15s, transform 0.15s; }
	.list li:hover { box-shadow: 0 2px 4px rgba(20, 22, 40, 0.06), 0 10px 24px rgba(20, 22, 40, 0.09); transform: translateY(-1px); }
	.info { flex: 1; min-width: 14rem; display: flex; flex-direction: column; gap: 0.2rem; }
	.title { font-weight: 700; font-size: 1.1rem; color: var(--text); text-decoration: none; }
	.title:hover { text-decoration: underline; }
	.actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
	.actions .btn, .actions button { padding: 0.5rem 0.9rem; font-size: 0.9rem; }
	.move select { padding: 0.45rem 0.5rem; font-size: 0.88rem; max-width: 12rem; }
	.btn.secondary { background: #e7e8ee; color: var(--text); }
	.btn.disabled { opacity: 0.4; pointer-events: none; }
	.danger-link { color: var(--danger) !important; }
	.empty { text-align: center; padding: 2.5rem; }
	.pager { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1.25rem; flex-wrap: wrap; }
</style>
