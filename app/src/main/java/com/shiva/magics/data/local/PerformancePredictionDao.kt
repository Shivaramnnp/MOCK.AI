package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface PerformancePredictionDao {

    @Query("SELECT * FROM performance_predictions ORDER BY generatedAt DESC LIMIT 1")
    suspend fun getLatestPredictionOnce(): PerformancePredictionEntity?

    @Query("SELECT * FROM performance_predictions ORDER BY generatedAt DESC")
    fun getAllPredictionsFlow(): Flow<List<PerformancePredictionEntity>>

    @Insert
    suspend fun insertPrediction(prediction: PerformancePredictionEntity)

    @Query("DELETE FROM performance_predictions")
    suspend fun clearHistory()
}
