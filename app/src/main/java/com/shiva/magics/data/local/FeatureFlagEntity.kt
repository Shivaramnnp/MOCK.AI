package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "feature_flags")
data class FeatureFlagEntity(
    @PrimaryKey val featureName: String,
    val enabled: Boolean,
    val updatedAt: Long = System.currentTimeMillis()
)

@Dao
interface FeatureFlagDao {
    @Query("SELECT * FROM feature_flags")
    fun getAllFlags(): Flow<List<FeatureFlagEntity>>

    @Query("SELECT * FROM feature_flags")
    suspend fun getAllFlagsOnce(): List<FeatureFlagEntity>

    @Query("SELECT enabled FROM feature_flags WHERE featureName = :name")
    suspend fun isFeatureEnabled(name: String): Boolean?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun setFeatureFlag(flag: FeatureFlagEntity)
    
    @Query("SELECT * FROM feature_flags WHERE featureName = :name")
    suspend fun getFlag(name: String): FeatureFlagEntity?
}
