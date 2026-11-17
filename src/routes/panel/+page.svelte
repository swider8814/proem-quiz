<script lang="ts">
	import { panelDict } from '#lib/i18n/panel.js';
	let { data, form } = $props();
	const t = $derived(panelDict(data.lang));
	let query = $state('');
	const shown = $derived(
		data.quizzes.filter((q) => q.title.toLowerCase().includes(query.toLowerCase().trim()))
	);
	const fmt = (d: Date | string) => new Date(d).toLocaleDateString(t.list.dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<svelte:head><title>{t.list.title} · Proem Quiz</title></svelte:head>

<div class="head">
	<h1>{t.list.title}</h1>
	<form method="POST" action="?/create" class="new">
		<input name="title" type="text" placeholder={t.list.newTitle} aria-label={t.list.newTitle} required maxlength="120" />
		<button>{t.list.create}</button>
	</form>
</div>

{#if form?.error}<p class="error">{form.error}</p>{/if}
{#if form?.message}<p class="success">{form.message}</p>{/if}

{#if data.quizzes.length === 0}
	<div class="card empty">
		<p><strong>{t.list.empty}</strong></p>
		<p class="muted">{t.list.emptyHint}</p>
	</div>
{:else}
	{#if data.quizzes.length > 6}
		<input class="search" type="search" bind:value={query} placeholder={t.list.search} aria-label={t.list.search} />
	{/if}
	<ul class="list">
		{#each shown as q (q.id)}
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
					{#if q.mine || data.user.role === 'admin'}
						<form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(t.list.confirmDelete(q.title))) e.preventDefault(); }}>
							<input type="hidden" name="id" value={q.id} /><button class="link danger-link">{t.common.remove}</button>
						</form>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
	h1 { margin: 0; }
	.new { display: flex; gap: 0.5rem; flex: 1 1 20rem; max-width: 30rem; min-width: 0; }
	.new input { flex: 1; min-width: 0; }
	@media (max-width: 520px) { .new { flex-basis: 100%; max-width: none; } }
	.search { margin-bottom: 1rem; max-width: 20rem; }
	.list { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
	.list li { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 1rem 1.25rem; }
	.info { flex: 1; min-width: 14rem; display: flex; flex-direction: column; gap: 0.2rem; }
	.title { font-weight: 700; font-size: 1.1rem; color: var(--text); text-decoration: none; }
	.title:hover { text-decoration: underline; }
	.actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
	.actions .btn, .actions button { padding: 0.5rem 0.9rem; font-size: 0.9rem; }
	.btn.secondary { background: #e7e8ee; color: var(--text); }
	.btn.disabled { opacity: 0.4; pointer-events: none; }
	.danger-link { color: var(--danger) !important; }
	.empty { text-align: center; padding: 2.5rem; }
</style>
