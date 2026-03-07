package com.shivasruthi.magics.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface TestHistoryDao {
    @Query("SELECT * FROM test_history ORDER BY createdAt DESC")
    fun getAllTests(): Flow<List<TestHistoryEntity>>

    @Transaction
    @Query("SELECT * FROM test_history WHERE id = :id")
    fun getTestWithQuestions(id: Long): Flow<TestWithQuestions>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTest(entity: TestHistoryEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertQuestions(questions: List<QuestionEntity>)

    @Query("UPDATE test_history SET bestScore=:score, bestScorePercent=:percent, lastTakenAt=:timestamp WHERE id=:id")
    suspend fun updateBestScore(id: Long, score: Int, percent: Float, timestamp: Long)

    @Query("DELETE FROM test_history WHERE id = :id")
    suspend fun deleteTest(id: Long)

    @Query("DELETE FROM questions WHERE testId = :testId")
    suspend fun deleteQuestionsForTest(testId: Long)
}
