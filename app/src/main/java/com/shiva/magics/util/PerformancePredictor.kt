package com.shiva.magics.util

import com.shiva.magics.data.local.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Sprint 2 — Week 3: Performance Predictor
 * Converts diagnostic mastery data into future performance forecasts.
 */
object PerformancePredictor {

    /**
     * Estimates likely exam score based on weighted performance signals.
     * Formula: (0.40 * accuracy) + (0.25 * mastery) + (0.20 * trend) + (0.15 * trust)
     */
    suspend fun calculateAndSync(
        testDao: TestHistoryDao,
        masteryDao: TopicMasteryDao,
        predictionDao: PerformancePredictionDao
    ): PerformancePrediction = withContext(Dispatchers.IO) {
        
        val tests = testDao.getAllTestsOnce()
        val masteries = masteryDao.getAllMasteryOnce()
        
        // 1. Overall Accuracy (avg of best scores)
        val overallAccuracy = if (tests.isEmpty()) 0f 
            else tests.mapNotNull { it.bestScorePercent }.average().toFloat()
            
        // 2. Mastery Average (avg of all topics)
        val masteryAverage = if (masteries.isEmpty()) 0f
            else masteries.map { it.masteryLevel }.average().toFloat()
            
        // 3. Recent Trend Score (avg of top 5 most recent topics)
        val recentTrendScore = if (masteries.isEmpty()) 0f
            else masteries.sortedByDescending { it.lastAttemptAt }
                .take(5)
                .map { it.masteryLevel }
                .average().toFloat()
                
        // 4. Trust Score Average
        val trustScoreAverage = if (masteries.isEmpty()) 0f
            else masteries.map { it.averageTrustScore }.average().toFloat() * 100f // Scale to 100
            
        val rawPredictedScore = (0.40f * overallAccuracy) +
                            (0.25f * masteryAverage) +
                            (0.20f * recentTrendScore) +
                            (0.15f * trustScoreAverage)
                            
        // Rule: Smoothing Mechanism
        // newPrediction = 0.70 * previous + 0.30 * current
        val lastPrediction = predictionDao.getLatestPredictionOnce()
        val smoothedScore = if (lastPrediction == null) {
            rawPredictedScore
        } else {
            (0.70f * lastPrediction.predictedScore) + (0.30f * rawPredictedScore)
        }
        
        // Confidence Estimation (based on total academic volume)
        val totalAttempts = masteries.sumOf { it.totalAttempts }
        val confidence = when {
            totalAttempts >= 20 -> PredictionConfidence.HIGH
            totalAttempts >= 10 -> PredictionConfidence.MEDIUM
            else -> PredictionConfidence.LOW
        }
        
        // Risk Level Mapping
        val risk = when {
            smoothedScore < 40 -> PredictionRiskLevel.CRITICAL
            smoothedScore < 55 -> PredictionRiskLevel.HIGH
            smoothedScore < 70 -> PredictionRiskLevel.MEDIUM
            else -> PredictionRiskLevel.LOW
        }
        
        // Readiness Status Mapping
        val readiness = when {
            smoothedScore < 50 -> ReadinessStatus.NOT_READY
            smoothedScore < 65 -> ReadinessStatus.NEEDS_IMPROVEMENT
            smoothedScore < 80 -> ReadinessStatus.READY
            else -> ReadinessStatus.EXCELLENT
        }
        
        val prediction = PerformancePrediction(
            predictedScore = smoothedScore,
            confidence = confidence,
            riskLevel = risk,
            readinessStatus = readiness
        )
        
        // Persist the forecast
        predictionDao.insertPrediction(
            PerformancePredictionEntity(
                userId = "shared_user",
                predictedScore = prediction.predictedScore,
                confidence = prediction.confidence.name,
                riskLevel = prediction.riskLevel.name,
                readinessStatus = prediction.readinessStatus.name
            )
        )
        
        android.util.Log.d("PerformancePredictor", "Forecast Generated: ${"%.1f".format(smoothedScore)}% (Confidence: $confidence)")
        
        prediction
    }
}
