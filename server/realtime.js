// Warstwa komunikacji na żywo (Socket.IO).
// Na razie: przestrzeń /diag do testu WebSocketów za Cytrusem.
// Tu w kolejnych krokach dojdzie przestrzeń /game (PIN, pytania, odpowiedzi).
import { Server } from 'socket.io';

/** @param {import('node:http').Server} httpServer */
export function attachRealtime(httpServer) {
	const io = new Server(httpServer, {
		path: '/socket.io',
		serveClient: false,
		pingInterval: 20000,
		pingTimeout: 20000,
		// Długie odpowiedzi long-polling są OK przy proxy, które buforuje.
		maxHttpBufferSize: 1e5
	});

	const diag = io.of('/diag');
	diag.on('connection', (socket) => {
		const transport = () => socket.conn.transport.name;
		socket.emit('hello', {
			id: socket.id,
			transport: transport(),
			serverTime: Date.now(),
			clients: diag.sockets.size
		});
		diag.emit('clients', diag.sockets.size);

		socket.conn.on('upgrade', () => {
			socket.emit('upgraded', { transport: transport() });
		});

		// Pomiar opóźnienia w obie strony.
		socket.on('ping-check', (/** @type {number} */ sentAt, ack) => {
			if (typeof ack === 'function') ack({ sentAt, serverTime: Date.now(), transport: transport() });
		});

		// Rozsyłanie do wszystkich (symulacja "pokaż pytanie").
		socket.on('broadcast', (/** @type {string} */ text) => {
			diag.emit('broadcast', { text: String(text).slice(0, 100), at: Date.now() });
		});

		socket.on('disconnect', () => diag.emit('clients', diag.sockets.size));
	});

	return io;
}
