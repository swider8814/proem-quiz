<script lang="ts">
	import '#lib/styles/panel.css';
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	import LangSwitch from '#lib/i18n/LangSwitch.svelte';
	import { afterNavigate } from '$app/navigation';
	let { data, children } = $props();
	const t = $derived(panelDict(data.lang));

	const setupOnly = $derived(data.user.role === 'admin' && !data.user.totpEnabled);
	const links = $derived([
		{ href: '/panel', label: t.nav.quizzes },
		...(data.user.role === 'admin'
			? [
					{ href: '/panel/themes', label: t.nav.themes },
					{ href: '/panel/users', label: t.nav.users },
					{ href: '/panel/settings', label: t.nav.settings }
				]
			: []),
		{ href: '/panel/security', label: t.nav.security }
	]);

	// Telefon: menu chowane pod przyciskiem (hamburger), zamyka się po przejściu na inną stronę.
	let open = $state(false);
	afterNavigate(() => (open = false));
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<header>
	<a class="brand" href="/panel">
		{#if data.org.logoUrl}<img src={data.org.logoUrl} alt={data.org.name} />{:else}<strong>{data.org.name}</strong>{/if}
		<span>Quiz</span>
	</a>
	<button class="burger" type="button" aria-expanded={open} aria-controls="panel-menu" aria-label={t.nav.menu} onclick={() => (open = !open)}>
		<span></span><span></span><span></span>
	</button>
	<div class="menu" id="panel-menu" class:open>
		{#if !setupOnly}
			<nav>
				{#each links as l}
					<a href={l.href} aria-current={(l.href === '/panel' ? page.url.pathname === l.href : page.url.pathname.startsWith(l.href)) ? 'page' : undefined}>{l.label}</a>
				{/each}
			</nav>
		{/if}
		<div class="who">
			<span>{data.user.name}{data.user.role === 'admin' ? ` · ${t.nav.admin}` : ''}</span>
			<LangSwitch light />
			<form method="POST" action="/logout"><button class="secondary">{t.nav.logout}</button></form>
		</div>
	</div>
</header>

<main>
	{@render children()}
</main>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.75rem 1.5rem;
		background: var(--accent);
		color: var(--accent-text);
		flex-wrap: wrap;
	}
	.brand { font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; color: #fff; text-decoration: none; }
	.brand img { max-height: 2rem; max-width: 9rem; display: block; }
	.brand span { opacity: 0.75; }
	.menu { display: flex; align-items: center; gap: 1.5rem; flex: 1; min-width: 0; }
	.burger { display: none; }
	nav { display: flex; gap: 1rem; flex: 1; flex-wrap: wrap; min-width: 0; }
	nav a { color: #cfd3f5; text-decoration: none; padding: 0.3rem 0; }
	nav a[aria-current='page'] { color: #fff; border-bottom: 2px solid #f5b700; }
	.who { display: flex; align-items: center; gap: 0.8rem; margin-left: auto; font-size: 0.9rem; }
	.who button { padding: 0.4rem 0.8rem; font-size: 0.85rem; }
	main { max-width: 64rem; margin: 2rem auto; padding: 0 1.5rem; }
	@media (max-width: 720px) {
		header { padding: 0.6rem 1rem; gap: 0.75rem; position: relative; }
		.burger {
			display: inline-flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 5px;
			margin-left: auto; width: 44px; height: 44px; padding: 10px; background: transparent; border-radius: 0.5rem;
		}
		.burger span { display: block; width: 100%; height: 3px; border-radius: 2px; background: #fff; transition: transform 0.2s, opacity 0.2s; }
		.burger[aria-expanded='true'] span:nth-child(1) { transform: translateY(8px) rotate(45deg); }
		.burger[aria-expanded='true'] span:nth-child(2) { opacity: 0; }
		.burger[aria-expanded='true'] span:nth-child(3) { transform: translateY(-8px) rotate(-45deg); }
		.menu {
			display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 40;
			flex-direction: column; align-items: stretch; gap: 0.75rem; padding: 0.75rem 1rem 1rem;
			background: var(--accent); box-shadow: 0 12px 24px rgba(0, 0, 0, 0.25);
		}
		.menu.open { display: flex; }
		nav { flex-direction: column; gap: 0; }
		nav a { padding: 0.75rem 0.25rem; border-bottom: 1px solid rgba(255, 255, 255, 0.12); font-size: 1.05rem; }
		nav a[aria-current='page'] { border-bottom: 1px solid rgba(255, 255, 255, 0.12); box-shadow: inset 4px 0 0 #f5b700; padding-left: 0.75rem; }
		.who { margin-left: 0; flex-wrap: wrap; justify-content: space-between; }
		main { margin: 1rem auto; padding: 0 1rem; }
	}
</style>
