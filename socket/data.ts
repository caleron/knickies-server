import {Game, SessionData, Sheet, SocketResponse, User} from "./types";
import {Database, SqliteDb} from '../custom-types/sqlite'
import * as crypto from 'crypto'
import {pushStatusToUser} from "./server";
import moment = require("moment");

let sqlite: SqliteDb = require('sqlite');

class Manager {
    users: Map<string, User> = new Map();
    games: Map<number, Game> = new Map();
    db: Database;

    async init() {
        console.log("loading data");
        this.db = await sqlite.open('./data.sqlite');
        let db: Database = this.db;
        await db.migrate({});

        // load all users
        // language=SQLite
        let users = await db.all('SELECT name, password, token FROM users');
        for (let user of users) {
            user.games = [];
            this.users.set(user.name.toLowerCase(), user);
        }

        // load all games
        // language=SQLite
        let games = await db.all(`SELECT
                                    id,
                                    name,
                                    running,
                                    creator,
                                    sheet_count AS sheetCount,
                                    text_count  AS textCount,
                                    closed_time AS closedTime
                                  FROM games
                                  ORDER BY closed_time`);
        for (let game of games) {
            game.users = [];
            game.sheets = [];
            game.closedTime = moment(game.closedTime);
            this.games.set(game.id, game);
        }

        // load table game_user
        // language=SQLite
        let gameUser: Array<{ game_id: number, user: string }> = await db.all('SELECT game_id, user FROM game_user');
        for (let entry of gameUser) {
            if (this.games.get(entry.game_id)) {
                this.games.get(entry.game_id).users.push(entry.user);
            } else {
                console.log(`cant find game ${entry.game_id}`);
            }
            if (this.users.get(entry.user)) {
                this.users.get(entry.user).games.push(this.games.get(entry.game_id));
            } else {
                console.log(`cant find user ${entry.user}`);
            }
        }

        // load the sheets
        // maps game id to the list of sheets
        let sheets: Map<number, Array<Sheet>> = new Map();
        // language=SQLite
        await db.each('SELECT game_id AS gameId, number FROM sheets', (err, row) => {
            if (!sheets.has(row.gameId)) {
                sheets.set(row.gameId, []);
            }
            sheets.get(row.gameId).push({
                gameId: row.gameId,
                number: row.number,
                texts: [],
                nextUser: '',
                assignTime: 0
            });
        });

        // load the texts of the sheets
        // language=SQLite
        await db.each('SELECT id, sheet_number, creator, text, game_id AS gameId FROM sheet_text ORDER BY id ASC', (err, row) => {
            sheets.get(row.gameId)[row.sheet_number].texts.push({
                creator: row.creator,
                text: row.text
            })
        });

        // finally assign the sheets to the games
        for (let gameSheets of sheets.values()) {
            for (let sheet of gameSheets) {
                this.games.get(sheet.gameId).sheets.push(sheet);
            }
        }
        for (let game of this.games.values()) {
            await this.checkGameFinished(game);
            if (game.running)
                Manager.assignNextTextCreator(game)
        }
        console.log("loading finished");

        // execute every 10 mins
        setInterval(this.checkAssignTimes.bind(this), 10 * 60 * 1000)
    }

    findUserByName(name: string): User {
        return this.users.get(name.toLowerCase())
    }

    findUserByToken(token: string): User {
        for (let user of this.users.values()) {
            if (user.token == token) {
                return user;
            }
        }
    }

    async login(session: SessionData, username: string, password: string, token: string): Promise<void> {
        let user: User;
        if (token && token.length > 5) {
            user = this.findUserByToken(token);
            if (!user) {
                throw  'invalid token'
            }
        } else {
            user = this.findUserByName(username);
            if (!user) {
                throw 'unknown user'
            } else if (user.password != password) {
                throw 'wrong password'
            }
        }

        // login is valid when user is not null here
        session.isLoggedIn = true;
        session.user = user;
        if (!(token && token.length > 5)) {
            // only generate new token if necessary
            user.token = crypto.randomBytes(20).toString('hex');
            // language=SQLite
            await this.db.run('UPDATE users SET token = ? WHERE name = ?;', user.token, user.name);
        }
        console.log(`login successful for user ${user.name}`);
    }

