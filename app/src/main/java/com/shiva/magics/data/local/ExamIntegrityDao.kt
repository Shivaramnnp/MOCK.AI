package com.shiva.magics.data.local

import androidx.room.*

@Entity(tableName = "exam_integrity_events")
data class ExamIntegrityEventEntity(
    @PrimaryKey val id: String,
    val examId: String,
    val eventType: String,
    val timestamp: Long = System.currentTimeMillis()
)

@Entity(tableName = "exam_active_sessions")
data class ExamSessionEntity(
    @PrimaryKey val examId: String,
    val templateId: String,
    val currentQuestionIndex: Int,
    val remainingTimeSeconds: Int,
    val answersJson: String, // Map<QuestionId, Answer>
    val violationCount: Int = 0,
    val lastUpdatedAt: Long = System.currentTimeMillis()
)

@Dao
interface ExamIntegrityDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertIntegrityEvent(event: ExamIntegrityEventEntity)

    @Query("SELECT * FROM exam_integrity_events WHERE examId = :examId")
    suspend fun getEventsForExam(examId: String): List<ExamIntegrityEventEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveSession(session: ExamSessionEntity)

    @Query("SELECT * FROM exam_active_sessions WHERE examId = :examId")
    suspend fun getSession(examId: String): ExamSessionEntity?

    @Query("DELETE FROM exam_active_sessions WHERE examId = :examId")
    suspend fun clearSession(examId: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveTimerState(state: ExamTimerStateEntity)

    @Query("SELECT * FROM exam_timer_state WHERE examId = :examId")
    suspend fun getTimerState(examId: String): ExamTimerStateEntity?

    @Query("DELETE FROM exam_timer_state WHERE examId = :examId")
    suspend fun clearTimerState(examId: String)
}
