import ws, { WebSocketError } from 'k6/ws';
import { check } from 'k6';

export default function () {
    const url = 'wss://39mds187f0.execute-api.us-east-1.amazonaws.com/dev';
    const duration = 5000;

    const result = ws.connect(url, function connect(socket) {
        socket.on('open', function open() {
            console.log('Connected.');

            socket.setTimeout(function timeout() {
                console.log('Close.');
                socket.close();
            }, duration);
        });

        socket.on('close', function close() {
            console.log('Disconnected.');
        });

        socket.on('error', function (e) {
            if (e.error() != 'websocket: close sent') {
                console.log('An unexpected error occured: ', e.error());
            }
        });
    });

    check(result, { 'status is 101': (r) => r && r.status === 101 });
}
