# octwin.ai in-app chat — samples

> Put your octwin.ai AI Agent inside your mobile app. Get a push when a message is waiting.

By **CEQUENS**

## What this is

These samples put the octwin.ai AI Agent chat inside your mobile app, in a WebView.
When the AI Agent or a person on your team answers and the user does not see it, octwin.ai tells your server, and your server sends a push.
There is one server sample and one app sample per platform: Flutter, React Native, Android and iOS.

## How it works

```text
  YOUR APP                      YOUR SERVER                        octwin.ai
  --------                      -----------                        ---------

  1. The user opens the chat screen
     POST /chat/session  ---->  signs who the user is
                                (IDENTITY_SECRET)
                         <----  { url }
     WebView opens url  --------------------------------------->  app page /c/app/<widgetId>
     setActive(true / false)  --------------------------------->  is the chat on screen?

  2. A message is not seen for 15 seconds
                                POST /octwin/unread  <---------  signed webhook
                                check the signature,
                                find the user's phones
     push arrives  <----------  FCM / APNs

  3. The user taps the push
     the chat screen opens with a fresh session (step 1)  ----->  the missed messages are there
```

Your server holds both secrets. The app never sees them.

## The one rule that matters

**Call `setActive(false)` when the chat is not on screen.** Call it when the app goes to the background, and when the user moves to another tab or screen. Call `setActive(true)` when the chat is visible again. On Android you **must** also call `webView.onPause()` and `webView.onResume()`.

Why: octwin.ai sends an alert only for a message the user has not seen.
The page inside a WebView cannot reliably tell when the user stops seeing it. Only your app knows.
If you skip this, octwin.ai thinks the user saw the message, and no push is sent.

Every sample here does it. Look for `setActive` in the code.

## Pick your platform

| Folder | Stack | What it shows |
|---|---|---|
| [`server/`](server/) | Node.js 22+, Express | Signs the chat session. Turns the unread alert into a push. A browser simulator. |
| [`flutter/`](flutter/) | Flutter 3, `webview_flutter`, `firebase_messaging` | The chat screen, the lifecycle rule, the bridge, push and tap-to-open. |
| [`react-native/`](react-native/) | React Native, TypeScript, `react-native-webview`, React Native Firebase | The same, with `AppState` and screen focus. |
| [`android/`](android/) | Kotlin, `WebView`, `androidx.webkit`, Firebase Cloud Messaging | The same, in an `Activity`, with `onPause` / `onResume`. |
| [`ios/`](ios/) | Swift, UIKit, `WKWebView`, Firebase Cloud Messaging | The same, in a `UIViewController`. |

The app folders hold code, not full projects. Each README says how to add the code to a new project.

## Quickstart

1. **Turn it on in the octwin console.**
   - **In-app chat:** turn on the app page for your web widget.
   - **In-app chat:** set the unread-alert URL to `https://<your server>/octwin/unread`, and reveal the webhook secret (`whsec_...`).
   - **Channels → your web widget → Identity verification:** reveal the identity secret.
2. **Run the server.**

   ```bash
   cd server
   cp .env.example .env    # add the widget id and the two secrets
   npm install
   npm start
   ```

   Keep `DRY_RUN=1` at first: the server prints each push instead of sending it. octwin.ai must reach your server over the internet, so on your own computer use a tunnel (for example `cloudflared` or `ngrok`).
3. **Run the app of your choice.** Follow the README in its folder. Point it at your server's address.

To try the flow without a phone, open `http://localhost:8080/simulator.html`.

## Requirements

- An octwin.ai workspace on the **Pro** or **Enterprise** plan, with in-app chat. In-app chat is in early access: ask us to turn it on.
- A Firebase project, for push notifications.
- Node.js 22 or newer, for the server.

## Links

- In-app chat guide: <https://octwin.ai/artifacts/in-app-chat-guide>
- octwin.ai: <https://octwin.ai>

## License

[MIT](./LICENSE) © CEQUENS
