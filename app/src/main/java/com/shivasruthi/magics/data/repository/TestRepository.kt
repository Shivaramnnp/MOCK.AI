package com.shivasruthi.magics.data.repository

import com.shivasruthi.magics.data.local.AppDatabase
import com.shivasruthi.magics.data.local.QuestionEntity
import com.shivasruthi.magics.data.local.TestHistoryEntity
import com.shivasruthi.magics.data.local.TestWithQuestions
import com.shivasruthi.magics.data.model.Question
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class TestRepository(private val db: AppDatabase) {
    private val dao = db.testHistoryDao()
    private val json = Json { ignoreUnknownKeys = true }

    fun getAllTests(): Flow<List<TestHistoryEntity>> = dao.getAllTests()

    fun getTestWithQuestions(id: Long): Flow<TestWithQuestions> =
        dao.getTestWithQuestions(id)

    suspend fun saveTest(title: String, category: String, questions: List<Question>): Long =
        withContext(Dispatchers.IO) {
            val testId = dao.insertTest(
                TestHistoryEntity(
                    title = title,
                    category = category,
                    questionCount = questions.size
                )
            )
            dao.insertQuestions(
                questions.mapIndexed { i, q ->
                    QuestionEntity(
                        testId = testId,
                        questionIndex = i,
                        questionText = q.questionText,
                        optionsJson = json.encodeToString(q.options),
                        correctAnswerIndex = q.correctAnswerIndex
                    )
                }
            )
            testId
        }

    suspend fun updateBestScore(id: Long, score: Int, total: Int) =
        withContext(Dispatchers.IO) {
            dao.updateBestScore(
                id = id,
                score = score,
                percent = if (total > 0) score.toFloat() / total * 100f else 0f,
                timestamp = System.currentTimeMillis()
            )
        }

    suspend fun deleteTest(id: Long) = withContext(Dispatchers.IO) {
        dao.deleteQuestionsForTest(id)
        dao.deleteTest(id)
    }

    // Convert QuestionEntity back to Question
    fun QuestionEntity.toQuestion(): Question = Question(
        questionText = questionText,
        options = json.decodeFromString(optionsJson),
        correctAnswerIndex = correctAnswerIndex
    )
}
