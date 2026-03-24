package com.shivasruthi.magics.data.remote

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

object YouTubeTranscriptFetcher {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    // Use WEB client - stable for YouTube API
    private const val CLIENT_NAME = "WEB"
    private const val CLIENT_VERSION = "2.20250319.01.00" // Updated to latest version
    private const val CLIENT_NAME_INT = "1"
    private const val API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
    private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"

    fun extractVideoId(url: String): String? {
        val patterns = listOf(
            "(?:v=|youtu\\.be/|/embed/|/shorts/)([a-zA-Z0-9_-]{11})",
            "^([a-zA-Z0-9_-]{11})$"
        )
        for (pattern in patterns) {
            val matcher = Pattern.compile(pattern).matcher(url)
            if (matcher.find()) return matcher.group(1)
        }
        return null
    }

    suspend fun fetchTranscript(videoUrl: String): Result<Pair<String, String>> =
        withContext(Dispatchers.IO) {
        try {
            val videoId = extractVideoId(videoUrl)
                ?: return@withContext Result.failure(Exception("Invalid YouTube URL"))

            Log.d("YOUTUBE_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            Log.d("YOUTUBE_FLOW", "📱 YouTube Data API v3 for: $videoId")
            
            // Debug: Check if video likely has captions
            Log.d("YOUTUBE_FLOW", "🔍 Testing video: https://www.youtube.com/watch?v=$videoId")
            Log.d("YOUTUBE_FLOW", "💡 Tip: Try these test videos with guaranteed captions:")
            Log.d("YOUTUBE_FLOW", "   • Khan Academy: https://youtu.be/jXsQ_0vA4ps")
            Log.d("YOUTUBE_FLOW", "   • TED Talk: https://youtu.be/8KkKuTCFvZU")
            Log.d("YOUTUBE_FLOW", "   • NPTEL: https://youtu.be/CM9Th3J8t7E")
            Log.d("YOUTUBE_FLOW", "   • Popular video: https://youtu.be/dQw4w9WgXcQ (Rick Roll - always has captions)")
            Log.d("YOUTUBE_FLOW", "   • Educational: https://youtu.be/aircAruvnKk (First ML lesson)")

            // ═══ PRIMARY METHOD: YouTube Data API v3 ═══
            Log.d("YOUTUBE_FLOW", "🔄 Primary method: YouTube Data API v3")
            val dataApiResult = tryYouTubeDataApi(videoId)
            if (dataApiResult != null) {
                return@withContext dataApiResult
            }
            
            // ═══ FALLBACK 1: Legacy get_video_info ═══
            Log.d("YOUTUBE_FLOW", "� Fallback 1: Legacy get_video_info")
            val legacyResult = tryLegacyGetVideoInfo(videoId)
            if (legacyResult != null) {
                return@withContext legacyResult
            }
            
            // ═══ FALLBACK 2: Try Innertube (last resort) ═══
            Log.d("YOUTUBE_FLOW", "� Fallback 2: Innertube API (last resort)")
            val innertubeResult = tryInnertubeApi(videoId)
            if (innertubeResult != null) {
                return@withContext innertubeResult
            }
            
            Log.w("YOUTUBE_FLOW", "❌ All methods failed")
            return@withContext Result.failure(
                Exception("Unable to fetch transcript from this video. This could be due to:\n\n• Video has no captions available\n• YouTube API rate limiting\n• Video is private or restricted\n\nTry these solutions:\n• Khan Academy videos (khanacademy.org)\n• TED Talks (ted.com/talks)\n• NPTEL lectures (youtube.com/user/nptelhrd)\n• Look for videos with CC (closed captions) icon\n\nOr manually check: On YouTube, click ⚙️ Settings → Subtitles/CC to see if captions are available.")
            )

        } catch (e: Exception) {
            Log.e("YOUTUBE_FLOW", "❌ Exception: ${e.message}", e)
            Result.failure(e)
        }
    }

    private fun extractTranscriptParams(nextObj: JSONObject): String? {
        return try {
            // Try multiple paths to find transcript params
            
            // Path 1: engagementPanels (most common)
            val panels = nextObj.optJSONArray("engagementPanels")
            if (panels != null) {
                for (i in 0 until panels.length()) {
                    val panel = panels.getJSONObject(i)
                    val section = panel
                        .optJSONObject("engagementPanelSectionListRenderer")
                        ?.optJSONObject("content")
                        ?.optJSONObject("continuationItemRenderer")
                        ?.optJSONObject("continuationEndpoint")
                        ?.optJSONObject("getTranscriptEndpoint")
                    
                    if (section != null) {
                        val params = section.optString("params")
                        if (params.isNotBlank()) {
                            Log.d("YOUTUBE_FLOW", "  Found params via engagementPanels path")
                            return params
                        }
                    }
                }
            }
            
            // Path 2: Try direct transcriptRenderer in contents
            try {
                val contents = nextObj.optJSONObject("contents")
                    ?.optJSONObject("twoColumnWatchNextResults")
                    ?.optJSONObject("results")
                    ?.optJSONObject("results")
                    ?.optJSONArray("contents")
                
                if (contents != null) {
                    for (i in 0 until contents.length()) {
                        val content = contents.getJSONObject(i)
                        val itemSection = content.optJSONObject("itemSectionRenderer")
                        val sectionContents = itemSection?.optJSONArray("contents")
                        
                        if (sectionContents != null) {
                            for (j in 0 until sectionContents.length()) {
                                val item = sectionContents.getJSONObject(j)
                                val transcriptPanel = item.optJSONObject("itemSectionRenderer")
                                    ?.optJSONArray("contents")
                                
                                if (transcriptPanel != null) {
                                    for (k in 0 until transcriptPanel.length()) {
                                        val panel = transcriptPanel.getJSONObject(k)
                                        val params = panel
                                            .optJSONObject("transcriptRenderer")
                                            ?.optJSONObject("content")
                                            ?.optJSONObject("transcriptSearchPanelRenderer")
                                            ?.optJSONArray("continuations")
                                            ?.optJSONObject(0)
                                            ?.optJSONObject("nextContinuationData")
                                            ?.optString("continuation")
                                        
                                        if (!params.isNullOrEmpty()) {
                                            Log.d("YOUTUBE_FLOW", "  Found params via transcriptRenderer path")
                                            return params
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w("YOUTUBE_FLOW", "  Path 2 error: ${e.message}")
            }
            
            // Path 3: Regex fallback for any getTranscriptEndpoint
            try {
                val match = Regex(""""getTranscriptEndpoint"[^}]*"params"\s*:\s*"([^"]+)"""")
                    .find(nextObj.toString())
                if (match != null) {
                    Log.d("YOUTUBE_FLOW", "  Found params via regex fallback")
                    return match.groupValues[1]
                }
            } catch (e: Exception) {
                Log.w("YOUTUBE_FLOW", "  Regex fallback error: ${e.message}")
            }
            
            Log.w("YOUTUBE_FLOW", "    ❌ No transcript params found")
            null
        } catch (e: Exception) {
            Log.e("YOUTUBE_FLOW", "    Extract error: ${e.message}")
            null
        }
    }

    private fun parseTranscriptResponse(json: String): String {
        return try {
            // Path: actions[0].updateEngagementPanelAction.content.transcriptRenderer
            //       .content.transcriptSearchPanelRenderer.body
            //       .transcriptSegmentListRenderer.initialSegments[]
            //       .transcriptSegmentRenderer.snippet.runs[].text
            val obj = JSONObject(json)
            val actions = obj.optJSONArray("actions") ?: return ""

            val texts = mutableListOf<String>()

            for (i in 0 until actions.length()) {
                val action = actions.getJSONObject(i)
                val panel = action
                    .optJSONObject("updateEngagementPanelAction")
                    ?.optJSONObject("content")
                    ?.optJSONObject("transcriptRenderer")
                    ?.optJSONObject("content")
                    ?.optJSONObject("transcriptSearchPanelRenderer")
                    ?.optJSONObject("body")
                    ?.optJSONObject("transcriptSegmentListRenderer")
                    ?.optJSONArray("initialSegments") ?: continue

                for (j in 0 until panel.length()) {
                    val seg = panel.getJSONObject(j)
                    val runs = seg
                        .optJSONObject("transcriptSegmentRenderer")
                        ?.optJSONObject("snippet")
                        ?.optJSONArray("runs") ?: continue

                    val segText = StringBuilder()
                    for (k in 0 until runs.length()) {
                        val text = runs.getJSONObject(k).optString("text", "")
                        segText.append(text)
                    }
                    val clean = segText.toString().trim()
                    if (clean.isNotEmpty()) texts.add(clean)
                }

                if (texts.isNotEmpty()) break
            }

            if (texts.isNotEmpty()) {
                Log.d("YOUTUBE_FLOW", "  Parsed ${texts.size} segments via transcriptSegmentRenderer")
                return texts.joinToString(" ")
            }

            Log.w("YOUTUBE_FLOW", "  ⚠ Could not parse via primary path, trying fallback")
            ""
        } catch (e: Exception) {
            Log.e("YOUTUBE_FLOW", "  Parse error: ${e.message}")
            ""
        }
    }

    private suspend fun tryFallbackMethods(videoId: String): Result<Pair<String, String>>? {
        return withContext(Dispatchers.IO) {
            try {
                Log.d("YOUTUBE_FLOW", "🔄 Trying fallback method 1: Alternative API endpoint")
                
                // Fallback 1: Try different API endpoint with different headers
                val altResult = tryAlternativeEndpoint(videoId)
                if (altResult != null) return@withContext altResult
                
                Log.d("YOUTUBE_FLOW", "🔄 Trying fallback method 2: Legacy get_video_info")
                
                // Fallback 2: Legacy get_video_info method
                val legacyResult = tryLegacyGetVideoInfo(videoId)
                if (legacyResult != null) return@withContext legacyResult
                
                Log.d("YOUTUBE_FLOW", "🔄 Trying fallback method 3: YouTube Data API v3 captions")
                
                // Fallback 3: YouTube Data API v3 captions (requires API key)
                val dataApiResult = tryYouTubeDataApi(videoId)
                if (dataApiResult != null) return@withContext dataApiResult
                
                Log.w("YOUTUBE_FLOW", "❌ All fallback methods failed")
                
                // Provide helpful guidance to the user
                return@withContext Result.failure(
                    Exception("Unable to fetch transcript from this video. This could be due to:\n\n• Video has no captions available\n• YouTube API rate limiting\n• Video is private or restricted\n\nTry these solutions:\n• Khan Academy videos (khanacademy.org)\n• TED Talks (ted.com/talks)\n• NPTEL lectures (youtube.com/user/nptelhrd)\n• Look for videos with CC (closed captions) icon\n\nOr manually check: On YouTube, click ⚙️ Settings → Subtitles/CC to see if captions are available.")
                )
            } catch (e: Exception) {
                Log.e("YOUTUBE_FLOW", "Fallback error: ${e.message}")
                null
            }
        }
    }

    private suspend fun tryYouTubeDataApi(videoId: String): Result<Pair<String, String>>? {
        return try {
            Log.d("YOUTUBE_FLOW", "🔄 Trying YouTube Data API v3 captions")
            
            // Use a public YouTube Data API key (for demo purposes)
            val dataApiKey = "AIzaSyAa8yy0GdcGhdtVWtQJlBvFHDhXJ9A6g2E"
            val url = "https://www.googleapis.com/youtube/v3/captions?videoId=$videoId&key=$dataApiKey&part=snippet"
            
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
                    // Find English caption or first available
                    var targetCaptionId: String? = null
                    var detectedLang = "en"
                    
                    for (i in 0 until items.length()) {
                        val item = items.getJSONObject(i)
                        val snippet = item.optJSONObject("snippet")
                        val lang = snippet?.optString("language", "")
                        val trackKind = snippet?.optString("trackKind", "")
                        
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
                        // Download the caption content
                        val downloadUrl = "https://www.googleapis.com/youtube/v3/captions/$targetCaptionId?key=$dataApiKey&tfmt=srt"
                        
                        val downloadRequest = Request.Builder()
                            .url(downloadUrl)
                            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                            .build()

                        val downloadResponse = client.newCall(downloadRequest).execute()
                        val srtContent = downloadResponse.use { it.body?.string() ?: "" }

                        if (downloadResponse.code == 200 && srtContent.isNotEmpty()) {
                            // Parse SRT to plain text
                            val transcript = parseSrtToText(srtContent)
                            if (transcript.isNotBlank()) {
                                Log.d("YOUTUBE_FLOW", "✅ YouTube Data API succeeded: ${transcript.length} chars")
                                return Result.success(Pair(transcript, detectedLang))
                            }
                        }
                    }
                }
            }
            null
        } catch (e: Exception) {
            Log.w("YOUTUBE_FLOW", "YouTube Data API failed: ${e.message}")
            null
        }
    }
    
    private suspend fun tryInnertubeApi(videoId: String): Result<Pair<String, String>>? {
        return try {
            Log.d("YOUTUBE_FLOW", "🔄 Trying Innertube API (last resort)")
            
            // Step 1: Get video info
            val step1Body = JSONObject().apply {
                put("context", JSONObject().apply {
                    put("client", JSONObject().apply {
                        put("clientName", "WEB")
                        put("clientVersion", "2.20250319.01.00")
                        put("hl", "en")
                        put("gl", "US")
                    })
                })
                put("videoId", videoId)
            }.toString()

            val step1Request = Request.Builder()
                .url("https://www.youtube.com/youtubei/v1/next?key=$API_KEY")
                .post(step1Body.toRequestBody("application/json".toMediaType()))
                .header("Content-Type", "application/json")
                .header("User-Agent", USER_AGENT)
                .header("X-YouTube-Client-Name", "1")
                .header("X-YouTube-Client-Version", "2.20250319.01.00")
                .build()

            val step1Response = client.newCall(step1Request).execute()
            val step1Json = step1Response.use { it.body?.string() ?: "" }

            if (step1Response.code == 200 && step1Json.isNotEmpty()) {
                val nextObj = JSONObject(step1Json)
                val params = extractTranscriptParams(nextObj)
                
                if (params != null) {
                    // Step 2: Get transcript
                    val step2Body = JSONObject().apply {
                        put("context", JSONObject().apply {
                            put("client", JSONObject().apply {
                                put("clientName", "WEB")
                                put("clientVersion", "2.20250319.01.00")
                                put("hl", "en")
                                put("gl", "US")
                            })
                        })
                        put("params", params)
                    }.toString()

                    val step2Request = Request.Builder()
                        .url("https://www.youtube.com/youtubei/v1/get_transcript?key=$API_KEY")
                        .post(step2Body.toRequestBody("application/json".toMediaType()))
                        .header("Content-Type", "application/json")
                        .header("User-Agent", USER_AGENT)
                        .header("X-YouTube-Client-Name", "1")
                        .header("X-YouTube-Client-Version", "2.20250319.01.00")
                        .build()

                    val step2Response = client.newCall(step2Request).execute()
                    val step2Json = step2Response.use { it.body?.string() ?: "" }

                    if (step2Response.code == 200 && step2Json.isNotEmpty()) {
                        val transcript = parseTranscriptResponse(step2Json)
                        if (transcript.isNotBlank()) {
                            Log.d("YOUTUBE_FLOW", "✅ Innertube API succeeded: ${transcript.length} chars")
                            return Result.success(Pair(transcript, "en"))
                        }
                    }
                }
            }
            null
        } catch (e: Exception) {
            Log.w("YOUTUBE_FLOW", "Innertube API failed: ${e.message}")
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

    private suspend fun tryAlternativeEndpoint(videoId: String): Result<Pair<String, String>>? {
        return try {
            // Try with different client version and headers
            val altBody = JSONObject().apply {
                put("context", JSONObject().apply {
                    put("client", JSONObject().apply {
                        put("clientName", "WEB")
                        put("clientVersion", "2.20250319.01.00") // Same updated version
                        put("hl", "en")
                        put("gl", "US")
                    })
                })
                put("videoId", videoId)
                put("params", "8AEB")
            }.toString()

            val altRequest = Request.Builder()
                .url("https://www.youtube.com/youtubei/v1/next?key=$API_KEY")
                .post(altBody.toRequestBody("application/json".toMediaType()))
                .header("Content-Type", "application/json")
                .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
                .header("X-YouTube-Client-Name", "1")
                .header("X-YouTube-Client-Version", "2.20250319.01.00")
                .header("Accept", "application/json")
                .header("Accept-Language", "en-US,en;q=0.9")
                .build()

            val altResponse = client.newCall(altRequest).execute()
            val altJson = altResponse.use { it.body?.string() ?: "" }

            if (altResponse.code == 200 && altJson.isNotEmpty()) {
                Log.d("YOUTUBE_FLOW", "✅ Alternative endpoint succeeded")
                // Parse and return transcript
                val nextObj = JSONObject(altJson)
                val params = extractTranscriptParams(nextObj)
                if (params != null) {
                    // Continue with Step 2 using these params
                    return getTranscriptWithParams(videoId, params, nextObj.optJSONObject("responseContext")?.optString("visitorData", "") ?: "")
                }
            }
            null
        } catch (e: Exception) {
            Log.w("YOUTUBE_FLOW", "Alternative endpoint failed: ${e.message}")
            null
        }
    }

    private suspend fun tryLegacyGetVideoInfo(videoId: String): Result<Pair<String, String>>? {
        return try {
            Log.d("YOUTUBE_FLOW", "🔄 Trying legacy get_video_info method")
            
            val url = "https://www.youtube.com/get_video_info?video_id=$videoId&el=detailpage&ps=default&eurl=&gl=US&hl=en"
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .build()

            val response = client.newCall(request).execute()
            val body = response.use { it.body?.string() ?: "" }

            if (response.code == 200 && body.isNotEmpty()) {
                val decoded = java.net.URLDecoder.decode(body, "UTF-8")
                
                // Extract caption tracks
                val captionTracksMatch = Regex("captionTracks=([^&]+)").find(decoded)
                if (captionTracksMatch != null) {
                    val captionTracksEncoded = captionTracksMatch.groupValues[1]
                    val captionTracks = java.net.URLDecoder.decode(captionTracksEncoded, "UTF-8")
                    
                    val baseUrlMatch = Regex(""""baseUrl":"([^"]+)"""").find(captionTracks)
                    if (baseUrlMatch != null) {
                        var captionUrl = baseUrlMatch.groupValues[1]
                            .replace("\\u0026", "&")
                            .replace("\\/", "/")

                        if (captionUrl.startsWith("/")) {
                            captionUrl = "https://www.youtube.com$captionUrl"
                        }

                        // Fetch the caption XML
                        val xmlRequest = Request.Builder()
                            .url(captionUrl)
                            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                            .build()

                        val xmlResponse = client.newCall(xmlRequest).execute()
                        val xml = xmlResponse.use { it.body?.string() ?: "" }

                        if (xml.isNotEmpty() && xml.contains("<text")) {
                            val transcript = parseCaptionXml(xml)
                            if (transcript.isNotBlank()) {
                                Log.d("YOUTUBE_FLOW", "✅ Legacy method succeeded: ${transcript.length} chars")
                                return Result.success(Pair(transcript, "en"))
                            }
                        }
                    }
                }
            }
            null
        } catch (e: Exception) {
            Log.w("YOUTUBE_FLOW", "Legacy method failed: ${e.message}")
            null
        }
    }

    private suspend fun getTranscriptWithParams(videoId: String, params: String, visitorData: String): Result<Pair<String, String>> {
        return try {
            val step2Body = JSONObject().apply {
                put("context", JSONObject().apply {
                    put("client", JSONObject().apply {
                        put("clientName", "WEB")
                        put("clientVersion", "2.20250319.01.00")
                        put("hl", "en")
                        put("gl", "US")
                        // Only add visitorData if it's not empty and valid
                        if (visitorData.isNotEmpty() && visitorData.length > 10) {
                            put("visitorData", visitorData)
                        }
                    })
                })
                put("externalVideoId", videoId)
                put("params", params)
            }.toString()

            val step2RequestBuilder = Request.Builder()
                .url("https://www.youtube.com/youtubei/v1/get_transcript?key=$API_KEY")
                .post(step2Body.toRequestBody("application/json".toMediaType()))
                .header("Content-Type", "application/json")
                .header("User-Agent", USER_AGENT)
                .header("X-YouTube-Client-Name", "1")
                .header("X-YouTube-Client-Version", "2.20250319.01.00")
                .header("Origin", "https://www.youtube.com")
                .header("Referer", "https://www.youtube.com/watch?v=$videoId")
                .header("Accept", "application/json")
                .header("Accept-Language", "en-US,en;q=0.9")
            
            // Only add X-Goog-Visitor-Id if visitorData is valid
            if (visitorData.isNotEmpty() && visitorData.length > 10) {
                step2RequestBuilder.header("X-Goog-Visitor-Id", visitorData)
            }
            
            val step2Request = step2RequestBuilder.build()

            val step2Response = client.newCall(step2Request).execute()
            val step2Json = step2Response.use { it.body?.string() ?: "" }

            if (step2Response.code == 200 && step2Json.isNotEmpty()) {
                val transcript = parseTranscriptResponse(step2Json)
                if (transcript.isNotBlank()) {
                    return Result.success(Pair(transcript, "en"))
                }
            }
            Result.failure(Exception("Failed to get transcript with params"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseCaptionXml(xml: String): String {
        val textPattern = Regex("<text[^>]*>(.*?)</text>", RegexOption.DOT_MATCHES_ALL)
        return textPattern.findAll(xml)
            .map { it.groupValues[1] }
            .map { text ->
                text.replace("&amp;", "&")
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&quot;", "\"")
                    .replace("&#39;", "'")
                    .replace(Regex("<[^>]+>"), "")
                    .replace("\n", " ")
                    .trim()
            }
            .filter { it.isNotEmpty() }
            .joinToString(" ")
    }

    // Test function to verify implementation works
    suspend fun testTranscriptFetching(): Boolean {
        return try {
            val testUrls = listOf(
                "https://youtu.be/jXsQ_0vA4ps", // Khan Academy (guaranteed captions)
                "https://youtu.be/8KkKuTCFvZU", // TED Talk (high-quality captions)
                "https://youtu.be/CM9Th3J8t7E"  // NPTEL (educational content)
            )
            
            for (url in testUrls) {
                Log.d("YOUTUBE_FLOW", "🧪 Testing with: $url")
                val result = fetchTranscript(url)
                if (result.isSuccess) {
                    val (transcript, lang) = result.getOrThrow()
                    Log.d("YOUTUBE_FLOW", "✅ SUCCESS: ${transcript.length} chars, lang=$lang")
                    Log.d("YOUTUBE_FLOW", "   Preview: ${transcript.take(100)}...")
                    return true
                } else {
                    Log.w("YOUTUBE_FLOW", "❌ Failed: ${result.exceptionOrNull()?.message}")
                }
            }
            false
        } catch (e: Exception) {
            Log.e("YOUTUBE_FLOW", "Test error: ${e.message}")
            false
        }
    }
    
    // Quick test with Rick Roll (always has captions)
    suspend fun quickTest(): Boolean {
        return try {
            val testUrl = "https://youtu.be/dQw4w9WgXcQ" // Rick Roll - guaranteed captions
            Log.d("YOUTUBE_FLOW", "🚀 Quick test with: $testUrl")
            val result = fetchTranscript(testUrl)
            if (result.isSuccess) {
                val (transcript, lang) = result.getOrThrow()
                Log.d("YOUTUBE_FLOW", "🎉 QUICK TEST SUCCESS: ${transcript.length} chars, lang=$lang")
                Log.d("YOUTUBE_FLOW", "   Preview: ${transcript.take(150)}...")
                return true
            } else {
                Log.e("YOUTUBE_FLOW", "❌ Quick test failed: ${result.exceptionOrNull()?.message}")
                return false
            }
        } catch (e: Exception) {
            Log.e("YOUTUBE_FLOW", "Quick test error: ${e.message}")
            false
        }
    }
    
    // Test with Khan Academy (guaranteed captions)
    suspend fun testKhanAcademy(): Boolean {
        return try {
            val testUrl = "https://youtu.be/jXsQ_0vA4ps" // Khan Academy - guaranteed captions
            Log.d("YOUTUBE_FLOW", "🎓 Khan Academy test with: $testUrl")
            val result = fetchTranscript(testUrl)
            if (result.isSuccess) {
                val (transcript, lang) = result.getOrThrow()
                Log.d("YOUTUBE_FLOW", "🎉 KHAN ACADEMY SUCCESS: ${transcript.length} chars, lang=$lang")
                Log.d("YOUTUBE_FLOW", "   Preview: ${transcript.take(150)}...")
                return true
            } else {
                Log.e("YOUTUBE_FLOW", "❌ Khan Academy test failed: ${result.exceptionOrNull()?.message}")
                return false
            }
        } catch (e: Exception) {
            Log.e("YOUTUBE_FLOW", "Khan Academy test error: ${e.message}")
            false
        }
    }
}
