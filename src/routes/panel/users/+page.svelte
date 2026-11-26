<script lang="ts">
	import { enhance } from '$app/forms';
	import { send } from '#lib/forms.js';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import Icon from '#lib/Icon.svelte';
	import RowMenu from '#lib/RowMenu.svelte';
	import { PANEL_LANGS, isPanelLang, panelDict } from '#lib/i18n/panel.js';
	let { data, form } = $props();
	const t = $derived(panelDict(data.lang));
	const U = $derived(t.users);
	let copied = $state(false);
	// Wiersz, w którym edytujemy imię i nazwisko (formularz w miejscu nazwy).
	let renaming = $state<string | null>(null);
	$effect(() => { if (form && 'renameId' in form && form.renameId) renaming = String(form.renameId); });
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
		locale: isPanelLang(form?.locale) ? form.locale : isPanelLang(data.lang) ? data.lang : 'pl'
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

	// ── Filtry listy: w przeglądarce, na wczytanej liście; stan w adresie (?q=&status=&role=&lang=),
	// żeby odświeżenie, „wstecz” i akcje na liście (POST) pokazywały ten sam widok. ──
	type Status = 'all' | 'active' | 'pending' | 'blocked' | 'no2fa';
	const STATUSES: Status[] = ['all', 'active', 'pending', 'blocked', 'no2fa'];
	const pick = <T extends string>(v: string | null, ok: readonly T[], def: T): T => (ok.includes(v as T) ? (v as T) : def);
	const sp = page.url.searchParams;
	let q = $state((sp.get('q') ?? '').slice(0, 100));
	let status = $state(pick(sp.get('status'), STATUSES, 'all'));
	let role = $state(pick(sp.get('role'), ['all', 'author', 'admin'] as const, 'all'));
	let lang = $state(pick(sp.get('lang'), ['all', 'pl', 'en', 'uk'] as const, 'all'));

	const filterQuery = $derived.by(() => {
		const p = new URLSearchParams();
		if (q.trim()) p.set('q', q.trim());
		if (status !== 'all') p.set('status', status);
		if (role !== 'all') p.set('role', role);
		if (lang !== 'all') p.set('lang', lang);
		return p.toString();
	});
	const filtered = $derived(filterQuery !== '');
	// Akcje zachowują filtry: po wysłaniu formularza strona wraca z tym samym widokiem.
	const act = (name: string) => `?/${name}${filterQuery ? `&${filterQuery}` : ''}`;
	function syncUrl() {
		const url = new URL(page.url.href);
		url.search = filterQuery;
		try { replaceState(url, {}); } catch { /* przed hydratacją – adres zaktualizuje się przy kolejnej zmianie */ }
	}
	// setTimeout: przy pierwszym uruchomieniu router SvelteKit może jeszcze nie być gotowy.
	$effect(() => { void filterQuery; const id = setTimeout(syncUrl, 0); return () => clearTimeout(id); });
	function clearFilters() { q = ''; status = 'all'; role = 'all'; lang = 'all'; }

	// Najpierw małe litery: NFD nie rozkłada „Ł”, więc zamiana na „l” musi objąć też wielkie „Ł”.
	const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
	type Row = (typeof data.users)[number];
	const statusOf = (u: Row): Exclude<Status, 'all' | 'no2fa'> => (u.disabled ? 'blocked' : !u.activated ? 'pending' : 'active');
	const is = (u: Row, s: Status) => s === 'all' || (s === 'no2fa' ? u.role === 'admin' && !u.totpEnabled && !u.disabled : statusOf(u) === s);
	// Kolejność: najpierw to, co wymaga działania (czekające), potem aktywne, na końcu zablokowane.
	const ORDER = { pending: 0, active: 1, blocked: 2 } as const;
	const sorted = $derived([...data.users].sort((a, b) => ORDER[statusOf(a)] - ORDER[statusOf(b)] || a.name.localeCompare(b.name, data.lang)));
	// Liczniki przy statusach uwzględniają pozostałe filtry (szukanie, rolę, język).
	const base = $derived.by(() => {
		const needle = fold(q.trim());
		return sorted.filter((u) => (role === 'all' || u.role === role) && (lang === 'all' || u.locale === lang) && (!needle || fold(`${u.name} ${u.email}`).includes(needle)));
	});
	const counts = $derived(Object.fromEntries(STATUSES.map((s) => [s, base.filter((u) => is(u, s)).length])) as Record<Status, number>);
	const shown = $derived(base.filter((u) => is(u, status)));
	const statusLabel = (s: Status) => ({ all: U.fAll, active: U.fActive, pending: U.fPending, blocked: U.fBlocked, no2fa: U.fNo2fa })[s];

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

