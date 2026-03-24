package com.shiva.magics.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

@Serializable
data class YoutubeTranscriptResponse(
    val transcript: String = "",
    val title: String = "",
    val language: String = "",
    val duration: Int = 0,
    val chars: Int = 0,
    val source: String = "",
    val error: String = "",
    val message: String = ""
)

class YoutubeBackendService(
    private val backendBaseUrl: String
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)     // 30s is plenty for youtube-transcript-api
        .build()

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    suspend fun getTranscript(youtubeUrl: String): Result<YoutubeTranscriptResponse> =
        withContext(Dispatchers.IO) {
            val startTime = System.currentTimeMillis()
            try {
                android.util.Log.d("YOUTUBE_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
                android.util.Log.d("YOUTUBE_FLOW", "📡 YoutubeBackendService.getTranscript()")
                android.util.Log.d("YOUTUBE_FLOW", "  url     : $youtubeUrl")
                android.util.Log.d("YOUTUBE_FLOW", "  backend : $backendBaseUrl")
                android.util.Log.d("YOUTUBE_FLOW", "  time    : ${java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())}")

                val encodedUrl = java.net.URLEncoder.encode(youtubeUrl, "UTF-8")
                val request = okhttp3.Request.Builder()
                    .url("$backendBaseUrl/transcript?url=$encodedUrl")
                    .build()

                android.util.Log.d("YOUTUBE_FLOW", "⏳ Sending request to backend...")
                val response = client.newCall(request).execute()
                val body = response.body?.string() ?: ""
                val elapsed = System.currentTimeMillis() - startTime

                android.util.Log.d("YOUTUBE_FLOW", "📥 Response received in ${elapsed}ms")
                android.util.Log.d("YOUTUBE_FLOW", "  httpCode : ${response.code}")
                android.util.Log.d("YOUTUBE_FLOW", "  bodyLen  : ${body.length} chars")

                if (!response.isSuccessful) {
                    android.util.Log.e("YOUTUBE_FLOW", "❌ Backend error body: $body")
                    return@withContext Result.failure(java.io.IOException(
                        "Backend error (${response.code}): ${body.ifBlank { "Unknown error" }}"
                    ))
                }

                // Check if response is JSON before parsing
                if (!body.startsWith("{") && !body.startsWith("[")) {
                    android.util.Log.e("YOUTUBE_FLOW", "❌ Non-JSON response: $body")
                    return@withContext Result.failure(java.io.IOException(
                        "Backend returned non-JSON response: ${body.take(100)}"
                    ))
                }

                val parsed = json.decodeFromString<YoutubeTranscriptResponse>(body)

                if (!response.isSuccessful || parsed.error.isNotBlank()) {
                    val msg = parsed.message.ifBlank { "Backend error (${response.code})" }
                    android.util.Log.e("YOUTUBE_FLOW", "❌ Error: $msg")
                    return@withContext Result.failure(java.io.IOException(msg))
                }

                if (parsed.transcript.isBlank()) {
                    android.util.Log.e("YOUTUBE_FLOW", "❌ Empty transcript returned")
                    return@withContext Result.failure(java.io.IOException(
                        "This video has no subtitles. Try Khan Academy, NPTEL, or TED Talk videos."
                    ))
                }

                // ✅ Success — log all metadata
                android.util.Log.d("YOUTUBE_FLOW", "✅ Transcript fetched successfully!")
                android.util.Log.d("YOUTUBE_FLOW", "  source   : ${parsed.source}")
                android.util.Log.d("YOUTUBE_FLOW", "  title    : ${parsed.title}")
                android.util.Log.d("YOUTUBE_FLOW", "  lang     : ${parsed.language}")
                android.util.Log.d("YOUTUBE_FLOW", "  duration : ${parsed.duration}s (${parsed.duration / 60} min)")
                android.util.Log.d("YOUTUBE_FLOW", "  chars    : ${parsed.chars}")
                android.util.Log.d("YOUTUBE_FLOW", "  elapsed  : ${elapsed}ms")

                // Log FULL transcript in 3000-char chunks
                val transcript = parsed.transcript
                val chunkSize = 3000
                val totalChunks = Math.ceil(transcript.length.toDouble() / chunkSize).toInt()

                android.util.Log.d("YOUTUBE_FLOW", "━━━━━━━━━ FULL TRANSCRIPT ($totalChunks parts) ━━━━━━━━━")
                var offset = 0
                var part = 1
                while (offset < transcript.length) {
                    val end = minOf(offset + chunkSize, transcript.length)
                    android.util.Log.d("YOUTUBE_FLOW", "📜 [Part $part/$totalChunks] ${transcript.substring(offset, end)}")
                    offset += chunkSize
                    part++
                }
                android.util.Log.d("YOUTUBE_FLOW", "━━━━━━━━━ END OF TRANSCRIPT ━━━━━━━━━")

                Result.success(parsed)

            } catch (e: java.net.SocketTimeoutException) {
                val elapsed = System.currentTimeMillis() - startTime
                android.util.Log.e("YOUTUBE_FLOW", "⏱ Timeout after ${elapsed}ms — Render cold start")
                Result.failure(java.io.IOException(
                    "Request timed out. The transcript service may be waking up — please try again in 30 seconds."
                ))
            } catch (e: Exception) {
                val elapsed = System.currentTimeMillis() - startTime
                android.util.Log.e("YOUTUBE_FLOW", "💥 Exception after ${elapsed}ms: ${e.message}", e)
                Result.failure(java.io.IOException(
                    "Could not connect to transcript service. Check your internet connection."
                ))
            }
        }
}
