import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { forgetToken } from './devices.js';

// Firebase says these tokens will never work again. Delete them.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

let messaging = null;

/** Start Firebase on the first real send, so DRY_RUN=1 never needs a service account. */
function firebaseMessaging() {
  if (!messaging) {
    initializeApp({ credential: cert(process.env.FIREBASE_SERVICE_ACCOUNT) });
    messaging = getMessaging();
  }
  return messaging;
}

/**
 * The push for one waiting chat message.
 *
 * Every id below is the conversation id. The user may get several alerts for one
 * conversation; the phone then shows ONE notification and replaces it, instead of a pile.
 * The `data` part tells the app to open the chat screen when the user taps it.
 */
export function buildChatPush({ tokens, conversationId, preview }) {
  return {
    tokens,
    notification: {
      title: 'New message',
      // preview is null when the operator chose "no preview" in the console.
      body: preview ?? 'You have a new message',
    },
    data: { type: 'octwin_chat', conversation_id: conversationId },
    android: {
      collapseKey: conversationId,
      notification: { tag: conversationId },
    },
    apns: {
      headers: { 'apns-collapse-id': conversationId },
      payload: { aps: { threadId: conversationId } },
    },
  };
}

/**
 * Send the push to every phone of one user.
 * Throws only when Firebase itself fails (network, bad credentials). The caller can then
 * answer octwin.ai with a 5xx, and octwin.ai sends the alert again later.
 */
export async function sendChatPush({ tokens, conversationId, preview }) {
  const message = buildChatPush({ tokens, conversationId, preview });

  if (process.env.DRY_RUN === '1') {
    console.log('[push] DRY_RUN=1, not sending:', JSON.stringify(message));
    return { sent: tokens.length, failed: 0 };
  }

  const result = await firebaseMessaging().sendEachForMulticast(message);
  result.responses.forEach((response, i) => {
    if (response.success) return;
    const code = response.error?.code;
    if (DEAD_TOKEN_CODES.has(code)) forgetToken(tokens[i]);
    console.warn(`[push] token ${i} failed: ${code}`);
  });
  return { sent: result.successCount, failed: result.failureCount };
}
