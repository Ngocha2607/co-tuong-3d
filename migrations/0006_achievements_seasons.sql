-- Achievements (src/achievements.js): what each player has earned, and when.
CREATE TABLE achievements (
  user_id INTEGER NOT NULL REFERENCES users (id),
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Ranked seasons (src/seasons.js): the boards count each season's games. The games so far count for the first season.
ALTER TABLE users ADD COLUMN season_games INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN sg_season_games INTEGER NOT NULL DEFAULT 0;
UPDATE users SET season_games = games, sg_season_games = sg_games;
CREATE INDEX users_season_board ON users (rating DESC) WHERE season_games >= 10;
CREATE INDEX users_sg_season_board ON users (sg_rating DESC) WHERE sg_season_games >= 10;

-- each season's final boards (the first hundred of each), kept when it ends; the top ten wear a title for it
CREATE TABLE season_results (
  season INTEGER NOT NULL,
  v TEXT NOT NULL,                        -- 'xq' cờ tướng, 'sg' Tam Quốc
  user_id INTEGER NOT NULL REFERENCES users (id),
  rank INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  games INTEGER NOT NULL,
  PRIMARY KEY (season, v, user_id)
);
CREATE INDEX season_results_user ON season_results (user_id, season);

-- small facts the Worker keeps: 'season' = the last season it has closed and started afresh after
CREATE TABLE meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
