<script lang="ts">
	import { enhance } from '$app/forms';
	import { send } from '#lib/forms.js';
	import Icon from '#lib/Icon.svelte';
	import BackLink from '#lib/BackLink.svelte';
	import { panelDict } from '#lib/i18n/panel.js';
	let { data } = $props();
	const t = $derived(panelDict(data.lang));
	const R = $derived(t.reports);
	const d = $derived(data.report.data);
	const fmt = (x: Date) => new Date(x).toLocaleString(data.lang === 'en' ? 'en-GB' : 'pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
	const minutes = $derived(Math.max(1, Math.round((+new Date(data.report.endedAt) - +new Date(data.report.startedAt)) / 60000)));
	const graded = (type: string) => type !== 'poll' && type !== 'slide';
	const pct = (q: { answered: number; correct: number }) => (q.answered ? Math.round((q.correct / q.answered) * 100) : 0);
	// Najtrudniejsze: najniższy odsetek poprawnych (tylko pytania z oceną i z odpowiedziami).
	const hardest = $derived(
		d.questions
			.map((q, i) => ({ ...q, i }))
			.filter((q) => graded(q.type) && q.answered > 0)
			.sort((a, b) => pct(a) - pct(b))
			.slice(0, 3)
	);
</script>

<svelte:head><title>{R.title} – {data.report.title}</title></svelte:head>

<BackLink href="/panel/quizzes/{data.quizId}/reports" label={R.backToList} />
<h1>{data.report.title}</h1>
<p class="muted">{fmt(data.report.endedAt)} · {R.players(d.players.length)} · {R.duration}: {R.minutes(minutes)}</p>

<div class="actions">
	<a class="btn" href="/panel/quizzes/{data.quizId}/reports/{data.report.id}/csv" download><Icon name="download" weight={2} />{R.download}</a>
	{#if data.canDelete}
		<form method="POST" action="?/delete" use:enhance={send({ confirm: () => R.removeConfirm })}>
			<button class="danger"><Icon name="trash" weight={2} />{R.remove}</button>
		</form>
	{/if}
</div>

{#if hardest.length}
	<section class="card">
		<h2>{R.hardest}</h2>
		<ol class="hard">
			{#each hardest as q}
				<li><span class="bar" style:--p="{pct(q)}%"></span><strong>{pct(q)}%</strong> {q.i + 1}. {q.prompt}</li>
			{/each}
		</ol>
	</section>
{/if}

<section class="card">
	<h2>{R.results}</h2>
	<div class="scroll">
		<table>
			<thead>
				<tr>
					<th>{R.place}</th><th>{d.teamMode ? R.team : R.player}</th><th class="num">{R.score}</th>
				</tr>
			</thead>
			<tbody>
				{#each d.players as p}
					<tr>
						<td>{p.rank}.</td>
						<td>{p.nick}</td>
						<td class="num"><strong>{p.score}</strong></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<section class="card">
	<h2>{R.questionsHeading}</h2>
	<div class="scroll">
		<table>
			<thead>
				<tr><th>{R.question}</th><th>{R.type}</th><th class="num">{R.answeredCount}</th><th class="num">{R.correctPct}</th><th class="num">{R.avgTime}</th></tr>
			</thead>
			<tbody>
				{#each d.questions as q, i}
					<tr>
						<td>{i + 1}. {q.prompt}</td>
						<td>{t.editor.types[q.type as keyof typeof t.editor.types] ?? q.type}</td>
						<td class="num">{q.answered}</td>
						<td class="num">{graded(q.type) && q.answered ? `${pct(q)}%` : '–'}</td>
						<td class="num">{q.avgMs == null ? '–' : (q.avgMs / 1000).toFixed(1)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<style>
	.actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 1rem 0; }
	.scroll { overflow-x: auto; }
	table { min-width: 100%; }
	.num { text-align: right; font-variant-numeric: tabular-nums; }
	.hard { margin: 0; padding-left: 1.2rem; }
	.hard li { margin: 0.4rem 0; position: relative; }
	.bar { display: inline-block; width: 5rem; height: 0.6rem; margin-right: 0.5rem; border-radius: 1rem; background: linear-gradient(90deg, #2ec27e var(--p), #f0efec var(--p)); vertical-align: middle; }
</style>
