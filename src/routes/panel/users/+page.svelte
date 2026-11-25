<script lang="ts">
	import { panelDict } from '#lib/i18n/panel.js';
	let { data, form } = $props();
	const t = $derived(panelDict(data.lang));
	const U = $derived(t.users);
	let copied = $state(false);

	async function copy(text: string) {
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:head><title>{U.title} · Proem Quiz</title></svelte:head>

<h1>{U.title}</h1>

{#if form?.link}
	<div class="success">
		<p><strong>{U.linkFor(form.linkFor)}</strong> {U.linkValid}</p>
		{#if form.mailed}<p>{U.mailed}</p>{:else if data.mail}<p class="error">{U.mailFailed}</p>{/if}
		<code class="copy">{form.link}</code>
		<p>
			<button type="button" class="secondary" onclick={() => copy(form.link)}>{copied ? t.common.copied : t.common.copy}</button>
			<span class="muted">{U.sendIt}</span>
		</p>
	</div>
{/if}
{#if form?.message}<p class="success">{form.message}</p>{/if}
{#if form?.actionError}<p class="error">{form.actionError}</p>{/if}

<div class="card">
	<h2>{U.invite}</h2>
	{#if form?.inviteError}<p class="error">{form.inviteError}</p>{/if}
	<form method="POST" action="?/invite" class="invite">
		<div>
			<label for="name">{U.name}</label>
			<input id="name" name="name" type="text" required value={form?.name ?? ''} />
		</div>
		<div>
			<label for="email">{t.common.email}</label>
			<input id="email" name="email" type="email" required value={form?.email ?? ''} />
		</div>
		<div>
			<label for="role">{U.role}</label>
			<select id="role" name="role">
				<option value="author" selected={form?.role !== 'admin'}>{U.authorOption}</option>
				<option value="admin" selected={form?.role === 'admin'}>{U.admin}</option>
			</select>
		</div>
		<div>
			<label for="locale">{U.language}</label>
			<select id="locale" name="locale">
				<option value="pl" selected={(form?.locale ?? data.lang) === 'pl'}>Polski</option>
				<option value="en" selected={(form?.locale ?? data.lang) === 'en'}>English</option>
			</select>
		</div>
		<button>{U.createInvite}</button>
	</form>
</div>

<div class="card list">
	<table>
		<thead>
			<tr><th>{U.person}</th><th>{U.role}</th><th>{t.common.language}</th><th>{U.status}</th><th>2FA</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.users as u (u.id)}
				<tr class:off={u.disabled}>
					<td><strong>{u.name}</strong><br /><span class="muted">{u.email}</span></td>
					<td>
						{#if u.id === data.user.id}
							{u.role === 'admin' ? U.admin : U.author} <span class="muted">{U.you}</span>
						{:else}
							<form method="POST" action="?/role">
								<input type="hidden" name="id" value={u.id} />
								<select name="role" onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label={U.role}>
									<option value="author" selected={u.role === 'author'}>{U.author}</option>
									<option value="admin" selected={u.role === 'admin'}>{U.admin}</option>
								</select>
							</form>
						{/if}
					</td>
					<td>
						<form method="POST" action="?/locale">
							<input type="hidden" name="id" value={u.id} />
							<select name="locale" onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label={U.language}>
								<option value="pl" selected={u.locale === 'pl'}>PL</option>
								<option value="en" selected={u.locale !== 'pl'}>EN</option>
							</select>
						</form>
					</td>
					<td>
						{#if u.disabled}<span class="tag off">{U.blocked}</span>
						{:else if !u.activated}<span class="tag warn">{U.pending}</span>
						{:else}<span class="tag ok">{U.active}</span>{/if}
					</td>
					<td>
						{#if u.totpEnabled}<span class="tag ok">{t.common.yes}</span>
						{:else if u.role === 'admin'}<span class="tag warn">{U.required}</span>
						{:else}<span class="tag off">{t.common.no}</span>{/if}
					</td>
					<td class="actions">
						{#if u.id !== data.user.id}
							{#if !u.activated}
								<form method="POST" action="?/reinvite">
									<input type="hidden" name="id" value={u.id} /><button class="secondary">{U.newLink}</button>
								</form>
							{/if}
							{#if u.totpEnabled}
								<form method="POST" action="?/reset2fa" onsubmit={(e) => { if (!confirm(U.reset2faConfirm(u.name))) e.preventDefault(); }}>
									<input type="hidden" name="id" value={u.id} /><button class="secondary">{U.reset2fa}</button>
								</form>
							{/if}
							<form method="POST" action="?/toggle">
								<input type="hidden" name="id" value={u.id} />
								<button class={u.disabled ? 'secondary' : 'danger'}>{u.disabled ? U.unblock : U.block}</button>
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
	.invite { display: grid; grid-template-columns: 1fr 1fr 1fr 0.6fr auto; gap: 0 1rem; align-items: end; }
	@media (max-width: 720px) { .invite { grid-template-columns: 1fr; } .invite button { margin-top: 1rem; } }
	.list { overflow-x: auto; }
	tr.off td { opacity: 0.55; }
	.actions { display: flex; gap: 0.4rem; justify-content: flex-end; flex-wrap: wrap; }
	.actions button { padding: 0.4rem 0.7rem; font-size: 0.85rem; }
	td select { width: auto; padding: 0.35rem; }
</style>
