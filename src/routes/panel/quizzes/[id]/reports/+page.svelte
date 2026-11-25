<script lang="ts">
	import { panelDict } from '#lib/i18n/panel.js';
	let { data } = $props();
	const R = $derived(panelDict(data.lang).reports);
	const fmt = (d: Date) => new Date(d).toLocaleString(data.lang === 'en' ? 'en-GB' : 'pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head><title>{R.title} – {data.quiz.title}</title></svelte:head>

<p><a href="/panel/quizzes/{data.quiz.id}">{R.backToQuiz}</a></p>
<h1>{R.heading(data.quiz.title)}</h1>
<p class="muted">{R.retention}</p>

<section class="card">
	{#if data.reports.length === 0}
		<p class="muted">{R.none}</p>
	{:else}
		<ul class="rows">
			{#each data.reports as r (r.id)}
				<li>
					<a href="/panel/quizzes/{data.quiz.id}/reports/{r.id}"><strong>{fmt(r.endedAt)}</strong></a>
					<span class="muted">{R.players(r.playerCount)} · {R.minutes(Math.max(1, Math.round((+new Date(r.endedAt) - +new Date(r.startedAt)) / 60000)))}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.rows { list-style: none; margin: 0; padding: 0; }
	.rows li { display: flex; flex-wrap: wrap; gap: 0.3rem 1rem; align-items: baseline; padding: 0.6rem 0; border-bottom: 1px solid var(--line); }
	.rows li:last-child { border-bottom: 0; }
</style>
