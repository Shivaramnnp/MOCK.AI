package com.shiva.magics.data.local

import androidx.room.*

@Entity(tableName = "performance_predictions")
data class PerformancePredictionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val userId: String, // Future-proofing for multi-user
    val predictedScore: Float,
    val confidence: String,
    val riskLevel: String,
    val readinessStatus: String,
    val generatedAt: Long = System.currentTimeMillis()
)
