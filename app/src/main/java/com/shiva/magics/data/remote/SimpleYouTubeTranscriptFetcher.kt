package com.shiva.magics.data.remote

import android.util.Log
import com.shiva.magics.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.regex.Pattern

object SimpleYouTubeTranscriptFetcher {
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .build()
    
    suspend fun fetchTranscript(videoUrl: String): Result<Pair<String, String>> =
        withContext(Dispatchers.IO) {
            try {
                val videoId = extractVideoId(videoUrl)
                    ?: return@withContext Result.failure(Exception("Invalid YouTube URL"))
                
                Log.d("SIMPLE_YT", "🎯 Simple fetch for: $videoId")
                
                // Method 1: Try YouTube Data API v3 (most reliable)
                val dataApiResult = tryYouTubeDataApi(videoId)
                if (dataApiResult != null) {
                    return@withContext dataApiResult
                }
                
                // Method 2: Try direct caption extraction
                val directResult = tryDirectCaptionExtraction(videoId)
                if (directResult != null) {
                    return@withContext directResult
                }
                
                Result.failure(Exception("No captions found. Try videos with CC icon."))
                
            } catch (e: Exception) {
                Log.e("SIMPLE_YT", "Error: ${e.message}")
                Result.failure(e)
            }
        }
    
    private suspend fun tryYouTubeDataApi(videoId: String): Result<Pair<String, String>>? {
        return try {
            Log.d("SIMPLE_YT", "🔄 Trying YouTube Data API...")

            val apiKey = BuildConfig.YOUTUBE_DATA_API_KEY
            val url = "https://www.googleapis.com/youtube/v3/captions?videoId=$videoId&key=$apiKey&part=snippet"
            
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .build()

            val response = client.newCall(request).execute()
            val body = response.use { it.body?.string() ?: "" }

            if (response.code == 200 && body.isNotEmpty()) {
                val captionsJson = JSONObject(body)
                val items = captionsJson.optJSONArray("items")
                
                if (items != null && items.length() > 0) {
                    Log.d("SIMPLE_YT", "✅ Found ${items.length()} caption tracks")
                    
                    // Find English caption or first available
                    var targetCaptionId: String? = null
                    var detectedLang = "en"
                    
                    for (i in 0 until items.length()) {
                        val item = items.getJSONObject(i)
                        val snippet = item.optJSONObject("snippet")
                        val lang = snippet?.optString("language", "")
                        val trackKind = snippet?.optString("trackKind", "")
                        
                        Log.d("SIMPLE_YT", "📝 Track $i: lang=$lang, kind=$trackKind")
                        
                        if (trackKind == "standard") {
                            if (lang?.startsWith("en") == true) {
                                targetCaptionId = item.optString("id")
                                detectedLang = lang
                                break
                            } else if (targetCaptionId == null) {
                                targetCaptionId = item.optString("id")
                                detectedLang = lang ?: "en"
                            }
                        }
                    }
                    
                    if (targetCaptionId != null) {
                        Log.d("SIMPLE_YT", "🎯 Using caption: $targetCaptionId")
                        
                        // Download the caption content
                        val downloadUrl = "https://www.googleapis.com/youtube/v3/captions/$targetCaptionId?key=$apiKey&tfmt=srt"
                        
                        val downloadRequest = Request.Builder()
                            .url(downloadUrl)
                            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                            .build()

                        val downloadResponse = client.newCall(downloadRequest).execute()
                        val srtContent = downloadResponse.use { it.body?.string() ?: "" }

                        if (downloadResponse.code == 200 && srtContent.isNotEmpty()) {
                            val transcript = parseSrtToText(srtContent)
                            if (transcript.isNotBlank()) {
                                Log.d("SIMPLE_YT", "✅ SUCCESS: ${transcript.length} chars, lang=$detectedLang")
                                return Result.success(Pair(transcript, detectedLang))
                            }
                        }
                    }
                }
            }
            null
        } catch (e: Exception) {
            Log.w("SIMPLE_YT", "YouTube Data API failed: ${e.message}")
            null
        }
    }
    
