import {Moment} from "moment";

export interface SocketRequest {
    action: 'login' | 'register' | 'createGame' | 'inviteUser' | 'addText' | 'setGameName' | 'excludeUser'
    username?: string
    password?: string
    token?: string
    newGame?: Game
    gameId?: number
    sheetNumber?: number
    text?: string
    requestId?: number
    users: Array<string>
    name?: string
    force: boolean
}

export interface SocketResponse {
    currentUser?: string
    error?: string
    token?: string
    requestId?: number
    users?: Array<string>
    runningGames?: Array<Game>
    closedGames?: Array<Game>
}

export interface Game {
    id?: number
    name: string
    running?: boolean
    users: Array<string>
    expiredUsers?: Array<string>
    closedTime?: Moment
    creator?: string
    sheetCount: number
    textCount: number
    sheets?: Array<Sheet>
}

export interface Sheet {
    gameId: number
    number: number
    nextUser: string
    assignTime: number
    texts: Array<SheetText>
}

export interface SheetText {
    creator: string
    text: string
}

export interface User {
    name: string
    password: string
    token: string
    games: Array<Game>
}

export interface SessionData {
    isAlive: boolean
    isLoggedIn: boolean
    user: User
}