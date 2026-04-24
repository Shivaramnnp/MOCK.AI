package com.shiva.magics.util

import com.shiva.magics.data.local.ExamAnalyticsEntity
import com.shiva.magics.data.model.ExamAttempt
import com.shiva.magics.data.model.ReadinessStatus

/**
 * Phase 4 — Week 4: Exam Analytics Engine
 * Transforms raw attempt data into diagnostic performance insights.
 */
object ExamAnalyticsEngine {

    /**
     * Generates a full analytics suite for a completed exam attempt.
     */
    fun generateAnalytics(attempt: ExamAttempt): ExamAnalyticsEntity {
        val score = calculateScore(attempt.correctCount, attempt.totalQuestions)
        val avgTime = calculateAverageTime(attempt.timeSpentSeconds, attempt.questionsAttempted)
        val stressIndex = calculateStressIndex(attempt.timePressureScore, attempt.errorRateScore)
        val readiness = evaluateReadiness(score)

        return ExamAnalyticsEntity(
            examId = attempt.id,
            score = score,
            averageTimePerQuestion = avgTime,
            stressIndex = stressIndex,
            readinessStatus = readiness.name
        )
    }

    private fun calculateScore(correct: Int, total: Int): Float {
        if (total == 0) return 0f
        return (correct.toFloat() / total.toFloat()) * 100f
    }

    private fun calculateAverageTime(totalTime: Int, attempted: Int): Float {
        if (attempted == 0) return 0f
        return totalTime.toFloat() / attempted.toFloat()
    }

    private fun calculateStressIndex(timePressure: Int, errorRate: Int): Float {
        // formula: (timePressure * 0.6) + (errorRate * 0.4)
        return (timePressure * 0.6f) + (errorRate * 0.4f)
    }

    private fun evaluateReadiness(score: Float): ReadinessStatus {
        return when {
            score >= 80 -> ReadinessStatus.READY
            score >= 65 -> ReadinessStatus.NEAR_READY
            score >= 50 -> ReadinessStatus.NEEDS_WORK
            else -> ReadinessStatus.NOT_READY
        }
    }

    /**
     * Classifies time efficiency based on seconds per question.
     */
    fun classifyEfficiency(avgTime: Float): String {
        return when {
            avgTime < 30 -> "FAST"
            avgTime <= 90 -> "OPTIMAL"
            else -> "SLOW"
        }
    }
}
