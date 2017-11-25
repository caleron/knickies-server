export interface SocketRequest {
    action: 'login' | 'register' | 'createGame' | 'inviteUser' | 'addText'
    username?: string
    password?: string
    token?: string
    newGame?: Game
    gameId?: number
    sheetId?: number
    text?: string
    requestId: number
}

export interface SocketResponse {
    error: string
    token?: string
    requestId?: number
    users: Array<string>
    runningGames: Array<Game>
    closedGames: Array<Game>
}

export interface Game {
    id?: number
    name: string
    running?: boolean
    users: Array<string>
    creator?: string
    sheetCount: number
    textCount: number
    sheets?: Array<Sheet>
}

export interface Sheet {
    id: number
    gameId: number
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