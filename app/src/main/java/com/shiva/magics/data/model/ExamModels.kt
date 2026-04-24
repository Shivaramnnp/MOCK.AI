package com.shiva.magics.data.model

import kotlinx.serialization.Serializable

/**
 * Phase 4 — Week 1: Exam Simulation Models
 */

@Serializable
data class ExamTemplate(
    val id: String,
    val title: String,
    val description: String,
    val totalDurationMinutes: Int,
    val sections: List<ExamSection>,
    val difficulty: ExamDifficulty = ExamDifficulty.MEDIUM,
    val passingScorePercent: Int = 40
)

@Serializable
data class ExamSection(
    val id: String,
    val name: String,
    val durationMinutes: Int,
    val questionCount: Int,
    val sectionType: SectionType = SectionType.MIXED,
    val instructions: String? = null
)

@Serializable
enum class SectionType {
    MCQ,
    TRUE_FALSE,
    NUMERICAL,
    SUBJECTIVE,
    MIXED
}

@Serializable
enum class ExamDifficulty {
    EASY,
    MEDIUM,
    HARD,
    COMPETITIVE
}

@Serializable
data class ExamAttempt(
    val id: String,
    val templateId: String,
    val startedAt: Long,
    val completedAt: Long? = null,
    val questionsAttempted: Int = 0,
    val correctCount: Int = 0,
    val totalQuestions: Int = 0,
    val timeSpentSeconds: Int = 0,
    val timePressureScore: Int = 0, // 0-100 derived from time left vs avg
    val errorRateScore: Int = 0,    // 0-100 derived from incorrects
    val isAutoSubmitted: Boolean = false
)

enum class ReadinessStatus {
    READY,
    NEAR_READY,
    NEEDS_WORK,
    NOT_READY
}
