package com.shiva.magics.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "offline_assignments")
data class OfflineAssignmentEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val assignmentId: String,
    val score: Int,
    val total: Int,
    val isSynced: Boolean = false,
    val createdAt: Long = System.currentTimeMillis()
)
