package com.shivasruthi.magics.data.model

// IMMUTABLE — loaded once, never copied during test
data class TestDefinition(
    val dbId: Long = 0,
    val title: String,
    val category: String,
    val questions: List<Question>
)

// MUTABLE SESSION — tiny object, O(1) copy per interaction
data class SessionState(
    val currentIndex: Int = 0,
    val userAnswers: Map<Int, Int> = emptyMap(),    // questionIndex → optionIndex
    val isSubmitted: Boolean = false,
    val timerRemainingSeconds: Int = 0
)

data class ReviewItem(
    val index: Int,
    val question: Question,
    val userAnswerIndex: Int?,          // null = skipped
    val isCorrect: Boolean
)

sealed interface SaveState {
    data object Idle : SaveState
    data object Saving : SaveState
    data class Success(val testId: Long) : SaveState
    data class Error(val message: String) : SaveState
}
