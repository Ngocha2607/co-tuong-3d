// worker/elo.js — rating for ranked games. Plain Elo: a new player moves fast (K 40 for the first 20 games),
// then settles (K 20, K 10 above 2100). Ratings are whole numbers; each side uses its own K.
export const START = 1200;
export const PROVISIONAL = 10;          // games needed before a player shows on the leaderboard (also hard-coded in api.js SQL)

export const kFactor = (rating, games) => games < 20 ? 40 : rating < 2100 ? 20 : 10;
export const expected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));

// red, black: { rating, games } before the game; winner: 1 Red, -1 Black, 0 draw → rating change of each side
export function rate(red, black, winner) {
  const s = winner === 1 ? 1 : winner === -1 ? 0 : 0.5, e = expected(red.rating, black.rating);
  return {
    red: Math.round(kFactor(red.rating, red.games) * (s - e)),
    black: Math.round(kFactor(black.rating, black.games) * (e - s)),
  };
}

// ranked queue: two seekers may be paired if their ratings are within both of their windows, which start at ±100
// points and widen by 20 points for each second waited, so nobody waits long when few people are online
export const windowOf = (since, now) => 100 + 20 * (now - since) / 1000;
export const fits = (a, b, now) => a.user.id !== b.user.id
  && Math.abs(a.user.rating - b.user.rating) <= Math.min(windowOf(a.since, now), windowOf(b.since, now));
