-- The moves of each ranked game, so it can be watched again and analysed (NULL for games played before this).
ALTER TABLE games ADD COLUMN moves TEXT;                 -- comma-separated moves, as the room kept them

-- The daily puzzle (src/daily.js): each player's first solution of a day's puzzle, replayed by the Worker before
-- it is saved. ms: from when they first opened that day's puzzle (a token the Worker signed) to the mate.
CREATE TABLE daily (
  user_id INTEGER NOT NULL REFERENCES users (id),
  day INTEGER NOT NULL,                   -- days since 1970 in Vietnam's time (DAILY.dayOf)
  ms INTEGER NOT NULL,
  tries INTEGER NOT NULL,                 -- attempts before the one that worked, plus one
  help INTEGER NOT NULL DEFAULT 0,        -- undo or hints were used: solved, but not on the board of the fastest
  moves TEXT NOT NULL,
  solved_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX daily_board ON daily (day, help, ms);
