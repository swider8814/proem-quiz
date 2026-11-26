<script lang="ts">
	import { smoothDetails } from '#lib/motion.js';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { isPanelLang, panelDict } from '#lib/i18n/panel.js';
	import { HELP, helpHtml, type HelpLang } from '#lib/help/content.js';

	const lang = $derived<HelpLang>(isPanelLang(page.data.lang) ? page.data.lang : 'pl');
	const t = $derived(panelDict(page.data.lang));
	const isAdmin = $derived(page.data.user?.role === 'admin');
	let query = $state('');
	let open = $state<Record<string, boolean>>({});

	const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/\*\*/g, '');
	const sections = $derived(
		HELP.filter((s) => !s.adminOnly || isAdmin).map((s) => ({ id: s.id, b: s[lang] }))
	);
	const shown = $derived.by(() => {
		const q = norm(query.trim());
		if (!q) return sections;
		return sections.filter(({ b }) => norm([b.title, b.summary, ...(b.steps ?? []), ...(b.tips ?? [])].join(' ')).includes(q));
	});

	// Link z podpowiedzi „?” (np. /panel/help#settings) otwiera od razu właściwą sekcję.
	onMount(() => {
		const id = decodeURIComponent(location.hash.slice(1));
		if (id && sections.some((s) => s.id === id)) {
			open[id] = true;
			requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
		}
	});
</script>

<svelte:head><title>{t.help.title} · Proem Quiz</title></svelte:head>

<h1>{t.help.title}</h1>
<p class="muted">{t.help.intro}</p>

<input class="search" type="search" bind:value={query} placeholder={t.help.search} aria-label={t.help.search} />

{#if !shown.length}
	<p class="muted">{t.help.noResults}</p>
{/if}

<div class="sections">
	{#each shown as s, i (s.id)}
		<details class="card sec" id={s.id} use:smoothDetails bind:open={() => open[s.id] || !!query.trim(), (v) => (open[s.id] = v)}>
			<summary>
				<span class="num">{i + 1}</span>
				<span class="head"><strong>{s.b.title}</strong><span class="muted">{s.b.summary}</span></span>
			</summary>
			{#if s.b.steps?.length}
				<ol>
					{#each s.b.steps as step}<li>{@html helpHtml(step)}</li>{/each}
				</ol>
			{/if}
			{#if s.b.tips?.length}
				<ul class="tips">
					{#each s.b.tips as tip}<li>{@html helpHtml(tip)}</li>{/each}
				</ul>
			{/if}
		</details>
	{/each}
</div>

<style>
	.search { width: 100%; max-width: 28rem; margin: 0.5rem 0 1.25rem; }
	.sections { display: grid; gap: 0.75rem; }
	.sec { padding: 0; overflow: hidden; scroll-margin-top: 1rem; }
	summary { display: flex; gap: 0.9rem; align-items: center; padding: 1rem 1.25rem; cursor: pointer; list-style: none; }
	summary::-webkit-details-marker { display: none; }
	summary::after { content: '+'; margin-left: auto; font-size: 1.4rem; font-weight: 600; color: var(--muted); }
	/* „+” obraca się w „×” zamiast podmieniać znak. */
	summary::after { transition: transform var(--dur) var(--ease-out); }
	details[open] summary::after { transform: rotate(45deg); }
	.num { flex: none; display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 50%; background: var(--bg); border: 1px solid var(--line-strong); font-weight: 700; }
	.head { display: grid; gap: 0.15rem; }
	.head .muted { font-size: 0.9rem; }
	ol, .tips { margin: 0; padding: 0 1.25rem 1.1rem 3.6rem; display: grid; gap: 0.5rem; line-height: 1.5; }
	.tips { list-style: disc; color: var(--muted); padding-top: 0.25rem; }
	@media (max-width: 860px) {
		summary { padding: 0.9rem 1rem; }
		ol, .tips { padding-left: 2.4rem; padding-right: 1rem; }
	}
</style>
