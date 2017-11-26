-- Up
CREATE TABLE game_user
(
  game_id INT,
  user    VARCHAR(50),
  PRIMARY KEY (game_id, user)
);

CREATE TABLE games
(
  id          INTEGER PRIMARY KEY  AUTOINCREMENT,
  name        VARCHAR(50),
  running     BOOLEAN,
  creator     VARCHAR(50),
  sheet_count INT,
  text_count  INT,
  closed_time DATETIME
);

CREATE TABLE sheet_text
(
  id           INTEGER PRIMARY KEY  AUTOINCREMENT,
  sheet_number INT,
  creator      VARCHAR(50),
  text         VARCHAR(500),
  game_id      INT
);

CREATE TABLE sheets
(
  game_id INT,
  number  INT,
  CONSTRAINT sheets_game_id_number_pk
  PRIMARY KEY (game_id, number)
);

CREATE TABLE users
(
  name     VARCHAR(50) PRIMARY KEY,
  password VARCHAR(10),
  token    VARCHAR(100)
);

-- Down
DROP TABLE users;
DROP TABLE games;
DROP TABLE game_user;
DROP TABLE sheets;
DROP TABLE sheet_text;