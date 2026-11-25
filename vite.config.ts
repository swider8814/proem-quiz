import path from 'node:path';
import { pathToFileURL } from 'node:url';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

// W trybie dev podpinamy Socket.IO pod serwer Vite,
// w produkcji robi to server/index.js.
const realtimeDev: Plugin = {
	name: 'proem-quiz-realtime',
	async configureServer(server) {
		// Ścieżka w zmiennej: serwer gry to czysty JS, poza kontrolą typów SvelteKit.
		const realtimePath = pathToFileURL(path.resolve('server/realtime.js')).href;
		const { attachRealtime } = await import(/* @vite-ignore */ realtimePath);
		if (server.httpServer) attachRealtime(server.httpServer);
	}
};

export default defineConfig({
	// Fonty i grafiki zawsze jako osobne pliki (CSP: font-src/img-src 'self', bez data: dla fontów).
	build: { assetsInlineLimit: 0 },
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ out: 'build' }),
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'media-src': ['self', 'blob:'],
					'font-src': ['self'],
					'connect-src': ['self', 'ws:', 'wss:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		}),
		realtimeDev
	]
});
