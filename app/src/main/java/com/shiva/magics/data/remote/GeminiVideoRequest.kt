package com.shiva.magics.data.remote

import androidx.annotation.Keep
import kotlinx.serialization.Serializable

@Keep
@Serializable
data class GeminiVideoRequest(val contents: List<GeminiContent>)

@Keep
@Serializable
data class GeminiContent(val parts: List<GeminiPart>)

@Keep
@Serializable
data class GeminiPart(
    val text: String? = null,
    val fileData: GeminiFileData? = null
)

@Keep
@Serializable
data class GeminiFileData(
    val fileUri: String,
    val mimeType: String = "video/*"
)

@Keep
@Serializable
data class GeminiVideoResponse(
    val candidates: List<GeminiCandidate>? = null
)

@Keep
@Serializable
data class GeminiCandidate(
    val content: GeminiContent? = null
)
