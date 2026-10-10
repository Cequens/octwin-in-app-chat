# Flutter sample

The octwin.ai AI Agent chat in a Flutter app, with a push when a message waits unseen.

This folder holds the Dart code (`lib/`, `test/`) and `pubspec.yaml`. It has no `android/` or `ios/` folder: you make them with `flutter create` (step 1). `pubspec.lock` holds the package versions this sample was checked with.

## What it shows

| File | What it does |
|---|---|
| [`lib/chat_screen.dart`](lib/chat_screen.dart) | The chat in a `WebViewWidget`. Tells the page when the chat is on screen. Answers the page's events. File chooser and microphone. |
| [`lib/main.dart`](lib/main.dart) | Firebase, the push permission, the token to your server, and tap-to-open. |
| [`lib/octwin_bridge.dart`](lib/octwin_bridge.dart) | Reads the page's events. Builds the `setActive` and `setIdentity` calls. |
| [`lib/session_client.dart`](lib/session_client.dart) | Calls your server: `POST /chat/session` and `POST /devices`. |
| [`lib/config.dart`](lib/config.dart) | Your server address and the demo user. |
| [`test/octwin_bridge_test.dart`](test/octwin_bridge_test.dart) | Unit tests for the bridge. |

## Set it up

1. **Make the platform folders.** In this folder:

   ```bash
   flutter create --project-name octwin_in_app_chat --org ai.octwin.sample --platforms=android,ios .
   rm test/widget_test.dart
   ```

   `flutter create` keeps the files that are already here. `--project-name` is needed because a package cannot be called `flutter`. Delete `test/widget_test.dart`: it tests Flutter's counter demo, which this app does not have.

   Then, in `android/app/build.gradle.kts`, change `compileSdk = flutter.compileSdkVersion` to `compileSdk = 37`. `permission_handler` needs it; without it the Android build fails with *"Failed to find target with hash string 'android-37'"*.

2. **Add Firebase.** The easy way is the FlutterFire CLI: `flutterfire configure`. Then pass `DefaultFirebaseOptions.currentPlatform` to `Firebase.initializeApp` in [`lib/main.dart`](lib/main.dart). Never commit `google-services.json` or `GoogleService-Info.plist`.

3. **Add the permissions** below.

4. **Run it**, pointing at your server. Use https. A tunnel to your computer (cloudflared, ngrok) works well.

   ```bash
   flutter run --dart-define=SERVER_URL=https://your-tunnel.example.com --dart-define=USER_ID=42
   ```

## Permissions

**Android** — `android/app/src/main/AndroidManifest.xml`, inside `<manifest>`:

```xml
<!-- The chat is a web page. flutter create adds this only to debug builds. -->
<uses-permission android:name="android.permission.INTERNET" />
<!-- Voice notes. The app asks the user at the moment the chat needs the mic. -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<!-- Android 13 and newer: permission to show the push notification. -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**iOS** — `ios/Runner/Info.plist`:

| Key | Why |
|---|---|
| `NSMicrophoneUsageDescription` | voice notes |
| `NSCameraUsageDescription` | "take photo" in the attach menu |
| `NSPhotoLibraryUsageDescription` | "photo library" in the attach menu |

In Xcode (`ios/Runner.xcworkspace`), also turn on the **Push Notifications** capability, and upload your APNs key in the Firebase console.

## The one rule

Call `window.octwin.setActive(false)` when the chat is not on screen, and `setActive(true)` when it is again. [`chat_screen.dart`](lib/chat_screen.dart) does it in three places:

- **`didChangeAppLifecycleState`** — the app goes to the background, or comes back. Only `resumed` means the user can see it.
- **`RouteAware`** — another screen opens on top of the chat (`didPushNext`), or the user comes back (`didPopNext`). This needs `chatRouteObserver` in `MaterialApp.navigatorObservers`.
- **`dispose`** — the chat screen closes.

If you skip this, octwin.ai thinks the user saw every message, and it never sends an unread alert.

On native Android you would also call `WebView.onPause()`. `webview_flutter` does not call it, and gives you no way to call it, so `setActive` is the signal here.

## The bridge

The page posts its events as JSON strings to the JavaScript channel `OctwinBridge`: `{"source":"octwin","type":"ready"}` and `{"source":"octwin","type":"identity_refused"}`.

- `ready` — the page is loaded. The app tells it whether the chat is on screen.
- `identity_refused` — the signed session expired. The app asks `/chat/session` for a fresh one and calls `window.octwin.setIdentity({ from, identity, identity_sig })`. The page does not reload.

## Files and the microphone

- **Android:** `<input type="file">` shows nothing in a WebView unless the app opens a file chooser. The sample opens one with `file_picker` (`setOnShowFileSelector`). For voice notes, it asks for `RECORD_AUDIO` with `permission_handler`, then grants the page the microphone.
- **iOS:** WebKit shows the attach menu and asks for the microphone by itself. It needs the Info.plist keys above.

## Push

- Your server sends `data: { type: 'octwin_chat', conversation_id }`.
- A tap, from the background or from a closed app, opens a fresh chat screen. It loads a new signed session, and the chat shows the messages the user missed.
- While the app is open on another screen, the phone shows no notification, so the app shows a bar with an **Open** button.
