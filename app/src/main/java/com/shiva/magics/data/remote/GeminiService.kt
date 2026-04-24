package com.shiva.magics.data.remote

import android.util.Base64
import com.shiva.magics.data.model.GeminiQuestionResponse
import com.shiva.magics.data.model.Question
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit
import com.shiva.magics.util.AICostMonitor

class GeminiService(
    private val apiKey: String,
    private val costDao: com.shiva.magics.data.local.AICostDao? = null
) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private val json = Json {
        isLenient = true
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    private val endpoint =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

    private val PROMPT = """
        You are a precise MCQ exam question extractor.
        Analyze this document carefully and extract ALL multiple choice questions.
        
        Return ONLY a valid JSON object with this exact structure, no other text:
        {
          "questions": [
            {
              "questionText": "Complete question text here",
              "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
              "correctAnswerIndex": 0
            }
          ]
        }
        
        STRICT RULES:
        - correctAnswerIndex is zero-based: 0=A, 1=B, 2=C, 3=D
        - If the correct answer is marked with ✓, bold, underline, or asterisk, use that index
        - If correct answer cannot be determined, use -1
        - options array MUST always contain exactly 4 strings
        - If an option is missing in the source, use an empty string ""
        - Extract EVERY question found, even with inconsistent formatting
        - questionText must include the full question without option labels
        - Do NOT include any markdown, explanation, or text outside the JSON
        - If NO questions found, return: {"questions": []}
    """.trimIndent()

    private val GENERATE_PRACTICE_PROMPT = """
        You are an expert exam creator. 
        Create 10 high-quality multiple choice questions for the following topic: {TOPIC}
        
        Difficulty: {DIFFICULTY}
        
        Return ONLY a valid JSON object with this exact structure:
        {
          "questions": [
            {
              "questionText": "Question text here",
              "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
              "correctAnswerIndex": 0
            }
          ]
        }
        
        STRICT RULES:
        - Exactly 4 options per question.
        - Exactly 1 correct answer.
        - correctAnswerIndex is zero-based (0 to 3).
        - Focus on conceptual depth and edge cases.
        - No extra text or markdown.
    """.trimIndent()

    suspend fun generatePracticeQuestions(
        topic: String,
        difficulty: String = "MEDIUM"
    ): Result<List<Question>> = withContext(Dispatchers.IO) {
        try {
            // Budget Check
            costDao?.let {
                val withinBudget = AICostMonitor.recordAndCheckBudget(it, "default_user", "gemini-2.5-flash", 2000)
                if (!withinBudget) return@withContext Result.failure(Exception("Daily AI budget exceeded."))
            }

            val finalPrompt = GENERATE_PRACTICE_PROMPT
                .replace("{TOPIC}", topic)
                .replace("{DIFFICULTY}", difficulty)
            
            val requestBody = buildTextOnlyRequestBody("Generate questions for $topic", finalPrompt)

            val request = Request.Builder()
                .url(endpoint)
                .addHeader("x-goog-api-key", apiKey)
                .addHeader("Content-Type", "application/json")
                .post(requestBody.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val responseString = response.body?.string()
                ?: return@withContext Result.failure(IOException("Empty response"))

            if (!response.isSuccessful) {
                return@withContext Result.failure(IOException("Error ${response.code}"))
            }

            val extractedText = parseGeminiResponseText(responseString)
            val cleanedJson = extractedText
                .replace(Regex("```json\\s*"), "")
                .replace(Regex("```\\s*"), "")
                .trim()

            val geminiData = json.decodeFromString<GeminiQuestionResponse>(cleanedJson)
            // Usage Recording (Simplified: 3000 tokens per call)
            // In a real app, we'd parse usage metadata from response
            Result.success(geminiData.questions)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // Main function: accepts bytes + mimeType, returns questions
    // mimeType: "application/pdf" or "image/jpeg" or "image/png"
    suspend fun extractQuestions(
        fileBytes: ByteArray,
        mimeType: String
    ): Result<List<Question>> = withContext(Dispatchers.IO) {
        try {
            // Budget Check
            costDao?.let {
                val withinBudget = AICostMonitor.recordAndCheckBudget(it, "default_user", "gemini-2.5-flash", 3000)
                if (!withinBudget) return@withContext Result.failure(Exception("Daily AI budget exceeded. Please try again tomorrow."))
            }

            android.util.Log.d("PDF_FLOW", "📡 GeminiService.extractQuestions()")
            android.util.Log.d("PDF_FLOW", "  mimeType  : $mimeType")
            android.util.Log.d("PDF_FLOW", "  fileSize  : ${fileBytes.size} bytes (${fileBytes.size / 1024} KB)")

            // Validate size: Gemini inline limit is ~20MB total request
            // Base64 inflates by ~33%, so cap source at 14MB
            if (fileBytes.size > 14 * 1024 * 1024) {
                android.util.Log.e("PDF_FLOW", "❌ File too large: ${fileBytes.size / (1024 * 1024)}MB — aborting")
                return@withContext Result.failure(
                    IllegalArgumentException(
                        "File too large (${fileBytes.size / (1024 * 1024)}MB). " +
                        "Please use a file under 14MB for best results."
                    )
                )
            }

            val base64Data = Base64.encodeToString(fileBytes, Base64.NO_WRAP)
            android.util.Log.d("PDF_FLOW", "  base64Len : ${base64Data.length} chars")
            android.util.Log.d("PDF_FLOW", "  endpoint  : $endpoint")

            val requestBody = buildJsonRequestBody(base64Data, mimeType)

            val request = Request.Builder()
                .url(endpoint)
                .addHeader("x-goog-api-key", apiKey)
                .addHeader("Content-Type", "application/json")
                .post(requestBody.toRequestBody("application/json".toMediaType()))
                .build()

            android.util.Log.d("PDF_FLOW", "⏳ Sending request to Gemini...")
            val response = client.newCall(request).execute()
            val responseString = response.body?.string()
                ?: return@withContext Result.failure(IOException("Empty response from Gemini"))

            android.util.Log.d("PDF_FLOW", "📥 Response received")
            android.util.Log.d("PDF_FLOW", "  httpCode  : ${response.code}")
            android.util.Log.d("PDF_FLOW", "  bodyLen   : ${responseString.length} chars")

            if (!response.isSuccessful) {
                android.util.Log.e("PDF_FLOW", "❌ Gemini API error ${response.code}")
                android.util.Log.e("PDF_FLOW", "  body: $responseString")
                return@withContext Result.failure(
                    IOException("Gemini API error ${response.code}: $responseString")
                )
            }

            val extractedText = parseGeminiResponseText(responseString)
            android.util.Log.d("PDF_FLOW", "  rawJsonLen: ${extractedText.length} chars")

            val cleanedJson = extractedText
                .replace(Regex("```json\\s*"), "")
                .replace(Regex("```\\s*"), "")
                .trim()

            val geminiData = json.decodeFromString<GeminiQuestionResponse>(cleanedJson)
            android.util.Log.d("PDF_FLOW", "✅ Parsed ${geminiData.questions.size} questions from Gemini JSON")
            Result.success(geminiData.questions)

        } catch (e: CancellationException) {
            throw e  // Always rethrow CancellationException
        } catch (e: Exception) {
            android.util.Log.e("PDF_FLOW", "💥 Exception in GeminiService.extractQuestions()", e)
            Result.failure(e)
        }
    }

    private fun buildJsonRequestBody(base64Data: String, mimeType: String): String {
        return """
            {
              "contents": [{
                "parts": [
                  {
                    "inline_data": {
                      "mime_type": "$mimeType",
                      "data": "$base64Data"
                    }
                  },
                  {
                    "text": ${json.encodeToString(PROMPT)}
                  }
                ]
              }],
              "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.1,
                "maxOutputTokens": 8192
              }
            }
        """.trimIndent()
    }
    
    suspend fun extractQuestionsFromText(
        text: String,
        customPrompt: String? = null
    ): Result<List<Question>> = withContext(Dispatchers.IO) {
        try {
            // Budget Check
            costDao?.let {
                val withinBudget = AICostMonitor.recordAndCheckBudget(it, "default_user", "gemini-2.5-flash", 1500)
                if (!withinBudget) return@withContext Result.failure(Exception("Daily AI budget exceeded."))
            }

            val promptToUse = customPrompt ?: PROMPT
            val requestBody = buildTextOnlyRequestBody(text, promptToUse)

            val request = Request.Builder()
                .url(endpoint)
                .addHeader("x-goog-api-key", apiKey)
                .addHeader("Content-Type", "application/json")
                .post(requestBody.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val responseString = response.body?.string()
                ?: return@withContext Result.failure(IOException("Empty response from Gemini"))

            if (!response.isSuccessful) {
                return@withContext Result.failure(
                    IOException("Gemini API error ${response.code}: $responseString")
                )
            }

            val extractedText = parseGeminiResponseText(responseString)
            val cleanedJson = extractedText
                .replace(Regex("```json\\s*"), "")
                .replace(Regex("```\\s*"), "")
                .trim()

            val geminiData = json.decodeFromString<GeminiQuestionResponse>(cleanedJson)
            Result.success(geminiData.questions)

        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun buildTextOnlyRequestBody(sourceText: String, prompt: String): String {
        return """
            {
              "contents": [{
                "parts": [
                  {
                    "text": ${json.encodeToString(sourceText)}
                  },
                  {
                    "text": ${json.encodeToString(prompt)}
                  }
                ]
              }],
              "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.1,
                "maxOutputTokens": 8192
              }
            }
        """.trimIndent()
    }

    private fun parseGeminiResponseText(responseJson: String): String {
        // Navigate: candidates[0].content.parts[0].text
        val root = json.parseToJsonElement(responseJson).jsonObject
        return root["candidates"]
            ?.jsonArray?.get(0)
            ?.jsonObject?.get("content")
            ?.jsonObject?.get("parts")
            ?.jsonArray?.get(0)
            ?.jsonObject?.get("text")
            ?.jsonPrimitive?.content
            ?: throw IOException("Could not parse Gemini response structure")
    }
}
