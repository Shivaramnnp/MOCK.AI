package com.shiva.magics.data.local

import androidx.room.*

@Entity(tableName = "exam_timer_state")
data class ExamTimerStateEntity(
    @PrimaryKey val examId: String,
    val remainingSeconds: Int,
    val lastUpdatedAt: Long, // Use System.currentTimeMillis() for recovery calculation
    val sectionIndex: Int = 0
)

// I will add the DAO methods to the existing ExamIntegrityDao for consistency.
