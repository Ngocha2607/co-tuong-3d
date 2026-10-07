-- Players signed in with Google, and the ranked games between them.
-- Only Google's stable account id (sub) is kept: no e-mail, no photo. `name` is the nickname shown to others.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1200,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
-- the leaderboard lists players with at least 10 ranked games (PROVISIONAL in worker/elo.js)
CREATE INDEX users_board ON users (rating DESC) WHERE games >= 10;

CREATE TABLE games (
  id INTEGER PRIMARY KEY,
  room TEXT NOT NULL UNIQUE,              -- one ranked game per room: a retried write cannot count twice
  red INTEGER NOT NULL REFERENCES users (id),
  black INTEGER NOT NULL REFERENCES users (id),
  winner INTEGER NOT NULL,                -- 1 Red, -1 Black, 0 draw
  reason TEXT NOT NULL,
  plies INTEGER NOT NULL,
  red_rating INTEGER NOT NULL,            -- ratings before the game
  black_rating INTEGER NOT NULL,
  red_delta INTEGER NOT NULL,
  black_delta INTEGER NOT NULL,
  ended_at INTEGER NOT NULL
);
CREATE INDEX games_red ON games (red, ended_at DESC);
CREATE INDEX games_black ON games (black, ended_at DESC);
