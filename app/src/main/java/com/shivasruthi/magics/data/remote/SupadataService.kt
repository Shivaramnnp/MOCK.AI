package com.shivasruthi.magics.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

class SupadataService(
    private val primaryKey: String,
    private val fallbackKey: String = ""
) {

    private val json = Json { 
        ignoreUnknownKeys = true
        explicitNulls = false 
    }

    private val retrofit = Retrofit.Builder()
        .baseUrl("https://generativelanguage.googleapis.com/")
        .client(
            OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(90, TimeUnit.SECONDS)
                .writeTimeout(90, TimeUnit.SECONDS)
                .build()
        )
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    private val geminiVideoService = retrofit.create(GeminiVideoService::class.java)

    private var usesFallback = false
    
    private fun getCurrentKey(): String {
        return if (usesFallback && fallbackKey.isNotBlank() 
                   && fallbackKey != "your_third_gemini_key_here") {
            fallbackKey
        } else {
            primaryKey
        }
    }

    fun buildVideoRequest(youtubeUrl: String): GeminiVideoRequest {
        return GeminiVideoRequest(
            contents = listOf(GeminiContent(
                parts = listOf(
                    GeminiPart(fileData = GeminiFileData(fileUri = youtubeUrl)),
                    GeminiPart(text = "Extract a complete transcript of everything spoken in this video. Return only the raw spoken text, no timestamps, no formatting. Just the full content.")
                )
            ))
        )
    }

    suspend fun getYouTubeTranscript(youtubeUrl: String): Result<String> = withContext(Dispatchers.IO) {
        // Try primary key first
        val primaryResult = tryFetchTranscript(youtubeUrl, primaryKey)
        
        if (primaryResult.isSuccess) {
            usesFallback = false
            return@withContext primaryResult
        }
        
        // Check if it's a quota error specifically
        val error = primaryResult.exceptionOrNull()?.message ?: ""
        val isQuota = error.contains("quota", ignoreCase = true) ||
                      error.contains("429") ||
                      error.contains("RESOURCE_EXHAUSTED", ignoreCase = true)
        
        // If quota error AND we have a fallback key, try it
        if (isQuota && fallbackKey.isNotBlank() 
                    && fallbackKey != "your_third_gemini_key_here") {
            android.util.Log.d("YouTubeGemini", "Primary key quota hit, trying fallback key...")
            usesFallback = true
            val fallbackResult = tryFetchTranscript(youtubeUrl, fallbackKey)
            if (fallbackResult.isSuccess) return@withContext fallbackResult
        }
        
        // Both keys exhausted
        if (isQuota) {
            return@withContext Result.failure(
                java.io.IOException(
                    "YouTube quota exhausted for today. Please try again tomorrow or use a different input type."
                )
            )
        }
        
        return@withContext primaryResult
    }

    private suspend fun tryFetchTranscript(youtubeUrl: String, apiKey: String): Result<String> {
        return try {
            val request = buildVideoRequest(youtubeUrl)
            
            android.util.Log.d("YouTubeGemini", "Making API call for URL: $youtubeUrl")
            android.util.Log.d("YouTubeGemini", "API Key length: ${apiKey.length}")
            
            val response = geminiVideoService.generateFromVideo(apiKey, request)

            android.util.Log.d("YouTubeGemini", "Response code: ${response.code()}")
            android.util.Log.d("YouTubeGemini", "Response successful: ${response.isSuccessful}")
            
            if (!response.isSuccessful) {
                val code = response.code()
                val errorBody = response.errorBody()?.string() ?: ""
                android.util.Log.d("YouTubeGemini", "Error body: $errorBody")
                
                return when {
                    code == 429 -> Result.failure(
                        java.io.IOException("RESOURCE_EXHAUSTED: quota exceeded")
                    )
                    code == 400 && errorBody.contains("size", ignoreCase = true) ->
                        Result.failure(java.io.IOException(
                            "Video is too long. Try videos under 2 hours."
                        ))
                    code == 400 -> Result.failure(java.io.IOException(
                        "This video is private. Please use a public YouTube video."
                    ))
                    else -> Result.failure(java.io.IOException(
                        "Could not process this video. Try another one."
                    ))
                }
            }

            val transcript = response.body()
                ?.candidates?.firstOrNull()
                ?.content?.parts?.firstOrNull()
                ?.text

            if (transcript.isNullOrBlank()) {
                Result.failure(java.io.IOException("Video is too long. Try videos under 2 hours."))
            } else {
                Result.success(transcript)
            }
        } catch (e: java.net.SocketTimeoutException) {
            android.util.Log.e("YouTubeGemini", "Timeout: ${e.message}")
            Result.failure(java.io.IOException("Processing timed out. Try a shorter video."))
        } catch (e: Exception) {
            android.util.Log.e("YouTubeGemini", "Exception: ${e.javaClass.simpleName}: ${e.message}")
            Result.failure(java.io.IOException("Could not process this video. Try another one."))
        }
    }
}
