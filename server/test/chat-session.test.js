import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApp } from '../src/app.js';

const IDENTITY_SECRET = 'test-identity-secret';

test('POST /chat/session returns a signed app page URL for the user', async () => {
  const app = createApp({ octwinUrl: 'https://staging.octwin.ai', widgetId: 'wid_abc', identitySecret: IDENTITY_SECRET });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/chat/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: '42' }),
    });
    assert.equal(res.status, 200);
    const session = await res.json();

    assert.ok(session.url.startsWith('https://staging.octwin.ai/c/app/wid_abc#from=user-42&identity='));
    assert.equal(session.from, 'user-42');
    assert.equal(JSON.parse(session.identity).from, session.from, 'the signed "from" is the session id');
    assert.equal(session.identity_sig, createHmac('sha256', IDENTITY_SECRET).update(session.identity).digest('base64url'));
  } finally {
    server.close();
  }
});
