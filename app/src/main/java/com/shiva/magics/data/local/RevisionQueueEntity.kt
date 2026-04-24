package com.shiva.magics.data.local

import androidx.room.*

@Entity(tableName = "revision_queue")
data class RevisionQueueEntity(
    @PrimaryKey val topic: String,
    val nextReviewAt: Long,
    val intervalDays: Int,
    val retentionProbability: Float,
    val lastUpdatedAt: Long = System.currentTimeMillis()
)
