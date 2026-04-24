package com.shiva.magics.util

import com.shiva.magics.data.local.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID

/**
 * Phase 7 — Personal AI Coach: Daily Insight Generator
 * Analyzes multi-dimensional user data to generate proactive coaching messages.
 */
object DailyInsightGenerator {

    enum class InsightPriority {
        INFO,
        WARNING,
        CRITICAL
    }

    /**
     * Generates a personalized insight based on current system state.
     */
    suspend fun generate(
        db: AppDatabase,
        userId: String = "default_user"
    ) = withContext(Dispatchers.IO) {
        
        val masteryDao = db.topicMasteryDao()
        val streakDao = db.studyStreakDao()
        val predictionDao = db.performancePredictionDao()
        val insightDao = db.dailyInsightDao()

        val allMastery = masteryDao.getAllMasteryOnce()
        val streak = streakDao.getStreak(userId)
        val latestPrediction = predictionDao.getLatestPredictionOnce()

        val message: String
        val priority: InsightPriority

        // Rule 1: Streak Momentum (Retention Priority)
        if (streak != null && streak.currentStreak > 0 && streak.currentStreak % 5 == 0) {
            message = "🔥 You're on a ${streak.currentStreak}-day streak! Consistency is your greatest strength. Keep it going!"
            priority = InsightPriority.INFO
        } 
        // Rule 2: Critical Weakness (Learning Priority)
        else if (allMastery.any { it.masteryLevel < 40f }) {
            val weakest = allMastery.filter { it.masteryLevel < 40f }.minBy { it.masteryLevel }
            message = "⚠️ Performance Alert: Your mastery in '${weakest.topic}' is critical (${weakest.masteryLevel.toInt()}%). Schedule a revision today."
            priority = InsightPriority.CRITICAL
        }
        // Rule 3: Exam Readiness (Prediction Priority)
        else if (latestPrediction != null && latestPrediction.predictedScore < 70f) {
            message = "📉 Goal Gap: Your predicted score is ${latestPrediction.predictedScore.toInt()}%. Focus on weak topics to reach your 80% target."
            priority = InsightPriority.WARNING
        }
        // Rule 4: Mastery Improvement (Encouragement Priority)
        else if (allMastery.any { it.masteryLevel > 85f }) {
            val strongest = allMastery.filter { it.masteryLevel > 85f }.maxBy { it.masteryLevel }
            message = "🌟 Mastery Unlocked: You've mastered '${strongest.topic}'! Excellent progress—keep applying this focus to other topics."
            priority = InsightPriority.INFO
        }
        // Fallback: General Guidance
        else {
            message = "📚 Daily Goal: Review at least 3 topics today to maintain your learning momentum."
            priority = InsightPriority.INFO
        }

        val insightEntity = DailyInsightEntity(
            id = UUID.randomUUID().toString(),
            message = message,
            priority = priority.name,
            createdAt = System.currentTimeMillis()
        )

        insightDao.insertInsight(insightEntity)
        TelemetryCollector.record(TelemetryCollector.EventType.STREAK_INCREMENTED, "insight_generated", streak?.currentStreak?.toDouble() ?: 0.0)
    }
}
