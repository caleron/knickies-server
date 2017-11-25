"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = require("ws");
let wss;
function initWebSocketServer(http) {
    wss = new WebSocket.Server(http);
    wss.on('connection', function connection(ws) {
        ws.on('message', function incoming(message) {
            console.log('received: %s', message);
        });
        ws.send('something');
    });
}
exports.initWebSocketServer = initWebSocketServer;
//# sourceMappingURL=server.js.map