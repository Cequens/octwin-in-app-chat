import express from 'express';
import { fileURLToPath } from 'node:url';
import { Webhook } from 'standardwebhooks';
import { signIdentity, appPageUrl } from './identity.js';
import { addDevice, tokensFor } from './devices.js';
import { sendChatPush } from './push.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

// Retries of one alert carry the same webhook-id. We remember the last ids we handled
// and skip repeats. In memory and capped: enough for a sample, because retries come
// within minutes. In production, keep the ids in Redis or your database for a day.
const MAX_REMEMBERED_IDS = 1000;

// Our chat session id for a user. The unread alert sends it back as data.visitor.from.
const FROM_PREFIX = 'user-';

/**
 * The sample server.
 *
 *   POST /chat/session   -> { url, from, identity, identity_sig }  the app opens `url`
 *   POST /chat/identity  -> { from, identity, identity_sig }       for public/simulator.html
 *   POST /devices        <- { userId, token }                      the app's FCM token
 *   POST /octwin/unread  <- the unread-message alert from octwin.ai
 *
 * `sendPush` can be swapped in tests.
 */
export function createApp({
  octwinUrl = 'https://octwin.ai',
  widgetId,
  identitySecret,
  unreadAlertSecret,
  tenantSlug,
  projectSlug,
  sendPush = sendChatPush,
} = {}) {
  const app = express();
  const webhook = unreadAlertSecret ? new Webhook(unreadAlertSecret) : null;
  const handledIds = new Set();

  /**
   * !!! REPLACE THIS WITH YOUR AUTH !!!
   * This sample trusts the userId in the request body, so you can try it with curl.
   * A real server reads the user from its own login session or token. If you keep
   * this, anyone can ask for a chat signed as any of your users.
   */
  function currentUser(req) {
    const userId = String(req.body?.userId ?? '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return null;
    // Load the user from your database here. Add phone and email if you have them:
    // the AI Agent then confirms them instead of asking for them.
    return { id: userId, name: undefined, phone: undefined, email: undefined };
  }

  function signedIdentityFor(user) {
    const from = FROM_PREFIX + user.id;
    const signed = signIdentity(
      { from, phone: user.phone, email: user.email, claims: { customer_id: user.id } },
      identitySecret,
    );
    return { from, ...signed };
  }

  // The app calls this when it opens the chat screen. It also calls it again after an
  // "identity_refused" event, and passes { from, identity, identity_sig } to
  // window.octwin.setIdentity(...) without reloading the page.
  app.post('/chat/session', express.json(), (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'not logged in' });
    const signed = signedIdentityFor(user);
    const url = appPageUrl({ octwinUrl, widgetId, name: user.name, ...signed });
    res.json({ url, ...signed });
  });

  // Same signature, without the URL. public/simulator.html mounts the chat itself.
  app.post('/chat/identity', express.json(), (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'not logged in' });
    res.json(signedIdentityFor(user));
  });

  // The app sends its FCM token after login, and again when Firebase gives it a new one.
  app.post('/devices', express.json(), (req, res) => {
    const user = currentUser(req);
    const token = req.body?.token;
    if (!user || typeof token !== 'string' || token.length === 0) return res.sendStatus(400);
    addDevice(user.id, token);
    res.sendStatus(204);
  });

  // The unread-message alert. octwin.ai calls this when a chat message has waited unseen
  // for a while: 15 seconds by default, 5 to 300 seconds in the console.
  // express.raw keeps the body as bytes: the signature is over the exact body, so we
  // must check it BEFORE anything parses the JSON.
  app.post('/octwin/unread', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!webhook) {
      console.error('[unread] UNREAD_ALERT_SECRET is not set');
      return res.sendStatus(500);
    }

    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    let event;
    try {
      // Checks webhook-signature over webhook-id + webhook-timestamp + body, and
      // refuses a timestamp more than 5 minutes old. Returns the parsed JSON.
      event = webhook.verify(raw, req.headers);
    } catch (err) {
      console.warn(`[unread] refused: ${err.message}`);
      return res.sendStatus(401);
    }

    const id = req.get('webhook-id');
    if (handledIds.has(id)) {
      console.log(`[unread] ${id} already handled, skipping the retry`);
      return res.sendStatus(204);
    }
    if (event?.type !== 'message.unread') return res.sendStatus(204); // not a type we handle

    const { data } = event;
    if (data.test) console.log('[unread] TEST alert from the octwin console ("Send test")');
    console.log(`[unread] ${data.unread_count} unread for ${data.visitor?.from} in ${data.conversation_id}`);

    const from = data.visitor?.from ?? '';
    const tokens = from.startsWith(FROM_PREFIX) ? tokensFor(from.slice(FROM_PREFIX.length)) : [];
    remember(id); // before the await, so a retry that arrives meanwhile is skipped
    if (tokens.length === 0) {
      console.log(`[unread] no phone registered for ${from}; no push sent`);
      return res.sendStatus(204);
    }

    // Answer fast. One push call is quick; never do slow work before you answer.
    try {
      await sendPush({ tokens, conversationId: data.conversation_id, preview: data.preview });
    } catch (err) {
      // Firebase is down or the credentials are wrong. Forget the id and answer 503:
      // octwin.ai sends the same alert again later.
      handledIds.delete(id);
      console.error(`[unread] push failed: ${err.message}`);
      return res.sendStatus(503);
    }
    res.sendStatus(204);
  });

  function remember(id) {
    handledIds.add(id);
    // A Set keeps insertion order, so the first value is the oldest one.
    if (handledIds.size > MAX_REMEMBERED_IDS) handledIds.delete(handledIds.values().next().value);
  }

  // Public values only, for public/simulator.html. No secret goes in here.
  app.get('/simulator-config.json', (req, res) => {
    res.json({ octwinUrl, widgetId, tenantSlug, projectSlug });
  });
  app.get('/', (req, res) => res.redirect('/simulator.html'));
  app.use(express.static(PUBLIC_DIR));

  return app;
}
