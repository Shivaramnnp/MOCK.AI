package com.shiva.magics.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Citation(
    val pageNumber: Int? = null,
    val youtubeTimestamp: String? = null,
    val sourceExactText: String
)

@Serializable
enum class VerificationStatus {
    VERIFIED,
    PARTIAL,
    UNVERIFIED,
    FAILED
}

@Serializable
data class Question(
    val questionText: String,
    val options: List<String>,          // exactly 4 items always
    val correctAnswerIndex: Int,        // 0–3, or -1 if not found
    val topic: String? = null,          // Used for weak topic detection in Analytics
    val citation: Citation? = null,
    val verificationStatus: VerificationStatus = VerificationStatus.UNVERIFIED,
    val trustScore: Float = 0f,
    val verifiedAt: Long? = null
)

@Serializable
data class GeminiQuestionResponse(
    val questions: List<Question> = emptyList()
)
