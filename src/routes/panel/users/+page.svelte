<script lang="ts">
	import { panelDict } from '#lib/i18n/panel.js';
	let { data, form } = $props();
	const t = $derived(panelDict(data.lang));
	const U = $derived(t.users);
	let copied = $state(false);
	// Telefon: formularz zaproszenia chowa się pod przyciskiem (otwarty od razu, gdy wrócił z błędem).
	let inviteOpen = $state(false);
	$effect(() => { if (form?.inviteError) inviteOpen = true; });
	// Pola zaproszenia jako stan: opis wybranej roli zmienia się na żywo (w opcjach krótkie nazwy,
	// żeby się nie ucinały), a przerysowanie nie czyści wpisanego imienia i e-maila.
	// Po błędzie wracają wartości z serwera; po udanym zaproszeniu formularz jest pusty.
	const inviteDefaults = () => ({
		name: form?.name ?? '',
		email: form?.email ?? '',
		role: form?.role === 'admin' ? 'admin' : 'author',
		locale: (form?.locale ?? data.lang) === 'en' ? 'en' : 'pl'
	});
	const init = inviteDefaults(); // od razu, żeby też HTML z serwera miał właściwe wartości
	let inviteName = $state(init.name);
	let inviteEmail = $state(init.email);
	let inviteRole = $state(init.role);
	let inviteLocale = $state(init.locale);
	$effect.pre(() => {
		const d = inviteDefaults();
		inviteName = d.name;
		inviteEmail = d.email;
		inviteRole = d.role;
		inviteLocale = d.locale;
	});

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

<button type="button" class="invite-toggle" aria-expanded={inviteOpen} aria-controls="invite-box" onclick={() => (inviteOpen = !inviteOpen)}>+ {U.invite}</button>
<div class="card invite-box" id="invite-box" class:open={inviteOpen}>
	<h2>{U.invite}</h2>
	{#if form?.inviteError}<p class="error">{form.inviteError}</p>{/if}
	<form method="POST" action="?/invite" class="invite">
		<div class="f-name">
			<label for="name">{U.name}</label>
			<input id="name" name="name" type="text" required bind:value={inviteName} />
		</div>
		<div class="f-email">
			<label for="email">{t.common.email}</label>
			<input id="email" name="email" type="email" required bind:value={inviteEmail} />
		</div>
		<div class="f-role">
			<label for="role">{U.role}</label>
			<select id="role" name="role" bind:value={inviteRole} aria-describedby="role-hint">
				<option value="author">{U.author}</option>
				<option value="admin">{U.admin}</option>
			</select>
		</div>
		<div class="f-locale">
			<label for="locale">{U.language}</label>
			<select id="locale" name="locale" bind:value={inviteLocale}>
				<option value="pl">Polski</option>
				<option value="en">English</option>
			</select>
		</div>
		<button class="f-submit">{U.createInvite}</button>
		<p class="hint" id="role-hint" aria-live="polite">{inviteRole === 'admin' ? U.adminHint : U.authorHint}</p>
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
					<td class="person"><strong>{u.name}</strong><br /><span class="muted">{u.email}</span></td>
					<td data-label={U.role}>
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
					<td data-label={t.common.language}>
						<form method="POST" action="?/locale">
							<input type="hidden" name="id" value={u.id} />
							<select name="locale" onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label={U.language}>
								<option value="pl" selected={u.locale === 'pl'}>PL</option>
								<option value="en" selected={u.locale !== 'pl'}>EN</option>
							</select>
						</form>
					</td>
					<td data-label={U.status}>
						{#if u.disabled}<span class="tag off">{U.blocked}</span>
						{:else if !u.activated}<span class="tag warn">{U.pending}</span>
						{:else}<span class="tag ok">{U.active}</span>{/if}
					</td>
					<td data-label="2FA">
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
	h2 { margin-top: 0; }
	.card { margin-bottom: 1.5rem; }
	/* Dwa rzędy: imię + e-mail, potem rola (z opisem), język i przycisk. */
	.invite { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto; grid-template-areas: 'name email email' 'role locale submit' 'hint hint hint'; gap: 1rem; align-items: end; }
	.invite > * { min-width: 0; }
	.f-name { grid-area: name; }
	.f-email { grid-area: email; }
	.f-role { grid-area: role; }
	.f-locale { grid-area: locale; }
	.f-submit { grid-area: submit; white-space: nowrap; }
	.invite .hint { grid-area: hint; margin-top: -0.6rem; }
	.invite :global(label) { margin-top: 0; }
	.hint { margin: 0; color: var(--muted); font-size: 0.85rem; line-height: 1.35; }
	.invite-toggle { display: none; }
	.list { overflow-x: auto; padding: 0.5rem 1rem; }
	tr.off td { opacity: 0.55; }
	td.actions { text-align: right; white-space: nowrap; }
	td.actions :global(form) { display: inline-block; margin-left: 0.4rem; }
	.actions button { min-height: 2.5rem; padding: 0.3rem 0.8rem; font-size: 0.9rem; }
	td select { width: auto; min-height: 2.5rem; padding: 0.3rem 0.5rem; }
	@media (max-width: 720px) {
		.invite { grid-template-columns: 1fr; grid-template-areas: 'name' 'email' 'role' 'hint' 'locale' 'submit'; gap: 1rem; }
		.f-submit { width: 100%; white-space: normal; }
		.invite-toggle { display: flex; width: 100%; margin-bottom: 1rem; }
		.invite-box { display: none; }
		.invite-box.open { display: block; }
		/* Tabela → karty: każda osoba to osobna karta z podpisanymi polami. */
		.list { padding: 0; background: none; border: 0; box-shadow: none; overflow: visible; }
		.list table, .list tbody { display: block; overflow: visible; }
		.list thead { display: none; }
		.list tr { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; padding: 1rem; margin-bottom: 0.75rem; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
		.list td { display: block; padding: 0; border: 0; min-width: 0; }
		.list td[data-label]::before { content: attr(data-label); display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.25rem; }
		.list td.person, .list td.actions { grid-column: 1 / -1; }
		.list td.person strong { font-size: 1.05rem; }
		.list td.actions { display: flex; gap: 0.5rem; white-space: normal; }
		.list td.actions :global(form) { margin: 0; }
		.list td.actions:empty { display: none; }
		.list td.actions :global(form) { flex: 1; }
		.list td.actions button { width: 100%; min-height: 2.75rem; }
		td select { width: 100%; min-height: 2.75rem; }
	}
</style>
