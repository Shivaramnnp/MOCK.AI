package com.shivasruthi.magics.data.remote

import com.shivasruthi.magics.data.model.GeminiQuestionResponse
import com.shivasruthi.magics.data.model.InputSource
import com.shivasruthi.magics.data.model.Question
import kotlinx.serialization.json.Json

class AiProviderManager(
    private val geminiService: GeminiService,           // Layer 1
    private val groqService: GroqService,               // Layer 2
    private val flashLiteService: GeminiFlashLiteService, // Layer 3
    private val groqApiKey: String,
    private val flashLiteApiKey: String
) {

    private val jsonParser = Json {
        isLenient = true
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    sealed class ProviderResult {
        data class Success(val questions: List<Question>, val provider: String) : ProviderResult()
        data class AllFailed(val lastError: String) : ProviderResult()
    }

    private suspend fun retryWithBackoff(
        maxRetries: Int = 2,
        initialDelayMs: Long = 2000,
        block: suspend () -> Result<*>
    ): Result<*> {
        var delay = initialDelayMs
        repeat(maxRetries) { attempt ->
            val result = block()
            if (result.isSuccess) return result
            val error = result.exceptionOrNull()?.message ?: ""
            if (!error.contains("429")) return result  // Non-quota error, don't retry
            kotlinx.coroutines.delay(delay)
            delay *= 2  // exponential: 2s → 4s
        }
        return block()  // final attempt
    }

    suspend fun extractQuestionsWithFallback(
        text: String,
        imageData: ByteArray? = null,
        mimeType: String = "image/jpeg",
        source: InputSource,
        fileName: String,
        customPrompt: String? = null,
        preferredAi: String = "auto"
    ): ProviderResult {

        android.util.Log.d("AI_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        android.util.Log.d("AI_FLOW", "🤖 extractQuestionsWithFallback()")
        android.util.Log.d("AI_FLOW", "  source    : $source")
        android.util.Log.d("AI_FLOW", "  mimeType  : $mimeType")
        android.util.Log.d("AI_FLOW", "  imageData : ${if (imageData != null) "${imageData.size} bytes" else "null"}")
        android.util.Log.d("AI_FLOW", "  textLen   : ${text.length} chars")
        android.util.Log.d("AI_FLOW", "  preferred : $preferredAi")

        var anyProviderSucceeded = false

        // Logic defines lambdas to avoid repetition
        val tryGemini: suspend () -> ProviderResult? = {
            android.util.Log.d("AI_FLOW", "🔷 [Layer 1] Trying Gemini Flash 2.5...")
            val result = retryWithBackoff {
                if (imageData != null) {
                    geminiService.extractQuestions(imageData, mimeType)
                } else {
                    geminiService.extractQuestionsFromText(text, customPrompt)
                }
            }
            if (result.isSuccess) {
                val questions = result.getOrNull() as? List<Question>
                if (!questions.isNullOrEmpty()) {
                    ProviderResult.Success(questions, "Gemini Flash")
                } else {
                    anyProviderSucceeded = true
                    null
                }
            } else {
                android.util.Log.e("AI_FLOW", "❌ Gemini failure: ${result.exceptionOrNull()?.message}")
                null
            }
        }

        val tryGroq: suspend () -> ProviderResult? = {
            if (imageData != null) {
                null // Groq can't handle binary
            } else {
                android.util.Log.d("AI_FLOW", "🔶 [Layer 2] Trying Groq...")
                if (groqApiKey.isNotBlank() && groqApiKey != "your_groq_key_here") {
                    val result = try {
                        groqService.extractQuestionsFromText(text, groqApiKey)
                    } catch (e: Exception) { Result.failure(e) }
                    
                    if (result.isSuccess) {
                        val rawJson = result.getOrNull() ?: ""
                        val questions = parseQuestionsFromJson(rawJson)
                        if (questions.isNotEmpty()) {
                            ProviderResult.Success(questions, "Groq (Llama 4)")
                        } else {
                            anyProviderSucceeded = true
                            null
                        }
                    } else {
                        android.util.Log.e("AI_FLOW", "❌ Groq failure: ${result.exceptionOrNull()?.message}")
                        null
                    }
                } else null
            }
        }

        // --- Execution Chain based on preference ---
        
        if (preferredAi == "gemini") {
            tryGemini()?.let { return it }
            tryGroq()?.let { return it }
        } else if (preferredAi == "groq" && imageData == null) {
            tryGroq()?.let { return it }
            tryGemini()?.let { return it }
        } else {
            // Auto or mismatched
            tryGemini()?.let { return it }
            tryGroq()?.let { return it }
        }

        // LAYER 3: Gemini Flash-Lite (Always last resort)
        android.util.Log.d("AI_FLOW", "🔴 [Layer 3] Trying Gemini Flash-Lite...")
        if (flashLiteApiKey.isNotBlank() && flashLiteApiKey != "your_gemini_flash_lite_key_here") {
            val liteResult = try {
                if (imageData != null) {
                    flashLiteService.extractQuestions(imageData, mimeType)
                } else {
                    flashLiteService.extractQuestionsFromText(text)
                }
            } catch (e: Exception) {
                android.util.Log.e("AI_FLOW", "❌ [Layer 3] Flash-Lite exception: ${e.message}")
                Result.failure(e)
            }
            if (liteResult.isSuccess) {
                val questions = liteResult.getOrNull()
                android.util.Log.d("AI_FLOW", "✅ [Layer 3] Flash-Lite succeeded — ${questions?.size ?: 0} questions")
                if (!questions.isNullOrEmpty()) return ProviderResult.Success(questions, "Gemini Flash-Lite")
                anyProviderSucceeded = true // Flash-Lite worked but found nothing
                android.util.Log.w("AI_FLOW", "⚠ [Layer 3] Flash-Lite returned 0 questions")
            } else {
                android.util.Log.e("AI_FLOW", "❌ [Layer 3] Flash-Lite failed: ${liteResult.exceptionOrNull()?.message}")
            }
        } else {
            android.util.Log.w("AI_FLOW", "⏭ [Layer 3] Flash-Lite skipped — no API key")
        }

        val finalMessage = if (anyProviderSucceeded) {
            "No MCQ questions found in this content. Make sure the source contains multiple choice questions."
        } else {
            "All AI providers are currently at capacity. Please try again in a few minutes."
        }

        android.util.Log.e(
            "AI_FLOW",
            "💀 ALL 3 PROVIDERS FAILED  source=$source  anySucceeded=$anyProviderSucceeded"
        )
        android.util.Log.d("AI_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        return ProviderResult.AllFailed(finalMessage)
    }

    private fun parseQuestionsFromJson(jsonStr: String): List<Question> {
        return try {
            val cleanedJson = jsonStr
                .replace(Regex("```json\\s*"), "")
                .replace(Regex("```\\s*"), "")
                .trim()
            val resultData = jsonParser.decodeFromString<GeminiQuestionResponse>(cleanedJson)
            resultData.questions
        } catch (e: Exception) {
            emptyList()
        }
    }
}
