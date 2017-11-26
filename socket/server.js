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
const crypto = require("crypto");
let wss;
let sessions = new Map();
function initWebSocketServer(http) {
    wss = new WebSocket.Server(http);
    wss.on('connection', (ws, req) => {
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
}
exports.initWebSocketServer = initWebSocketServer;
function processMessage(request, session, ws) {
    handleRequest(request, session, ws).then(([sendResponse, sendToken]) => {
        if (!sendResponse) {
            return;
        }
        // just send the whole state on success
        // TODO
        sendText(ws, request, {
            requestId: request.requestId,
            token: sendToken ? session.user.token : undefined,
            runningGames: [],
            closedGames: [],
            users: []
        });
    }).catch(reason => {
        sendText(ws, request, {
            error: reason,
            requestId: request.requestId
        });
    });
}
function handleRequest(request, session, ws) {
    return __awaiter(this, void 0, void 0, function* () {
        if (request.action == 'login') {
            let user;
            if (request.token && request.token.length > 5) {
                user = data_1.DataManager.findUserByToken(request.token);
                if (!user) {
                    throw 'invalid token';
                }
            }
            else {
                user = data_1.DataManager.findUserByName(request.username);
                if (!user) {
                    throw 'unknown user';
                }
                else if (user.password != request.password) {
                    throw 'wrong password';
                }
            }
            // login is valid when user is not null here
            session.isLoggedIn = true;
            session.user = user;
            user.token = crypto.randomBytes(20).toString('hex');
            return [true, true];
        }
        else if (!session.isLoggedIn) {
            // close session if neither logged in nor action is login
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