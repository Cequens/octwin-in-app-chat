import { DEMO_USER_ID, SERVER_URL } from './config';

/** A signed chat session from your server. */
export type ChatSession = {
  /** The app page to open: https://octwin.ai/c/app/<widgetId>#from=...&identity=... */
  url: string;
  /** The same signed values, for window.octwin.setIdentity(...) after "identity_refused". */
  from: string;
  identity: string;
  identity_sig: string;
};

async function post(path: string, body: object): Promise<unknown> {
  const response = await fetch(SERVER_URL + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

/** POST /chat/session. Call it each time the chat screen opens: a session is short-lived. */
export async function fetchSession(): Promise<ChatSession> {
  return (await post('/chat/session', { userId: DEMO_USER_ID })) as ChatSession;
}

/** POST /devices. Tells your server where to send this user's pushes. */
export async function registerDevice(token: string): Promise<void> {
  await post('/devices', { userId: DEMO_USER_ID, token });
}
