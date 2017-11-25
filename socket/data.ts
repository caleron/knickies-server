import {Game, Sheet, User} from "./types";
import {Database, SqliteDb} from '../custom-types/sqlite'

let sqlite: SqliteDb = require('sqlite');

class Manager {
    users: Map<string, User> = new Map();
    games: Map<number, Game> = new Map();
    db: SqliteDb.Database;

    async init() {
        this.db = await sqlite.open('./data.db');
        let db: Database = this.db;
        await db.migrate({});

        // load all users
        let users = await db.all('SELECT name, password, token FROM users');
        for (let user of users) {
            this.users.set(user.name, user);
        }

        // load all games
        let games = await db.all('SELECT id, name, running, creator, sheet_count as sheetCount, text_count as textCount from games');
        for (let game of games) {
            game.users = [];
            game.sheets = [];
            this.games.set(game.id, game);
        }

        // load table game_user
        let gameUser: Array<{ game_id: number, user: string }> = await db.all('SELECT game_id, user FROM game_user');
        for (let entry of gameUser) {
            this.games.get(entry.game_id).users.push(entry.user);
            this.users.get(entry.user).games.push(this.games.get(entry.game_id));
        }

        // load the sheets
        let sheets: Map<number, Sheet> = new Map();
        await db.each('SELECT id, game_id as gameId FROM sheets', (err, row) => {
            sheets.set(row.id, {
                id: row.id,
                gameId: row.gameId,
                texts: []
            });
        });

        // load the texts of the sheets
        await db.each('SELECT id, sheet_id, creator, text FROM sheet_text', (err, row) => {
            sheets.get(row.sheet_id).texts.push({
                creator: row.creator,
                text: row.text
            })
        });

        // finally assign the sheets to the games
        for (let sheet of sheets.values()) {
            this.games.get(sheet.gameId).sheets.push(sheet);
        }
    }

    findUserByName(name: string): User {
        name = name.toLowerCase();
        for (let user of this.users) {
            if (user.name.toLowerCase() == name) {
                return user;
            }
        }
    }

    findUserByToken(token: string): User {
        for (let user of this.users) {
            if (user.token == token) {
                return user;
            }
        }
    }
}

export let DataManager = new Manager();
