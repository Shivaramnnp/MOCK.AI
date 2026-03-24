package com.shivasruthi.magics.data.remote

import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

interface GeminiVideoService {
    @POST("v1beta/models/gemini-2.0-flash:generateContent")
    suspend fun generateFromVideo(
        @Query("key") apiKey: String,
        @Body request: GeminiVideoRequest
    ): Response<GeminiVideoResponse>
}

// Global instance builder for convenience
object GeminiVideoApiClient {
    val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(90, TimeUnit.SECONDS)
        .build()
}
