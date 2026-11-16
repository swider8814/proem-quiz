import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { attachRealtime } from './server/realtime.js';

// W trybie dev podpinamy Socket.IO pod serwer Vite,
// w produkcji robi to server/index.js.
const realtimeDev: Plugin = {
	name: 'proem-quiz-realtime',
	configureServer(server) {
		if (server.httpServer) attachRealtime(server.httpServer as import('node:http').Server);
	}
};

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ out: 'build' })
		}),
		realtimeDev
	]
});
