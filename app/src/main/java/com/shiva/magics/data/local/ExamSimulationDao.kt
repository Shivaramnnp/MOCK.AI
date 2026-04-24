package com.shiva.magics.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "exam_templates")
data class ExamTemplateEntity(
    @PrimaryKey val id: String,
    val title: String,
    val totalDurationMinutes: Int,
    val templateJson: String, // Full ExamTemplate
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "mock_exam_history")
data class MockExamHistoryEntity(
    @PrimaryKey val id: String,
    val templateId: String,
    val score: Float,
    val durationMinutes: Int,
    val completedAt: Long,
    val attemptJson: String // Full ExamAttempt data
)

@Dao
interface ExamSimulationDao {

    @Query("SELECT * FROM exam_templates ORDER BY createdAt DESC")
    fun getAllTemplates(): Flow<List<ExamTemplateEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTemplate(template: ExamTemplateEntity)

    @Query("SELECT * FROM mock_exam_history ORDER BY completedAt DESC")
    fun getExamHistory(): Flow<List<MockExamHistoryEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertExamAttempt(attempt: MockExamHistoryEntity)

    @Query("SELECT * FROM exam_templates WHERE id = :id")
    suspend fun getTemplateById(id: String): ExamTemplateEntity?
}
