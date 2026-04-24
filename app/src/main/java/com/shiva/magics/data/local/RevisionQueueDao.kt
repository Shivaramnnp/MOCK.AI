package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface RevisionQueueDao {

    @Query("SELECT * FROM revision_queue ORDER BY nextReviewAt ASC")
    fun getFullQueue(): Flow<List<RevisionQueueEntity>>

    @Query("SELECT * FROM revision_queue WHERE nextReviewAt <= :timestamp ORDER BY lastUpdatedAt DESC")
    suspend fun getPendingReviews(timestamp: Long): List<RevisionQueueEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertReview(entity: RevisionQueueEntity)

    @Query("DELETE FROM revision_queue WHERE topic = :topic")
    suspend fun deleteReview(topic: String)

    @Query("DELETE FROM revision_queue")
    suspend fun clearHistory()
}
