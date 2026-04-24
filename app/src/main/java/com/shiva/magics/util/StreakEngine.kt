package com.shiva.magics.util

import com.shiva.magics.data.local.StudyStreakDao
import com.shiva.magics.data.local.StudyStreakEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Calendar

/**
 * Phase 6 — Retention & Habit Engine: Streak Engine
 * Tracks consistent usage and manages streak increments, resets, and grace days.
 */
class StreakEngine(
    private val streakDao: StudyStreakDao,
    private val timeProvider: TimeProvider = DefaultTimeProvider
) {

    /**
     * Call this when a user completes a task.
     * Increments the streak if it's a new day of activity.
     */
    suspend fun onActivityDetected(userId: String = "default_user") = withContext(Dispatchers.IO) {
        val now = timeProvider.currentTimeMillis()
        val todayStart = getStartOfDay(now)
        
        val currentStreak = streakDao.getStreak(userId) ?: createInitialStreak(userId)
        
        if (currentStreak.lastActiveDate == todayStart) {
            // Already active today, nothing to do for streak increment
            return@withContext
        }

        val yesterdayStart = todayStart - (24 * 60 * 60 * 1000L)
        
        val newStreakCount: Int
        if (currentStreak.lastActiveDate == yesterdayStart) {
            // Consecutive day
            newStreakCount = currentStreak.currentStreak + 1
            TelemetryCollector.record(TelemetryCollector.EventType.STREAK_INCREMENTED, "streak", newStreakCount.toDouble())
        } else if (currentStreak.lastActiveDate == 0L) {
            // First time ever
            newStreakCount = 1
            TelemetryCollector.record(TelemetryCollector.EventType.STREAK_STARTED, "streak", 1.0)
        } else {
            // Broke the streak (but let's check for grace day later in a separate check or here?)
            // If we are here, it means lastActiveDate was before yesterday.
            newStreakCount = 1
            TelemetryCollector.record(TelemetryCollector.EventType.STREAK_BROKEN, "previous", currentStreak.currentStreak.toDouble())
            TelemetryCollector.record(TelemetryCollector.EventType.STREAK_STARTED, "streak", 1.0)
        }

        val updatedStreak = currentStreak.copy(
            currentStreak = newStreakCount,
            longestStreak = maxOf(currentStreak.longestStreak, newStreakCount),
            lastActiveDate = todayStart
        )
        
        streakDao.updateStreak(updatedStreak)
        
        // Check for rewards
        RewardManager.checkAndUnlockRewards(newStreakCount)
    }

    /**
     * Call this on app launch or periodic sync.
     * Resets streak if too much time has passed without activity, 
     * unless a grace day is available.
     */
    suspend fun syncStreakStatus(userId: String = "default_user") = withContext(Dispatchers.IO) {
        val now = timeProvider.currentTimeMillis()
        val todayStart = getStartOfDay(now)
        val yesterdayStart = todayStart - (24 * 60 * 60 * 1000L)
        
        val currentStreak = streakDao.getStreak(userId) ?: createInitialStreak(userId)
        
        if (currentStreak.lastActiveDate == 0L) {
            // Newly created streak, no sync needed
            return@withContext
        }
        
        if (currentStreak.lastActiveDate == todayStart || currentStreak.lastActiveDate == yesterdayStart) {
            // Streak is still alive (active today or was active yesterday)
            return@withContext
        }

        // Streak might be broken. Check for grace day.
        val lastActive = currentStreak.lastActiveDate
        val daysSinceLastActive = ((todayStart - lastActive) / (24 * 60 * 60 * 1000L)).toInt()
        
        if (daysSinceLastActive <= 2 && canUseGraceDay(currentStreak, now)) {
            // We missed only 1 day (today is > yesterday + lastActive), 
            // and we have a grace day available.
            // "Consume" the grace day by moving the lastActiveDate forward to yesterday.
            val updatedStreak = currentStreak.copy(
                lastActiveDate = yesterdayStart,
                graceDaysUsedThisWeek = currentStreak.graceDaysUsedThisWeek + 1,
                lastGraceDayUsedAt = now
            )
            streakDao.updateStreak(updatedStreak)
            android.util.Log.d("StreakEngine", "Grace day applied. Streak preserved at ${currentStreak.currentStreak}")
        } else if (daysSinceLastActive > 1) {
            // Reset streak
            if (currentStreak.currentStreak > 0) {
                TelemetryCollector.record(TelemetryCollector.EventType.STREAK_BROKEN, "lost", currentStreak.currentStreak.toDouble())
                streakDao.resetStreak(userId)
                android.util.Log.d("StreakEngine", "Streak reset due to inactivity.")
            }
        }
    }

    private fun canUseGraceDay(streak: StudyStreakEntity, now: Long): Boolean {
        // Logic: 1 grace day per week.
        val calendar = Calendar.getInstance()
        calendar.timeInMillis = now
        val currentWeek = calendar.get(Calendar.WEEK_OF_YEAR)
        
        if (streak.lastGraceDayUsedAt == 0L) return true
        
        calendar.timeInMillis = streak.lastGraceDayUsedAt
        val lastUsedWeek = calendar.get(Calendar.WEEK_OF_YEAR)
        
        return currentWeek != lastUsedWeek || streak.graceDaysUsedThisWeek < 1
    }

    private fun getStartOfDay(timestamp: Long): Long {
        val calendar = Calendar.getInstance()
        calendar.timeInMillis = timestamp
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        return calendar.timeInMillis
    }

    private suspend fun createInitialStreak(userId: String): StudyStreakEntity {
        val streak = StudyStreakEntity(
            userId = userId,
            currentStreak = 0,
            longestStreak = 0,
            lastActiveDate = 0L
        )
        streakDao.updateStreak(streak)
        return streak
    }
}
