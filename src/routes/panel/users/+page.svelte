<script lang="ts">
	let { data, form } = $props();
	let copied = $state(false);

	async function copy(text: string) {
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:head><title>Użytkownicy · Proem Quiz</title></svelte:head>

<h1>Użytkownicy</h1>

{#if form?.link}
	<div class="success">
		<p><strong>Link zaproszenia dla: {form.linkFor}</strong> (ważny 7 dni, działa raz)</p>
		<code class="copy">{form.link}</code>
		<p>
			<button type="button" class="secondary" onclick={() => copy(form.link)}>{copied ? 'Skopiowano ✓' : 'Kopiuj link'}</button>
			<span class="muted">Wyślij go tej osobie e-mailem lub komunikatorem.</span>
		</p>
	</div>
{/if}
{#if form?.message}<p class="success">{form.message}</p>{/if}
{#if form?.actionError}<p class="error">{form.actionError}</p>{/if}

<div class="card">
	<h2>Zaproś osobę</h2>
	{#if form?.inviteError}<p class="error">{form.inviteError}</p>{/if}
	<form method="POST" action="?/invite" class="invite">
		<div>
			<label for="name">Imię i nazwisko</label>
			<input id="name" name="name" type="text" required value={form?.name ?? ''} />
		</div>
		<div>
			<label for="email">E-mail</label>
			<input id="email" name="email" type="email" required value={form?.email ?? ''} />
		</div>
		<div>
			<label for="role">Rola</label>
			<select id="role" name="role">
				<option value="author" selected={form?.role !== 'admin'}>Autor (tworzy i prowadzi quizy)</option>
				<option value="admin" selected={form?.role === 'admin'}>Administrator</option>
			</select>
		</div>
		<button>Utwórz zaproszenie</button>
	</form>
</div>

<div class="card list">
	<table>
		<thead>
			<tr><th>Osoba</th><th>Rola</th><th>Status</th><th>2FA</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.users as u (u.id)}
				<tr class:off={u.disabled}>
					<td><strong>{u.name}</strong><br /><span class="muted">{u.email}</span></td>
					<td>
						{#if u.id === data.user.id}
							{u.role === 'admin' ? 'Administrator' : 'Autor'} <span class="muted">(Ty)</span>
						{:else}
							<form method="POST" action="?/role">
								<input type="hidden" name="id" value={u.id} />
								<select name="role" onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Rola">
									<option value="author" selected={u.role === 'author'}>Autor</option>
									<option value="admin" selected={u.role === 'admin'}>Administrator</option>
								</select>
							</form>
						{/if}
					</td>
					<td>
						{#if u.disabled}<span class="tag off">Zablokowane</span>
						{:else if !u.activated}<span class="tag warn">Czeka na aktywację</span>
						{:else}<span class="tag ok">Aktywne</span>{/if}
					</td>
					<td>
						{#if u.totpEnabled}<span class="tag ok">Tak</span>
						{:else if u.role === 'admin'}<span class="tag warn">Wymagane</span>
						{:else}<span class="tag off">Nie</span>{/if}
					</td>
					<td class="actions">
						{#if u.id !== data.user.id}
							{#if !u.activated}
								<form method="POST" action="?/reinvite">
									<input type="hidden" name="id" value={u.id} /><button class="secondary">Nowy link</button>
								</form>
							{/if}
							{#if u.totpEnabled}
								<form method="POST" action="?/reset2fa" onsubmit={(e) => { if (!confirm(`Zresetować 2FA dla: ${u.name}?`)) e.preventDefault(); }}>
									<input type="hidden" name="id" value={u.id} /><button class="secondary">Reset 2FA</button>
								</form>
							{/if}
							<form method="POST" action="?/toggle">
								<input type="hidden" name="id" value={u.id} />
								<button class={u.disabled ? 'secondary' : 'danger'}>{u.disabled ? 'Odblokuj' : 'Zablokuj'}</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	h2 { font-size: 1.1rem; margin-top: 0; }
	.card { margin-bottom: 1.5rem; }
	.invite { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 0 1rem; align-items: end; }
	@media (max-width: 720px) { .invite { grid-template-columns: 1fr; } .invite button { margin-top: 1rem; } }
	.list { overflow-x: auto; }
	tr.off td { opacity: 0.55; }
	.actions { display: flex; gap: 0.4rem; justify-content: flex-end; flex-wrap: wrap; }
	.actions button { padding: 0.4rem 0.7rem; font-size: 0.85rem; }
	td select { width: auto; padding: 0.35rem; }
</style>
