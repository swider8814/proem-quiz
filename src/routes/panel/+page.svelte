<script lang="ts">
	let { data, form } = $props();
	let query = $state('');
	const shown = $derived(
		data.quizzes.filter((q) => q.title.toLowerCase().includes(query.toLowerCase().trim()))
	);
	const fmt = (d: Date | string) => new Date(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<svelte:head><title>Quizy · Proem Quiz</title></svelte:head>

<div class="head">
	<h1>Quizy</h1>
	<form method="POST" action="?/create" class="new">
		<input name="title" type="text" placeholder="Tytuł nowego quizu" aria-label="Tytuł nowego quizu" required maxlength="120" />
		<button>Utwórz quiz</button>
	</form>
</div>

{#if form?.error}<p class="error">{form.error}</p>{/if}
{#if form?.message}<p class="success">{form.message}</p>{/if}

{#if data.quizzes.length === 0}
	<div class="card empty">
		<p><strong>Nie masz jeszcze żadnego quizu.</strong></p>
		<p class="muted">Wpisz tytuł powyżej i kliknij „Utwórz quiz”.</p>
	</div>
{:else}
	{#if data.quizzes.length > 6}
		<input class="search" type="search" bind:value={query} placeholder="Szukaj quizu…" aria-label="Szukaj quizu" />
	{/if}
	<ul class="list">
		{#each shown as q (q.id)}
			<li class="card">
				<div class="info">
					<a class="title" href="/panel/quizzes/{q.id}">{q.title}</a>
					<span class="muted">
						{q.questionCount} {q.questionCount === 1 ? 'pytanie' : q.questionCount >= 2 && q.questionCount <= 4 ? 'pytania' : 'pytań'}
						· {q.themeName ?? 'motyw domyślny'} · zmieniono {fmt(q.updatedAt)}
						{#if !q.mine}· autor: {q.ownerName}{/if}
					</span>
				</div>
				<div class="actions">
					<a class="btn" href="/panel/quizzes/{q.id}/host" aria-disabled={q.questionCount === 0} class:disabled={q.questionCount === 0}>Uruchom</a>
					<a class="btn secondary" href="/panel/quizzes/{q.id}">Edytuj</a>
					{#if q.canEdit}<form method="POST" action="?/duplicate"><input type="hidden" name="id" value={q.id} /><button class="secondary">Duplikuj</button></form>{/if}
					{#if q.mine || data.user.role === 'admin'}
						<form method="POST" action="?/delete" onsubmit={(e) => { if (!confirm(`Usunąć quiz „${q.title}”? Tego nie da się cofnąć.`)) e.preventDefault(); }}>
							<input type="hidden" name="id" value={q.id} /><button class="link danger-link">Usuń</button>
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
	.new { display: flex; gap: 0.5rem; flex: 1; max-width: 30rem; }
	.new input { flex: 1; }
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
