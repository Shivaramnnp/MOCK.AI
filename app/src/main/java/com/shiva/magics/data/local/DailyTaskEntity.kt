package com.shiva.magics.data.local

import androidx.room.*

@Entity(tableName = "daily_tasks")
data class DailyTaskEntity(
    @PrimaryKey val id: String,
    val topic: String,
    val taskType: String,
    val estimatedMinutes: Int,
    val priority: String,
    val dueAt: Long,
    val completed: Boolean,
    val createdAt: Long = System.currentTimeMillis()
)
