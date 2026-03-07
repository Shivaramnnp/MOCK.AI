package com.shivasruthi.magics.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

class SupadataService(private val backendUrl: String) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    private val jsonParser = Json {
        ignoreUnknownKeys = true
    }

    suspend fun getYouTubeTranscript(youtubeUrl: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val baseUrl = backendUrl.trimEnd('/')
            val url = "$baseUrl/transcript?url=$youtubeUrl"

            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            val response = client.newCall(request).execute()
            val responseString = response.body?.string()
                ?: return@withContext Result.failure(IOException("Empty response from backend API"))

            if (!response.isSuccessful) {
                return@withContext Result.failure(
                    IOException("Backend API error ${response.code}: $responseString")
                )
            }

            // Expected schema: {"transcript": "full text"} or {"error": "error message", "message": "friendly message"}
            val rootObj = jsonParser.parseToJsonElement(responseString).jsonObject
            
            if (rootObj.containsKey("error")) {
                val errorCode = rootObj["error"]?.jsonPrimitive?.content ?: "unknown"
                val errorMsg = rootObj["message"]?.jsonPrimitive?.content ?: "Unknown backend error"
                
                if (errorCode == "no_captions") {
                    return@withContext Result.failure(IOException("This video has no subtitles. Try Physics Wallah, Khan Academy or NPTEL videos — they work great! \uD83C\uDF93"))
                }
                return@withContext Result.failure(IOException("Backend Error: $errorMsg"))
            }

            val resultText = rootObj["transcript"]?.jsonPrimitive?.content
            if (resultText.isNullOrBlank()) {
                Result.failure(IOException("This video has no captions available"))
            } else {
                Result.success(resultText)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
