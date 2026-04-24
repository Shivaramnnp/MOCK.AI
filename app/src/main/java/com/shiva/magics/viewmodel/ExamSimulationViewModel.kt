package com.shiva.magics.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shiva.magics.data.local.ExamIntegrityDao
import com.shiva.magics.data.local.ExamIntegrityEventEntity
import com.shiva.magics.data.local.ExamSessionEntity
import com.shiva.magics.util.ExamTimerController
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Phase 4 — Week 2: Exam Simulation ViewModel
 * Manages Strict Mode logic, violation tracking, and session recovery.
 */
class ExamSimulationViewModel(
    private val integrityDao: ExamIntegrityDao
) : ViewModel() {

    private val _violationCount = MutableStateFlow(0)
    val violationCount: StateFlow<Int> = _violationCount.asStateFlow()

    private val _isExamActive = MutableStateFlow(false)
    val isExamActive: StateFlow<Boolean> = _isExamActive.asStateFlow()

    private val _remainingTime = MutableStateFlow(0)
    val remainingTime: StateFlow<Int> = _remainingTime.asStateFlow()

    private val _activeWarning = MutableStateFlow<String?>(null)
    val activeWarning: StateFlow<String?> = _activeWarning.asStateFlow()

    private var timerController: ExamTimerController? = null
    private var currentExamId: String? = null
    private var maxViolations = 3

    fun startExam(examId: String, totalDurationSeconds: Int) {
        currentExamId = examId
        _violationCount.value = 0
        _isExamActive.value = true
        recordEvent("EXAM_STARTED")
        
        timerController = ExamTimerController(examId, integrityDao, viewModelScope)
        timerController?.startTimer(totalDurationSeconds)
        
        // Monitor timer
        viewModelScope.launch {
            timerController?.remainingSeconds?.collect { seconds ->
                _remainingTime.value = seconds
                checkWarnings(seconds)
                if (seconds == 0 && _isExamActive.value) {
                    recordEvent("AUTO_SUBMIT_TRIGGERED")
                    _isExamActive.value = false
                }
            }
        }
    }

    private fun checkWarnings(seconds: Int) {
        val minutes = seconds / 60
        val remainingSeconds = seconds % 60
        
        if (remainingSeconds == 0) {
            when (minutes) {
                10 -> _activeWarning.value = "10 minutes remaining"
                5 -> _activeWarning.value = "5 minutes remaining"
                1 -> _activeWarning.value = "1 minute remaining"
                else -> { if (minutes < 1) _activeWarning.value = null }
            }
        } else if (seconds <= 0) {
            _activeWarning.value = null
        }
    }

    fun dismissWarning() {
       _activeWarning.value = null
    }

    fun pauseExam() {
        timerController?.pauseTimer()
        recordEvent("EXAM_PAUSED")
    }

    fun resumeExam() {
        timerController?.resumeTimer()
        recordEvent("EXAM_RESUMED")
    }

    fun recordEvent(type: String) {
        val examId = currentExamId ?: return
        viewModelScope.launch {
            val event = ExamIntegrityEventEntity(
                id = UUID.randomUUID().toString(),
                examId = examId,
                eventType = type
            )
            integrityDao.insertIntegrityEvent(event)
            
            if (type == "APP_BACKGROUND") {
                _violationCount.value += 1
                if (_violationCount.value >= maxViolations) {
                    recordEvent("AUTO_SUBMIT_TRIGGERED")
                    _isExamActive.value = false
                }
            }
        }
    }

    fun saveSession(
        templateId: String,
        currentIndex: Int,
        remainingTime: Int,
        answersJson: String
    ) {
        val examId = currentExamId ?: return
        viewModelScope.launch {
            val session = ExamSessionEntity(
                examId = examId,
                templateId = templateId,
                currentQuestionIndex = currentIndex,
                remainingTimeSeconds = remainingTime,
                answersJson = answersJson,
                violationCount = _violationCount.value
            )
            integrityDao.saveSession(session)
        }
    }

    fun endExam() {
        _isExamActive.value = false
        currentExamId = null
    }
}
