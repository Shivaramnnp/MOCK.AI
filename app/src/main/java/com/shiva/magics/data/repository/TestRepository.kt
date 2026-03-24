package com.shiva.magics.data.repository

import com.shiva.magics.data.local.AppDatabase
import com.shiva.magics.data.local.QuestionEntity
import com.shiva.magics.data.local.TestHistoryEntity
import com.shiva.magics.data.local.TestWithQuestions
import com.shiva.magics.data.model.Question
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class TestRepository(private val db: AppDatabase) {
    private val dao = db.testHistoryDao()
    private val json = Json { ignoreUnknownKeys = true }

    fun getAllTests(): Flow<List<TestHistoryEntity>> = dao.getAllTests()

    fun getTestWithQuestions(id: Long): Flow<TestWithQuestions> =
        dao.getTestWithQuestions(id)

    suspend fun saveTest(title: String, category: String, questions: List<Question>, timeLimitSeconds: Int? = null): Long =
        withContext(Dispatchers.IO) {
            val testId = dao.insertTest(
                TestHistoryEntity(
                    title = title,
                    category = category,
                    questionCount = questions.size,
                    timeLimitSeconds = timeLimitSeconds
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

    suspend fun updateBestScore(id: Long, score: Int, total: Int, wrong: Int) =
        withContext(Dispatchers.IO) {
            dao.updateLastTaken(id, System.currentTimeMillis())
            dao.updateBestScoreIfBetter(
                id = id,
                score = score,
                percent = if (total > 0) score.toFloat() / total * 100f else 0f,
                wrong = wrong
            )
        }

    suspend fun deleteTest(id: Long) = withContext(Dispatchers.IO) {
        dao.deleteQuestionsForTest(id)
        dao.deleteTest(id)
    }

    suspend fun renameTest(id: Long, newTitle: String) = withContext(Dispatchers.IO) {
        dao.updateTestTitle(id, newTitle)
    }

    suspend fun updateTestCategory(id: Long, newCategory: String) = withContext(Dispatchers.IO) {
        dao.updateTestCategory(id, newCategory)
    }

    suspend fun getQuestionsForTest(id: Long): List<Question> = withContext(Dispatchers.IO) {
        dao.getQuestionsForTest(id).map { it.toQuestion() }
    }

    suspend fun updateQuestions(id: Long, questions: List<Question>) = withContext(Dispatchers.IO) {
        dao.deleteQuestionsForTest(id)
        dao.updateQuestionCount(id, questions.size)
        dao.insertQuestions(
            questions.mapIndexed { i, q ->
                QuestionEntity(
                    testId = id,
                    questionIndex = i,
                    questionText = q.questionText,
                    optionsJson = json.encodeToString(q.options),
                    correctAnswerIndex = q.correctAnswerIndex
                )
            }
        )
    }

    suspend fun deleteAllTests() = withContext(Dispatchers.IO) {
        dao.deleteAllQuestions()
        dao.deleteAllTests()
    }

    // Convert QuestionEntity back to Question
    fun QuestionEntity.toQuestion(): Question = Question(
        questionText = questionText,
        options = json.decodeFromString(optionsJson),
        correctAnswerIndex = correctAnswerIndex
    )

    fun buildShareJson(questions: List<Question>, title: String): String {
        val jsonQuestions = questions.map { q ->
            kotlinx.serialization.json.buildJsonObject {
                put("questionText", kotlinx.serialization.json.JsonPrimitive(q.questionText))
                put("options", kotlinx.serialization.json.buildJsonArray { q.options.forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) } })
                put("correctAnswerIndex", kotlinx.serialization.json.JsonPrimitive(q.correctAnswerIndex))
            }
        }
        return kotlinx.serialization.json.buildJsonObject {
            put("title", kotlinx.serialization.json.JsonPrimitive(title))
            put("questions", kotlinx.serialization.json.JsonArray(jsonQuestions))
        }.toString()
    }
}
