import UIKit
import WebKit

/// The chat screen: the octwin.ai app page in a WKWebView.
///
/// The one rule: tell the page when the chat is on screen and when it is not.
/// octwin.ai sends an unread alert, and so a push, only for a message the user did
/// not see. If the page always says "on screen", no push is ever sent.
///
/// UIKit. In SwiftUI, host it with UIViewControllerRepresentable.
final class ChatViewController: UIViewController, WKScriptMessageHandler, WKUIDelegate {
    /// The octwin.ai pages. Only they may post to the app or use the microphone.
    private static let allowedHosts: Set<String> = ["octwin.ai", "staging.octwin.ai"]

    /// The conversation a push was about. The chat page opens the right one by itself;
    /// keep this for your own logging or analytics.
    var conversationId: String?

    private var webView: WKWebView!
    private var isOnScreen = false // between viewDidAppear and viewWillDisappear
    private var appIsActive = true // false while the app is in the background
    private var lastIdentityRefresh: Date?

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        // Voice notes play inside the chat, not in a full-screen player.
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        // The page posts its events to window.webkit.messageHandlers.OctwinBridge.
        // WebKit keeps a STRONG reference to the handler, so we pass a weak wrapper.
        // Passing `self` directly would keep this screen in memory for ever.
        configuration.userContentController.add(WeakScriptMessageHandler(self), name: "OctwinBridge")

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.uiDelegate = self
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Chat"
        // The app goes to the background, or comes back. (Without scenes, use
        // UIApplication.willResignActiveNotification and didBecomeActiveNotification.)
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(sceneWillDeactivate), name: UIScene.willDeactivateNotification, object: nil)
        center.addObserver(self, selector: #selector(sceneDidActivate), name: UIScene.didActivateNotification, object: nil)
        loadChat()
    }

    // MARK: - Is the chat on screen?

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        isOnScreen = true
        reportActive()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        isOnScreen = false // another screen or tab is about to cover the chat
        reportActive()
    }

    @objc private func sceneWillDeactivate() {
        appIsActive = false
        reportActive()
    }

    @objc private func sceneDidActivate() {
        appIsActive = true
        reportActive()
    }

    private func reportActive() {
        setActive(isOnScreen && appIsActive)
    }

    private func setActive(_ active: Bool) {
        // `window.octwin &&` makes it safe to run before the page has loaded.
        // `completionHandler: nil` picks the plain (not async) evaluateJavaScript.
        webView.evaluateJavaScript("window.octwin && window.octwin.setActive(\(active))", completionHandler: nil)
    }

    // MARK: - Loading the chat

    private func loadChat() {
        Task {
            do {
                // A fresh signed session every time the chat opens.
                let session = try await SessionClient.fetchSession()
                webView.load(URLRequest(url: session.url))
            } catch {
                webView.loadHTMLString("<p>Could not open the chat.</p>", baseURL: nil)
            }
        }
    }

    // MARK: - The page talks to the app

    /// One message from the page: a JSON string like {"source":"octwin","type":"ready"}.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard Self.allowedHosts.contains(message.frameInfo.securityOrigin.host),
              let text = message.body as? String,
              let data = text.data(using: .utf8),
              let event = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              event["source"] as? String == "octwin"
        else { return }

        switch event["type"] as? String {
        case "ready":
            reportActive() // the page may have loaded while the app was in the background
        case "identity_refused":
            refreshIdentity()
        default:
            break
        }
    }

    /// The signed identity expired (or the secret changed). Get a new one and give it to
    /// the page, without a reload. If it is refused again right away, stop: your server
    /// signs with the wrong secret, and retrying would loop.
    private func refreshIdentity() {
        if let last = lastIdentityRefresh, Date().timeIntervalSince(last) < 30 {
            print("Identity refused again right after a refresh. Check IDENTITY_SECRET on your server.")
            return
        }
        lastIdentityRefresh = Date()
        Task {
            do {
                let session = try await SessionClient.fetchSession()
                // JSONSerialization quotes and escapes every value: a safe JavaScript literal.
                let payload = ["from": session.from, "identity": session.identity, "identity_sig": session.identitySig]
                let data = try JSONSerialization.data(withJSONObject: payload)
                let json = String(decoding: data, as: UTF8.self)
                webView.evaluateJavaScript("window.octwin && window.octwin.setIdentity(\(json))", completionHandler: nil)
            } catch {
                print("Could not refresh the chat identity: \(error)")
            }
        }
    }

    // MARK: - Microphone (voice notes)

    /// iOS 15+. Grant the microphone, and nothing else, to the octwin.ai page.
    /// iOS still asks the user once, with NSMicrophoneUsageDescription from Info.plist.
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        let allowed = Self.allowedHosts.contains(origin.host) && type == .microphone
        decisionHandler(allowed ? .grant : .deny)
    }
}

/// Passes WebKit's messages on to a handler without keeping it alive.
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
