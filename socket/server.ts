import * as WebSocket from "ws";
import * as http from "http";
import {SocketRequest, SocketResponse, User} from "./types";
import {DataManager} from "./data";
import * as crypto from 'crypto'

let wss: WebSocket.Server;

let sessions: Map<WebSocket, SessionData> = new Map();

export function initWebSocketServer(http) {
    wss = new WebSocket.Server(http);

    wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
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

function processMessage(request: SocketRequest, session: SessionData, ws: WebSocket) {
    handleRequest(request, session, ws).then(([sendResponse, sendToken]) => {
        if (!sendResponse) {
            return
        }
        // just send the whole state on success
        // TODO
        sendText(ws, request, {
            requestId: request.requestId,
            token: sendToken ? session.user.token : undefined,
            runningGames: [],
            closedGames: [],
            users: []
        } as SocketResponse);
    }).catch(reason => {
        sendText(ws, request, {
            error: reason,
            requestId: request.requestId
        });
    });
}


async function handleRequest(request: SocketRequest, session: SessionData, ws: WebSocket): Promise<[boolean, boolean]> {
    if (request.action == 'login') {
        let user: User;
        if (request.token && request.token.length > 5) {
            user = DataManager.findUserByToken(request.token);
            if (!user) {
                throw  'invalid token'
            }
        } else {
            user = DataManager.findUserByName(request.username);
            if (!user) {
                throw 'unknown user'
            } else if (user.password != request.password) {
                throw 'wrong password'
            }
        }

        // login is valid when user is not null here
        session.isLoggedIn = true;
        session.user = user;
        user.token = crypto.randomBytes(20).toString('hex');

        return [true, true];
    } else if (!session.isLoggedIn) {
        // close session if neither logged in nor action is login
        sendText(ws, request, {
            error: 'not logged in',
            requestId: request.requestId
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
        case "register":
            await DataManager.register(request.username, request.password);
            break;
    }
    return [true, false];
}

function sendText(ws: WebSocket, request: SocketRequest, response: SocketResponse) {
    response.requestId = request.requestId;

    ws.send(JSON.stringify(response));
}

function closeSession(ws: WebSocket) {
    sessions.delete(ws);
    ws.terminate();
}

interface SessionData {
    isAlive: boolean
    isLoggedIn: boolean
    user: User
}