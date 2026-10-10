import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Webhook } from 'standardwebhooks';
import { createApp } from '../src/app.js';

// Log pushes instead of sending them. No Firebase in tests.
process.env.DRY_RUN = '1';

const SECRET = 'whsec_' + randomBytes(24).toString('base64');
const CONVERSATION_ID = 'c0ffee00-0000-4000-8000-000000000001';

/** Start an app on a free port. Returns its base URL and a close function. */
async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

/** An alert exactly as octwin.ai sends it: signed with the Standard Webhooks library. */
function signedAlert({ id = `msg_${randomUUID()}`, data = {} } = {}) {
  const body = JSON.stringify({
    type: 'message.unread',
    timestamp: new Date().toISOString(),
    data: {
      widget_id: 'wid_abc',
      visitor: { from: 'user-42', claims: { customer_id: '42' } },
      conversation_id: CONVERSATION_ID,
      unread_count: 2,
      preview: 'Your booking is confirmed',
      author: 'ai_agent',
      first_unread_at: new Date().toISOString(),
      ...data,
    },
  });
  const now = new Date();
  const headers = {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(Math.floor(now.getTime() / 1000)),
    'webhook-signature': new Webhook(SECRET).sign(id, now, body),
    'x-octwin-delivery-id': id,
    'x-octwin-attempt': '1',
    'user-agent': 'octwin-alerts/1',
  };
  return { body, headers };
}

function post(base, path, { body, headers }) {
  return fetch(base + path, { method: 'POST', body, headers });
}

let server; // the app with the real (DRY_RUN) push
const pushed = []; // calls to the fake push in `spied`
let spied; // the same app with a fake push we can count
let failOnce = false;

before(async () => {
  server = await listen(createApp({ unreadAlertSecret: SECRET }));
  spied = await listen(createApp({
    unreadAlertSecret: SECRET,
    sendPush: async (push) => {
      if (failOnce) {
        failOnce = false;
        throw new Error('FCM is down');
      }
      pushed.push(push);
    },
  }));
  // Register a phone for user 42 (the devices store is shared by both apps).
  const res = await fetch(`${server.base}/devices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: '42', token: 'fcm-token-of-user-42' }),
  });
  assert.equal(res.status, 204);
});

after(() => {
  server.close();
  spied.close();
});

test('a correctly signed alert is accepted (204) and the push is logged in DRY_RUN', async () => {
  const res = await post(server.base, '/octwin/unread', signedAlert());
  assert.equal(res.status, 204);
});

test('a tampered body is refused with 401', async () => {
  const alert = signedAlert();
  const tampered = alert.body.replace('"unread_count":2', '"unread_count":3');
  assert.notEqual(tampered, alert.body);
  const res = await post(server.base, '/octwin/unread', { ...alert, body: tampered });
  assert.equal(res.status, 401);
});

test('an alert signed with another secret is refused with 401', async () => {
  const alert = signedAlert();
  const now = new Date();
  const otherSecret = 'whsec_' + randomBytes(24).toString('base64');
  alert.headers['webhook-signature'] = new Webhook(otherSecret).sign(alert.headers['webhook-id'], now, alert.body);
  const res = await post(server.base, '/octwin/unread', alert);
  assert.equal(res.status, 401);
});

test('a retry with the same webhook-id is answered 204 but sends no second push', async () => {
  pushed.length = 0;
  const alert = signedAlert();
  assert.equal((await post(spied.base, '/octwin/unread', alert)).status, 204);
  assert.equal((await post(spied.base, '/octwin/unread', alert)).status, 204);
  assert.equal(pushed.length, 1);
  assert.deepEqual(pushed[0], {
    tokens: ['fcm-token-of-user-42'],
    conversationId: CONVERSATION_ID,
    preview: 'Your booking is confirmed',
  });
});

test('a failed push answers 503, and the retry is not skipped as a repeat', async () => {
  pushed.length = 0;
  failOnce = true;
  const alert = signedAlert({ data: { preview: null } });
  assert.equal((await post(spied.base, '/octwin/unread', alert)).status, 503);
  assert.equal((await post(spied.base, '/octwin/unread', alert)).status, 204);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].preview, null, '"no preview" reaches the push as null');
});

test('an alert for a user with no phone is accepted and sends nothing', async () => {
  pushed.length = 0;
  const alert = signedAlert({ data: { visitor: { from: 'user-999' }, test: true } });
  assert.equal((await post(spied.base, '/octwin/unread', alert)).status, 204);
  assert.equal(pushed.length, 0);
});
