<script lang="ts">
	import Icon from '#lib/Icon.svelte';
	import { enhance } from '$app/forms';
	import { send } from '#lib/forms.js';
	import BackLink from '#lib/BackLink.svelte';
	import { panelDict } from '#lib/i18n/panel.js';
	import HelpTip from '#lib/help/HelpTip.svelte';
	let { data, form } = $props();
	const S = $derived(panelDict(data.lang).share);
</script>

<svelte:head><title>{S.title} – {data.quiz.title}</title></svelte:head>

<BackLink href="/panel/quizzes/{data.quiz.id}" label={S.backToQuiz} />
<h1>{S.heading(data.quiz.title)}</h1>
<p class="muted">{S.intro(data.quiz.ownerName)}</p>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

<section class="card">
	<h2>{S.haveAccess}</h2>
	{#if data.shares.length === 0}
		<p class="muted">{S.onlyOwner}</p>
	{:else}
		<ul class="rows">
			{#each data.shares as s (s.userId)}
				<li>
					<div class="who"><strong>{s.name}</strong> <span class="muted">{s.email}</span></div>
					<form method="POST" action="?/set" use:enhance={send({ reset: true, confirm: (b) => (b?.getAttribute('name') === 'remove' ? S.removeAccessConfirm(s.name) : null) })} class="row">
						<input type="hidden" name="userId" value={s.userId} />
						<select name="permission" aria-label={S.permissionFor(s.name)} value={s.permission}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}>
							<option value="host">{S.host}</option>
							<option value="edit">{S.edit}</option>
						</select>
						<button type="submit" name="remove" value="1" class="danger"><Icon name="trash" weight={2} />{S.removeAccess}</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="card">
	<h2>{S.add}</h2>
	{#if data.candidates.length === 0}
		<p class="muted">{S.allHaveAccess}</p>
	{:else}
		<form method="POST" action="?/set" use:enhance={send({ reset: true })} class="row add">
			<label>{S.person}
				<select name="userId" required>
					{#each data.candidates as u (u.id)}<option value={u.id}>{u.name} ({u.email})</option>{/each}
				</select>
			</label>
			<label>{S.permission}<HelpTip id="share" />
				<select name="permission">
					<option value="host">{S.host}</option>
					<option value="edit">{S.edit}</option>
				</select>
			</label>
			<button type="submit">{S.submit}</button>
		</form>
	{/if}
</section>

<style>
	.card { margin: 1rem 0; }
	.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
	.rows li { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: space-between; padding-bottom: 0.6rem; border-bottom: 1px solid var(--line); }
	.rows li:last-child { border-bottom: 0; padding-bottom: 0; }
	.who { min-width: 0; overflow-wrap: anywhere; }
	.row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; }
	.add label { flex: 1 1 14rem; }
	.add select { width: 100%; }
</style>
