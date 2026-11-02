-- Tournaments between friends (src/bracket.js, worker/tournament.js): a host opens one, friends join by its link,
-- the host draws the bracket and each match is played in a room of its own.
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,                    -- 6 letters and digits, in the link ?giai=
  name TEXT NOT NULL,
  host INTEGER NOT NULL REFERENCES users (id),
  tc TEXT NOT NULL,                       -- each game's time: '10+5' or '5+3'
  data TEXT NOT NULL,                     -- the players and the bracket, as JSON
  ver INTEGER NOT NULL DEFAULT 0,         -- raised on every write, so two results arriving together both count
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- who is in which, for each player's list of tournaments
CREATE TABLE tournament_players (
  tid TEXT NOT NULL REFERENCES tournaments (id),
  user_id INTEGER NOT NULL REFERENCES users (id),
  PRIMARY KEY (tid, user_id)
);
CREATE INDEX tournament_players_user ON tournament_players (user_id);