    private suspend fun tryDirectCaptionExtraction(videoId: String): Result<Pair<String, String>>? {
        return try {
            Log.d("SIMPLE_YT", "🔄 Trying direct extraction...")
            
            val url = "https://www.youtube.com/watch?v=$videoId"
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .build()

            val response = client.newCall(request).execute()
            val html = response.use { it.body?.string() ?: "" }

            if (html.isNotEmpty()) {
                // Look for caption tracks in the HTML
                val captionPattern = Pattern.compile("\"captionTracks\":\\s*\\[([^\\]]+)\\]")
                val matcher = captionPattern.matcher(html)
                
                if (matcher.find()) {
                    val captionTracksJson = matcher.group(1)
                    Log.d("SIMPLE_YT", "📝 Found caption tracks: $captionTracksJson")
                    
                    // Parse caption tracks correctly - wrap in array brackets
                    try {
                        val captions = JSONArray("[$captionTracksJson]")
                        
                        for (i in 0 until captions.length()) {
                            val caption = captions.getJSONObject(i)
                            val lang = caption.optString("languageCode", "")
                            val baseUrl = caption.optString("baseUrl", "")
                            
                            Log.d("SIMPLE_YT", "📝 Track $i: lang=$lang, baseUrl found=${baseUrl.isNotEmpty()}")
                            
                            if (baseUrl.isNotEmpty()) {
                                Log.d("SIMPLE_YT", "🎯 Downloading caption: lang=$lang")
                                
                                val captionRequest = Request.Builder()
                                    .url(baseUrl)
                                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                                    .header("Accept", "*/*")
                                    .header("Accept-Language", "en-US,en;q=0.9")
                                    .header("Accept-Encoding", "gzip, deflate, br")
                                    .header("Referer", "https://www.youtube.com/")
                                    .header("Origin", "https://www.youtube.com")
                                    .header("Sec-Fetch-Dest", "empty")
                                    .header("Sec-Fetch-Mode", "cors")
                                    .header("Sec-Fetch-Site", "same-origin")
                                    .build()

                                val captionResponse = client.newCall(captionRequest).execute()
                                val xmlContent = captionResponse.use { it.body?.string() ?: "" }

                                Log.d("SIMPLE_YT", "📥 Response: code=${captionResponse.code}, length=${xmlContent.length}")
                                Log.d("SIMPLE_YT", "📝 Content preview: ${xmlContent.take(200)}...")

                                if (captionResponse.code == 200 && xmlContent.isNotEmpty()) {
                                    val transcript = parseXmlToText(xmlContent)
                                    Log.d("SIMPLE_YT", "🔤 Parsed transcript: ${transcript.take(100)}...")
                                    if (transcript.isNotBlank()) {
                                        Log.d("SIMPLE_YT", "✅ SUCCESS: ${transcript.length} chars, lang=$lang")
                                        return Result.success(Pair(transcript, lang))
                                    } else {
                                        Log.w("SIMPLE_YT", "⚠ Parsed transcript is empty")
                                    }
                                } else {
                                    Log.w("SIMPLE_YT", "⚠ Bad response: code=${captionResponse.code}, empty=${xmlContent.isEmpty()}")
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.e("SIMPLE_YT", "JSON parsing error: ${e.message}")
                        // Try alternative parsing method
                        tryAlternativeParsing(captionTracksJson ?: "")
                    }
                }
            }
            null
        } catch (e: Exception) {
            Log.w("SIMPLE_YT", "Direct extraction failed: ${e.message}")
            null
        }
    }
    
    private suspend fun tryAlternativeParsing(captionTracksJson: String): Result<Pair<String, String>>? {
        return try {
            Log.d("SIMPLE_YT", "🔄 Trying alternative parsing...")
            
            // Manual parsing to extract baseUrl and languageCode
            val baseUrlPattern = Pattern.compile("\"baseUrl\"\\s*:\\s*\"([^\"]+)\"")
            val langCodePattern = Pattern.compile("\"languageCode\"\\s*:\\s*\"([^\"]+)\"")
            
            val baseUrlMatcher = baseUrlPattern.matcher(captionTracksJson)
            val langMatcher = langCodePattern.matcher(captionTracksJson)
            
            val baseUrls = mutableListOf<String>()
            val langCodes = mutableListOf<String>()
            
            while (baseUrlMatcher.find()) {
                baseUrls.add(baseUrlMatcher.group(1) ?: continue)
            }
            
            while (langMatcher.find()) {
                langCodes.add(langMatcher.group(1) ?: continue)
            }
            
            Log.d("SIMPLE_YT", "📊 Found ${baseUrls.size} baseUrls and ${langCodes.size} languages")
            
            // Try English first, then first available
            var targetIndex = -1
            for (i in 0 until minOf(baseUrls.size, langCodes.size)) {
                if (langCodes[i].startsWith("en")) {
                    targetIndex = i
                    break
                }
            }
            
            if (targetIndex == -1 && baseUrls.isNotEmpty()) {
                targetIndex = 0 // Use first available
            }
            
            if (targetIndex >= 0) {
                val baseUrl = baseUrls[targetIndex]
                val lang = langCodes.getOrNull(targetIndex) ?: "en"
                
                Log.d("SIMPLE_YT", "🎯 Using alternative parsing: lang=$lang")
                
                val captionRequest = Request.Builder()
                    .url(baseUrl)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .header("Accept", "*/*")
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .header("Accept-Encoding", "gzip, deflate, br")
                    .header("Referer", "https://www.youtube.com/")
                    .header("Origin", "https://www.youtube.com")
                    .header("Sec-Fetch-Dest", "empty")
                    .header("Sec-Fetch-Mode", "cors")
                    .header("Sec-Fetch-Site", "same-origin")
                    .build()

                val captionResponse = client.newCall(captionRequest).execute()
                val xmlContent = captionResponse.use { it.body?.string() ?: "" }

                if (captionResponse.code == 200 && xmlContent.isNotEmpty()) {
                    val transcript = parseXmlToText(xmlContent)
                    if (transcript.isNotBlank()) {
                        Log.d("SIMPLE_YT", "✅ ALTERNATIVE SUCCESS: ${transcript.length} chars, lang=$lang")
                        return Result.success(Pair(transcript, lang))
                    }
                }
            }
            
            null
        } catch (e: Exception) {
            Log.e("SIMPLE_YT", "Alternative parsing failed: ${e.message}")
            null
        }
    }
    
    private fun parseSrtToText(srt: String): String {
        return srt.split("\n\n")
            .filter { it.isNotBlank() }
            .mapNotNull { block ->
                val lines = block.split("\n")
                if (lines.size >= 3) {
                    lines.drop(2).joinToString(" ")
                        .replace(Regex("\\d+"), "")
                        .replace(Regex("\\{[^}]*\\}"), "")
                        .replace(Regex("<[^>]*>"), "")
                        .replace(Regex("\\[\\d+:\\d+:\\d+,\\d+ --> \\d+:\\d+:\\d+,\\d+\\]"), "")
                        .trim()
                } else null
            }
            .filter { it.isNotBlank() }
            .joinToString(" ")
    }
    
    private fun parseXmlToText(xml: String): String {
        val textPattern = Pattern.compile("<text[^>]*>(.*?)</text>", Pattern.DOTALL)
        val matcher = textPattern.matcher(xml)
        val result = StringBuilder()
        
        while (matcher.find()) {
            val text = matcher.group(1).orEmpty()
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace(Regex("<[^>]+>"), "")
                .replace("\n", " ")
                .trim()
            
            if (text.isNotEmpty()) {
                result.append(text).append(" ")
            }
        }
        
        return result.toString().trim()
    }
    
    private fun extractVideoId(url: String): String? {
        val patterns = listOf(
            Regex("(?:youtube\\.com/watch\\?v=|youtu\\.be/|youtube\\.com/embed/)([a-zA-Z0-9_-]{11})"),
            Regex("youtube\\.com/watch\\?v=([a-zA-Z0-9_-]{11})")
        )
        
        for (pattern in patterns) {
            val match = pattern.find(url)
            if (match != null) {
                return match.groupValues[1]
            }
        }
        return null
    }
}
