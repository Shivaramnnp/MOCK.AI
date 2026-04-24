package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "daily_insights")
data class DailyInsightEntity(
    @PrimaryKey val id: String,
    val message: String,
    val priority: String, // INFO, WARNING, CRITICAL
    val createdAt: Long = System.currentTimeMillis()
)

@Dao
interface DailyInsightDao {
    @Query("SELECT * FROM daily_insights ORDER BY createdAt DESC LIMIT 1")
    fun getLatestInsight(): Flow<DailyInsightEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertInsight(insight: DailyInsightEntity)

    @Query("DELETE FROM daily_insights WHERE createdAt < :timestamp")
    suspend fun clearOldInsights(timestamp: Long)
}
