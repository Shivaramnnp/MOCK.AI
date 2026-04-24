package com.shiva.magics.util

/**
 * Sprint 2 — Week 3: Performance Predictor Models
 */

data class PerformancePrediction(
    val predictedScore: Float,
    val confidence: PredictionConfidence,
    val riskLevel: PredictionRiskLevel,
    val readinessStatus: ReadinessStatus,
    val generatedAt: Long = System.currentTimeMillis()
)

enum class PredictionConfidence {
    LOW,
    MEDIUM,
    HIGH
}

enum class PredictionRiskLevel {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}

enum class ReadinessStatus {
    NOT_READY,
    NEEDS_IMPROVEMENT,
    READY,
    EXCELLENT
}
