import FirebaseCore
import FirebaseMessaging
import UIKit
import UserNotifications

/// Push for the chat, added to your existing AppDelegate.
///
/// Call `setUpPush(application)` from application(_:didFinishLaunchingWithOptions:).
/// The UNUserNotificationCenter delegate must be set before that method returns, or a
/// tap that launched the app is lost.
extension AppDelegate: MessagingDelegate, UNUserNotificationCenterDelegate {
    func setUpPush(_ application: UIApplication) {
        FirebaseApp.configure() // reads GoogleService-Info.plist
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self

        // "Allow notifications?" The answer does not matter here: we register either way.
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
        application.registerForRemoteNotifications()
    }

    /// Firebase has a token for this phone: on start, and whenever it changes.
    /// Tell your server where to send this user's pushes. In your app, do it after login.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        Task {
            do {
                try await SessionClient.registerDevice(token: fcmToken)
            } catch {
                print("Could not register this phone for push: \(error)")
            }
        }
    }

    /// The user tapped a notification.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let data = response.notification.request.content.userInfo
        if data["type"] as? String == "octwin_chat" {
            openChat(conversationId: data["conversation_id"] as? String)
        }
        completionHandler()
    }

    /// A push arrived while the app is open. The user may be on another screen, so show it.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    /// Opens a fresh chat screen. It loads a new signed session, and the chat shows the
    /// messages the user missed. An open chat screen is closed first, so there is only one.
    private func openChat(conversationId: String?) {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        guard let root = scene?.keyWindow?.rootViewController else { return }

        let chat = ChatViewController()
        chat.conversationId = conversationId
        if let navigation = root as? UINavigationController {
            navigation.popToRootViewController(animated: false)
            navigation.pushViewController(chat, animated: true)
        } else {
            let present = { root.present(UINavigationController(rootViewController: chat), animated: true) }
            if root.presentedViewController != nil {
                root.dismiss(animated: false, completion: present)
            } else {
                present()
            }
        }
    }
}
