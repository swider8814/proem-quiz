<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
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

	// ── Filtry listy: w przeglądarce, na wczytanej liście; stan w adresie (?q=&status=&role=&lang=),
	// żeby odświeżenie, „wstecz” i akcje na liście (POST) pokazywały ten sam widok. ──
	type Status = 'all' | 'active' | 'pending' | 'blocked' | 'no2fa';
	const STATUSES: Status[] = ['all', 'active', 'pending', 'blocked', 'no2fa'];
	const pick = <T extends string>(v: string | null, ok: readonly T[], def: T): T => (ok.includes(v as T) ? (v as T) : def);
	const sp = page.url.searchParams;
	let q = $state((sp.get('q') ?? '').slice(0, 100));
	let status = $state(pick(sp.get('status'), STATUSES, 'all'));
	let role = $state(pick(sp.get('role'), ['all', 'author', 'admin'] as const, 'all'));
	let lang = $state(pick(sp.get('lang'), ['all', 'pl', 'en'] as const, 'all'));

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

<button type="button" class="invite-toggle" aria-expanded={inviteOpen} aria-controls="invite-box" onclick={() => (inviteOpen = !inviteOpen)}>+ {U.invite}</button>
<div class="card invite-box" id="invite-box" class:open={inviteOpen}>
	<h2>{U.invite}</h2>
	{#if form?.inviteError}<p class="error">{form.inviteError}</p>{/if}
	<form method="POST" action={act('invite')} class="invite">
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
			<option value="pl">Polski</option>
			<option value="en">English</option>
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
		<colgroup><col class="c-person" /><col class="c-role" /><col class="c-lang" /><col class="c-status" /><col class="c-2fa" /><col class="c-actions" /></colgroup>
		<thead>
			<tr><th>{U.person}</th><th>{U.role}</th><th>{t.common.language}</th><th>{U.status}</th><th>2FA</th><th></th></tr>
		</thead>
		<tbody>
			{#each shown as u (u.id)}
				<tr class:off={u.disabled}>
					<td class="person"><strong>{u.name}</strong><br /><span class="muted">{u.email}</span></td>
					<td data-label={U.role}>
						{#if u.id === data.user.id}
							{u.role === 'admin' ? U.admin : U.author} <span class="muted">{U.you}</span>
						{:else}
							<form method="POST" action={act('role')}>
								<input type="hidden" name="id" value={u.id} />
								<select name="role" onchange={(e) => e.currentTarget.form?.requestSubmit()} aria-label={U.role}>
									<option value="author" selected={u.role === 'author'}>{U.author}</option>
									<option value="admin" selected={u.role === 'admin'}>{U.admin}</option>
								</select>
							</form>
						{/if}
					</td>
					<td data-label={t.common.language}>
						<form method="POST" action={act('locale')}>
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
								<form method="POST" action={act('reinvite')}>
									<input type="hidden" name="id" value={u.id} /><button class="secondary">{U.newLink}</button>
								</form>
							{/if}
							{#if u.totpEnabled}
								<form method="POST" action={act('reset2fa')} onsubmit={(e) => { if (!confirm(U.reset2faConfirm(u.name))) e.preventDefault(); }}>
									<input type="hidden" name="id" value={u.id} /><button class="secondary">{U.reset2fa}</button>
								</form>
							{/if}
							<form method="POST" action={act('toggle')}>
								<input type="hidden" name="id" value={u.id} />
								<button class={u.disabled ? 'secondary' : 'danger'}>{u.disabled ? U.unblock : U.block}</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{/if}
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
	.c-person { width: auto; } .c-role { width: 10rem; } .c-lang { width: 5.5rem; } .c-status { width: 11rem; } .c-2fa { width: 7rem; } .c-actions { width: 17rem; }
	td.person { overflow-wrap: anywhere; }
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
		table { table-layout: auto; min-width: 0; }
		.frow .q { flex-basis: 100%; }
		.frow select { flex: 1 1 0; }
		/* Statusy w jednym rzędzie, przewijane w bok – nie zajmują pół ekranu. */
		.chips { flex-wrap: nowrap; overflow-x: auto; margin: 0 -1rem; padding: 0 1rem 0.25rem; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
		.chips::-webkit-scrollbar { display: none; }
		.chip { flex: none; }
	}
</style>
