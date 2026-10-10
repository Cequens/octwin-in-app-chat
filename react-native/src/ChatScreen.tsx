import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { parseOctwinEvent, setActiveJs, setIdentityJs } from './octwinBridge';
import { fetchSession } from './sessionClient';

/**
 * The chat screen: the octwin.ai app page in a WebView.
 *
 * The one rule: tell the page when the chat is on screen and when it is not.
 * octwin.ai sends an unread alert (and so a push) only for a message the user did
 * not see. If the page always says "on screen", no push is ever sent.
 */
export function ChatScreen() {
  // `<object>`: the WebView typings default their generic to `undefined`, which makes a
  // plain `useRef<WebView>` fail under strict TypeScript.
  const webviewRef = useRef<WebView<object>>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const appInForeground = useRef(AppState.currentState === 'active');
  const focused = useRef(true); // false while another screen covers this one
  const lastIdentityRefresh = useRef(0);

  const reportActive = useCallback(() => {
    const active = appInForeground.current && focused.current;
    webviewRef.current?.injectJavaScript(setActiveJs(active));
  }, []);

  // A fresh signed session every time the screen opens.
  useEffect(() => {
    fetchSession()
      .then(session => setUrl(session.url))
      .catch(err => setError(`Could not open the chat. ${err}`));
  }, []);

  // The app goes to the background, or comes back. Only "active" means the user can see it.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      appInForeground.current = state === 'active';
      reportActive();
    });
    return () => subscription.remove();
  }, [reportActive]);

  // Another screen covers the chat (blur), or the user comes back to it (focus).
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      reportActive();
      return () => {
        focused.current = false;
        reportActive();
      };
    }, [reportActive]),
  );

  /**
   * The signed identity expired (or the secret changed). Get a new one and give it
   * to the page, without a reload. If it is refused again right away, stop: your
   * server signs with the wrong secret, and retrying would loop.
   */
  const refreshIdentity = useCallback(async () => {
    if (Date.now() - lastIdentityRefresh.current < 30_000) {
      console.warn('Identity refused again right after a refresh. Check IDENTITY_SECRET on your server.');
      return;
    }
    lastIdentityRefresh.current = Date.now();
    try {
      const session = await fetchSession();
      webviewRef.current?.injectJavaScript(setIdentityJs(session));
    } catch (err) {
      console.warn('Could not refresh the chat identity:', err);
    }
  }, []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      switch (parseOctwinEvent(event.nativeEvent.data)) {
        case 'ready':
          // The page may have loaded while the app was in the background. Say where we are.
          reportActive();
          break;
        case 'identity_refused':
          refreshIdentity();
          break;
      }
    },
    [reportActive, refreshIdentity],
  );

  if (error) {
    return (
      <View style={styles.center}>
        <Text>{error}</Text>
      </View>
    );
  }
  if (!url) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <WebView
      ref={webviewRef}
      source={{ uri: url }}
      // Setting onMessage is what creates window.ReactNativeWebView in the page.
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      // Voice notes: let the page use the microphone (iOS 15+). The phone still asks
      // the user once, with NSMicrophoneUsageDescription from Info.plist.
      mediaCapturePermissionGrantType="grant"
      // Play voice notes inside the chat, not in a full-screen player (iOS).
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
