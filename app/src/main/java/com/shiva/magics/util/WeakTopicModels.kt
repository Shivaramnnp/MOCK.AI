package com.shiva.magics.util

/**
 * Sprint 2 — Weak Topic Detector Output Models
 */

data class WeakTopicResult(
    val topic: String,
    val masteryScore: Float,          // 0.0 – 100.0 (matches TopicMasteryEntity.masteryLevel)
    val trend: TrendDirection,
    val riskLevel: RiskLevel,
    val recommendedAction: RecommendedAction
)

enum class TrendDirection {
    IMPROVING,
    DECLINING,
    STABLE
}

enum class RiskLevel {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL;

    fun label(): String = when (this) {
        CRITICAL -> "CRITICAL \uD83D\uDD34"
        HIGH     -> "HIGH \uD83D\uDFE0"
        MEDIUM   -> "MEDIUM \uD83D\uDFE1"
        LOW      -> "LOW \uD83D\uDFE2"
    }
}

data class RecommendedAction(
    val shortMessage: String,     // e.g. "Revise Trees tomorrow"
    val practiceGoal: Int,        // e.g. 10 (practice questions recommended)
    val focusHint: String         // e.g. "Focus on traversal methods"
)
