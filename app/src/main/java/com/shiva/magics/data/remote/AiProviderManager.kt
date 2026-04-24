package com.shiva.magics.data.remote

import android.util.Log
import com.shiva.magics.data.model.GeminiQuestionResponse
import com.shiva.magics.data.model.InputSource
import com.shiva.magics.data.model.Question
import com.shiva.magics.util.AICostMonitor
import com.shiva.magics.util.ConfidenceScorer
import com.shiva.magics.util.ErrorRecoveryManager
import com.shiva.magics.util.QuestionQualityValidator
import com.shiva.magics.util.RateLimiter
import com.shiva.magics.util.SmartModelRouter
import com.shiva.magics.util.TelemetryCollector
import kotlinx.serialization.json.Json

class AiProviderManager(
    private val geminiService: GeminiService,              // Layer 1
    private val groqService: GroqService,                  // Layer 2
    private val flashLiteService: GeminiFlashLiteService,  // Layer 3
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

    // Gap #6 + #14: Retry with backoff now delegates to RateLimiter.withRetry
    private suspend fun retryWithBackoff(
        operationName: String = "AI call",
        block: suspend () -> Result<*>
    ): Result<*> = RateLimiter.withRetry(operationName) { @Suppress("UNCHECKED_CAST") (block() as Result<Any>) }

    suspend fun extractQuestionsWithFallback(
        text: String,
        imageData: ByteArray? = null,
        mimeType: String = "image/jpeg",
        source: InputSource,
        fileName: String,
        customPrompt: String? = null,
        preferredAi: String = "auto"
    ): ProviderResult {

        // Gap #4 + #14: Rate limiting gate
        val acquired = RateLimiter.acquire("${source}/${fileName.take(20)}")
        if (!acquired) {
            return ProviderResult.AllFailed("Too many requests. Please wait a moment before generating another test.")
        }

        TelemetryCollector.record(TelemetryCollector.EventType.PROCESSING_STARTED, source.toString())
        val t0Global = System.currentTimeMillis()

        // Gap #2: Inject diagram-aware prompt suffix for image/PDF content
        val enrichedPrompt = if (imageData != null || source == InputSource.PDF || source == InputSource.Image || source == InputSource.Camera) {
            (customPrompt ?: "") + QuestionQualityValidator.getDiagramAwarePromptSuffix()
        } else {
            customPrompt
        }

        Log.d("AI_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        Log.d("AI_FLOW", "🤖 extractQuestionsWithFallback()")
        Log.d("AI_FLOW", "  source    : $source")
        Log.d("AI_FLOW", "  mimeType  : $mimeType")
        Log.d("AI_FLOW", "  imageData : ${if (imageData != null) "${imageData.size} bytes" else "null"}")
        Log.d("AI_FLOW", "  textLen   : ${text.length} chars")
        Log.d("AI_FLOW", "  preferred : $preferredAi")

        var anyProviderSucceeded = false

        // Logic defines lambdas to avoid repetition
        val tryGemini: suspend () -> ProviderResult? = {
            Log.d("AI_FLOW", "🔷 [Layer 1] Trying Gemini Flash 2.5...")
            val result = retryWithBackoff("Gemini") {
                if (imageData != null) {
                    geminiService.extractQuestions(imageData, mimeType)
                } else {
                    geminiService.extractQuestionsFromText(text, enrichedPrompt)
                }
            }
            if (result.isSuccess) {
                @Suppress("UNCHECKED_CAST")
                val rawQuestions = result.getOrNull() as? List<Question>
                // Gap #3: Validate question quality
                val questions = if (!rawQuestions.isNullOrEmpty()) {
                    QuestionQualityValidator.validate(rawQuestions).valid
                } else rawQuestions
                if (!questions.isNullOrEmpty()) {
                    ProviderResult.Success(questions, "Gemini Flash")
                } else {
                    anyProviderSucceeded = true
                    null
                }
            } else {
                Log.e("AI_FLOW", "❌ Gemini failure: ${result.exceptionOrNull()?.message}")
                null
            }
        }

        val tryGroq: suspend () -> ProviderResult? = {
            if (imageData != null) {
                null // Groq can't handle binary
            } else {
                Log.d("AI_FLOW", "🔶 [Layer 2] Trying Groq...")
                if (groqApiKey.isNotBlank() && groqApiKey != "your_groq_key_here") {
                    val result = try {
                        RateLimiter.withRetry("Groq") { groqService.extractQuestionsFromText(text, groqApiKey) }
                    } catch (e: Exception) { Result.failure(e) }

                    if (result.isSuccess) {
                        val rawJson = result.getOrNull() as? String ?: ""
                        // Gap #3: Validate question quality
                        val rawQuestions = parseQuestionsFromJson(rawJson)
                        val questions = if (rawQuestions.isNotEmpty()) {
                            QuestionQualityValidator.validate(rawQuestions).valid
                        } else rawQuestions
                        if (questions.isNotEmpty()) {
                            ProviderResult.Success(questions, "Groq (Llama 4)")
                        } else {
                            anyProviderSucceeded = true
                            null
                        }
                    } else {
                        Log.e("AI_FLOW", "❌ Groq failure: ${result.exceptionOrNull()?.message}")
                        null
                    }
                } else null
            }
        }

        // Feature #5: Smart routing order (replaces hard-coded linear fallback)
        val routeOrder = SmartModelRouter.recommend(
            hasImageData = imageData != null,
            preferredProviderId = when (preferredAi) {
                "gemini" -> SmartModelRouter.Provider.GEMINI_FLASH.id
                "groq" -> SmartModelRouter.Provider.GROQ_LLAMA.id
                else -> "auto"
            }
        )
        Log.d("AI_FLOW", "📡 Smart route order: ${routeOrder.joinToString { it.id }}")

        for (provider in routeOrder) {
            val t0 = System.currentTimeMillis()
            val result: ProviderResult? = when (provider) {
                SmartModelRouter.Provider.GEMINI_FLASH -> tryGemini()
                SmartModelRouter.Provider.GROQ_LLAMA  -> tryGroq()
                SmartModelRouter.Provider.GEMINI_FLASH_LITE -> {
                    Log.d("AI_FLOW", "🔴 [Layer 3] Trying Gemini Flash-Lite...")
                    if (flashLiteApiKey.isNotBlank() && flashLiteApiKey != "your_gemini_flash_lite_key_here") {
                        try {
                            val liteResult = if (imageData != null) flashLiteService.extractQuestions(imageData, mimeType)
                                             else flashLiteService.extractQuestionsFromText(text)
                            if (liteResult.isSuccess) {
                                val qs = liteResult.getOrNull()
                                if (!qs.isNullOrEmpty()) ProviderResult.Success(qs, "Gemini Flash-Lite")
                                else { anyProviderSucceeded = true; null }
                            } else null
                        } catch (e: Exception) { Log.e("AI_FLOW", "❌ Flash-Lite: ${e.message}"); null }
                    } else null
                }
            }
            val latencyMs = System.currentTimeMillis() - t0

            if (result is ProviderResult.Success) {
                val scored = ConfidenceScorer.scoreBatch(result.questions)
                AICostMonitor.recordRequest(provider.id, source.toString(), scored.passed.size)
                TelemetryCollector.recordLatency("${provider.id}/$source", System.currentTimeMillis() - t0Global)
                TelemetryCollector.recordConfidence(scored.averageConfidence)
                TelemetryCollector.record(TelemetryCollector.EventType.QUESTION_QUARANTINED, provider.id, scored.quarantined.size.toDouble())
                SmartModelRouter.recordSuccess(provider, latencyMs)
                Log.d("AI_FLOW", "✅ ${provider.id}: ${result.questions.size} raw → ${scored.passed.size} passed (${scored.quarantined.size} quarantined, avgConf=${"%.2f".format(scored.averageConfidence)})")
                if (scored.passed.isNotEmpty()) return ProviderResult.Success(scored.passed, result.provider)
                anyProviderSucceeded = true
            } else {
                SmartModelRouter.recordFailure(provider, "null result")
            }
        }

        // Gap #15: Use ErrorRecoveryManager for structured final error message
        val finalMessage = if (anyProviderSucceeded) {
            "No MCQ questions found in this content. Make sure the source contains multiple choice questions."
        } else {
            val plan = ErrorRecoveryManager.handle(errorMessage = "All AI providers failed")
            plan.userMessage
        }

        Log.e("AI_FLOW", "💀 ALL 3 PROVIDERS FAILED  source=$source  anySucceeded=$anyProviderSucceeded")
        Log.d("AI_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
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
