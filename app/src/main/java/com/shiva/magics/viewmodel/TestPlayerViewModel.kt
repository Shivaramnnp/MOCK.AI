package com.shiva.magics.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shiva.magics.data.model.ReviewItem
import com.shiva.magics.data.model.SessionState
import com.shiva.magics.data.model.TestDefinition
import com.shiva.magics.util.PerformancePrediction
import com.shiva.magics.data.local.AppDatabase
import com.shiva.magics.data.local.PerformancePredictionEntity
import com.shiva.magics.util.PredictionConfidence
import com.shiva.magics.util.PredictionRiskLevel
import com.shiva.magics.util.ReadinessStatus
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class TestPlayerViewModel : ViewModel() {

    private var testStartTimeMs: Long = 0L
    private val _elapsedSeconds = MutableStateFlow(0)
    val elapsedSeconds: StateFlow<Int> = _elapsedSeconds.asStateFlow()

    // IMMUTABLE — set once, never copied during test
    private var _definition: TestDefinition? = null
    val definition get() = _definition

    private var _assignmentId: String? = null
    val assignmentId get() = _assignmentId

    // MUTABLE SESSION — tiny object, safe to copy per interaction
    private val _session = MutableStateFlow<SessionState?>(null)
    val session: StateFlow<SessionState?> = _session.asStateFlow()

    private val _timerSeconds = MutableStateFlow(0)
    val timerSeconds: StateFlow<Int> = _timerSeconds.asStateFlow()

    private var initialTimerSeconds: Int = 0
    private var timerJob: Job? = null

    // Built after submission, immutable
    private val _reviewItems = MutableStateFlow<List<ReviewItem>>(emptyList())
    val reviewItems: StateFlow<List<ReviewItem>> = _reviewItems.asStateFlow()

    private val _bookmarkedQuestions = MutableStateFlow<Set<Int>>(emptySet())
    val bookmarkedQuestions: StateFlow<Set<Int>> = _bookmarkedQuestions.asStateFlow()

    private val _latestPrediction = MutableStateFlow<PerformancePrediction?>(null)
    val latestPrediction: StateFlow<PerformancePrediction?> = _latestPrediction.asStateFlow()

    fun loadTest(
        definition: TestDefinition,
        timerDurationSeconds: Int = 0,
        assignmentId: String? = null
    ) {
        _definition = definition
        _assignmentId = assignmentId
        initialTimerSeconds = timerDurationSeconds
        _session.value = SessionState(timerRemainingSeconds = timerDurationSeconds)
        _reviewItems.value = emptyList()
        _elapsedSeconds.value = 0
        testStartTimeMs = System.currentTimeMillis()
        if (timerDurationSeconds > 0) startTimer(timerDurationSeconds)
    }

    fun loadTestFromDb(
        testId: Long,
        repository: com.shiva.magics.data.repository.TestRepository,
        timerDurationSeconds: Int = 0
    ) {
        viewModelScope.launch {
            val testWithQ = repository.getTestWithQuestions(testId).first()
            val definitions = with(repository) {
                testWithQ.questions.map { it.toQuestion() }
            }
            loadTest(
                definition = TestDefinition(
                    dbId = testWithQ.test.id,
                    title = testWithQ.test.title,
                    category = testWithQ.test.category,
                    questions = definitions
                ),
                timerDurationSeconds = if (timerDurationSeconds > 0) timerDurationSeconds else (testWithQ.test.timeLimitSeconds ?: 0)
            )
        }
    }

    fun retakeCurrentTest() {
        val def = _definition ?: return
        loadTest(def, initialTimerSeconds, _assignmentId)
    }

    private fun startTimer(durationSeconds: Int) {
        timerJob?.cancel()
        _timerSeconds.value = durationSeconds
        timerJob = viewModelScope.launch {
            while (_timerSeconds.value > 0) {
                delay(1_000L)
                _timerSeconds.update { it - 1 }
            }
            // Auto-submit when timer hits zero
            if (_session.value?.isSubmitted == false) submitTest()
        }
    }

    fun stopTimer() { timerJob?.cancel() }

    fun selectAnswer(optionIndex: Int) {
        if (_session.value?.isSubmitted == true) return
        _session.update { s ->
            s?.copy(
                userAnswers = s.userAnswers + (s.currentIndex to optionIndex)
            )
        }
    }

    fun nextQuestion() {
        _session.update { s ->
            val total = _definition?.questions?.size ?: 0
            s?.let { if (it.currentIndex < total - 1) it.copy(currentIndex = it.currentIndex + 1) else it }
        }
    }

    fun previousQuestion() {
        _session.update { s ->
            s?.let { if (it.currentIndex > 0) it.copy(currentIndex = it.currentIndex - 1) else it }
        }
    }

    fun goToQuestion(index: Int) {
        _session.update { it?.copy(currentIndex = index) }
    }

    fun submitTest() {
        // Idempotency guard — prevents double-submission from timer auto-submit
        // racing a simultaneous user tap on the Submit button.
        if (_session.value?.isSubmitted == true) return
        timerJob?.cancel()
        val def = _definition ?: return
        val sess = _session.value ?: return
        _session.update { it?.copy(isSubmitted = true) }
        _elapsedSeconds.value = ((System.currentTimeMillis() - testStartTimeMs) / 1000).toInt()
        // Build review items immediately after submission
        _reviewItems.value = def.questions.mapIndexed { i, q ->
            val userAnswer = sess.userAnswers[i]
            ReviewItem(
                index = i,
                question = q,
                userAnswerIndex = userAnswer,
                isCorrect = userAnswer != null &&
                    userAnswer == q.correctAnswerIndex &&
                    q.correctAnswerIndex != -1
            )
        }
    }

    fun computeScore(): Int {
        val def = _definition ?: return 0
        val sess = _session.value ?: return 0
        return def.questions.indices.count { i ->
            val userAns = sess.userAnswers[i]
            userAns != null &&
            userAns == def.questions[i].correctAnswerIndex &&
            def.questions[i].correctAnswerIndex != -1
        }
    }

    fun getUnansweredCount(): Int {
        val total = _definition?.questions?.size ?: 0
        val answered = _session.value?.userAnswers?.size ?: 0
        return total - answered
    }

    fun toggleBookmark(index: Int) {
        _bookmarkedQuestions.update { current ->
            if (index in current) current - index else current + index
        }
    }

    fun clearTest() {
        timerJob?.cancel()
        _definition = null
        _session.value = null
        _timerSeconds.value = 0
        _reviewItems.value = emptyList()
        _bookmarkedQuestions.value = emptySet()
        _latestPrediction.value = null
    }

    fun loadLatestPrediction(db: AppDatabase) {
        viewModelScope.launch {
            val latest = db.performancePredictionDao().getLatestPredictionOnce()
            latest?.let {
                _latestPrediction.value = PerformancePrediction(
                    predictedScore = it.predictedScore,
                    confidence = PredictionConfidence.valueOf(it.confidence),
                    riskLevel = PredictionRiskLevel.valueOf(it.riskLevel),
                    readinessStatus = ReadinessStatus.valueOf(it.readinessStatus),
                    generatedAt = it.generatedAt
                )
            }
        }
    }

    override fun onCleared() {
        timerJob?.cancel()
        super.onCleared()
    }
}
