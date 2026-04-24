package com.shiva.magics.util

import com.shiva.magics.data.local.TopicMasteryDao
import com.shiva.magics.data.local.TopicMasteryEntity
import com.shiva.magics.data.model.ReviewItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Sprint 2: Intelligence Engine - Mastery Tracker
 * Measures user strength on per-topic granularity dynamically evaluating mastery percentage.
 */
object MasteryTracker {

    /**
     * Processes a completed test, updating the persistent intelligence model
     * with the latest performance telemetry for each topic.
     *
     * @param reviewItems The list of answered questions and correctness status.
     * @param elapsedSeconds The total time taken natively in the player (to estimate speed factor).
     * @param dao The TopicMasteryDao interfacing with the AppDatabase.
     */
    suspend fun processTestSubmission(
        reviewItems: List<ReviewItem>,
        elapsedSeconds: Int,
        testDao: com.shiva.magics.data.local.TestHistoryDao,
        masteryDao: TopicMasteryDao,
        weakTopicDao: com.shiva.magics.data.local.WeakTopicDao,
        predictionDao: com.shiva.magics.data.local.PerformancePredictionDao,
        studyPlanDao: com.shiva.magics.data.local.StudyPlanDao,
        revisionQueueDao: com.shiva.magics.data.local.RevisionQueueDao,
        dailyTaskDao: com.shiva.magics.data.local.DailyTaskDao
    ) = withContext(Dispatchers.IO) {
        
        // Group items strictly by declared topics, ignoring untagged queries
        val groupedByTopic = reviewItems
            .filter { !it.question.topic.isNullOrBlank() }
            .groupBy { it.question.topic!!.trim() }

        if (groupedByTopic.isEmpty()) return@withContext

        // Evaluate baseline average response time per question
        val baselineAvgResponseMs = (elapsedSeconds * 1000L) / Math.max(1, reviewItems.size)

        for ((topic, items) in groupedByTopic) {
            val totalNewAttempts = items.size
            if (totalNewAttempts == 0) continue
            
            val correctNewAttempts = items.count { it.isCorrect }
            val averageTrustScoreForTopicNode = items.map { it.question.trustScore }.average().toFloat().takeIf { !it.isNaN() } ?: 0f

            // Grab historical mastery metric map or initialize the base state
            val existing = masteryDao.getMasteryForTopic(topic) ?: TopicMasteryEntity(topic = topic)

            val updatedTotalAttempts = existing.totalAttempts + totalNewAttempts
            val updatedCorrectAttempts = existing.correctAttempts + correctNewAttempts

            // Simple cumulative accuracy projection. 
            // In Week 2 Weak Topic Detector we will use < 60% flags on this masteryLevel metric.
            val rawMasteryLevel = (updatedCorrectAttempts.toFloat() / updatedTotalAttempts.toFloat()) * 100f
            val masteryLevelSafe = rawMasteryLevel.coerceIn(0f, 100f)

            // Exponential mapping for continuous metrics:
            val safeAvgTime = if (existing.totalAttempts == 0) baselineAvgResponseMs 
                else (existing.averageResponseTimeMs * 0.7 + baselineAvgResponseMs * 0.3).toLong()
                
            val safeTrustScore = if (existing.totalAttempts == 0) averageTrustScoreForTopicNode 
                else (existing.averageTrustScore * 0.7f + averageTrustScoreForTopicNode * 0.3f)

            val newEntity = existing.copy(
                totalAttempts = updatedTotalAttempts,
                correctAttempts = updatedCorrectAttempts,
                masteryLevel = masteryLevelSafe,
                averageResponseTimeMs = safeAvgTime,
                averageTrustScore = safeTrustScore,
                lastAttemptAt = System.currentTimeMillis()
            )

            masteryDao.insertOrUpdate(newEntity)
            android.util.Log.d("MasteryTracker", "Updated Topic [$topic] -> Mastery: ${"%.1f".format(masteryLevelSafe)}%")
        }

        // Sprint 2 Week 2: Trigger Weak Topic Detection after sync
        WeakTopicDetector.evaluateAndSync(masteryDao, weakTopicDao)

        // Sprint 2 Week 3: Trigger Performance Prediction after sync
        PerformancePredictor.calculateAndSync(testDao, masteryDao, predictionDao)

        // Sprint 3 Week 1: Regenerate Study Plan after intelligence update
        val newPlan = StudyPlannerEngine.generatePlan(
            masteryDao = masteryDao,
            weakTopicDao = weakTopicDao,
            predictionDao = predictionDao
        )
        StudyPlannerEngine.saveAndActivatePlan(newPlan, studyPlanDao)

        // Sprint 3 Week 2: Sync Revision Queue after plan update
        RevisionScheduler.syncQueue(masteryDao, revisionQueueDao)

        // Sprint 3 Week 3: Generate Daily Tasks after scheduler update
        DailyTaskGenerator.generateAndSync(masteryDao, revisionQueueDao, studyPlanDao, dailyTaskDao)
    }
}
