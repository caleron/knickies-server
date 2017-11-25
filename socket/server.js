"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = require("ws");
const data_1 = require("./data");
let wss;
let sessions = new Map();
function initWebSocketServer(http) {
    wss = new WebSocket.Server(http);
    wss.on('connection', (ws, req) => {
        sessions.set(ws, {
            isAlive: true,
            isLoggedIn: false,
            user: ''
        });
        ws.on('message', (message) => {
            // set the connection as alive on each pong or received message
            sessions.get(ws).isAlive = true;
            console.log('received: %s', message);
            // handle request and send response
            handleRequest(JSON.parse(message.toString()), sessions.get(ws), ws);
        });
        ws.on('pong', () => {
            // set the connection as alive on each pong or received message
            sessions.get(ws).isAlive = true;
        });
    });
    /**
     * Check every 30s if all sessions are alive
     * if the client does not responds with a pong after 30s, the respective connection is terminated (because isAlive is
     * false from the last execution)
     */
    setInterval(function ping() {
        wss.clients.forEach(function each(ws) {
            let data = sessions.get(ws);
            if (data.isAlive === false) {
                return closeSession(ws);
            }
            data.isAlive = false;
            ws.ping('', false, true);
        });
    }, 30000);
}
exports.initWebSocketServer = initWebSocketServer;
function handleRequest(request, session, ws) {
    if (request.action == 'login') {
        let user;
        let errorMessage;
        if (request.token && request.token.length > 5) {
            user = data_1.DataManager.findUserByToken(request.token);
            if (!user) {
                errorMessage = 'invalid token';
            }
        }
        else {
            user = data_1.DataManager.findUserByName(request.username);
            if (!user) {
                errorMessage = 'unknown user';
            }
            else if (user.password != request.password) {
                user = null;
                errorMessage = 'wrong password';
            }
        }
        if (user == null) {
            // send error response and terminate the connection
            ws.send(JSON.stringify({
                error: errorMessage,
                requestId: request.requestId
            }));
            return closeSession(ws);
        }
        else {
            // login is valid when user is not null here
            session.isLoggedIn = true;
            session.user = user.name;
            ws.send(JSON.stringify({
                error: errorMessage,
                requestId: request.requestId
            }));
        }
        return;
    }
    else if (!session.isLoggedIn) {
        // close session if neither logged in nor action is login
        ws.send(JSON.stringify({
            error: 'not logged in',
            requestId: request.requestId
        }));
        return closeSession(ws);
    }
    switch (request.action) {
        case "addText":
            break;
        case "createGame":
            break;
        case "inviteUser":
            break;
        case "register":
            break;
    }
}
function sendText(ws, request, response) {
    response.requestId = request.requestId;
    ws.send(JSON.stringify(response));
}
function closeSession(ws) {
    sessions.delete(ws);
    ws.terminate();
}
//# sourceMappingURL=server.js.map