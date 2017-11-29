import * as WebSocket from "ws";
import * as http from "http";
import {SessionData, SocketRequest, SocketResponse} from "./types";
import {DataManager} from "./data";

let wss: WebSocket.Server;

let sessions: Map<WebSocket, SessionData> = new Map();
let acceptConnections = false;

export function initWebSocketServer(http) {
    wss = new WebSocket.Server(http);
    console.log("initialized websocket server");

    wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
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

        ws.on('message', (message: WebSocket.Data) => {
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
     * from the ws library readme
     */
    setInterval(function ping() {
        wss.clients.forEach(function each(ws) {
            let data = sessions.get(ws);

            if (data.isAlive === false) {
                if (data.user) {
                    console.log("connection with user " + data.user.name + " died");
                } else {
                    console.log("unknown connection died");
                }
                return closeSession(ws);
            }
            data.isAlive = false;
            ws.ping('', false, true);
        });
    }, 30000);

    // start accepting connections when data is loaded
    DataManager.init()
        .then(() => acceptConnections = true)
        .catch(console.log);
}

function processMessage(request: SocketRequest, session: SessionData, ws: WebSocket) {
    handleRequest(request, session, ws).then(([sendResponse, sendToken]) => {
        if (!sendResponse) {
            return
        }
        // just send the whole state on success
        let response: SocketResponse = DataManager.getStatus(session.user);
        if (sendToken) {
            console.log("returning response with token");
            response.token = session.user.token;
        }
        sendText(ws, request, response);
    }).catch(reason => {
        console.log("returning error:");
        console.error(reason);
        sendText(ws, request, {
            error: reason,
        });
    });
}


async function handleRequest(request: SocketRequest, session: SessionData, ws: WebSocket): Promise<[boolean, boolean]> {
    console.log("handling request with action " + request.action);
    if (request.action == 'login') {

        try {
            await DataManager.login(session, request.username, request.password, request.token);
        } catch (e) {
            console.log('login failed: ' + e);
            sendText(ws, request, {
                error: e
            }, true);
            return [false, false]
        }

        return [true, true];
    } else if (request.action == 'register') {
        try {
            await DataManager.register(request.username, request.password, session);
        } catch (e) {
            console.log('register failed: ' + e);
            sendText(ws, request, {
                error: e
            }, true);
            return [false, false]
        }

        return [true, true];
    } else if (!session.isLoggedIn) {
        // close session if neither logged in nor action is login
        console.log("user is not logged in");
        sendText(ws, request, {
            error: 'not logged in',
        } as SocketResponse);
        closeSession(ws);
        return [false, false];
    }

    switch (request.action) {
        case "addText":
            await DataManager.addText(session.user.name, request.gameId, request.sheetNumber, request.text);
            break;
        case "createGame":
            await DataManager.createGame(request.newGame.name, session.user.name, request.newGame.users, request.newGame.sheetCount, request.newGame.textCount);
            break;
        case "inviteUser":
            await DataManager.inviteUser(request.gameId, request.username);
            break;
        default:
            throw 'unknown action';
    }
    return [true, false];
}

export function pushStatusToUser(user: Array<string>) {
    console.log(`should push to ${JSON.stringify(user)}`);
    // sends the current status to each connected user in the array
    for (const pair of sessions.entries()) {
        const session: SessionData = pair[1];
        const ws: WebSocket = pair[0];
        if (user.indexOf(session.user.name.toLowerCase()) !== -1) {
            let response: SocketResponse = DataManager.getStatus(session.user);
            if (ws.readyState == WebSocket.OPEN) {
                console.log(`pushing status to ${session.user.name}`);
                try {
                    sendText(ws, null, response);
                } catch (e) {
                    console.log(`caught error while pushing to ${session.user.name}`, e)
                }
            } else {
                console.log(`connection to ${session.user.name} not open`);
            }
        }
    }
}

function sendText(ws: WebSocket, request: SocketRequest, response: SocketResponse, close?: boolean) {
    if (request) {
        response.requestId = request.requestId;
    }

    ws.send(JSON.stringify(response));
    if (close) {
        closeSession(ws);
    }
}

function closeSession(ws: WebSocket) {
    if (sessions.has(ws) && sessions.get(ws).user) {
        console.log("closing session with user " + sessions.get(ws).user.name);
    } else {
        console.log("closing unknown session");
    }
    sessions.delete(ws);
    ws.terminate();
}