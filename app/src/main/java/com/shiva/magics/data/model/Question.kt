package com.shiva.magics.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Question(
    val questionText: String,
    val options: List<String>,          // exactly 4 items always
    val correctAnswerIndex: Int         // 0–3, or -1 if not found
)

@Serializable
data class GeminiQuestionResponse(
    val questions: List<Question> = emptyList()
)
