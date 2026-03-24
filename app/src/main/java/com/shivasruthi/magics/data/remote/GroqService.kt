package com.shivasruthi.magics.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.Headers
import retrofit2.http.POST
import java.io.IOException
import java.util.concurrent.TimeUnit

interface GroqApi {
    @POST("chat/completions")
    @Headers("Content-Type: application/json")
    suspend fun complete(
        @Header("Authorization") auth: String,
        @Body request: GroqRequest
    ): Response<GroqResponse>
}

class GroqService {

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }

    private val retrofit = Retrofit.Builder()
        .baseUrl("https://api.groq.com/openai/v1/")
        .client(
            OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .writeTimeout(60, TimeUnit.SECONDS)
                .build()
        )
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    private val api = retrofit.create(GroqApi::class.java)

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

    suspend fun extractQuestionsFromText(text: String, apiKey: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val messages = listOf(
                GroqMessage(role = "system", content = PROMPT),
                GroqMessage(role = "user", content = text)
            )
            val request = GroqRequest(messages = messages)
            val authHeader = "Bearer $apiKey"

            val response = api.complete(authHeader, request)

            if (!response.isSuccessful) {
                return@withContext Result.failure(
                    IOException("Groq API error ${response.code()}: ${response.errorBody()?.string()}")
                )
            }

            val responseContent = response.body()?.choices?.firstOrNull()?.message?.content
            if (responseContent.isNullOrBlank()) {
                Result.failure(IOException("Empty response from Groq"))
            } else {
                Result.success(responseContent)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
