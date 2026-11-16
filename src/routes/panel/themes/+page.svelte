<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head><title>Motywy · Proem Quiz</title></svelte:head>

<h1>Motywy</h1>
<p class="muted">Motyw = styl ekranów (C plakatowy / A kolorowy / B jasny) + kolory, czcionka i logo. Autor wybiera motyw w ustawieniach quizu.</p>

<div class="card">
	<h2>Nowy motyw</h2>
	{#if form?.error}<p class="error">{form.error}</p>{/if}
	<form method="POST" action="?/create" class="new">
		<div><label for="name">Nazwa</label><input id="name" name="name" type="text" maxlength="60" placeholder="np. Proem Zako – obozy" required /></div>
		<div>
			<label for="style">Styl</label>
			<select id="style" name="style">
				{#each Object.entries(data.styles) as [k, label]}<option value={k}>{label}</option>{/each}
			</select>
		</div>
		<button>Utwórz</button>
	</form>
</div>

<ul class="grid">
	{#each data.themes as t (t.id)}
		<li class="card theme">
			<a href="/panel/themes/{t.id}" class="swatch" style:background={t.colors.background} aria-label="Edytuj motyw {t.name}">
				{#if t.logoUrl}<img src={t.logoUrl} alt="" />{/if}
				<span class="tiles">{#each t.colors.answers as c}<span style:background={c}></span>{/each}</span>
			</a>
			<div class="meta">
				<a href="/panel/themes/{t.id}" class="nm">{t.name}</a>
				<span class="muted">{data.styles[t.style]} · quizów: {t.quizzes}</span>
				{#if t.isDefault}<span class="tag ok">Domyślny</span>{/if}
			</div>
		</li>
	{/each}
</ul>

<style>
	h2 { font-size: 1.1rem; margin-top: 0; }
	.new { display: grid; grid-template-columns: 2fr 1.5fr auto; gap: 0 1rem; align-items: end; }
	@media (max-width: 720px) { .new { grid-template-columns: 1fr; } .new button { margin-top: 1rem; } }
	.grid { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: 1rem; margin-top: 1.5rem; }
	.theme { padding: 0; overflow: hidden; }
	.swatch { display: flex; flex-direction: column; justify-content: space-between; height: 8rem; padding: 0.75rem; text-decoration: none; }
	.swatch img { max-height: 2.5rem; max-width: 60%; object-fit: contain; align-self: flex-start; }
	.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.35rem; margin-top: auto; }
	.tiles span { height: 1.6rem; border: 2px solid #111; }
	.meta { padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
	.nm { font-weight: 700; color: var(--text); text-decoration: none; }
	.tag { align-self: flex-start; }
</style>
