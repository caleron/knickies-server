-- Up
ALTER TABLE game_user
  ADD excluded BOOLEAN DEFAULT 0 NOT NULL;

-- Down
CREATE TABLE game_user8e7b
(
  game_id INT,
  user    VARCHAR(50),
  PRIMARY KEY (game_id, user)
);
INSERT INTO game_user8e7b (game_id, user) SELECT
                                            game_id,
                                            user
                                          FROM game_user;
DROP TABLE game_user;
ALTER TABLE game_user8e7b
  RENAME TO game_user;
