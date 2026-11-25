<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	const LABEL = { host: 'może prowadzić grę', edit: 'może edytować i prowadzić' } as const;
</script>

<svelte:head><title>Udostępnianie – {data.quiz.title}</title></svelte:head>

<p><a href="/panel/quizzes/{data.quiz.id}">← Wróć do quizu</a></p>
<h1>Udostępnij „{data.quiz.title}”</h1>
<p class="muted">Właściciel: {data.quiz.ownerName}. Osoby z dostępem widzą ten quiz na swojej liście.
	„Prowadzenie” pozwala uruchomić grę bez zmieniania pytań.</p>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

<section class="card">
	<h2>Mają dostęp</h2>
	{#if data.shares.length === 0}
		<p class="muted">Na razie tylko właściciel.</p>
	{:else}
		<ul class="rows">
			{#each data.shares as s (s.userId)}
				<li>
					<div class="who"><strong>{s.name}</strong> <span class="muted">{s.email}</span></div>
					<form method="POST" action="?/set" use:enhance class="row">
						<input type="hidden" name="userId" value={s.userId} />
						<select name="permission" aria-label="Uprawnienia: {s.name}" value={s.permission}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}>
							<option value="host">{LABEL.host}</option>
							<option value="edit">{LABEL.edit}</option>
						</select>
						<button type="submit" name="remove" value="1" class="secondary">Usuń dostęp</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="card">
	<h2>Dodaj osobę</h2>
	{#if data.candidates.length === 0}
		<p class="muted">Wszystkie aktywne konta mają już dostęp. Nowe osoby zaprasza administrator w zakładce Użytkownicy.</p>
	{:else}
		<form method="POST" action="?/set" use:enhance class="row add">
			<label>Osoba
				<select name="userId" required>
					{#each data.candidates as u (u.id)}<option value={u.id}>{u.name} ({u.email})</option>{/each}
				</select>
			</label>
			<label>Uprawnienia
				<select name="permission">
					<option value="host">{LABEL.host}</option>
					<option value="edit">{LABEL.edit}</option>
				</select>
			</label>
			<button type="submit">Udostępnij</button>
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
