import * as WebSocket from "ws";

let wss;

export function initWebSocketServer(http) {
    wss = new WebSocket.Server(http);

    wss.on('connection', function connection(ws) {
        ws.on('message', function incoming(message) {
            console.log('received: %s', message);
        });

        ws.send('something');
    });
}
