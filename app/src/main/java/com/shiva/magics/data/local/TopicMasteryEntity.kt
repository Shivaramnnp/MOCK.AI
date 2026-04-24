package com.shiva.magics.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "topic_mastery")
data class TopicMasteryEntity(
    @PrimaryKey val topic: String,
    val totalAttempts: Int = 0,
    val correctAttempts: Int = 0,
    val masteryLevel: Float = 0f, // 0.0 to 100.0
    val averageResponseTimeMs: Long = 0,
    val averageTrustScore: Float = 0f,
    val lastAttemptAt: Long = System.currentTimeMillis()
)
