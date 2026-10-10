import { createHmac } from 'node:crypto';

/**
 * Tell octwin.ai who the user is, in a way the app cannot fake.
 *
 * Your server builds a small JSON string and signs it with the identity secret
 * (octwin console -> Channels -> web widget -> Identity verification).
 * The app only carries the string and the signature. It never sees the secret.
 *
 * octwin.ai checks the signature over the EXACT string it receives, so we sign the
 * string itself. Never parse it and build it again before sending: a different key
 * order or spacing gives a different string, and the signature no longer matches.
 *
 * Returns { identity, identity_sig }.
 */
export function signIdentity({ from, phone, email, claims, ttlSeconds = 3600 }, secret) {
  if (!from) throw new Error('signIdentity: "from" is required');
  if (!secret) throw new Error('signIdentity: the identity secret is missing (IDENTITY_SECRET)');

  // Key order here is only for readability. It does not matter, because we sign the
  // string we send.
  const payload = { from };
  if (phone) payload.phone = phone; // E.164, for example +201234567890
  if (email) payload.email = email;
  if (claims) payload.claims = claims; // flat: { customer_id: '123' }
  // When the signature stops being valid, in unix seconds. Keep it short. The page
  // tells the app when it needs a new one (the "identity_refused" event).
  payload.exp = Math.floor(Date.now() / 1000) + ttlSeconds;

  const identity = JSON.stringify(payload);
  const identity_sig = createHmac('sha256', secret).update(identity, 'utf8').digest('base64url');
  return { identity, identity_sig };
}

/**
 * The address the app opens in its WebView:
 *
 *   https://octwin.ai/c/app/<widgetId>#from=...&identity=...&identity_sig=...
 *
 * Everything after "#" is the fragment. A browser never sends the fragment to a
 * server, so the signed identity does not land in any server or proxy log.
 *
 * Each value is encoded with encodeURIComponent, because the page decodes it with
 * decodeURIComponent. Do NOT use URLSearchParams here: it writes a space as "+",
 * and the page would then read the "+" in "+201234567890" as a space.
 */
export function appPageUrl({ octwinUrl, widgetId, from, identity, identity_sig, name, active }) {
  if (!octwinUrl || !widgetId) throw new Error('appPageUrl: octwinUrl and widgetId are required');

  const parts = [
    ['from', from],
    ['identity', identity],
    ['identity_sig', identity_sig],
  ];
  if (name) parts.push(['name', name]); // the name shown in the chat
  if (active !== undefined) parts.push(['active', active ? '1' : '0']); // false = start hidden

  const fragment = parts.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  const base = octwinUrl.replace(/\/+$/, '');
  return `${base}/c/app/${encodeURIComponent(widgetId)}#${fragment}`;
}
