package com.shiva.magics.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.shiva.magics.data.local.TestHistoryEntity
import com.shiva.magics.data.repository.TestRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AnalyticsState(
    val isLoading: Boolean = true,
    val totalTestsTaken: Int = 0,
    val averageScorePercent: Float = 0f,
    val recentScores: List<Float> = emptyList(), // For line chart (chronological)
    val weakTopics: Map<String, Int> = emptyMap() // topic/category -> wrong answers count
)

class AnalyticsViewModel(private val repository: TestRepository) : ViewModel() {

    private val _state = MutableStateFlow(AnalyticsState())
    val state: StateFlow<AnalyticsState> = _state.asStateFlow()

    init {
        loadAnalytics()
    }

    private fun loadAnalytics() {
        viewModelScope.launch {
            repository.getAllTests().collect { tests ->
                val takenTests = tests.filter { it.bestScorePercent != null }.sortedBy { it.lastTakenAt ?: 0L }
                
                val totalTaken = takenTests.size
                val avgScore = if (totalTaken > 0) takenTests.mapNotNull { it.bestScorePercent }.average().toFloat() else 0f
                val recentScores = takenTests.mapNotNull { it.bestScorePercent }

                // Group weak topics by category, using wrongAnswers
                // We're aggregating categories (or if topic is added natively, we'd use that). Category is non-null.
                val weakTopicsMap = mutableMapOf<String, Int>()
                takenTests.forEach { test ->
                    val wrong = test.wrongAnswers ?: 0
                    if (wrong > 0) {
                        val current = weakTopicsMap[test.category] ?: 0
                        weakTopicsMap[test.category] = current + wrong
                    }
                }

                // Sort weak topics descending
                val sortedWeakTopics = weakTopicsMap.entries
                    .sortedByDescending { it.value }
                    .associate { it.key to it.value }

                _state.value = AnalyticsState(
                    isLoading = false,
                    totalTestsTaken = totalTaken,
                    averageScorePercent = avgScore,
                    recentScores = recentScores,
                    weakTopics = sortedWeakTopics
                )
            }
        }
    }

    class Factory(private val repository: TestRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AnalyticsViewModel(repository) as T
    }
}
