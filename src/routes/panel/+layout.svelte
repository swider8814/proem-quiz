<script lang="ts">
	import '#lib/styles/panel.css';
	import { page } from '$app/state';
	import { panelDict } from '#lib/i18n/panel.js';
	import LangSwitch from '#lib/i18n/LangSwitch.svelte';
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
</script>

<header>
	<a class="brand" href="/panel">
		{#if data.org.logoUrl}<img src={data.org.logoUrl} alt={data.org.name} />{:else}<strong>{data.org.name}</strong>{/if}
		<span>Quiz</span>
	</a>
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
	nav { display: flex; gap: 1rem; flex: 1; flex-wrap: wrap; min-width: 0; }
	nav a { color: #cfd3f5; text-decoration: none; padding: 0.3rem 0; }
	nav a[aria-current='page'] { color: #fff; border-bottom: 2px solid #f5b700; }
	.who { display: flex; align-items: center; gap: 0.8rem; margin-left: auto; font-size: 0.9rem; }
	.who button { padding: 0.4rem 0.8rem; font-size: 0.85rem; }
	main { max-width: 64rem; margin: 2rem auto; padding: 0 1.5rem; }
	@media (max-width: 720px) {
		header { padding: 0.75rem 1rem; gap: 0.75rem; }
		nav { order: 3; flex-basis: 100%; gap: 0.25rem 1rem; }
		main { margin: 1rem auto; padding: 0 1rem; }
	}
</style>
