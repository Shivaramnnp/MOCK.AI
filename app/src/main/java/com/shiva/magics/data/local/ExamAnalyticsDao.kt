package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "exam_analytics")
data class ExamAnalyticsEntity(
    @PrimaryKey val examId: String,
    val score: Float,
    val averageTimePerQuestion: Float,
    val stressIndex: Float,
    val readinessStatus: String,
    val generatedAt: Long = System.currentTimeMillis()
)

@Dao
interface ExamAnalyticsDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAnalytics(analytics: ExamAnalyticsEntity)

    @Query("SELECT * FROM exam_analytics WHERE examId = :examId")
    suspend fun getAnalyticsForExam(examId: String): ExamAnalyticsEntity?

    @Query("SELECT * FROM exam_analytics ORDER BY generatedAt DESC")
    fun getAllExamAnalytics(): Flow<List<ExamAnalyticsEntity>>
}
