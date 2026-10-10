# iOS sample (Swift)

The octwin.ai AI Agent chat in a native iOS app, with a push when a message waits unseen.

This folder holds the code only. It is **not** an Xcode project. Add these files to a new or existing iOS app.

## What it shows

| File | What it does |
|---|---|
| [`ChatViewController.swift`](ChatViewController.swift) | The chat in a `WKWebView`. Tells the page when the chat is on screen. Handles `OctwinBridge` messages. Gives the page the microphone. |
| [`AppDelegate+Push.swift`](AppDelegate+Push.swift) | Firebase Cloud Messaging: sends the token to your server, opens the chat on tap. |
| [`SessionClient.swift`](SessionClient.swift) | Calls your server: `POST /chat/session` and `POST /devices`. |
| [`Info.plist`](Info.plist) | The privacy keys to add to your app's Info.plist. |

UIKit code. In a SwiftUI app, host `ChatViewController` with `UIViewControllerRepresentable`, and add the app delegate with `@UIApplicationDelegateAdaptor(AppDelegate.self)`.

## Set it up

1. In Xcode, add the three `.swift` files to your app target. `AppDelegate+Push.swift` extends a class named `AppDelegate`.
2. Add Firebase with Swift Package Manager (`https://github.com/firebase/firebase-ios-sdk`), product **FirebaseMessaging**.
3. Firebase console → add an iOS app → download `GoogleService-Info.plist` into the target. Never commit it.
4. Firebase console → Project settings → Cloud Messaging → upload your **APNs authentication key**.
5. Target → Signing & Capabilities → add **Push Notifications**.
6. Add the keys from [`Info.plist`](Info.plist) to your app's Info.plist.
7. Call `setUpPush(application)` from `application(_:didFinishLaunchingWithOptions:)`.
8. Set `serverURL` in [`SessionClient.swift`](SessionClient.swift). Use https. A tunnel to your Mac (cloudflared, ngrok) works well.
9. Show `ChatViewController` from a "Chat with us" button, inside a `UINavigationController`.

Push works on a real iPhone. The simulator needs extra setup.

## The one rule

When the chat is not on screen, the page must know. [`ChatViewController.swift`](ChatViewController.swift) calls `window.octwin.setActive(false|true)` from:

- **`UIScene.willDeactivateNotification` / `didActivateNotification`** — the app goes to the background, or comes back. (An app without scenes uses `UIApplication.willResignActiveNotification` / `didBecomeActiveNotification`.)
- **`viewWillDisappear` / `viewDidAppear`** — another screen or tab covers the chat, or the user comes back.

Without this, octwin.ai thinks the user saw every message, and it never sends an unread alert.

## The bridge

The page posts its events as JSON strings to `window.webkit.messageHandlers.OctwinBridge`: `{"source":"octwin","type":"ready"}` and `{"source":"octwin","type":"identity_refused"}`. Only the octwin.ai pages are listened to.

- `ready` — the page is loaded. The app tells it whether the chat is on screen.
- `identity_refused` — the signed session expired. The app asks `/chat/session` for a fresh one and calls `window.octwin.setIdentity({ from, identity, identity_sig })`. The page does not reload.

WebKit keeps a strong reference to a message handler. The sample passes a small weak wrapper, so the chat screen is freed when it closes.

## Microphone, camera, photos

- Voice notes: the `WKUIDelegate` method `webView(_:requestMediaCapturePermissionFor:initiatedByFrame:type:decisionHandler:)` answers `.grant` for the microphone (iOS 15 and newer). iOS still asks the user once, with your `NSMicrophoneUsageDescription` text.
- Attachments: `WKWebView` shows the photo and file menu by itself. It needs `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription`.
- `allowsInlineMediaPlayback = true` plays voice notes inside the chat.

## Push

- Your server sends `data: { type: 'octwin_chat', conversation_id }`, with the conversation id as `apns-collapse-id` and `thread-id`. A newer alert for the same chat replaces the old one.
- A tap calls `userNotificationCenter(_:didReceive:withCompletionHandler:)`, which opens a fresh `ChatViewController`. It loads a new signed session, and the chat shows the messages the user missed.
- While the app is open, `willPresent` still shows the banner: the user may be on another screen.
