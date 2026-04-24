package com.shiva.magics.util

import kotlinx.serialization.Serializable

/**
 * Sprint 3 — Week 1: Study Planner Models
 */

@Serializable
data class StudyPlan(
    val id: String,
    val generatedAt: Long = System.currentTimeMillis(),
    val examDate: Long?,
    val dailyTimeGoalMinutes: Int,
    val sessions: List<StudySession>,
    val overallStatus: String // e.g. "On Track", "Behind", "Critical"
)

@Serializable
data class StudySession(
    val date: Long,
    val totalDurationMinutes: Int,
    val tasks: List<StudyTask>
)

@Serializable
data class StudyTask(
    val topic: String,
    val type: TaskType,
    val durationMinutes: Int,
    val description: String,
    val isCompleted: Boolean = false,
    val priority: TaskPriority
)

@Serializable
enum class TaskType {
    REVISION,
    PRACTICE,
    ASSESSMENT,
    RECAP
}

@Serializable
enum class TaskPriority {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}
