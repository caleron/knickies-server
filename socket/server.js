"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = require("ws");
const data_1 = require("./data");
let wss;
let sessions = new Map();
let acceptConnections = false;
function initWebSocketServer(http) {
    wss = new WebSocket.Server(http);
    console.log("initialized websocket server");
    wss.on('connection', (ws, req) => {
        if (!acceptConnections) {
            console.log("refusing connection");
            ws.terminate();
        }
        console.log("accepting connection");
        sessions.set(ws, {
            isAlive: true,
            isLoggedIn: false,
            user: null
        });
        ws.on('message', (message) => {
            // set the connection as alive on each pong or received message
            sessions.get(ws).isAlive = true;
            console.log('received: %s', message);
            // handle request and send response
            processMessage(JSON.parse(message.toString()), sessions.get(ws), ws);
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
    // start accepting connections when data is loaded
    data_1.DataManager.init()
        .then(() => acceptConnections = true)
        .catch(console.log);
}
exports.initWebSocketServer = initWebSocketServer;
function processMessage(request, session, ws) {
    handleRequest(request, session, ws).then(([sendResponse, sendToken]) => {
        if (!sendResponse) {
            return;
        }
        // just send the whole state on success
        // TODO
        if (sendToken) {
            console.log("returning response with token");
        }
        sendText(ws, request, {
            requestId: request.requestId,
            token: sendToken ? session.user.token : undefined,
            runningGames: [],
            closedGames: [],
            users: []
        });
    }).catch(reason => {
        console.log("returning error:");
        console.error(reason);
        sendText(ws, request, {
            error: reason,
            requestId: request.requestId
        });
    });
}
function handleRequest(request, session, ws) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("handling request with action" + request.action);
        if (request.action == 'login') {
            yield data_1.DataManager.login(session, request.username, request.password, request.token);
            return [true, true];
        }
        else if (!session.isLoggedIn) {
            // close session if neither logged in nor action is login
            console.log("user is not logged in");
            sendText(ws, request, {
                error: 'not logged in',
                requestId: request.requestId
            });
            closeSession(ws);
            return [false, false];
        }
        switch (request.action) {
            case "addText":
                yield data_1.DataManager.addText(session.user.name, request.gameId, request.sheetNumber, request.text);
                break;
            case "createGame":
                yield data_1.DataManager.createGame(request.newGame.name, session.user.name, request.newGame.users, request.newGame.sheetCount, request.newGame.textCount);
                break;
            case "inviteUser":
                yield data_1.DataManager.inviteUser(request.gameId, request.username);
                break;
            case "register":
                yield data_1.DataManager.register(request.username, request.password);
                break;
            default:
                throw 'unknown action';
        }
        return [true, false];
    });
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