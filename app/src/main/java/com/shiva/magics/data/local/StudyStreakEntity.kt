package com.shiva.magics.data.local

import androidx.room.*

@Entity(tableName = "study_streak")
data class StudyStreakEntity(
    @PrimaryKey val userId: String = "default_user", // Single user for now
    val currentStreak: Int,
    val longestStreak: Int,
    val lastActiveDate: Long, // Start of day timestamp
    val graceDaysUsedThisWeek: Int = 0,
    val lastGraceDayUsedAt: Long = 0
)

@Dao
interface StudyStreakDao {
    @Query("SELECT * FROM study_streak WHERE userId = :userId")
    suspend fun getStreak(userId: String = "default_user"): StudyStreakEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun updateStreak(streak: StudyStreakEntity)

    @Query("UPDATE study_streak SET currentStreak = 0 WHERE userId = :userId")
    suspend fun resetStreak(userId: String = "default_user")
}
