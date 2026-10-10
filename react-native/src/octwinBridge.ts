import type { ChatSession } from './sessionClient';

/** What the app page tells the app. */
export type OctwinEvent = 'ready' | 'identity_refused';

/**
 * Reads one message from the page. In React Native the page posts through
 * window.ReactNativeWebView.postMessage, as a JSON string like
 * {"source":"octwin","type":"ready"}. Returns null for anything else.
 */
export function parseOctwinEvent(data: string): OctwinEvent | null {
  try {
    const message = JSON.parse(data);
    if (message?.source !== 'octwin') {
      return null;
    }
    return message.type === 'ready' || message.type === 'identity_refused' ? message.type : null;
  } catch {
    return null;
  }
}

/**
 * JavaScript that tells the page whether the chat is on screen.
 * `window.octwin &&` makes it safe before the page has loaded.
 * The final `true;` is needed: injectJavaScript can fail silently without it.
 */
export function setActiveJs(active: boolean): string {
  return `window.octwin && window.octwin.setActive(${active}); true;`;
}

/** JavaScript that hands the page a freshly signed identity, without a reload. */
export function setIdentityJs(session: ChatSession): string {
  // JSON.stringify makes a safe JavaScript literal: every quote and backslash is escaped.
  const identity = JSON.stringify({
    from: session.from,
    identity: session.identity,
    identity_sig: session.identity_sig,
  });
  return `window.octwin && window.octwin.setIdentity(${identity}); true;`;
}
