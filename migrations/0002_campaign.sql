-- Campaign progress of signed-in players, and the title each one shows.
-- A battle's row keeps the best result: its stars, and the moves that won them (replayed by the Worker before saving).
CREATE TABLE campaign (
  user_id INTEGER NOT NULL REFERENCES users (id),
  level TEXT NOT NULL,                    -- id from src/campaign.js, e.g. '2-1'
  stars INTEGER NOT NULL,                 -- 1..3
  moves TEXT NOT NULL,                    -- the winning game, comma-separated moves
  help INTEGER NOT NULL DEFAULT 0,        -- undo or hints were used
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, level)
);

-- the title shown beside the name ('' = none); only titles the campaign has earned are accepted
ALTER TABLE users ADD COLUMN title TEXT NOT NULL DEFAULT '';

-- the hero and stage last picked, so they follow the player to another device (NULL = never saved;
-- '' as hero = the plain general). Heroes and stages the campaign gives are accepted only once earned.
ALTER TABLE users ADD COLUMN hero TEXT;
ALTER TABLE users ADD COLUMN stage TEXT;
