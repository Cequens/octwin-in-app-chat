package ai.octwin.sample

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** The notification channel for chat messages. AndroidManifest.xml names it as the FCM default. */
const val CHAT_CHANNEL_ID = "chat"

/**
 * Receives the pushes your server sends for unread chat messages.
 *
 * When the app is in the BACKGROUND, Android shows the notification itself and this
 * class is not called. A tap then opens the launcher activity, with the push data
 * (type, conversation_id) as intent extras. In this sample ChatActivity is the
 * launcher. In your app, check those extras in your launcher activity and start
 * ChatActivity.
 */
class ChatMessagingService : FirebaseMessagingService() {
    /**
     * Firebase gave this phone a new push address. Firebase calls this off the main thread.
     * Deprecated since firebase-messaging 25.1, but still called: see registerForPush()
     * in ChatActivity for why the sample keeps it.
     */
    @Suppress("OVERRIDE_DEPRECATION")
    override fun onNewToken(token: String) {
        try {
            SessionClient.registerDevice(token)
        } catch (e: Exception) {
            Log.w(TAG, "Could not register this phone for push", e)
        }
    }

    /** A push arrived while the app is in the FOREGROUND. Show it ourselves. */
    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["type"] != "octwin_chat") return
        val conversationId = message.data["conversation_id"] ?: return
        showChatNotification(conversationId, message.notification?.body ?: "You have a new message")
    }

    private fun showChatNotification(
        conversationId: String,
        text: String,
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return // the user said no to notifications
        }

        // A tap opens a fresh ChatActivity: it loads a new signed session, and the chat
        // shows the messages the user missed. CLEAR_TOP replaces a chat that is already open.
        val intent =
            Intent(this, ChatActivity::class.java)
                .putExtra("type", "octwin_chat")
                .putExtra("conversation_id", conversationId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val tap =
            PendingIntent.getActivity(
                this,
                conversationId.hashCode(),
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )

        ensureChatChannel(this)
        val notification =
            NotificationCompat
                .Builder(this, CHAT_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_notify_chat) // use your own icon
                .setContentTitle("New message")
                .setContentText(text)
                .setAutoCancel(true)
                .setContentIntent(tap)
                .build()
        // The conversation id is the tag, like the FCM `tag` your server sets: a new alert
        // for the same chat replaces the old notification instead of adding one.
        NotificationManagerCompat.from(this).notify(conversationId, 0, notification)
    }

    private companion object {
        const val TAG = "OctwinChat"
    }
}

/** Android 8 and newer show a notification only through a channel. Safe to call often. */
fun ensureChatChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHAT_CHANNEL_ID, "Chat messages", NotificationManager.IMPORTANCE_HIGH)
    context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
}
