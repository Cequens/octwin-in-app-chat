# React Native sample

The octwin.ai AI Agent chat in a React Native app, with a push when a message waits unseen.

This folder holds the app code only (TypeScript). It is not a full React Native project: there are no `android/` or `ios/` folders. You create the project, then copy these files in.

## What it shows

| File | What it does |
|---|---|
| [`src/ChatScreen.tsx`](src/ChatScreen.tsx) | The chat in `react-native-webview`. Tells the page when the chat is on screen. Answers the page's events. |
| [`src/push.ts`](src/push.ts) | Push with React Native Firebase: the token goes to your server, and a tap opens the chat. |
| [`src/octwinBridge.ts`](src/octwinBridge.ts) | Reads the page's events. Builds the `setActive` and `setIdentity` calls. |
| [`src/sessionClient.ts`](src/sessionClient.ts) | Calls your server: `POST /chat/session` and `POST /devices`. |
| [`src/navigation.ts`](src/navigation.ts) | Opens the chat from a push tap. |
| [`App.tsx`](App.tsx) | A home screen and the chat screen. |

`package.json`, `tsconfig.json` and `.eslintrc.js` are here only so CI can type-check and lint this code. Your new project has its own.

## Set it up

1. Create a project and copy the code in:

   ```bash
   npx @react-native-community/cli@latest init OctwinChat
   cd OctwinChat
   # copy App.tsx and the src/ folder from here into OctwinChat/
   npm install react-native-webview @react-native-firebase/app @react-native-firebase/messaging \
     @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
   ```

2. Add Firebase. Follow the React Native Firebase install guide (<https://rnfirebase.io>): put `google-services.json` in `android/app/`, add `GoogleService-Info.plist` to the Xcode project, and make the Gradle and Podfile changes it lists. Then run `cd ios && pod install`.

3. Set your server address in [`src/config.ts`](src/config.ts). Use https. A tunnel to your computer (cloudflared, ngrok) works well.

4. Run `npx react-native run-android` or `npx react-native run-ios`.

## Permissions

**Android** — `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<!-- Voice notes. react-native-webview asks the user when the chat needs the mic. -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<!-- Android 13 and newer: permission to show the push notification. -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**iOS** — `ios/OctwinChat/Info.plist`:

| Key | Why |
|---|---|
| `NSMicrophoneUsageDescription` | voice notes |
| `NSCameraUsageDescription` | "take photo" in the attach menu |
| `NSPhotoLibraryUsageDescription` | "photo library" in the attach menu |

In Xcode, also turn on the **Push Notifications** capability, and upload your APNs key in the Firebase console.

Attaching a file needs no extra code: `react-native-webview` opens the file chooser on Android, and iOS does it by itself.

## The one rule

Call `window.octwin.setActive(false)` when the chat is not on screen, and `setActive(true)` when it is again. [`ChatScreen.tsx`](src/ChatScreen.tsx) does it in two places:

- **`AppState`** — the app goes to the background, or comes back. Only `active` means the user can see it.
- **`useFocusEffect`** — another screen covers the chat (blur), or the user comes back (focus).

If you skip this, octwin.ai thinks the user saw every message, and it never sends an unread alert.

On native Android you would also call `WebView.onPause()`. `react-native-webview` does not call it, and gives you no way to call it, so `setActive` is the signal here.

## When the identity is refused

The signed session expires. When octwin.ai refuses it, the page posts `identity_refused`. The app then asks `/chat/session` for a fresh one and calls `window.octwin.setIdentity({ from, identity, identity_sig })`. The page does not reload.

## Push

- Your server sends `data: { type: 'octwin_chat', conversation_id }`.
- A tap, from the background or from a closed app, opens a fresh chat screen. It loads a new signed session, and the chat shows the messages the user missed.
- While the app is open on another screen, the phone shows no notification, so the app shows an alert with an **Open** button.
