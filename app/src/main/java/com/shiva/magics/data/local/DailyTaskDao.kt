package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface DailyTaskDao {

    @Query("SELECT * FROM daily_tasks WHERE dueAt >= :startOfDay AND dueAt <= :endOfDay ORDER BY priority DESC, createdAt ASC")
    fun getTasksForDay(startOfDay: Long, endOfDay: Long): Flow<List<DailyTaskEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTask(task: DailyTaskEntity)

    @Query("UPDATE daily_tasks SET completed = :completed WHERE id = :id")
    suspend fun updateCompletion(id: String, completed: Boolean)

    @Query("DELETE FROM daily_tasks WHERE dueAt < :timestamp AND completed = 0")
    suspend fun clearOldUncompletedTasks(timestamp: Long)

    @Query("SELECT COUNT(*) FROM daily_tasks WHERE completed = 1 AND dueAt >= :startOfDay AND dueAt <= :endOfDay")
    suspend fun getCompletedCountForDay(startOfDay: Long, endOfDay: Long): Int
}
