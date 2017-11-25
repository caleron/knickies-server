-- Up
CREATE TABLE users (
  name     VARCHAR(50) PRIMARY KEY,
  password VARCHAR(10),
  token    VARCHAR(100)
);

CREATE TABLE games (
  id          INT PRIMARY KEY AUTOINCREMENT,
  name        VARCHAR(50),
  running     BOOLEAN,
  creator     VARCHAR(50),
  sheet_count INT,
  text_count  INT
);

CREATE TABLE game_user (
  game_id INT,
  user    VARCHAR(50),
  PRIMARY KEY (game_id, user)
);

CREATE TABLE sheets (
  id      INT PRIMARY KEY AUTOINCREMENT,
  game_id INT,
  number  INT
);

CREATE TABLE sheet_text (
  id       INT PRIMARY KEY AUTOINCREMENT,
  sheet_id INT,
  creator  VARCHAR(50),
  text     VARCHAR(500)
);

-- Down
DROP TABLE users;
DROP TABLE games;
DROP TABLE game_user;
DROP TABLE sheets;
DROP TABLE sheet_text;