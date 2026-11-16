// Konfiguracja PM2 na Mikrusie. Zmienne prywatne trzymamy w pliku .env (nie w repo).
module.exports = {
	apps: [
		{
			name: 'proem-quiz',
			script: 'server/index.js',
			node_args: '--env-file-if-exists=.env',
			instances: 1, // stan gry jest w pamięci: zawsze jeden proces
			max_memory_restart: '600M',
			env: {
				NODE_ENV: 'production'
			}
		}
	]
};
