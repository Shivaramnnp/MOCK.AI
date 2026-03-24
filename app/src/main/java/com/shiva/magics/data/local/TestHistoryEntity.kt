package com.shiva.magics.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "test_history")
data class TestHistoryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val category: String,
    val questionCount: Int,
    val timeLimitSeconds: Int? = null,
    val bestScore: Int? = null,
    val bestScorePercent: Float? = null,
    val wrongAnswers: Int? = null,
    val lastTakenAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis()
)