<button type="button" class="invite-toggle" aria-expanded={inviteOpen} aria-controls="invite-box" onclick={() => (inviteOpen = !inviteOpen)}><Icon name="plus" weight={2} />{U.invite}</button>
<div class="card invite-box" id="invite-box" class:open={inviteOpen}>
	<h2>{U.invite}</h2>
	{#if form?.inviteError}<p class="error">{form.inviteError}</p>{/if}
	<form method="POST" action={act('invite')} class="invite" use:enhance={send()}>
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
				{#each PANEL_LANGS as l (l)}<option value={l}>{panelDict(l).langName}</option>{/each}
			</select>
		</div>
		<button class="f-submit">{U.createInvite}</button>
		<p class="hint" id="role-hint" aria-live="polite">{inviteRole === 'admin' ? U.adminHint : U.authorHint}</p>
	</form>
</div>

<div class="filters" role="search">
	<div class="frow">
		<input class="q" type="search" bind:value={q} placeholder={U.search} aria-label={U.search} maxlength="100" />
		<select bind:value={role} aria-label={U.role}>
			<option value="all">{U.allRoles}</option>
			<option value="author">{U.author}</option>
			<option value="admin">{U.admin}</option>
		</select>
		<select bind:value={lang} aria-label={U.language}>
			<option value="all">{U.allLangs}</option>
			{#each PANEL_LANGS as l (l)}<option value={l}>{panelDict(l).langName}</option>{/each}
		</select>
	</div>
	<div class="chips" role="group" aria-label={U.filterStatus}>
		{#each STATUSES as s (s)}
			{#if s !== 'no2fa' || counts.no2fa > 0 || status === 'no2fa'}
				<button type="button" class="chip" class:on={status === s} class:warn={s === 'no2fa'} aria-pressed={status === s} onclick={() => (status = s)}>
					{statusLabel(s)} <span>{counts[s]}</span>
				</button>
			{/if}
		{/each}
	</div>
	<p class="count muted" aria-live="polite">
		{U.shown(shown.length, data.users.length)}
		{#if filtered}<button type="button" class="link" onclick={clearFilters}>{U.clearFilters}</button>{/if}
	</p>
</div>

<div class="card list">
	{#if shown.length === 0}
		<div class="empty">
			<p>{U.noMatch}</p>
			<button type="button" class="secondary" onclick={clearFilters}>{U.clearFilters}</button>
		</div>
	{:else}
	<table>
		<colgroup><col class="c-person" /><col class="c-role" /><col class="c-lang" /><col class="c-status" /><col class="c-actions" /></colgroup>
		<thead>
			<tr><th>{U.person}</th><th>{U.role}</th><th>{t.common.language}</th><th>{U.status}</th><th><span class="sr">{U.actions}</span></th></tr>
		</thead>
		<tbody>
			{#each shown as u (u.id)}
				<tr class:off={u.disabled}>
					<td class="person">
						{#if renaming === u.id}
							<form method="POST" action="?/rename" class="rename" use:enhance={send({ after: (r) => { if (r.type === 'success') renaming = null; } })}>
								<input type="hidden" name="id" value={u.id} />
								<input name="name" type="text" value={u.name} aria-label={U.name} required minlength="2" maxlength="80" autocomplete="off" autofocus />
								<button>{t.common.save}</button>
								<button type="button" class="secondary" onclick={() => (renaming = null)}>{t.common.cancel}</button>
							</form>
						{:else}
							<strong>{u.name}</strong><br />
						{/if}
						<span class="muted">{u.email}</span>
					</td>
					<td data-label={U.role}>
						{#if u.id === data.user.id}
							{u.role === 'admin' ? U.admin : U.author} <span class="muted">{U.you}</span>
						{:else}
							<form method="POST" action={act('role')} use:enhance={send()}>
								<input type="hidden" name="id" value={u.id} />
								<select name="role" onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label={U.role}>
									<option value="author" selected={u.role === 'author'}>{U.author}</option>
									<option value="admin" selected={u.role === 'admin'}>{U.admin}</option>
								</select>
							</form>
						{/if}
					</td>
					<td data-label={t.common.language}>
						<form method="POST" action={act('locale')} use:enhance={send()}>
							<input type="hidden" name="id" value={u.id} />
							<select name="locale" onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label={U.language}>
								{#each PANEL_LANGS as l (l)}<option value={l} selected={u.locale === l}>{l.toUpperCase()}</option>{/each}
							</select>
						</form>
					</td>
					<td data-label={U.status}>
						<div class="status">
							{#if u.disabled}<span class="tag off">{U.blocked}</span>
							{:else if !u.activated}<span class="tag warn">{U.pending}</span>
							{:else}<span class="tag ok">{U.active}</span>{/if}
							<span class="twofa" class:need={!u.totpEnabled && u.role === 'admin'}>2FA: {u.totpEnabled ? t.common.yes.toLowerCase() : u.role === 'admin' ? U.required.toLowerCase() : t.common.no.toLowerCase()}</span>
						</div>
					</td>
					<td class="actions" class:solo={u.id === data.user.id || (u.activated && !u.disabled)}>
						<div class="acts">
							{#if u.id !== data.user.id}
								<!-- Jedna akcja zależna od stanu konta; reszta w menu ⋯. -->
								{#if !u.activated && !u.disabled}
									<form method="POST" action={act('reinvite')} use:enhance={send()}>
										<input type="hidden" name="id" value={u.id} /><button class="secondary"><Icon name="send" weight={2} />{U.newLink}</button>
									</form>
								{:else if u.disabled}
									<form method="POST" action={act('toggle')} use:enhance={send()}>
										<input type="hidden" name="id" value={u.id} /><button class="secondary"><Icon name="unlock" weight={2} />{U.unblock}</button>
									</form>
								{/if}
							{/if}
							<RowMenu label={U.moreFor(u.name)}>
								<button type="button" onclick={() => (renaming = u.id)}><Icon name="edit" weight={2} />{U.rename}</button>
								{#if u.id !== data.user.id}
									{#if !u.activated && u.disabled}
										<form method="POST" action={act('reinvite')} use:enhance={send()}>
											<input type="hidden" name="id" value={u.id} /><button><Icon name="send" weight={2} />{U.newLink}</button>
										</form>
									{/if}
									{#if u.totpEnabled}
										<form method="POST" action={act('reset2fa')} use:enhance={send({ confirm: () => U.reset2faConfirm(u.name) })}>
											<input type="hidden" name="id" value={u.id} /><button><Icon name="key" weight={2} />{U.reset2fa}</button>
										</form>
									{/if}
									{#if u.activated && !u.disabled}
										<form method="POST" action={act('toggle')} use:enhance={send({ confirm: () => U.blockConfirm(u.name) })}>
											<input type="hidden" name="id" value={u.id} /><button><Icon name="lock" weight={2} />{U.block}</button>
										</form>
									{/if}
									{#if !u.activated}
										<!-- Nieaktywowane konto nie ma quizów ani plików – można je usunąć (zamiast blokować). -->
										<hr />
										<form method="POST" action={act('delete')} use:enhance={send({ confirm: () => U.deleteConfirm(u.name, u.email) })}>
											<input type="hidden" name="id" value={u.id} /><button class="danger"><Icon name="trash" weight={2} />{U.delete}</button>
										</form>
									{/if}
								{/if}
							</RowMenu>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{/if}
</div>

<style>
	h2 { margin-top: 0; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
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
	/* Filtry nad listą */
	.filters { margin-bottom: 1rem; }
	.frow { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem; }
	.frow .q { flex: 1 1 18rem; min-width: 0; }
	.frow select { flex: 0 1 13rem; width: auto; }
	.chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.chip { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 2.25rem; padding: 0 0.9rem; border-radius: 999px; background: #fff; color: var(--text); font-size: 0.93rem; font-weight: 500; border: 1px solid var(--line-strong); white-space: nowrap; }
	.chip span { background: var(--soft); border-radius: 999px; padding: 0 0.45rem; font-size: 0.8rem; color: var(--text); font-variant-numeric: tabular-nums; }
	.chip:hover { background: var(--soft); filter: none; }
	.chip.warn { border-color: #e7b84a; }
	.chip.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
	.count { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin: 0.75rem 0 0; }
	.link { min-height: 0; padding: 0; background: none; border: 0; color: var(--accent); font-size: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
	.link:hover { filter: none; background: none; }
	.empty { padding: 2rem 1rem; text-align: center; }
	.empty p { margin: 0 0 1rem; color: var(--muted); }
	/* Stałe proporcje kolumn – tabela wygląda tak samo przy jednej i przy wielu osobach. */
	table { table-layout: fixed; min-width: 50rem; }
	.c-person { width: auto; } .c-role { width: 10rem; } .c-lang { width: 5.5rem; } .c-status { width: 11.5rem; } .c-actions { width: 11rem; }
	td.person { overflow-wrap: anywhere; }
	td.person .muted { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.status { display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; }
	.twofa { font-size: 0.8rem; color: var(--muted); }
	.twofa.need { color: #8a5a00; font-weight: 600; }
	/* Zablokowane konto przygaszone – poza akcjami („Odblokuj” ma być wyraźne). */
	tr.off td:not(.actions) { opacity: 0.55; }
	.rename { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
	.rename input[name='name'] { flex: 1 1 12rem; min-width: 0; min-height: 2.5rem; }
	.rename button { min-height: 2.5rem; padding: 0.3rem 0.8rem; font-size: 0.9rem; }
	.acts { display: flex; justify-content: flex-end; align-items: center; gap: 0.4rem; }
	.acts > form > button { min-height: 2.5rem; padding: 0.3rem 0.8rem; font-size: 0.9rem; white-space: nowrap; }
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
		/* ⋯ w prawym górnym rogu karty; w dolnym rzędzie zostaje tylko akcja zależna od stanu (jeśli jest). */
		.list tr { position: relative; }
		.list td.person { padding-right: 3.25rem; }
		.acts :global(.trigger) { position: absolute; top: 0.75rem; right: 0.75rem; }
		.list td.actions.solo, .list td.actions.solo .acts { display: contents; }
		.acts > form { flex: 1; }
		.acts > form > button { width: 100%; min-height: 2.75rem; }
		td select { width: 100%; min-height: 2.75rem; }
		table { table-layout: auto; min-width: 0; }
		.frow .q { flex-basis: 100%; }
		.frow select { flex: 1 1 0; }
		/* Statusy w jednym rzędzie, przewijane w bok – nie zajmują pół ekranu. */
		.chips { flex-wrap: nowrap; overflow-x: auto; margin: 0 -1rem; padding: 0 1rem 0.25rem; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
		.chips::-webkit-scrollbar { display: none; }
		.chip { flex: none; }
		.rename input[name='name'] { flex-basis: 100%; min-height: 2.75rem; }
		.rename button { flex: 1; min-height: 2.75rem; }
	}
</style>
