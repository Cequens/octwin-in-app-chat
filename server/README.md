# Server sample (Node.js)

Your server has two jobs in in-app chat:

1. **Sign the chat session.** It tells octwin.ai who the user is, so the app never holds a secret.
2. **Turn an unread alert into a push.** octwin.ai calls your server when a chat message waits unseen. Your server sends the push to the user's phone.

Plain JavaScript (ES modules). No build step. Node.js 22 or newer.

## Run it

```bash
cd server
cp .env.example .env      # then fill it in
npm install
npm start                 # http://localhost:8080
npm test
```

Keep `DRY_RUN=1` at first. The server then prints each push instead of sending it, so you need no Firebase project yet.

## The endpoints

| Endpoint | Called by | Does |
|---|---|---|
| `POST /chat/session` | the app, when the chat screen opens | returns `{ url, from, identity, identity_sig }`. The app opens `url` in its WebView. |
| `POST /devices` | the app, after login and on each new FCM token | stores `{ userId, token }` |
| `POST /octwin/unread` | octwin.ai | checks the signature, then sends one push |
| `POST /chat/identity` | `public/simulator.html` | returns `{ from, identity, identity_sig }` |

> **Replace the fake login.** To keep the sample easy to try, every endpoint trusts the `userId` in the request body. A real server takes the user from its own login session or token. If you ship it as it is, anyone can get a chat signed as any of your users. Look for `REPLACE THIS WITH YOUR AUTH` in [`src/app.js`](src/app.js).

The app also calls `/chat/session` again after an `identity_refused` event. It then passes `from`, `identity` and `identity_sig` to `window.octwin.setIdentity(...)`, with no page reload.

## The unread alert

octwin.ai sends a [Standard Webhooks](https://www.standardwebhooks.com/) request. [`src/app.js`](src/app.js) handles it in this order:

1. **Read the raw body.** `express.raw({ type: 'application/json' })` keeps the exact bytes. The signature is over those bytes. If a JSON parser runs first, the check fails.
2. **Check the signature.** `new Webhook(UNREAD_ALERT_SECRET).verify(rawBody, headers)` from the official [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. A bad signature gets `401`.
3. **Skip repeats.** octwin.ai retries a failed delivery with the same `webhook-id` and the same body. The sample remembers recent ids in memory. Use Redis or your database in production.
4. **Find the phones.** `data.visitor.from` is the `from` your server signed (`user-<id>`).
5. **Send one push**, then answer `204`. If Firebase itself fails, the sample answers `503`, so octwin.ai tries again later.

Answer fast. octwin.ai waits only a short time, then counts the delivery as failed.

### What a push looks like

[`src/push.js`](src/push.js) builds it:

- Title `New message`. Body = `data.preview`, or `You have a new message` when the operator chose no preview.
- `data: { type: 'octwin_chat', conversation_id }`. The app reads it on tap and opens the chat screen.
- The conversation id is the Android `tag` and `collapse_key`, and the iOS `apns-collapse-id` and `thread-id`. More alerts for the same chat replace the notification instead of adding more.

With `DRY_RUN=0` it sends through Firebase Cloud Messaging (`FIREBASE_SERVICE_ACCOUNT` = the path to your service account JSON file). Tokens that Firebase reports as dead are removed.

### Test it from the console

In the octwin console, open **In-app chat** and press **Send test**. The alert carries `data.test: true`, and the server log says `TEST alert`.

octwin.ai must reach your server over the internet. On your own computer, use a tunnel (for example `cloudflared` or `ngrok`) and put its `https://…/octwin/unread` address in the console.

## The simulator

Open `http://localhost:8080/simulator.html`. It needs `WIDGET_ID`, `TENANT_SLUG` and `PROJECT_SLUG` in `.env`.

It mounts the chat with `widget.js` and `PlatformChat.mount(...)`, the "your own page" way, and gives you one big switch: **Chat on screen / Chat hidden**. Send a message, hide the chat, and wait. Press **Register a fake phone** first, and the server prints the push it would send.

If the widget has a list of allowed origins in the console, add `http://localhost:8080` to it.
