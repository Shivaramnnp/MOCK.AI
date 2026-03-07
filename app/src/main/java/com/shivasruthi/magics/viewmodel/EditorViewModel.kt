package com.shivasruthi.magics.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.shivasruthi.magics.data.model.Question
import com.shivasruthi.magics.data.model.SaveState
import com.shivasruthi.magics.data.repository.TestRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class EditorViewModel : ViewModel() {

    private val _questions = MutableStateFlow<List<Question>>(emptyList())
    val questions: StateFlow<List<Question>> = _questions.asStateFlow()

    private val _saveState = MutableStateFlow<SaveState>(SaveState.Idle)
    val saveState: StateFlow<SaveState> = _saveState.asStateFlow()

    fun setQuestions(questions: List<Question>) {
        _questions.value = questions
    }

    fun onQuestionTextChanged(qi: Int, newText: String) {
        _questions.update { list ->
            list.mapIndexed { i, q ->
                if (i == qi) q.copy(questionText = newText) else q
            }
        }
    }

    // Uses mapIndexed — no double toMutableList() copies
    fun onOptionChanged(qi: Int, oi: Int, newText: String) {
        _questions.update { list ->
            list.mapIndexed { i, q ->
                if (i != qi) q
                else q.copy(
                    options = q.options.mapIndexed { j, o -> if (j == oi) newText else o }
                )
            }
        }
    }

    fun onCorrectAnswerSelected(qi: Int, oi: Int) {
        _questions.update { list ->
            list.mapIndexed { i, q ->
                if (i == qi) q.copy(correctAnswerIndex = oi) else q
            }
        }
    }

    fun addQuestion() {
        _questions.update { list ->
            list + Question(
                questionText = "",
                options = List(4) { "" },
                correctAnswerIndex = -1
            )
        }
    }

    fun deleteQuestion(qi: Int) {
        _questions.update { list ->
            list.filterIndexed { i, _ -> i != qi }
        }
    }

    fun validationErrorCount(): Int =
        _questions.value.count { it.questionText.isBlank() || it.correctAnswerIndex == -1 }

    fun hasValidationErrors(): Boolean = validationErrorCount() > 0

    fun saveTest(
        title: String,
        category: String,
        repository: TestRepository
    ) {
        if (title.isBlank()) {
            _saveState.value = SaveState.Error("Test title cannot be empty")
            return
        }
        viewModelScope.launch {
            _saveState.value = SaveState.Saving
            try {
                val id = repository.saveTest(title, category, _questions.value)
                _saveState.value = SaveState.Success(id)
            } catch (e: Exception) {
                _saveState.value = SaveState.Error(e.message ?: "Failed to save test")
            }
        }
    }

    fun resetSaveState() { _saveState.value = SaveState.Idle }
}
