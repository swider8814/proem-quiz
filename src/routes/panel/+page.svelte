<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Quizy · Proem Quiz</title></svelte:head>

<h1>Cześć, {data.user.name}!</h1>
<div class="card">
	<p>Tu pojawi się lista quizów i edytor. To kolejny krok budowy.</p>
	<p class="muted">Na razie możesz sprawdzić <a href="/test-ws">test połączenia na żywo</a>.</p>
</div>
