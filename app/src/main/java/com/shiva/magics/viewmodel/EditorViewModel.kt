package com.shiva.magics.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.shiva.magics.data.model.Question
import com.shiva.magics.data.model.SaveState
import com.shiva.magics.data.remote.GeminiService
import com.shiva.magics.data.repository.TestRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class EditorViewModel(
    private val geminiService: GeminiService
) : ViewModel() {

    private val _questions = MutableStateFlow<List<Question>>(emptyList())
    val questions: StateFlow<List<Question>> = _questions.asStateFlow()

    private val _saveState = MutableStateFlow<SaveState>(SaveState.Idle)
    val saveState: StateFlow<SaveState> = _saveState.asStateFlow()

    // Tracks which question indices are currently being AI-fixed
    private val _fixingIndices = MutableStateFlow<Set<Int>>(emptySet())
    val fixingIndices: StateFlow<Set<Int>> = _fixingIndices.asStateFlow()

    // Per-question fix error (index -> error message)
    private val _fixErrors = MutableStateFlow<Map<Int, String>>(emptyMap())
    val fixErrors: StateFlow<Map<Int, String>> = _fixErrors.asStateFlow()

    // New state — tracks if a bulk fix is in progress
    private val _isFixingAll = MutableStateFlow(false)
    val isFixingAll: StateFlow<Boolean> = _isFixingAll.asStateFlow()

    private val _fixAllResult = MutableStateFlow<String?>(null) // success/error summary
    val fixAllResult: StateFlow<String?> = _fixAllResult.asStateFlow()

    fun fixAllQuestionsWithAi() {
        val incompleteIndices = _questions.value
            .mapIndexedNotNull { i, q ->
                if (q.correctAnswerIndex == -1 || q.options.any { it.isBlank() }) i else null
            }

        if (incompleteIndices.isEmpty()) return

        _isFixingAll.value = true
        _fixAllResult.value = null

        viewModelScope.launch {
            var fixed = 0
            var failed = 0

            // Fix questions sequentially to avoid hammering the API
            incompleteIndices.forEach { qi ->
                val question = _questions.value.getOrNull(qi) ?: return@forEach

                val prompt = """
                    You are an MCQ exam question expert.
                    
                    Given this incomplete multiple choice question, do the following:
                    1. If any options are blank or missing, fill them in with plausible but clearly wrong distractors
                    2. Determine which option is the correct answer
                    
                    Question: ${question.questionText}
                    Current options:
                    A: ${question.options.getOrElse(0) { "" }}
                    B: ${question.options.getOrElse(1) { "" }}
                    C: ${question.options.getOrElse(2) { "" }}
                    D: ${question.options.getOrElse(3) { "" }}
                    
                    Return ONLY a valid JSON object with this exact structure, no other text:
                    {
                      "questions": [
                        {
                          "questionText": "${question.questionText}",
                          "options": ["Option A", "Option B", "Option C", "Option D"],
                          "correctAnswerIndex": 0
                        }
                      ]
                    }
                    
                    RULES:
                    - Keep existing non-blank options exactly as they are
                    - Only fill in options that are blank or empty strings
                    - correctAnswerIndex must be 0, 1, 2, or 3 (never -1)
                    - options array must have exactly 4 strings
                """.trimIndent()

                val result = geminiService.extractQuestionsFromText(
                    text = question.questionText,
                    customPrompt = prompt
                )

                result.fold(
                    onSuccess = { fixedQuestions ->
                        val fixedQ = fixedQuestions.firstOrNull()
                        if (fixedQ != null) {
                            _questions.update { list ->
                                list.mapIndexed { i, q ->
                                    if (i == qi) fixedQ.copy(questionText = q.questionText) else q
                                }
                            }
                            fixed++
                        } else {
                            failed++
                        }
                    },
                    onFailure = { failed++ }
                )

                // Small delay between API calls to avoid rate limiting
                kotlinx.coroutines.delay(300)
            }

            _fixAllResult.value = when {
                failed == 0 -> "✅ Fixed all $fixed questions successfully"
                fixed == 0 -> "❌ Could not fix any questions. Please try again."
                else -> "⚠ Fixed $fixed questions, $failed could not be fixed"
            }
            _isFixingAll.value = false
        }
    }

    fun clearFixAllResult() {
        _fixAllResult.value = null
    }

    fun fixQuestionWithAi(qi: Int) {
        val question = _questions.value.getOrNull(qi) ?: return

        _fixingIndices.update { it + qi }
        _fixErrors.update { it - qi }

        viewModelScope.launch {
            val prompt = """
                You are an MCQ exam question expert.
                
                Given this incomplete multiple choice question, do the following:
                1. If any options are blank or missing, fill them in with plausible but clearly wrong distractors
                2. Determine which option is the correct answer
                
                Question: ${question.questionText}
                Current options:
                A: ${question.options.getOrElse(0) { "" }}
                B: ${question.options.getOrElse(1) { "" }}
                C: ${question.options.getOrElse(2) { "" }}
                D: ${question.options.getOrElse(3) { "" }}
                
                Return ONLY a valid JSON object with this exact structure, no other text:
                {
                  "questions": [
                    {
                      "questionText": "${question.questionText}",
                      "options": ["Option A", "Option B", "Option C", "Option D"],
                      "correctAnswerIndex": 0
                    }
                  ]
                }
                
                RULES:
                - Keep existing non-blank options exactly as they are
                - Only fill in options that are blank or empty strings
                - correctAnswerIndex must be 0, 1, 2, or 3 (never -1)
                - options array must have exactly 4 strings
            """.trimIndent()

            val result = geminiService.extractQuestionsFromText(
                text = question.questionText,
                customPrompt = prompt
            )

            result.fold(
                onSuccess = { fixedQuestions ->
                    val fixed = fixedQuestions.firstOrNull()
                    if (fixed != null) {
                        _questions.update { list ->
                            list.mapIndexed { i, q ->
                                if (i == qi) fixed.copy(questionText = q.questionText) else q
                            }
                        }
                    } else {
                        _fixErrors.update { it + (qi to "AI couldn't fix this question") }
                    }
                },
                onFailure = { e ->
                    _fixErrors.update { it + (qi to (e.message ?: "AI fix failed")) }
                }
            )

            _fixingIndices.update { it - qi }
        }
    }

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

    fun updateQuestion(qi: Int, question: Question) {
        _questions.update { list ->
            list.mapIndexed { i, q -> if (i == qi) question else q }
        }
    }

    fun moveQuestion(fromIndex: Int, toIndex: Int) {
        _questions.update { list ->
            if (fromIndex !in list.indices || toIndex !in list.indices) return@update list
            val mutable = list.toMutableList()
            val item = mutable.removeAt(fromIndex)
            mutable.add(toIndex, item)
            mutable
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
        timeLimitSeconds: Int? = null,
        repository: TestRepository
    ) {
        if (title.isBlank()) {
            _saveState.value = SaveState.Error("Test title cannot be empty")
            return
        }
        viewModelScope.launch {
            _saveState.value = SaveState.Saving
            try {
                val id = repository.saveTest(title, category, _questions.value, timeLimitSeconds)
                _saveState.value = SaveState.Success(id)
            } catch (e: Exception) {
                _saveState.value = SaveState.Error(e.message ?: "Failed to save test")
            }
        }
    }

    fun resetSaveState() { _saveState.value = SaveState.Idle }

    class Factory(private val geminiService: GeminiService) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return EditorViewModel(geminiService) as T
        }
    }
}
