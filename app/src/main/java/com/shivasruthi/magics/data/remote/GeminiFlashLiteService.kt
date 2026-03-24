package com.shivasruthi.magics.data.remote

import android.util.Base64
import com.shivasruthi.magics.data.model.GeminiQuestionResponse
import com.shivasruthi.magics.data.model.Question
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

class GeminiFlashLiteService(private val apiKey: String) {

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
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"

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

    suspend fun extractQuestions(
        fileBytes: ByteArray,
        mimeType: String
    ): Result<List<Question>> = withContext(Dispatchers.IO) {
        try {
            if (fileBytes.size > 14 * 1024 * 1024) {
                return@withContext Result.failure(
                    IllegalArgumentException(
                        "File too large. Please use a file under 14MB."
                    )
                )
            }

            val base64Data = Base64.encodeToString(fileBytes, Base64.NO_WRAP)
            val requestBody = buildJsonRequestBody(base64Data, mimeType)

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
