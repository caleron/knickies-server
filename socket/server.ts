import * as WebSocket from "ws";
import * as http from "http";
import {SocketRequest, SocketResponse, User} from "./types";
import {DataManager} from "./data";
import crypto from 'crypto'

let wss: WebSocket.Server;

let sessions: Map<WebSocket, SessionData> = new Map();

export function initWebSocketServer(http) {
    wss = new WebSocket.Server(http);

    wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
        sessions.set(ws, {
            isAlive: true,
            isLoggedIn: false,
            user: ''
        });

        ws.on('message', (message: WebSocket.Data) => {
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


function handleRequest(request: SocketRequest, session: SessionData, ws: WebSocket): void {
    if (request.action == 'login') {
        let user: User;
        let errorMessage: string;
        if (request.token && request.token.length > 5) {
            user = DataManager.findUserByToken(request.token);
            if (!user) {
                errorMessage = 'invalid token'
            }
        } else {
            user = DataManager.findUserByName(request.username);
            if (!user) {
                errorMessage = 'unknown user'
            } else if (user.password != request.password) {
                user = null;
                errorMessage = 'wrong password'
            }
        }

        if (user == null) {
            // send error response and terminate the connection
            sendText(ws, request, {
                    error: errorMessage,
                    requestId: request.requestId
                } as SocketResponse
            );
            return closeSession(ws);
        } else {
            // login is valid when user is not null here
            session.isLoggedIn = true;
            session.user = user.name;
            user.token = crypto.randomBytes(20).toString('hex');

            sendText(ws, request, {
                requestId: request.requestId,
                token: user.token,
                runningGames: [],
                closedGames: [],
                users: []
            } as SocketResponse);

        }
        return;
    } else if (!session.isLoggedIn) {
        // close session if neither logged in nor action is login
        sendText(ws, request, {
            error: 'not logged in',
            requestId: request.requestId
        } as SocketResponse);
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
    user: string
}