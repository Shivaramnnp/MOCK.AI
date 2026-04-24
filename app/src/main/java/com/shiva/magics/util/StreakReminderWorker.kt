package com.shiva.magics.util

import android.content.Context
import androidx.work.*
import com.shiva.magics.data.local.AppDatabase
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * Phase 6 — Retention & Habit Engine: Streak Reminder Worker
 * Triggers a notification at 7:00 PM if the user hasn't completed a task today.
 */
class StreakReminderWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        val database = AppDatabase.getDatabase(applicationContext)
        val streakDao = database.studyStreakDao()
        val taskDao = database.dailyTaskDao()

        val now = System.currentTimeMillis()
        val calendar = Calendar.getInstance()
        calendar.timeInMillis = now
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        val startOfDay = calendar.timeInMillis
        
        calendar.set(Calendar.HOUR_OF_DAY, 23)
        calendar.set(Calendar.MINUTE, 59)
        val endOfDay = calendar.timeInMillis

        // Check if any task is completed today
        val completedCount = taskDao.getCompletedCountForDay(startOfDay, endOfDay)
        
        if (completedCount == 0) {
            val streak = streakDao.getStreak()
            NotificationHelper.showStreakReminder(applicationContext, streak?.currentStreak ?: 0)
            TelemetryCollector.record(TelemetryCollector.EventType.NOTIFICATION_SENT, "streak_reminder", (streak?.currentStreak ?: 0).toDouble())
        }

        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "streak_reminder_work"

        fun schedule(context: Context) {
            val now = Calendar.getInstance()
            val target = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, 19) // 7:00 PM
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
            }

            if (target.before(now)) {
                target.add(Calendar.DAY_OF_YEAR, 1)
            }

            val delay = target.timeInMillis - now.timeInMillis

            val request = PeriodicWorkRequestBuilder<StreakReminderWorker>(24, TimeUnit.HOURS)
                .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.NOT_REQUIRED).build())
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request
            )
        }
    }
}
