package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface TopicMasteryDao {

    @Query("SELECT * FROM topic_mastery ORDER BY masteryLevel DESC")
    fun getAllMastery(): Flow<List<TopicMasteryEntity>>

    @Query("SELECT * FROM topic_mastery")
    suspend fun getAllMasteryOnce(): List<TopicMasteryEntity>

    @Query("SELECT * FROM topic_mastery WHERE topic = :topic LIMIT 1")
    suspend fun getMasteryForTopic(topic: String): TopicMasteryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdate(mastery: TopicMasteryEntity)

    @Query("SELECT * FROM topic_mastery ORDER BY masteryLevel ASC LIMIT :limit")
    fun getWeakestTopics(limit: Int): Flow<List<TopicMasteryEntity>>
}
