package com.shiva.magics.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "weak_topics")
data class WeakTopicEntity(
    @PrimaryKey val topic: String,
    val riskLevel: String,
    val masteryScore: Float,
    val trendDirection: String,
    val recommendedAction: String,
    val lastDetectedAt: Long = System.currentTimeMillis()
)
