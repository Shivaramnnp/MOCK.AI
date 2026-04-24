package com.shiva.magics.data.local

import androidx.room.*

@Entity(tableName = "study_plans")
data class StudyPlanEntity(
    @PrimaryKey val id: String,
    val generatedAt: Long,
    val examDate: Long?,
    val dailyTimeGoalMinutes: Int,
    val planJson: String, // Full serialized StudyPlan for rapid retrieval
    val isActive: Boolean = true
)
