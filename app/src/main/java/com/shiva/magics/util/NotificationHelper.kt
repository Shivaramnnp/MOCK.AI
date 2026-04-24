package com.shiva.magics.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.shiva.magics.MainActivity
import com.shiva.magics.R

object NotificationHelper {

    private const val CHANNEL_ID = "mock_ai_notifications"
    private const val CHANNEL_NAME = "Mock AI Updates"
    private const val CHANNEL_DESC = "Notifications for class assignments, results, and updates."

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_DEFAULT
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                description = CHANNEL_DESC
            }
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun showNotification(context: Context, title: String, message: String, notificationId: Int = System.currentTimeMillis().toInt()) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent: PendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE
        )

        // Using android.R.drawable.ic_dialog_info as placeholder icon.
        // It's recommended to replace this with a proper transparent PNG app icon in the future.
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        with(NotificationManagerCompat.from(context)) {
            try {
                notify(notificationId, builder.build())
            } catch (e: SecurityException) {
                // Handle case where notification permission is missing on Android 13+
                android.util.Log.e("NotificationHelper", "Missing POST_NOTIFICATIONS permission", e)
            }
        }
    }

    // High level helpers
    fun showAssignmentAssigned(context: Context, testTitle: String, className: String) {
        showNotification(
            context,
            title = "New Assignment",
            message = "You have a new assignment '$testTitle' in '$className'"
        )
    }

    fun showAssignmentGraded(context: Context, testTitle: String, score: String) {
        showNotification(
            context,
            title = "Assignment Graded",
            message = "Your test '$testTitle' score is $score."
        )
    }

    fun showStreakReminder(context: Context, streakDays: Int) {
        val title = if (streakDays > 0) "🔥 $streakDays Day Streak!" else "Start your streak!"
        val message = if (streakDays > 0) {
            "Don't break your progress. Complete 1 task to reach ${streakDays + 1} days!"
        } else {
            "Consistency is key. Start your study streak today!"
        }
        showNotification(context, title, message)
    }
}
