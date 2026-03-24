package com.shivasruthi.magics.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.shivasruthi.magics.data.local.TestHistoryEntity
import com.shivasruthi.magics.data.model.Question
import com.shivasruthi.magics.data.repository.TestRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class HomeViewModel(private val repository: TestRepository) : ViewModel() {

    val tests: StateFlow<List<TestHistoryEntity>> = repository
        .getAllTests()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = emptyList()
        )

    fun deleteTest(id: Long) {
        viewModelScope.launch { repository.deleteTest(id) }
    }

    fun renameTest(id: Long, newTitle: String) {
        viewModelScope.launch { repository.renameTest(id, newTitle) }
    }

    fun updateTestCategory(id: Long, newCategory: String) {
        viewModelScope.launch { repository.updateTestCategory(id, newCategory) }
    }

    suspend fun getQuestionsForTest(id: Long): List<Question> {
        return repository.getQuestionsForTest(id)
    }

    fun updateQuestions(id: Long, questions: List<Question>) {
        viewModelScope.launch { repository.updateQuestions(id, questions) }
    }

    // Factory for manual DI (no Hilt)
    class Factory(private val repository: TestRepository) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return HomeViewModel(repository) as T
        }
    }
}
