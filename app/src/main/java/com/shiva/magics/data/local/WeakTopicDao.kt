package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface WeakTopicDao {

    @Query("SELECT * FROM weak_topics ORDER BY masteryScore ASC")
    fun getAllWeakTopics(): Flow<List<WeakTopicEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertWeakTopic(entity: WeakTopicEntity)

    @Query("DELETE FROM weak_topics WHERE topic = :topic")
    suspend fun deleteWeakTopic(topic: String)

    @Query("DELETE FROM weak_topics")
    suspend fun clearAll()
}
