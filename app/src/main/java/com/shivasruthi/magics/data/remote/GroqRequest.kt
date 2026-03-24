package com.shivasruthi.magics.data.remote

import androidx.annotation.Keep
import kotlinx.serialization.Serializable

@Keep
@Serializable
data class GroqRequest(
    val model: String = "llama-3.3-70b-versatile",
    val messages: List<GroqMessage>,
    val max_tokens: Int = 4096,
    val temperature: Double = 0.1
)

@Keep
@Serializable
data class GroqMessage(val role: String, val content: String)

@Keep
@Serializable
data class GroqResponse(val choices: List<GroqChoice>? = null)

@Keep
@Serializable
data class GroqChoice(val message: GroqMessageContent? = null)

@Keep
@Serializable
data class GroqMessageContent(val content: String? = null)
