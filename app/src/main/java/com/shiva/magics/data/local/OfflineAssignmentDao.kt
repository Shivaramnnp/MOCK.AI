package com.shiva.magics.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface OfflineAssignmentDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdate(assignment: OfflineAssignmentEntity): Long

    @Query("SELECT * FROM offline_assignments WHERE isSynced = 0 ORDER BY createdAt ASC LIMIT 50")
    suspend fun getUnsyncedAssignments(): List<OfflineAssignmentEntity>

    @Query("UPDATE offline_assignments SET isSynced = 1 WHERE assignmentId = :assignmentId")
    suspend fun markAsSynced(assignmentId: String)
    
    @Query("DELETE FROM offline_assignments WHERE isSynced = 1")
    suspend fun deleteSyncedLogs()
}
