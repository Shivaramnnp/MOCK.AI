package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface StudyPlanDao {

    @Query("SELECT * FROM study_plans WHERE isActive = 1 LIMIT 1")
    fun getActivePlan(): Flow<StudyPlanEntity?>

    @Query("SELECT * FROM study_plans WHERE isActive = 1 LIMIT 1")
    suspend fun getActivePlanOnce(): StudyPlanEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPlan(plan: StudyPlanEntity)

    @Query("UPDATE study_plans SET isActive = 0 WHERE id != :activeId")
    suspend fun deactivateOthers(activeId: String)

    @Query("DELETE FROM study_plans")
    suspend fun clearHistory()
}
