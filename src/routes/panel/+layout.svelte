<script lang="ts">
	import { initials } from '#lib/initials.js';
	import '#lib/styles/panel.css';
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	import LangSwitch from '#lib/i18n/LangSwitch.svelte';
	import { afterNavigate } from '$app/navigation';
	import Icon from '#lib/Icon.svelte';
	import { slideIn } from '#lib/motion.js';
	let { data, children } = $props();
	const t = $derived(panelDict(data.lang));

	const setupOnly = $derived(data.user.role === 'admin' && !data.user.totpEnabled);
	const links = $derived([
		{ href: '/panel', label: t.nav.quizzes, icon: 'quizzes' as const },
		...(data.user.role === 'admin'
			? [
					{ href: '/panel/themes', label: t.nav.themes, icon: 'palette' as const },
					{ href: '/panel/users', label: t.nav.users, icon: 'users' as const },
					{ href: '/panel/settings', label: t.nav.settings, icon: 'settings' as const }
				]
			: []),
		{ href: '/panel/security', label: t.nav.security, icon: 'user' as const },
		{ href: '/panel/help', label: t.nav.help, icon: 'help' as const }
	]);

	// Edytor quizu ma własny pasek (← Quizy, tytuł, zapis) i całą szerokość okna – bez menu bocznego.
	const bare = $derived(page.route.id === '/panel/quizzes/[id]');

	// Telefon: menu chowane pod przyciskiem (hamburger), zamyka się po przejściu na inną stronę.
	let open = $state(false);
	let menuEl: HTMLElement | undefined = $state();
	afterNavigate(() => (open = false));
	// Wysunięcie menu przy otwarciu (Web Animations – działa też w Safari na iOS); chowa się od razu.
	$effect(() => {
		if (open && menuEl) slideIn(menuEl);
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="shell" class:bare>
	{#if !bare}
		<header class="sidebar">
			<a class="brand" class:has-logo={!!data.org.logoUrl} href="/panel">
				{#if data.org.logoUrl}
					<img src={data.org.logoUrl} alt={data.org.name} />
				{:else}
					<span class="mark" aria-hidden="true">{data.org.name.slice(0, 1).toUpperCase()}</span>
					<strong>{data.org.name}</strong>
				{/if}
				<span class="app">Quiz</span>
			</a>
			<button class="burger" type="button" aria-expanded={open} aria-controls="panel-menu" aria-label={t.nav.menu} onclick={() => (open = !open)}>
				<span></span><span></span><span></span>
			</button>
			<div class="menu" id="panel-menu" class:open bind:this={menuEl}>
				{#if !setupOnly}
					<nav>
						{#each links as l}
							<a href={l.href} aria-current={(l.href === '/panel' ? page.url.pathname === l.href || page.url.pathname.startsWith('/panel/quizzes') : page.url.pathname.startsWith(l.href)) ? 'page' : undefined}><Icon name={l.icon} size="1.15em" weight={2} /><span>{l.label}</span></a>
						{/each}
					</nav>
				{/if}
				<div class="who">
					<span class="avatar" aria-hidden="true">{initials(data.user.name)}</span>
					<span class="id">
						<strong>{data.user.name}</strong>
						{#if data.user.role === 'admin'}<span class="role">{t.nav.admin}</span>{/if}
					</span>
					<span class="acts compact-m">
						<LangSwitch />
						<form method="POST" action="/logout"><button class="secondary">{t.nav.logout}</button></form>
					</span>
				</div>
			</div>
		</header>
	{/if}

	<main>
		<div class="inner">
			{@render children()}
			{#if !bare}
				<footer class="ver">
					Proem Quiz {data.version.label}{#if data.version.builtAt}{' · '}{data.version.builtAt}{/if}{#if data.version.short}{' · '}<a href={data.version.commitUrl} target="_blank" rel="noopener">{data.version.short}</a>{/if}
				</footer>
			{/if}
		</div>
	</main>
</div>

<style>
	.ver { margin-top: 2.5rem; padding-top: 0.75rem; border-top: 1px solid var(--line); font-size: 0.78rem; color: var(--muted); font-variant-numeric: tabular-nums; }
	.ver a { color: inherit; }
	.shell { display: flex; align-items: flex-start; min-height: 100vh; }
	.sidebar {
		/* Szerokość rośnie o wcięcie „notcha” (iPhone w poziomie, ~59 px) – inaczej zjada miejsce na treść i przyciski wychodzą poza kolumnę. */
		flex: none; width: calc(15rem + max(0px, env(safe-area-inset-left) - 1rem)); box-sizing: border-box; position: sticky; top: 0; height: 100vh; overflow-y: auto;
		display: flex; flex-direction: column; gap: 1.5rem; padding: 1.5rem 1rem max(1.5rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
		background: var(--surface); border-right: 1px solid var(--line);
	}
	.brand { display: flex; align-items: center; gap: 0.6rem; padding: 0 0.5rem; color: var(--text); text-decoration: none; font-family: var(--display); font-size: 1.15rem; min-width: 0; }
	.brand strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.brand .app { color: var(--muted); font-weight: 600; }
	.mark { flex: none; width: 2rem; height: 2rem; border-radius: 0.55rem; background: var(--accent); color: var(--gold); display: flex; align-items: center; justify-content: center; font-weight: 700; }
	/* Logo organizacji jest przygotowane na ciemne tło (dawny granatowy nagłówek) – zostaje na granatowej plakietce. */
	.brand.has-logo { background: var(--accent); border-radius: 0.75rem; padding: 0.6rem 0.75rem; }
	.brand.has-logo .app { color: #cfd3f5; }
	.brand img { max-height: 2rem; max-width: 8rem; display: block; }
	.burger { display: none; }
	.menu { display: flex; flex-direction: column; gap: 1.5rem; flex: 1; min-height: 0; }
	nav { display: flex; flex-direction: column; gap: 2px; }
	nav a { display: flex; align-items: center; min-height: 2.75rem; padding: 0 0.75rem; border-radius: var(--radius-s); color: #4b5064; text-decoration: none; gap: 0.65rem; }
	/* Ikony szare, przy aktywnej pozycji w kolorze tekstu – nie konkurują z kolorowymi odpowiedziami. */
	nav a :global(.icon) { color: #8a8fa3; }
	nav a[aria-current='page'] :global(.icon) { color: var(--text); }
	nav a:hover { background: var(--bg); }
	nav a[aria-current='page'] { background: var(--soft); color: var(--text); font-weight: 600; }
	.who { margin-top: auto; display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; padding: 0.75rem; border: 1px solid var(--line); border-radius: 0.75rem; font-size: 0.9rem; }
	.avatar { flex: none; width: 2.25rem; height: 2.25rem; border-radius: 50%; background: var(--gold); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.02em; }
	.id { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.id strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.role { color: var(--muted); font-size: 0.85rem; }
	.acts { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
	/* Ta sama wysokość co przycisk języka (RowMenu: 2.5rem). */
	.acts button { min-height: 2.5rem; padding: 0.3rem 0.8rem; font-size: 0.87rem; }
	/* Dotyk (telefon w poziomie, tablet): 44 px jak przycisk języka. */
	@media (pointer: coarse) { .acts button { min-height: 44px; } }
	main { flex: 1; min-width: 0; box-sizing: border-box; padding: 2rem max(clamp(1rem, 4vw, 3rem), env(safe-area-inset-right)) max(3rem, calc(env(safe-area-inset-bottom) + 1.5rem)) clamp(1rem, 4vw, 3rem); }
	.inner { max-width: 65rem; margin: 0 auto; }
	/* Edytor (cała szerokość): wcięcia ekranu (boki – iPhone w poziomie, dół – pasek „home”) na wspólnym kontenerze –
	   obejmują pasek, listę, ustawienia, właściwości i ostatni blok strony, niezależnie od tego, który jest na dole. */
	.bare main { padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
	.bare .inner { max-width: none; }
	@media (max-width: 860px) {
		.shell { display: block; }
		.sidebar { position: sticky; top: 0; z-index: 40; width: auto; height: auto; overflow: visible; flex-direction: row; align-items: center; gap: 0.75rem; padding: 0.6rem max(1rem, env(safe-area-inset-right)) 0.6rem max(1rem, env(safe-area-inset-left)); border-right: 0; border-bottom: 1px solid var(--line); }
		.brand { flex: 1; padding: 0; }
		.brand.has-logo { flex: none; padding: 0.4rem 0.6rem; }
		.burger {
			display: inline-flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 4px;
			margin-left: auto; width: 44px; height: 44px; padding: 0.75rem; background: #fff; border: 1px solid var(--line-strong);
		}
		.burger:hover:not(:disabled) { filter: none; }
		.burger span { display: block; width: 100%; height: 2px; border-radius: 2px; background: var(--text); transition: transform 0.2s, opacity 0.2s; }
		.burger[aria-expanded='true'] span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
		.burger[aria-expanded='true'] span:nth-child(2) { opacity: 0; }
		.burger[aria-expanded='true'] span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }
		/* Menu na cały ekran pod paskiem: nawigacja u góry, profil, język i wylogowanie na dole. */
		.menu {
			display: none; position: fixed; inset: 4rem 0 0 0; z-index: 40; box-sizing: border-box;
			/* Dół i boki z odstępem od zaokrąglonych rogów i paska „home” (iPhone, aplikacja na ekranie głównym). */
			gap: 1rem; padding: 1rem max(1rem, env(safe-area-inset-right)) max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem)) max(1rem, env(safe-area-inset-left)); overflow-y: auto; background: var(--surface);
		}
		.menu.open { display: flex; }
		.burger span { transition: transform var(--dur) var(--ease-out), opacity var(--dur-fast); }
		nav a { min-height: 3.25rem; font-size: 1.1rem; }
		/* Profil, język i wylogowanie w jednej linii: [D] Imię Nazwisko · EN · Wyloguj */
		.who { flex-wrap: nowrap; border: 0; border-top: 1px solid var(--line); border-radius: 0; padding: 1rem 0 0; }
		.acts { flex: none; flex-basis: auto; justify-content: flex-end; gap: 0.25rem; }
		/* 44 px jak przycisk języka (RowMenu) – nie 2.75rem, bo root ma 15px (= 41,25 px). */
		.acts button { min-height: 44px; }
		main { padding: 1rem max(1rem, env(safe-area-inset-right)) max(2rem, calc(env(safe-area-inset-bottom) + 1rem)) max(1rem, env(safe-area-inset-left)); }
		/* Na telefonie jedna kolumna – stopka z wersją na środku; na komputerze w linii z treścią (do lewej). */
		.ver { text-align: center; }
	}
</style>
