package com.shiva.magics.util

import com.shiva.magics.data.local.TopicMasteryDao
import com.shiva.magics.data.local.WeakTopicDao
import com.shiva.magics.data.local.WeakTopicEntity
import com.shiva.magics.data.local.TopicMasteryEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Sprint 2 — Weak Topic Detector
 * Identifies high-risk topics based on mastery thresholds and activity volume.
 */
object WeakTopicDetector {

    private const val MASTERY_THRESHOLD = 60.0f
    private const val MIN_ATTEMPTS = 5
    private const val MAX_ALERTS = 3

    /**
     * Evaluates all topics and updates the Weak Topic Registry.
     * This follows the required Risk Classification and Stability rules.
     */
    suspend fun evaluateAndSync(
        masteryDao: TopicMasteryDao,
        weakTopicDao: WeakTopicDao
    ) = withContext(Dispatchers.IO) {
        
        val allMastery = masteryDao.getAllMasteryOnce()
        val weakResults = allMastery.mapNotNull { classifyTopic(it) }
            .sortedBy { it.masteryScore }
            .take(MAX_ALERTS)

        // Clear existing to refresh or we can do a smart diff. 
        // For Week 2, a clear-and-sync is safe and deterministic.
        weakTopicDao.clearAll()
        
        for (result in weakResults) {
            weakTopicDao.upsertWeakTopic(
                WeakTopicEntity(
                    topic = result.topic,
                    riskLevel = result.riskLevel.name,
                    masteryScore = result.masteryScore,
                    trendDirection = result.trend.name,
                    recommendedAction = "${result.recommendedAction.shortMessage}. ${result.recommendedAction.focusHint}"
                )
            )
        }
        
        android.util.Log.d("WeakTopicDetector", "Synced ${weakResults.size} weak topics to registry.")
    }

    /**
     * Logic for classifying a single topic based on the latest mastery state.
     */
    fun classifyTopic(mastery: TopicMasteryEntity): WeakTopicResult? {
        // Rule: Stability Mechanism - Noise Filtering
        if (mastery.totalAttempts < MIN_ATTEMPTS) return null
        
        // Rule: Mastery Threshold
        if (mastery.masteryLevel >= MASTERY_THRESHOLD) return null

        // Rule: Risk Mapping
        val riskLevel = when {
            mastery.masteryLevel < 40.0f -> RiskLevel.CRITICAL
            mastery.masteryLevel < 50.0f -> RiskLevel.HIGH
            mastery.masteryLevel < 60.0f -> RiskLevel.MEDIUM
            else -> RiskLevel.LOW
        }

        // Rule: Trend Detection
        // For now, since we use EWMA in MasteryTracker, we can't do "last 3" without history.
        // We will default to STABLE until MasteryHistory is implemented in Week 3 or a sub-task.
        val trend = TrendDirection.STABLE 

        val action = generateRecommendation(mastery.topic, riskLevel)

        return WeakTopicResult(
            topic = mastery.topic,
            masteryScore = mastery.masteryLevel,
            trend = trend,
            riskLevel = riskLevel,
            recommendedAction = action
        )
    }

    private fun generateRecommendation(topic: String, risk: RiskLevel): RecommendedAction {
        return when (risk) {
            RiskLevel.CRITICAL -> RecommendedAction(
                shortMessage = "Urgent: Review $topic concepts",
                practiceGoal = 15,
                focusHint = "Focus on fundamental definitions and core logic."
            )
            RiskLevel.HIGH -> RecommendedAction(
                shortMessage = "Focus on $topic revision",
                practiceGoal = 10,
                focusHint = "Target difficult questions you missed recently."
            )
            RiskLevel.MEDIUM -> RecommendedAction(
                shortMessage = "Practice $topic today",
                practiceGoal = 5,
                focusHint = "Review traversal and common edge cases."
            )
            else -> RecommendedAction(
                shortMessage = "Keep it up!",
                practiceGoal = 0,
                focusHint = "Maintain your current pace."
            )
        }
    }
}
