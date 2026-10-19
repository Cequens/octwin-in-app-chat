package ai.octwin.sample

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONException
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * The chat screen: the octwin.ai app page in a WebView.
 *
 * The one rule: tell the page when the chat is on screen and when it is not
 * (onResume / onPause below). octwin.ai sends an unread alert, and so a push, only
 * for a message the user did not see. If the page always says "on screen", no push
 * is ever sent.
 */
class ChatActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingMicRequest: PermissionRequest? = null
    private var lastIdentityRefresh: Long? = null

    // The chat's "attach" button: the system file picker, then back to the page.
    private val pickFiles =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
            fileCallback = null
        }

    // Voice notes: Android asks the user for the microphone, then we answer the page.
    private val askForMic =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val request = pendingMicRequest ?: return@registerForActivityResult
            pendingMicRequest = null
            if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else request.deny()
        }

    private val askForNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge() // the same layout on every Android version — see fitToVisibleScreen
        webView = WebView(this)
        setContentView(fitToVisibleScreen(webView))

        webView.settings.javaScriptEnabled = true // the chat is a web app
        webView.settings.domStorageEnabled = true // it keeps its state in localStorage
        webView.settings.mediaPlaybackRequiresUserGesture = false // play voice notes
        webView.webChromeClient = chromeClient
        addBridge()

        ensureChatChannel(this)
        askForNotificationPermission()
        registerForPush()
        loadChat()
    }

    // ---- Fitting the screen ----

    /**
     * The WebView inside a frame that leaves room for the status bar, the navigation bar,
     * a camera cutout and the keyboard.
     *
     * The chat keeps its message box above the keyboard by itself, but only if the WebView
     * gets smaller when the keyboard opens: the page cannot see the keyboard, only its own
     * size. Android 15 and newer draw an app edge to edge, under the bars and the keyboard,
     * and do not shrink it for the keyboard. So the app makes the room itself.
     * enableEdgeToEdge() in onCreate makes older Android versions work the same way.
     */
    private fun fitToVisibleScreen(content: View): View {
        val frame = FrameLayout(this)
        frame.addView(content, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        ViewCompat.setOnApplyWindowInsetsListener(frame) { view, insets ->
            val room =
                insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() or
                        WindowInsetsCompat.Type.displayCutout() or
                        WindowInsetsCompat.Type.ime(),
                )
            view.setPadding(room.left, room.top, room.right, room.bottom)
            WindowInsetsCompat.CONSUMED
        }
        return frame
    }

    // ---- Is the chat on screen? ----

    override fun onResume() {
        super.onResume()
        webView.onResume()
        setActive(true)
    }

    override fun onPause() {
        // The user can no longer see the chat: the app went to the background, or another
        // screen covers it. Tell the page first, then pause the WebView, so the call never
        // depends on what onPause() stops.
        setActive(false)
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private fun setActive(active: Boolean) {
        // `window.octwin &&` makes it safe to run before the page has loaded.
        webView.evaluateJavascript("window.octwin && window.octwin.setActive($active)", null)
    }

    // ---- The page talks to the app ----

    private fun addBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // A very old WebView. The chat still works; the app just does not hear the events.
            Log.w(TAG, "This WebView cannot add OctwinBridge. Update Android System WebView.")
            return
        }
        // Only the octwin.ai pages can reach this listener. It runs on the main thread.
        WebViewCompat.addWebMessageListener(webView, "OctwinBridge", ALLOWED_ORIGINS) { _, message, _, _, _ ->
            message.data?.let(::onBridgeMessage)
        }
    }

    /** One message from the page: a JSON string like {"source":"octwin","type":"ready"}. */
    private fun onBridgeMessage(data: String) {
        val event =
            try {
                JSONObject(data)
            } catch (e: JSONException) {
                return
            }
        if (event.optString("source") != "octwin") return
        when (event.optString("type")) {
            // The page may have loaded while the app was in the background. Say where we are.
            "ready" -> setActive(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED))

            // The signed session expired. Get a fresh one.
            "identity_refused" -> refreshIdentity()
        }
    }

    // ---- Loading the chat ----

    private fun loadChat() {
        thread {
            try {
                // A fresh signed session every time the chat opens.
                val session = SessionClient.fetchSession()
                runOnUiThread { webView.loadUrl(session.url) }
            } catch (e: Exception) {
                Log.e(TAG, "Could not open the chat", e)
                runOnUiThread { webView.loadData("<p>Could not open the chat.</p>", "text/html", "utf-8") }
            }
        }
    }

    /**
     * The signed identity expired (or the secret changed). Get a new one and give it to
     * the page, without a reload. If it is refused again right away, stop: your server
     * signs with the wrong secret, and retrying would loop.
     */
    private fun refreshIdentity() {
        val now = SystemClock.elapsedRealtime()
        val last = lastIdentityRefresh
        if (last != null && now - last < 30_000) {
            Log.w(TAG, "Identity refused again right after a refresh. Check IDENTITY_SECRET on your server.")
            return
        }
        lastIdentityRefresh = now
        thread {
            try {
                val session = SessionClient.fetchSession()
                // JSONObject quotes and escapes every value, so this is a safe JavaScript literal.
                val identity =
                    JSONObject()
                        .put("from", session.from)
                        .put("identity", session.identity)
                        .put("identity_sig", session.identitySig)
                runOnUiThread {
                    webView.evaluateJavascript("window.octwin && window.octwin.setIdentity($identity)", null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Could not refresh the chat identity", e)
            }
        }
    }

    // ---- Push ----

    private fun askForNotificationPermission() {
        // Android 13 and newer ask the user before showing any notification.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            askForNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    /**
     * Tell your server where to send this user's pushes. In your app, do it after login.
     *
     * firebase-messaging 25.1+ marks getToken() and onNewToken() as deprecated, in favour of
     * register() and onRegistered() (registration by Firebase installation ID). The token API
     * still works, and it is what FCM's server-side send by token is documented for. Move to
     * the new API once you have checked your server accepts what onRegistered() gives you.
     */
    @Suppress("DEPRECATION")
    private fun registerForPush() {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            thread {
                try {
                    SessionClient.registerDevice(token)
                } catch (e: Exception) {
                    Log.w(TAG, "Could not register this phone for push", e)
                }
            }
        }
    }

    // ---- File chooser and microphone ----

    private val chromeClient =
        object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null) // a chooser was already open: cancel it
                fileCallback = callback
                return try {
                    pickFiles.launch(params.createIntent())
                    true
                } catch (e: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                // Grant the microphone, and nothing else, to the octwin.ai page only.
                val origin = "${request.origin.scheme}://${request.origin.authority}"
                if (origin !in ALLOWED_ORIGINS || PermissionRequest.RESOURCE_AUDIO_CAPTURE !in request.resources) {
                    request.deny()
                    return
                }
                // The page gets the mic only if the app itself holds RECORD_AUDIO.
                val granted =
                    ContextCompat.checkSelfPermission(this@ChatActivity, Manifest.permission.RECORD_AUDIO) ==
                        PackageManager.PERMISSION_GRANTED
                if (granted) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else {
                    pendingMicRequest = request
                    askForMic.launch(Manifest.permission.RECORD_AUDIO)
                }
            }
        }

    companion object {
        private const val TAG = "OctwinChat"

        /** The octwin.ai pages. Use only the one you load, if you prefer. */
        val ALLOWED_ORIGINS = setOf("https://octwin.ai", "https://staging.octwin.ai")
    }
}
