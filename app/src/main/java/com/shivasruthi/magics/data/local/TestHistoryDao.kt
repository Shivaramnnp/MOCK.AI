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

    @Query("UPDATE test_history SET lastTakenAt=:timestamp WHERE id=:id")
    suspend fun updateLastTaken(id: Long, timestamp: Long)

    @Query("""UPDATE test_history 
              SET bestScore=:score, bestScorePercent=:percent, wrongAnswers=:wrong 
              WHERE id=:id AND (bestScore IS NULL OR :score >= bestScore)""")
    suspend fun updateBestScoreIfBetter(id: Long, score: Int, percent: Float, wrong: Int)

    @Query("UPDATE test_history SET title=:newTitle WHERE id=:id")
    suspend fun updateTestTitle(id: Long, newTitle: String)

    @Query("UPDATE test_history SET category=:newCategory WHERE id=:id")
    suspend fun updateTestCategory(id: Long, newCategory: String)

    @Query("UPDATE test_history SET questionCount=:count WHERE id=:id")
    suspend fun updateQuestionCount(id: Long, count: Int)

    @Query("SELECT * FROM questions WHERE testId = :testId ORDER BY questionIndex")
    suspend fun getQuestionsForTest(testId: Long): List<QuestionEntity>

    @Query("DELETE FROM test_history WHERE id = :id")
    suspend fun deleteTest(id: Long)

    @Query("DELETE FROM questions WHERE testId = :testId")
    suspend fun deleteQuestionsForTest(testId: Long)

    @Query("DELETE FROM test_history")
    suspend fun deleteAllTests()

    @Query("DELETE FROM questions")
    suspend fun deleteAllQuestions()
}
