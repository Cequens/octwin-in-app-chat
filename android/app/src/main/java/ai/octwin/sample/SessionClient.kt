package ai.octwin.sample

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** A signed chat session from your server. */
data class ChatSession(
    /** The app page to open: https://octwin.ai/c/app/<widgetId>#from=...&identity=... */
    val url: String,
    /** The same signed values, for window.octwin.setIdentity(...) after "identity_refused". */
    val from: String,
    val identity: String,
    val identitySig: String,
)

/**
 * Talks to your server (../server). Your server holds the secrets; the app never does.
 * The calls block, so run them off the main thread.
 */
object SessionClient {
    /** Your server. Use https. A tunnel (cloudflared, ngrok) to your computer works well. */
    const val SERVER_URL = "https://your-server.example.com"

    /**
     * The logged-in user. REPLACE THIS WITH YOUR LOGIN.
     * The sample server trusts this id so you can try it. A real app sends its own
     * session token, and the server finds the user from it.
     */
    const val DEMO_USER_ID = "42"

    /** POST /chat/session. Call it each time the chat opens: a session is short-lived. */
    fun fetchSession(): ChatSession {
        val json = post("/chat/session", JSONObject().put("userId", DEMO_USER_ID))
        return ChatSession(
            url = json.getString("url"),
            from = json.getString("from"),
            identity = json.getString("identity"),
            identitySig = json.getString("identity_sig"),
        )
    }

    /** POST /devices. Tells your server where to send this user's pushes. */
    fun registerDevice(fcmToken: String) {
        post("/devices", JSONObject().put("userId", DEMO_USER_ID).put("token", fcmToken))
    }

    private fun post(
        path: String,
        body: JSONObject,
    ): JSONObject {
        val connection = URL(SERVER_URL + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("content-type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray()) }

            val status = connection.responseCode
            if (status >= 300) throw IOException("$path answered $status")
            val text = connection.inputStream.bufferedReader().use { it.readText() }
            return if (text.isEmpty()) JSONObject() else JSONObject(text)
        } finally {
            connection.disconnect()
        }
    }
}