    async register(name: string, password: string, session: SessionData): Promise<string> {
        let newUser: User = {
            games: [],
            token: crypto.randomBytes(20).toString('hex'),
            name,
            password
        };
        if (this.users.has(name.toLowerCase())) {
            throw 'user already exists'
        }
        // insert the new user
        // language=SQLite
        await this.db.run('INSERT INTO users (name, password, token) VALUES (?,?,?)', newUser.name, newUser.password, newUser.token);

        this.users.set(name.toLowerCase(), newUser);
        session.isLoggedIn = true;
        session.user = newUser;
        return newUser.token;
    }

    async createGame(name: string, creator: string, users: Array<string>, sheetCount: number, textCount: number): Promise<Game> {
        // lower case all names
        users = users.map(value => value.toLowerCase());
        creator = creator.toLowerCase();

        if (!users || !Array.isArray(users)) {
            throw 'invalid users'
        }
        // add the creator of the game if missing
        if (users.indexOf(creator) === -1) {
            users.push(creator);
        }
        // throw some errors
        if (sheetCount < 1) {
            throw 'minimum 1 sheet'
        }
        if (textCount < 5) {
            throw 'minimum 5 texts per sheet'
        }
        if (!users || !Array.isArray(users) || users.length < 2) {
            throw 'minimum 2 users required'
        }

        let newGame: Game = {
            name,
            creator,
            sheetCount,
            textCount,
            users,
            running: true,
            sheets: []
        };
        // insert the new game
        // language=SQLite
        let res = await this.db.run(`INSERT INTO games (name, running, creator, sheet_count, text_count)
        VALUES (?, ?, ?, ?, ?)`, name, true, creator, sheetCount, textCount);

        newGame.id = res.lastID;

        // insert the game users
        // language=SQLite
        let stmt = await this.db.prepare('INSERT INTO game_user (game_id, user) VALUES (?,?)');
        for (let user of users) {
            await stmt.run(newGame.id, user);
        }
        await stmt.finalize();

        // insert the sheets
        // language=SQLite
        stmt = await this.db.prepare('INSERT INTO sheets (game_id, number) VALUES (?,?)');
        for (let i = 0; i < sheetCount; i++) {
            await stmt.run(newGame.id, i);
            // add the empty sheets also to the game
            newGame.sheets.push({
                number: i,
                gameId: newGame.id,
                texts: [],
                nextUser: '',
                assignTime: 0
            });
        }
        await stmt.finalize();

        // finally add the new game to the map and return it
        this.games.set(res.lastID, newGame);
        Manager.assignNextTextCreator(newGame);
        // also push status to new users
        pushStatusToUser(newGame.users);
        return newGame;
    }

    async inviteUser(gameId: number, users: Array<string>) {
        let game = this.games.get(gameId);
        for (let user of users) {
            user = user.toLowerCase();
            if (user != null && game.users.indexOf(user) === -1) {
                game.users.push(user);
                // language=SQLite
                await this.db.run('INSERT INTO game_user (game_id, user) VALUES (?,?)', gameId, user);
            }
        }
    }

    async addText(creator: string, gameId: number, sheetNumber: number, text: string): Promise<void> {
        creator = creator.toLowerCase();

        if (!this.games.has(gameId)) {
            throw "unknown game id";
        }

        let game = this.games.get(gameId);
        if (game.sheets.length <= sheetNumber) {
            throw 'sheet number too big';
        }

        let sheet = game.sheets[sheetNumber];
        if (sheet.nextUser != creator) {
            throw 'not the users turn'
        }

        // reset immediately to prevent double-inserted messages while sqlite queries
        sheet.nextUser = '';

        sheet.texts.push({
            creator,
            text
        });

        // language=SQLite
        await this.db.run('INSERT INTO sheet_text (game_id, sheet_number, creator, text) VALUES (?,?,?,?)',
            gameId, sheetNumber, creator, text);

        await this.checkGameFinished(game);

        let users = Manager.assignNextTextCreator(game, sheet);
        pushStatusToUser(users);
    }

    async checkGameFinished(game: Game) {
        if (!game.running)
            return;

        // check if game is finished
        let allFinished = true;
        for (const sheet of game.sheets) {
            if (sheet.texts.length < game.textCount) {
                allFinished = false;
                break;
            }
        }

        if (allFinished) {
            console.log(`game ${game.id} finished`);
            game.running = false;
            let now = moment().format("YYYY-MM-DD HH:mm:ss");
            // language=SQLite
            await this.db.run('UPDATE games SET running = 0, closed_time = ? WHERE id = ?', now, game.id);
        }
    }

