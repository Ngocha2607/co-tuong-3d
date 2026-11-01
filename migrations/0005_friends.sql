-- Friends: a request waits for the other player's yes; then each sees whether the other is online and may challenge
-- them. One row per direction: (a, b, 0) a asked b and waits; once accepted, (a, b, 1) and (b, a, 1).
CREATE TABLE friends (
  user_id INTEGER NOT NULL REFERENCES users (id),
  friend_id INTEGER NOT NULL REFERENCES users (id),
  state INTEGER NOT NULL,                 -- 0 asked, waiting for friend_id; 1 friends
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE INDEX friends_asked ON friends (friend_id, state);   -- the requests waiting for a player
-- finding a player by name, to ask them
CREATE INDEX users_name ON users (name COLLATE NOCASE);
