<script lang="ts">
	let { i, size = 32, color = 'currentColor' }: { i: number; size?: number; color?: string } = $props();
</script>

<svg class="shape" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
	{#if i === 0}<path d="M20 4 L37 34 L3 34 Z" fill={color} />
	{:else if i === 1}<path d="M20 2 L38 20 L20 38 L2 20 Z" fill={color} />
	{:else if i === 2}<circle cx="20" cy="20" r="17" fill={color} />
	{:else}<rect x="4" y="4" width="32" height="32" fill={color} />{/if}
</svg>