    /**
     *
     * @param {Game} game
     * @param {Sheet} sheet
     * @returns {Array<string>} the users which were assigned to a sheet
     */
    static assignNextTextCreator(game: Game, sheet?: Sheet): Array<string> {
        let sheets: Array<Sheet> = sheet ? [sheet] : game.sheets;
        let pushUsers: Array<string> = [];
        let freshGame: boolean = true;
        for (const sheet of sheets) {
            if (sheet.texts.length !== 0) {
                freshGame = false;
                break;
            }
        }
        if (freshGame) {
            console.log(`game ${game.id} is fresh`);
            // on a fresh game, assign the next users evenly, not randomly
            for (let i = 0; i < sheets.length; i++) {
                const sheet = sheets[i];
                sheet.nextUser = game.users[i % game.users.length];
                pushUsers.push(sheet.nextUser);
                console.log(`game ${game.id}: chose user ${sheet.nextUser} out of ${game.users.length} users`)
            }
            return;
        }

        for (const sheet of sheets) {
            if (sheet.texts.length >= game.textCount) {
                sheet.nextUser = '';
                console.log(`sheet ${sheet.number} of game ${game.id} finished`);
                continue;
            }

            let userTextCount: Map<string, number> = new Map();
            // init counter with 0
            for (let user of game.users) {
                userTextCount.set(user, 0);
            }

            for (let text of sheet.texts) {
                // count the number of texts each user has written
                userTextCount.set(text.creator, userTextCount.get(text.creator) + 1);
            }

            // remove creator of last text from possible candidates
            if (sheet.texts.length > 0) {
                let lastText = sheet.texts[sheet.texts.length - 1];
                userTextCount.delete(lastText.creator);
            }

            // remove also the creator of the text before the last text if more than 2 users are in the game
            if (sheet.texts.length > 1 && game.users.length > 2) {
                let prevLastText = sheet.texts[sheet.texts.length - 2];
                userTextCount.delete(prevLastText.creator);
            }

            // remove also the last assigned creator (only available if assignTime is more than 24 hours ago)
            if (sheet.nextUser && sheet.nextUser.length > 0 && userTextCount.size > 0) {
                userTextCount.delete(sheet.nextUser);
            }

            // find the least text counts
            let minAmount: number = 10000000;
            for (const count of userTextCount.values()) {
                if (minAmount > count) {
                    minAmount = count
                }
            }

            // find the candidates with the least text counts
            let candidates: Array<string> = [];
            for (const entry of userTextCount.entries()) {
                if (entry[1] == minAmount) {
                    candidates.push(entry[0]);
                }
            }
            //finally determine the next text creator
            let candidateIndex = getRandomInt(0, candidates.length - 1);
            sheet.nextUser = candidates[candidateIndex];
            sheet.assignTime = new Date().getTime();
            pushUsers.push(sheet.nextUser);
            console.log(`game ${game.id}: chose user ${sheet.nextUser} out of ${candidates.length} candidates`)
        }
        return pushUsers;
    }

    getStatus(user: User): SocketResponse {
        let response: SocketResponse = {
            users: [],
            closedGames: [],
            runningGames: [],
            currentUser: user.name
        };
        let username: string = user.name.toLowerCase();
        this.users.forEach((value: User) => response.users.push(value.name));

        // collect all running and closed games for the user
        for (const game of this.games.values()) {
            if (game.creator == username || game.users.indexOf(username) !== -1) {
                if (game.running) {
                    response.runningGames.push(game);
                } else {
                    response.closedGames.push(game)
                }
            }
        }

        return response;
    }

    checkAssignTimes() {
        console.log("checking for timed-out user assignments");
        let hours24Ago: number = new Date().getTime() - (24 * 60 * 60 * 1000);
        for (let game of this.games.values()) {
            if (game.running) {
                for (let sheet of game.sheets) {
                    if (sheet.assignTime < hours24Ago) {
                        console.log(`game ${game.id} sheet ${sheet.number}: user ${sheet.nextUser} expired`);
                        Manager.assignNextTextCreator(game, sheet)
                    }
                }
            }
        }
    }
}

/**
 * from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
 */
function getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export let DataManager = new Manager();
