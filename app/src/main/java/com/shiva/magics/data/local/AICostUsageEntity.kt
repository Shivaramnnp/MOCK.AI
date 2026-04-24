package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "ai_cost_usage")
data class AICostUsageEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val userId: String,
    val modelName: String,
    val tokensUsed: Int,
    val estimatedCost: Double,
    val timestamp: Long = System.currentTimeMillis()
)

@Dao
interface AICostDao {
    @Query("SELECT SUM(estimatedCost) FROM ai_cost_usage WHERE timestamp > :startTime")
    suspend fun getCostForPeriod(startTime: Long): Double?

    @Query("SELECT SUM(tokensUsed) FROM ai_cost_usage WHERE timestamp > :startTime")
    suspend fun getTokensForPeriod(startTime: Long): Int?

    @Insert
    suspend fun insertUsage(usage: AICostUsageEntity)

    @Query("SELECT * FROM ai_cost_usage ORDER BY timestamp DESC LIMIT 100")
    fun getRecentUsage(): Flow<List<AICostUsageEntity>>
}
