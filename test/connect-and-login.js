import ws, { WebSocketError } from 'k6/ws';
import { check } from 'k6';
import { formatMessage, generateUser, parseMessage } from './helpers.js';

export default function () {
    const url = 'wss://39mds187f0.execute-api.us-east-1.amazonaws.com/dev';
    const duration = 5000;
    let login = false;

    const result = ws.connect(url, function connect(socket) {
        socket.on('open', function open() {
            socket.setTimeout(function timeout() {
                console.log('Close.');
                socket.close();
            }, duration);

            console.log('Connected.');

            const { username, sessionId, token } = generateUser();
            const loginPacket = {
                type: 'login',
                sessionId: sessionId,
                token: token,
                username: username,
            };

            const json = formatMessage(loginPacket);
            socket.send(json);

            console.log('Sent Login!');
        });

        socket.on('close', function close() {
            console.log('Disconnected.');
        });

        socket.on('message', function message(json) {
            const data = parseMessage(json);

            if (data.type === 'login_result') {
                console.log('Login!');
                login = true;
            }
            check(data, {
                'message is login result': (d) => d.type === 'login_result',
            });
        });

        socket.on('error', function (e) {
            if (e.error() != 'websocket: close sent') {
                console.log('An unexpected error occured: ', e.error());
            }
        });
    });

    check(result, { 'status is 101': (r) => r && r.status === 101 });
    check(login, { 'have logged in': (l) => l === true });
}
