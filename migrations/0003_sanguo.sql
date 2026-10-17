-- Tam Quốc (three-kingdom) ranked play: a rating of its own beside the ordinary one, and its games.
ALTER TABLE users ADD COLUMN sg_rating INTEGER NOT NULL DEFAULT 1200;
ALTER TABLE users ADD COLUMN sg_games INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN sg_wins INTEGER NOT NULL DEFAULT 0;     -- united the realm alone
ALTER TABLE users ADD COLUMN sg_draws INTEGER NOT NULL DEFAULT 0;    -- still standing when the game was drawn
ALTER TABLE users ADD COLUMN sg_losses INTEGER NOT NULL DEFAULT 0;   -- fell
-- the Tam Quốc leaderboard lists players with at least 10 ranked games, like the other one
CREATE INDEX users_sg_board ON users (sg_rating DESC) WHERE sg_games >= 10;

CREATE TABLE sg_games (
  id INTEGER PRIMARY KEY,
  room TEXT NOT NULL UNIQUE,              -- one ranked game per room: a retried write cannot count twice
  p0 INTEGER NOT NULL REFERENCES users (id),   -- Shu, Wu, Wei
  p1 INTEGER NOT NULL REFERENCES users (id),
  p2 INTEGER NOT NULL REFERENCES users (id),
  place0 INTEGER NOT NULL,                -- 1 first .. 3 last; those still standing at a draw share first place
  place1 INTEGER NOT NULL,
  place2 INTEGER NOT NULL,
  reason TEXT NOT NULL,                   -- unite, repetition, quiet
  plies INTEGER NOT NULL,
  rating0 INTEGER NOT NULL,               -- Tam Quốc ratings before the game
  rating1 INTEGER NOT NULL,
  rating2 INTEGER NOT NULL,
  delta0 INTEGER NOT NULL,
  delta1 INTEGER NOT NULL,
  delta2 INTEGER NOT NULL,
  ended_at INTEGER NOT NULL
);
CREATE INDEX sg_games_p0 ON sg_games (p0, ended_at DESC);
CREATE INDEX sg_games_p1 ON sg_games (p1, ended_at DESC);
CREATE INDEX sg_games_p2 ON sg_games (p2, ended_at DESC);
