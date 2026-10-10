# Android sample (Kotlin)

The octwin.ai AI Agent chat in a native Android app, with a push when a message waits unseen.

This folder holds the code only. It is **not** a full Gradle project. Add these files to an Android Studio **Empty Activity** project.

## What it shows

| File | What it does |
|---|---|
| [`ChatActivity.kt`](app/src/main/java/ai/octwin/sample/ChatActivity.kt) | The chat in a `WebView`. Tells the page when the chat is on screen. Listens on `OctwinBridge`. Opens the file chooser. Gives the page the microphone. |
| [`ChatMessagingService.kt`](app/src/main/java/ai/octwin/sample/ChatMessagingService.kt) | Firebase Cloud Messaging: sends the token to your server, shows the notification, opens the chat on tap. |
| [`SessionClient.kt`](app/src/main/java/ai/octwin/sample/SessionClient.kt) | Calls your server: `POST /chat/session` and `POST /devices`. |
| [`AndroidManifest.xml`](app/src/main/AndroidManifest.xml) | The permissions, the activity, the messaging service. |
| [`build.gradle.kts`](app/build.gradle.kts) | The dependencies to add. |

## Set it up

1. In Android Studio: **New Project → Empty Activity** (Kotlin, minimum SDK 24 or newer).
2. Copy the three `.kt` files into `app/src/main/java/ai/octwin/sample/`. If your package is different, change the `package` line at the top of each file.
3. Merge [`AndroidManifest.xml`](app/src/main/AndroidManifest.xml) into yours, and add the lines from [`build.gradle.kts`](app/build.gradle.kts) to `app/build.gradle.kts`. If Gradle asks for a higher `compileSdk`, raise it.
4. Firebase console → add an Android app → download `google-services.json` into `app/`. Never commit it.
5. Set `SERVER_URL` in [`SessionClient.kt`](app/src/main/java/ai/octwin/sample/SessionClient.kt). Use https. A tunnel to your computer (cloudflared, ngrok) works well.
6. Run the app.

## The one rule

When the chat is not on screen, the page must know. [`ChatActivity.kt`](app/src/main/java/ai/octwin/sample/ChatActivity.kt) does it in the activity lifecycle:

```kotlin
override fun onPause() {
    webView.onPause()
    webView.evaluateJavascript("window.octwin && window.octwin.setActive(false)", null)
    super.onPause()
}

override fun onResume() {
    super.onResume()
    webView.onResume()
    webView.evaluateJavascript("window.octwin && window.octwin.setActive(true)", null)
}
```

`onPause` runs when the app goes to the background **and** when another screen covers the chat. On Android you must call **both** `webView.onPause()` and `setActive(false)`: a WebView does not pause or hide its page when the app leaves the screen. Without them, octwin.ai thinks the user saw every message, and it never sends an unread alert.

If your chat lives in a Fragment or a Compose screen, make the same calls in its own lifecycle.

## The bridge

The page posts its events as JSON strings: `{"source":"octwin","type":"ready"}` and `{"source":"octwin","type":"identity_refused"}`. The app listens with `WebViewCompat.addWebMessageListener` under the name `OctwinBridge`, and only for the octwin.ai origins.

- `ready` — the page is loaded. The app tells it whether the chat is on screen.
- `identity_refused` — the signed session expired. The app asks `/chat/session` for a fresh one and calls `window.octwin.setIdentity({ from, identity, identity_sig })`. The page does not reload.

`addWebMessageListener` needs a recent Android System WebView. On a very old one the chat still works, but the app does not hear these events.

## Push

- Your server sends `data: { type: "octwin_chat", conversation_id }`, with the conversation id as the notification `tag`. A newer alert for the same chat replaces the old notification.
- **App in the background:** Android shows the notification itself. A tap opens your **launcher activity**, with `type` and `conversation_id` as intent extras. Here `ChatActivity` is the launcher, so it just works. In your app, check those extras in your launcher activity and start `ChatActivity`.
- **App in the foreground:** `ChatMessagingService.onMessageReceived` shows the notification. Its tap opens a fresh `ChatActivity`.

A fresh `ChatActivity` loads a new signed session, and the chat shows the messages the user missed.

## Permissions

| Permission | Why |
|---|---|
| `INTERNET` | the chat is a web page |
| `RECORD_AUDIO` | voice notes. Asked at the moment the chat needs the mic. |
| `POST_NOTIFICATIONS` | Android 13 and newer: to show the push |
