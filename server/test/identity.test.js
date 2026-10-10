import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signIdentity, appPageUrl } from '../src/identity.js';

const SECRET = 'test-identity-secret';

test('signIdentity signs the exact string with HMAC-SHA256, base64url', () => {
  const { identity, identity_sig } = signIdentity(
    { from: 'user-123', phone: '+201234567890', email: 'a@b.com', claims: { customer_id: '123' } },
    SECRET,
  );

  // An independent computation over the same bytes must give the same signature.
  const expected = createHmac('sha256', SECRET).update(Buffer.from(identity, 'utf8')).digest('base64url');
  assert.equal(identity_sig, expected);
  assert.match(identity_sig, /^[A-Za-z0-9_-]+$/, 'base64url: no "+", "/" or "=" padding');

  // The string is plain JSON with the fields octwin.ai reads.
  const parsed = JSON.parse(identity);
  assert.equal(parsed.from, 'user-123');
  assert.equal(parsed.phone, '+201234567890');
  assert.equal(parsed.email, 'a@b.com');
  assert.deepEqual(parsed.claims, { customer_id: '123' });
  assert.ok(Number.isInteger(parsed.exp) && parsed.exp > Date.now() / 1000, 'exp is in the future');
  assert.equal(JSON.stringify(parsed), identity, 'round-trips JSON.parse');
});

test('signIdentity leaves out the optional fields it was not given', () => {
  const { identity } = signIdentity({ from: 'user-1', ttlSeconds: 60 }, SECRET);
  assert.deepEqual(Object.keys(JSON.parse(identity)), ['from', 'exp']);
});

test('appPageUrl keeps "+" in a phone number intact', () => {
  const signed = signIdentity({ from: 'user-123', phone: '+201234567890' }, SECRET);
  const url = appPageUrl({
    octwinUrl: 'https://octwin.ai/',
    widgetId: 'wid_abc',
    from: 'user-123',
    name: 'Sara Ali',
    ...signed,
  });

  const [base, fragment] = url.split('#');
  assert.equal(base, 'https://octwin.ai/c/app/wid_abc');
  assert.ok(fragment.includes('%2B201234567890'), 'the "+" is sent as %2B');

  // Decode the way the app page does: split, then decodeURIComponent each value.
  const values = Object.fromEntries(
    fragment.split('&').map((pair) => pair.split('=').map(decodeURIComponent)),
  );
  assert.equal(values.from, 'user-123');
  assert.equal(values.name, 'Sara Ali');
  assert.equal(values.identity, signed.identity, 'the signed string arrives byte for byte');
  assert.equal(values.identity_sig, signed.identity_sig);
  assert.equal(JSON.parse(values.identity).phone, '+201234567890');

  // Why we do not use URLSearchParams: form decoding turns "+" into a space.
  assert.equal(new URLSearchParams('phone=+201234567890').get('phone'), ' 201234567890');
});

test('appPageUrl adds active=0 only when asked', () => {
  const url = appPageUrl({ octwinUrl: 'https://octwin.ai', widgetId: 'w', from: 'f', identity: 'i', identity_sig: 's', active: false });
  assert.ok(url.endsWith('&active=0'));
  assert.ok(!appPageUrl({ octwinUrl: 'https://octwin.ai', widgetId: 'w', from: 'f', identity: 'i', identity_sig: 's' }).includes('active='));
});
