package com.shiva.magics.util

import com.shiva.magics.data.local.RevisionQueueEntity
import com.shiva.magics.data.local.RevisionQueueDao
import com.shiva.magics.data.local.TopicMasteryDao
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.exp

/**
 * Sprint 3 — Week 2: Revision Scheduler
 * Spaced Repetition Engine for long-term memory stabilization.
 */
object RevisionScheduler {

    private const val MAX_REVIEWS_PER_DAY = 10
    private const val MIN_INTERVAL_DAYS = 1
    private const val MAX_INTERVAL_DAYS = 30

    /**
     * Re-calculates and syncs the entire revision queue based on new mastery data.
     * Enforces the daily review limit by prioritizing lowest mastery.
     */
    suspend fun syncQueue(
        masteryDao: TopicMasteryDao,
        queueDao: RevisionQueueDao
    ) = withContext(Dispatchers.IO) {
        
        val allMasteries = masteryDao.getAllMasteryOnce()
        if (allMasteries.isEmpty()) return@withContext

        // 1. Calculate new schedules for all topics
        val rawQueue = allMasteries.map { mastery ->
            val mastery01 = mastery.masteryLevel / 100f
            val interval = calculateInterval(mastery01)
            val nextReview = System.currentTimeMillis() + (interval * 24L * 60L * 60L * 1000L)
            
            // Calculate retention probability based on decay since last update
            val daysSinceLast = (System.currentTimeMillis() - mastery.lastAttemptAt).toFloat() / (24f * 60f * 60f * 1000f)
            val retention = calculateRetention(mastery01, daysSinceLast)

            RevisionQueueEntity(
                topic = mastery.topic,
                nextReviewAt = nextReview,
                intervalDays = interval,
                retentionProbability = retention
            )
        }

        // 2. Enforce Daily Limit (Rule: Prioritize lowest mastery first, limit to MAX)
        // Group by 'nextReviewAt' day to check limits, but for a simple "Global Queue" 
        // we can just prune the overall registry to keep the most urgent 10 if we want, 
        // or just mark them. The brief says "queueSize = 10".
        val prioritizedQueue = rawQueue
            .sortedBy { it.retentionProbability } // Lower retention = more urgent
            .take(MAX_REVIEWS_PER_DAY)

        // Sync to DB
        queueDao.clearHistory()
        for (item in prioritizedQueue) {
            queueDao.upsertReview(item)
        }
        
        android.util.Log.d("RevisionScheduler", "Synced Revision Queue. Size: ${prioritizedQueue.size}")
    }

    private fun calculateInterval(mastery: Float): Int {
        return when {
            mastery < 0.40f -> 1
            mastery < 0.60f -> 3
            mastery < 0.80f -> 7
            else -> 14
        }.coerceIn(MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS)
    }

    private fun calculateRetention(mastery: Float, daysSinceLastReview: Float): Float {
        if (mastery <= 0) return 0f
        val stabilityFactor = mastery * 10f
        return exp(-daysSinceLastReview / stabilityFactor).coerceIn(0f, 1f)
    }
}
