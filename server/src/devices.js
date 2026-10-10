/**
 * Which phones belong to which user: userId -> Set of FCM tokens.
 *
 * This lives in memory, so it is empty after every restart.
 * Use your database in a real app.
 */
const tokensByUser = new Map();

export function addDevice(userId, token) {
  const tokens = tokensByUser.get(userId) ?? new Set();
  tokens.add(token);
  tokensByUser.set(userId, tokens);
}

export function tokensFor(userId) {
  return [...(tokensByUser.get(userId) ?? [])];
}

/** Forget a token Firebase says is dead (the app was removed, or the token changed). */
export function forgetToken(token) {
  for (const [userId, tokens] of tokensByUser) {
    tokens.delete(token);
    if (tokens.size === 0) tokensByUser.delete(userId);
  }
}
