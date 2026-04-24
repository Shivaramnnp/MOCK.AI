package com.shiva.magics.util

import android.os.SystemClock
import com.shiva.magics.data.local.ExamIntegrityDao
import com.shiva.magics.data.local.ExamTimerStateEntity
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Phase 4 — Week 3: Exam Timer Engine
 * High-precision, persistent, and drift-resistant pacing system.
 */
class ExamTimerController(
    private val examId: String,
    private val integrityDao: ExamIntegrityDao,
    private val scope: CoroutineScope,
    private val timeProvider: TimeProvider = DefaultTimeProvider
) {
    private val _remainingSeconds = MutableStateFlow(0)
    val remainingSeconds: StateFlow<Int> = _remainingSeconds.asStateFlow()

    private var timerJob: Job? = null
    private var isPaused = false

    /**
     * Starts the countdown. If a saved state exists, it recovers the time.
     */
    fun startTimer(durationSeconds: Int) {
        scope.launch {
            val savedState = integrityDao.getTimerState(examId)
            if (savedState != null) {
                // Formula: remaining = stored - elapsedSinceLastheartbeat
                val elapsedSinceLastSave = (timeProvider.currentTimeMillis() - savedState.lastUpdatedAt) / 1000
                val recoveredTime = (savedState.remainingSeconds - elapsedSinceLastSave).toInt().coerceAtLeast(0)
                _remainingSeconds.value = recoveredTime
            } else {
                _remainingSeconds.value = durationSeconds
            }
            isPaused = false
            runTicker()
        }
    }

    private fun runTicker() {
        timerJob?.cancel()
        timerJob = scope.launch {
            var lastTickRealtime = timeProvider.elapsedRealtime()
            
            while (isActive && _remainingSeconds.value > 0) {
                if (!isPaused) {
                    delay(1000)
                    val currentRealtime = timeProvider.elapsedRealtime()
                    val deltaSeconds = ((currentRealtime - lastTickRealtime) / 1000).toInt()
                    
                    if (deltaSeconds >= 1) {
                        _remainingSeconds.value = (_remainingSeconds.value - deltaSeconds).coerceAtLeast(0)
                        lastTickRealtime = currentRealtime
                        
                        // Heartbeat Persistence (Every 5 seconds to reduce DB IO but keep recovery fresh)
                        if (_remainingSeconds.value % 5 == 0) {
                            saveState()
                        }
                    }
                } else {
                    delay(500)
                    lastTickRealtime = timeProvider.elapsedRealtime() // Don't count pause time
                }
            }
            
            if (_remainingSeconds.value == 0) {
                onTimerExpired()
            }
        }
    }


    fun pauseTimer() {
        isPaused = true
        saveState()
    }

    fun resumeTimer() {
        isPaused = false
    }

    private fun saveState() {
        scope.launch {
            integrityDao.saveTimerState(
                ExamTimerStateEntity(
                    examId = examId,
                    remainingSeconds = _remainingSeconds.value,
                    lastUpdatedAt = timeProvider.currentTimeMillis()
                )
            )
        }
    }


    private fun onTimerExpired() {
        // Triggered when count hits 0
    }

    fun stop() {
        timerJob?.cancel()
    }
}
