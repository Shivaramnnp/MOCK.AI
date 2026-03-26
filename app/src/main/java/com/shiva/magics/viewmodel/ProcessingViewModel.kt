package com.shiva.magics.viewmodel

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.shiva.magics.data.model.Question
import com.shiva.magics.data.remote.GeminiService
import com.shiva.magics.data.remote.YoutubeBackendService
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.zip.ZipInputStream

sealed interface ProcessingState {
    data object Idle : ProcessingState
    data class Loading(
        val status: String = "Processing...",
        val currentStage: Int = 0
    ) : ProcessingState
    data class Success(
        val questions: List<Question>,
        val fileName: String
    ) : ProcessingState
    data class Error(val message: String) : ProcessingState
}

// Remembers last input so retry() can re-run it
private sealed interface LastInput {
    data class File(val context: android.content.Context, val uri: android.net.Uri, val mimeType: String, val fileName: String) : LastInput
    data class FileBytes(val bytes: ByteArray, val mimeType: String, val fileName: String) : LastInput
    data class Text(val text: String, val source: com.shiva.magics.data.model.InputSource, val fileName: String) : LastInput
    data class WebUrl(val url: String) : LastInput
    data class YouTubeUrl(val url: String) : LastInput
}

class ProcessingViewModel(
    private val aiProviderManager: com.shiva.magics.data.remote.AiProviderManager,
    private val youtubeBackendService: YoutubeBackendService,
    private val geminiService: GeminiService,
    private val context: android.content.Context
) : ViewModel() {

    private val prefs = context.getSharedPreferences("app_settings", android.content.Context.MODE_PRIVATE)

    private fun applySettings(questions: List<Question>): List<Question> {
        var list = if (prefs.getBoolean("shuffle_questions", false)) questions.shuffled() else questions
        val limit = prefs.getInt("questions_per_test", 0)
        if (limit > 0) {
            list = list.take(limit)
        }
        return list
    }

    private val _state = MutableStateFlow<ProcessingState>(ProcessingState.Idle)
    val state: StateFlow<ProcessingState> = _state.asStateFlow()

    private var processingJob: Job? = null
    private var lastInput: LastInput? = null
    private var keepAliveJob: Job? = null

    private val geminiMessages = listOf(
        "Asking  AI...",
        "Extracting questions...",
        "Almost there...",
        "Preparing your test..."
    )

    private val fallbackMessages = listOf(
        "Switching to backup AI...",
        "Groq is processing...",
        "Extracting questions...",
        "Preparing your test..."
    )

    private val lastResortMessages = listOf(
        "Trying last resort AI...",
        "Generating questions...",
        "Almost there...",
        "Preparing your test..."
    )

    private val defaultMessages = geminiMessages

    // Cycling status messages for loading UI
    val statusMessages = androidx.compose.runtime.mutableStateListOf(*defaultMessages.toTypedArray())

    private fun resetStatusMessages() {
        statusMessages.clear()
        statusMessages.addAll(defaultMessages)
    }

    fun processMultipleImages(context: android.content.Context, uris: List<android.net.Uri>) {
        if (uris.isEmpty()) return
        if (uris.size == 1) {
            val uri = uris.first()
            val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
            // Use a clean fallback name, we can just defer to processFile
            processFile(context, uri, mimeType, "Image")
            return
        }

        resetStatusMessages()
        processingJob?.cancel()
        processingJob = viewModelScope.launch {
            _state.value = ProcessingState.Loading("Combining ${uris.size} images...", 0)
            try {
                val pdfBytes = withContext(Dispatchers.IO) {
                    val document = android.graphics.pdf.PdfDocument()
                    uris.forEachIndexed { index, uri ->
                        context.contentResolver.openInputStream(uri)?.use { inputStream ->
                            val bitmap = android.graphics.BitmapFactory.decodeStream(inputStream)
                            if (bitmap != null) {
                                val maxDim = 1200f
                                val scale = Math.min(1f, Math.min(maxDim / bitmap.width, maxDim / bitmap.height))
                                val scaledW = (bitmap.width * scale).toInt()
                                val scaledH = (bitmap.height * scale).toInt()
                                val scaledBitmap = android.graphics.Bitmap.createScaledBitmap(bitmap, scaledW, scaledH, true)

                                val pageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(scaledW, scaledH, index + 1).create()
                                val page = document.startPage(pageInfo)
                                page.canvas.drawBitmap(scaledBitmap, 0f, 0f, null)
                                document.finishPage(page)
                                
                                if (scaledBitmap != bitmap) scaledBitmap.recycle()
                                bitmap.recycle()
                            }
                        }
                    }
                    val out = java.io.ByteArrayOutputStream()
                    document.writeTo(out)
                    document.close()
                    out.toByteArray()
                }
                
                val fileName = "Combined_${uris.size}_Images.pdf"
                processFileBytes(pdfBytes, "application/pdf", fileName)
            } catch (e: Exception) {
                _state.value = ProcessingState.Error("Failed to compile images: ${e.message}")
            }
        }
    }

    fun processFileBytes(bytes: ByteArray, mimeType: String, fileName: String) {
        lastInput = LastInput.FileBytes(bytes, mimeType, fileName)
        resetStatusMessages()
        processingJob?.cancel()
        processingJob = viewModelScope.launch {
            val voicePrompt = """
                You are an expert MCQ question generator for competitive exam preparation.
                Analyze this audio content carefully. The user is speaking their study material,
                lecture notes, or reading aloud from a textbook.
                
                CRITICAL: FOCUS ON CONCEPTS, NOT SPEAKER PERSONALIZATION:
                - Extract ONLY key concepts, principles, facts, and technical information
                - IGNORE ALL speaker's personal expressions, filler words, or conversational phrases
                - NEVER ask about what the speaker "can/cannot do", "feels", "thinks", or "expresses"
                - Focus on WHAT is being taught, not HOW the speaker says it
                - Convert "I want to talk about" → "The topic is"
                - Convert "As you and I know" → "Common knowledge indicates"
                - Convert "I believe" → "The evidence suggests"
                
                QUESTION TYPES TO CREATE:
                - ✅ "What is the principle behind [concept]?"
                - ✅ "How does [process] work?"
                - ✅ "What are the characteristics of [component]?"
                - ✅ "What is the relationship between [A] and [B]?"
                - ✅ "What is the purpose of [function]?"
                
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
                - Generate 10-20 questions based on the content spoken in the audio
                - Questions must be based ONLY on the concepts discussed
                - NEVER ask about speaker's personal expressions or abilities
                - Each question must have exactly 4 options
                - correctAnswerIndex is zero-based: 0=A, 1=B, 2=C, 3=D
                - All questions and options MUST be in English
                - Do NOT include markdown or text outside JSON
                - If no educational content found, return: {"questions": []}
            """.trimIndent()

            _state.value = ProcessingState.Loading("Reading file...", 0)
            android.util.Log.d("CAMERA_FLOW", "▶ processFileBytes() — ${bytes.size / 1024}KB  mimeType=$mimeType")

            val inputSource = when {
                mimeType == "application/pdf" -> com.shiva.magics.data.model.InputSource.PDF
                mimeType.startsWith("image/") -> com.shiva.magics.data.model.InputSource.Image
                mimeType.startsWith("audio/") -> com.shiva.magics.data.model.InputSource.Audio
                else -> com.shiva.magics.data.model.InputSource.Camera
            }

            try {

                val result = aiProviderManager.extractQuestionsWithFallback(
                    text = "",
                    imageData = bytes,
                    mimeType = mimeType,
                    source = inputSource,
                    fileName = fileName,
                    customPrompt = if (inputSource == com.shiva.magics.data.model.InputSource.Audio) voicePrompt else null,
                    preferredAi = prefs.getString("preferred_ai", "auto") ?: "auto"
                )

                when (result) {
                    is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.Success -> {
                        android.util.Log.d("CAMERA_FLOW", "🎉 ${result.questions.size} questions from ${result.provider}")
                        if (result.questions.isEmpty()) {
                            val errorMsg = when (inputSource) {
                                com.shiva.magics.data.model.InputSource.Audio -> "No MCQ questions could be generated from this audio."
                                com.shiva.magics.data.model.InputSource.PDF -> "No MCQ questions found in this document."
                                else -> "No MCQ questions found in this image."
                            }
                            _state.value = ProcessingState.Error(errorMsg)
                        } else {
                            _state.value = ProcessingState.Success(applySettings(result.questions), fileName)
                        }
                    }
                    is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.AllFailed -> {
                        android.util.Log.e("CAMERA_FLOW", "❌ All providers failed: ${result.lastError}")
                        _state.value = ProcessingState.Error(result.lastError)
                    }
                }
            } catch (e: CancellationException) {
                _state.value = ProcessingState.Idle
            } catch (e: Exception) {
                android.util.Log.e("CAMERA_FLOW", "💥 Exception", e)
                val errorMsg = when (inputSource) {
                    com.shiva.magics.data.model.InputSource.Audio -> "Failed to process audio"
                    else -> "Failed to process image"
                }
                _state.value = ProcessingState.Error(e.message ?: errorMsg)
            }
        }
    }

    fun processFile(
        context: Context,
        uri: Uri,
        mimeType: String,
        fileName: String
    ) {
        lastInput = LastInput.File(context, uri, mimeType, fileName)
        resetStatusMessages()
        processingJob?.cancel()
        processingJob = viewModelScope.launch {
            _state.value = ProcessingState.Loading("Reading document...", 0)

            // ✅ LOG 1 — Job started
            android.util.Log.d("PDF_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            android.util.Log.d("PDF_FLOW", "▶ processFile() started")
            android.util.Log.d("PDF_FLOW", "  fileName : $fileName")
            android.util.Log.d("PDF_FLOW", "  mimeType : $mimeType")
            android.util.Log.d("PDF_FLOW", "  uri      : $uri")

            try {
                val bytes = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)
                        ?.use { it.readBytes() }
                        ?: throw IOException("Cannot read file: $fileName")
                }

                // ✅ LOG 2 — File read success
                android.util.Log.d("PDF_FLOW", "✅ File read from ContentResolver")
                android.util.Log.d("PDF_FLOW", "  bytes    : ${bytes.size} bytes (${bytes.size / 1024} KB)")

                // If DOCX or PPTX use POI to extract text, then pass to text logic
                if (mimeType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
                    mimeType == "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
                    android.util.Log.d("PDF_FLOW", "↪ Routing to DOCX/PPTX branch — skipping PDF/Image path")
                    val extractedText = withContext(Dispatchers.IO) {
                        try {
                            val sb = StringBuilder()
                            ZipInputStream(bytes.inputStream()).use { zis ->
                                var entry = zis.nextEntry
                                while (entry != null) {
                                    val name = entry.name
                                    if (name.startsWith("word/document.xml") || name.startsWith("ppt/slides/slide")) {
                                        val xmlContent = zis.readBytes().toString(Charsets.UTF_8)
                                        // Simple regex to extract text between <w:t> or <a:t>
                                        val regex = Regex("<[wa]:t[^>]*>(.*?)</[wa]:t>")
                                        regex.findAll(xmlContent).forEach { match ->
                                            sb.append(match.groupValues[1]).append(" ")
                                        }
                                    }
                                    entry = zis.nextEntry
                                }
                            }
                            sb.toString().trim()
                        } catch (e: Exception) {
                            throw IOException("Failed to parse document: ${e.message}")
                        }
                    }
                    if (extractedText.isBlank()) {
                        _state.value = ProcessingState.Error("Could not extract any text from this file.")
                        return@launch
                    }
                    val safeText = if (extractedText.length > 100000) extractedText.take(100000) else extractedText
                    
                    val result = aiProviderManager.extractQuestionsWithFallback(
                        text = safeText,
                        source = com.shiva.magics.data.model.InputSource.Docx,
                        fileName = fileName,
                        preferredAi = prefs.getString("preferred_ai", "auto") ?: "auto"
                    )

                    when (result) {
                        is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.Success -> {
                            android.util.Log.d("MagicS", "Questions generated by: ${result.provider}")
                            if (result.questions.isEmpty()) {
                                _state.value = ProcessingState.Error("No questions found in this document.")
                            } else {
                                _state.value = ProcessingState.Success(applySettings(result.questions), fileName)
                            }
                        }
                        is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.AllFailed -> {
                            _state.value = ProcessingState.Error(result.lastError)
                        }
                    }
                    return@launch
                }

                // ✅ LOG 3 — Routing decision
                val inputSource = when {
                    mimeType == "application/pdf" -> com.shiva.magics.data.model.InputSource.PDF
                    mimeType.startsWith("image/") -> com.shiva.magics.data.model.InputSource.Image
                    mimeType.startsWith("audio/") -> com.shiva.magics.data.model.InputSource.Audio
                    else -> com.shiva.magics.data.model.InputSource.Camera
                }
                android.util.Log.d("PDF_FLOW", "🔀 InputSource resolved : $inputSource")
                android.util.Log.d("PDF_FLOW", "📤 Calling AiProviderManager.extractQuestionsWithFallback()")

                val result = aiProviderManager.extractQuestionsWithFallback(
                    text = "",
                    imageData = bytes,
                    mimeType = mimeType,
                    source = inputSource,
                    fileName = fileName,
                    preferredAi = prefs.getString("preferred_ai", "auto") ?: "auto"
                )

                // ✅ LOG 4 — Result from AI manager
                when (result) {
                    is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.Success -> {
                        android.util.Log.d("PDF_FLOW", "🎉 SUCCESS")
                        android.util.Log.d("PDF_FLOW", "  provider        : ${result.provider}")
                        android.util.Log.d("PDF_FLOW", "  questions found : ${result.questions.size}")
                        result.questions.forEachIndexed { i, q ->
                            android.util.Log.d("PDF_FLOW", "  Q${i + 1}: ${q.questionText.take(80)}...")
                        }
                        if (result.questions.isEmpty()) {
                            android.util.Log.w("PDF_FLOW", "⚠ Provider succeeded but returned 0 questions")
                            _state.value = ProcessingState.Error("No MCQ questions found in this document. Make sure it contains multiple choice questions.")
                        } else {
                            _state.value = ProcessingState.Success(applySettings(result.questions), fileName)
                        }
                    }
                    is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.AllFailed -> {
                        android.util.Log.e("PDF_FLOW", "❌ ALL PROVIDERS FAILED")
                        android.util.Log.e("PDF_FLOW", "  error: ${result.lastError}")
                        _state.value = ProcessingState.Error(result.lastError)
                    }
                }
            } catch (e: CancellationException) {
                android.util.Log.w("PDF_FLOW", "⚠ Job cancelled by user")
                _state.value = ProcessingState.Idle
            } catch (e: Exception) {
                android.util.Log.e("PDF_FLOW", "💥 Unexpected exception in processFile()", e)
                _state.value = ProcessingState.Error(e.message ?: "Failed to process file")
            }
            android.util.Log.d("PDF_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        }
    }

    fun generateQuestionsFromText(text: String, source: com.shiva.magics.data.model.InputSource, fileName: String) {
        lastInput = LastInput.Text(text, source, fileName)
        resetStatusMessages()
        processingJob?.cancel()
        processingJob = viewModelScope.launch {
            _state.value = ProcessingState.Loading("Analyzing text...", 0)
            try {
                if (source == com.shiva.magics.data.model.InputSource.Json) {
                    // Fast path for raw JSON
                    try {
                        val decoded = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
                            .decodeFromString<com.shiva.magics.data.model.GeminiQuestionResponse>(text)
                        
                        if (decoded.questions.isEmpty()) {
                            _state.value = ProcessingState.Error("No questions found in this JSON.")
                        } else {
                            _state.value = ProcessingState.Success(applySettings(decoded.questions), fileName)
                        }
                    } catch (e: Exception) {
                        _state.value = ProcessingState.Error("Invalid JSON format. Please check the structure.")
                    }
                    return@launch
                }

                // AI generation for other text
                val customPrompt = if (source == com.shiva.magics.data.model.InputSource.Topic) {
                    """
                    Generate multiple choice questions about: $text for competitive exam preparation. Focus on commonly tested concepts.
                    Return ONLY a JSON object with this exact structure:
                    {
                      "questions": [
                        {
                          "questionText": "Question here",
                          "options": ["A", "B", "C", "D"],
                          "correctAnswerIndex": 0
                        }
                      ]
                    }
                    """.trimIndent()
                } else null

                val result = aiProviderManager.extractQuestionsWithFallback(
                    text = text,
                    source = source,
                    fileName = fileName,
                    customPrompt = customPrompt,
                    preferredAi = prefs.getString("preferred_ai", "auto") ?: "auto"
                )
                
                when (result) {
                    is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.Success -> {
                        android.util.Log.d("MagicS", "Questions generated by: \${result.provider}")
                        if (result.questions.isEmpty()) {
                            _state.value = ProcessingState.Error("No MCQ questions could be generated from this text.")
                        } else {
                            _state.value = ProcessingState.Success(applySettings(result.questions), fileName)
                        }
                    }
                    is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.AllFailed -> {
                        _state.value = ProcessingState.Error(result.lastError)
                    }
                }
            } catch (e: CancellationException) {
                _state.value = ProcessingState.Idle
            } catch (e: Exception) {
                _state.value = ProcessingState.Error(e.message ?: "Failed to process text")
            }
        }
    }

    fun processWebUrl(url: String) {
        lastInput = LastInput.WebUrl(url)
        resetStatusMessages()
        processingJob?.cancel()
        processingJob = viewModelScope.launch {
            _state.value = ProcessingState.Loading("Fetching webpage...", 0)
            try {
                // Run Jsoup on IO Coroutine Dispatcher
                val textContent = withContext(Dispatchers.IO) {
                    val document = org.jsoup.Jsoup.connect(url)
                        .userAgent("Mozilla/5.0")
                        .timeout(10000)
                        .get()
                    // Strip HTML tags and keep only meaningless paragraph text
                    document.text()
                }

                if (textContent.isBlank()) {
                    _state.value = ProcessingState.Error("Could not extract any meaningful text from this URL.")
                    return@launch
                }

                // Cap at 8,000 chars — safe for Gemini, Groq (12k token limit ≈ 9k chars), and Flash-Lite
                val safeText = if (textContent.length > 8000) textContent.take(8000) else textContent
                
                android.util.Log.d("AI_FLOW", "🌐 URL text scraped: ${textContent.length} chars → capped to ${safeText.length}")
                
                val urlGenerationPrompt = """
                    You are an expert MCQ question generator for competitive exam preparation.
                    
                    Below is the text content scraped from a webpage. Read it carefully and generate
                    high-quality multiple choice questions that test understanding of key concepts,
                    facts, and technical information presented in this content.
                    
                    CRITICAL: FOCUS ON CONCEPTS, NOT PERSONAL EXPRESSIONS:
                    - Extract ONLY key concepts, principles, facts, and technical information
                    - IGNORE author's personal expressions, opinions, or conversational phrases
                    - Focus on WHAT is being explained, not HOW the author says it
                    - Convert "I think" → "The evidence suggests"
                    - Convert "I believe" → "According to the data"
                    - Convert "As we can see" → "The analysis shows"
                    
                    QUESTION TYPES TO AVOID:
                    - ❌ "What does the author express/think/believe?"
                    - ❌ "What does the author want to show?"
                    - ❌ Any question about author's personal state
                    
                    QUESTION TYPES TO CREATE:
                    - ✅ "What is the principle behind [concept]?"
                    - ✅ "How does [process] work?"
                    - ✅ "What are the characteristics of [component]?"
                    - ✅ "What is the relationship between [A] and [B]?"
                    - ✅ "What is the purpose of [function]?"
                    
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
                    - Generate between 10 and 25 questions based on how much content is available
                    - Questions must be based ONLY on information present in the provided text
                    - NEVER ask about author's personal expressions or opinions
                    - Each question must have exactly 4 options
                    - correctAnswerIndex is zero-based: 0=A, 1=B, 2=C, 3=D
                    - Make distractors (wrong options) plausible but clearly incorrect
                    - Vary question types: definitions, comparisons, cause-effect, numerical facts
                    - Do NOT include any markdown, explanation, or text outside the JSON
                    - If the content has no meaningful educational value, return: {"questions": []}
                """.trimIndent()

                val result = aiProviderManager.extractQuestionsWithFallback(
                    text = safeText,
                    source = com.shiva.magics.data.model.InputSource.Url,
                    fileName = url,
                    customPrompt = urlGenerationPrompt,
                    preferredAi = prefs.getString("preferred_ai", "auto") ?: "auto"
                )
                
                when (result) {
                    is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.Success -> {
                        android.util.Log.d("MagicS", "Questions generated by: ${result.provider}")
                        if (result.questions.isEmpty()) {
                            _state.value = ProcessingState.Error(
                                "Could not generate questions from this page. " +
                                "Try a Wikipedia article, textbook page, or any educational content."
                            )
                        } else {
                            _state.value = ProcessingState.Success(applySettings(result.questions), url)
                        }
                    }
                    is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.AllFailed -> {
                        _state.value = ProcessingState.Error(result.lastError)
                    }
                }

            } catch (e: CancellationException) {
                _state.value = ProcessingState.Idle
            } catch (e: Exception) {
                _state.value = ProcessingState.Error("Failed to fetch webpage: ${e.message}")
            }
        }
    }

    fun cancel() {
        processingJob?.cancel()
        _state.value = ProcessingState.Idle
    }

    fun reset() { _state.value = ProcessingState.Idle }

    fun retry() {
        android.util.Log.d("RETRY", "🔄 Retrying last input: $lastInput")
        when (val input = lastInput) {
            is LastInput.File -> processFile(input.context, input.uri, input.mimeType, input.fileName)
            is LastInput.FileBytes -> processFileBytes(input.bytes, input.mimeType, input.fileName)
            is LastInput.Text -> generateQuestionsFromText(input.text, input.source, input.fileName)
            is LastInput.WebUrl -> processWebUrl(input.url)
            is LastInput.YouTubeUrl -> processYouTubeUrl(input.url)
            null -> {
                android.util.Log.w("RETRY", "⚠ No last input to retry")
                _state.value = ProcessingState.Idle
            }
        }
    }

    private val keepAliveClient = okhttp3.OkHttpClient.Builder()
        .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
        .build()

    fun startKeepAlive(backendUrl: String) {
        if (keepAliveJob?.isActive == true) return  // already running
        keepAliveJob = viewModelScope.launch {
            while (true) {
                try {
                    kotlinx.coroutines.delay(10 * 60 * 1000L) // 10 minutes
                    withContext(Dispatchers.IO) {
                        val request = okhttp3.Request.Builder()
                            .url("$backendUrl/health")
                            .build()
                        keepAliveClient.newCall(request).execute().close()
                        android.util.Log.d("KEEP_ALIVE", "✅ Pinged backend — staying warm")
                    }
                } catch (e: Exception) {
                    android.util.Log.w("KEEP_ALIVE", "⚠ Ping failed: ${e.message}")
                }
            }
        }
    }

    override fun onCleared() {
        processingJob?.cancel()
        keepAliveJob?.cancel()
        super.onCleared()
    }

    fun processYouTubeUrl(url: String) {
        lastInput = LastInput.YouTubeUrl(url)
        val isValid = url.contains("youtube.com/watch") ||
                      url.contains("youtu.be/") ||
                      url.contains("youtube.com/shorts/") ||
                      url.contains("m.youtube.com/watch")

        if (!isValid) {
            _state.value = ProcessingState.Error("Please enter a valid YouTube URL")
            return
        }

        statusMessages.clear()
        
        // Show dynamic status based on what we're doing
        val baseMessages = mutableListOf("Fetching video transcript...")
        
        // Add language-specific messages
        android.util.Log.d("YOUTUBE_FLOW", "🌍 Will detect language and translate if needed")
        
        statusMessages.addAll(baseMessages + listOf(
            "Detecting video language...",
            "Processing content...",  // Will be updated after language detection
            "Generating mock test questions...",
            "Almost ready..."
        ))

        processingJob?.cancel()
        processingJob = viewModelScope.launch {
            _state.value = ProcessingState.Loading("Connecting to YouTube...", 0)
            val jobStart = System.currentTimeMillis()

            android.util.Log.d("YOUTUBE_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            android.util.Log.d("YOUTUBE_FLOW", "▶ processYouTubeUrl() — CLIENT SIDE")
            android.util.Log.d("YOUTUBE_FLOW", "  url: $url")

            // Step 1: Fetch transcript via Flask backend service
            _state.value = ProcessingState.Loading("Fetching transcript...", 0)

            val transcriptResult = youtubeBackendService.getTranscript(url)

            val response = transcriptResult.getOrElse { e ->
                android.util.Log.e("YOUTUBE_FLOW", "❌ Backend fetch failed: ${e.message}")
                _state.value = ProcessingState.Error(
                    e.message ?: "Could not fetch transcript. Try a video with captions."
                )
                return@launch
            }

            val transcriptText = response.transcript
            val detectedLang = response.language
            val title = response.title

            val step1Time = System.currentTimeMillis() - jobStart
            android.util.Log.d("YOUTUBE_FLOW", "✅ Backend transcript in ${step1Time}ms: ${transcriptText.length} chars, lang=$detectedLang")
            android.util.Log.d("YOUTUBE_FLOW", "📺 Video title: $title")

            // Update status based on detected language
            if (detectedLang.startsWith("en")) {
                android.util.Log.d("YOUTUBE_FLOW", "🌍 Detected: English - No translation needed")
                statusMessages[1] = "Processing English content..."
            } else {
                android.util.Log.d("YOUTUBE_FLOW", "🌍 Detected: $detectedLang - Will translate to English")
                statusMessages[1] = "Translating to English..."
            }

            val isEnglish = detectedLang.startsWith("en")

            // Cap for AI token limits
            val safeTranscript = if (transcriptText.length > 8000) transcriptText.take(8000)
                                 else transcriptText

            android.util.Log.d("YOUTUBE_FLOW", "📤 Sending to AI: ${safeTranscript.length} chars, isEnglish=$isEnglish")

            // Step 2: Build prompt — handles translation + MCQ generation in ONE AI call
            val youtubePrompt = if (isEnglish) {
                """
            You are an expert MCQ question generator for competitive exam preparation.
            Below is a transcript from a YouTube video.
            
            CRITICAL: FOCUS ON CONCEPTS, NOT SPEAKER PERSONALIZATION:
            - Extract ONLY key concepts, principles, facts, and technical information
            - IGNORE ALL speaker's personal expressions, inability statements, or conversational phrases
            - NEVER ask about what the speaker "can/cannot do", "feels", "thinks", or "expresses"
            - Focus on WHAT is being taught, not HOW the speaker says it
            - Convert "I can't show you" → "The process involves"
            - Convert "Now let us move to" → "The next topic is"
            - Convert "As you can see" → "The observation shows"
            - Convert "I will show you" → "The demonstration reveals"
            - Convert "What I want to explain" → "The concept involves"
            - Convert "Let me tell you" → "The information indicates"
            - Convert "In my experience" → "According to the data"
            - Convert "I believe" → "The evidence suggests"
            - Convert "We can see" → "The analysis shows"
            
            QUESTION TYPES TO AVOID:
            - ❌ "What does the speaker express/inability to do?"
            - ❌ "What does the speaker feel/think?"
            - ❌ "What does the speaker want to show?"
            - ❌ "What does the speaker believe?"
            - ❌ Any question about speaker's personal state
            
            QUESTION TYPES TO CREATE:
            - ✅ "What is the principle behind [concept]?"
            - ✅ "How does [process] work?"
            - ✅ "What are the characteristics of [component]?"
            - ✅ "What is the relationship between [A] and [B]?"
            - ✅ "What is the purpose of [function]?"
            - ✅ "How are [components] classified?"
            - ✅ "What are the advantages of [method]?"
            
            Generate high-quality multiple choice questions that test understanding
            of key concepts, facts, and ideas in this content.
            
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
            - Generate 10-20 questions based on content available
            - Questions must be based ONLY on transcript concepts
            - NEVER ask about speaker's personal expressions or abilities
            - Each question must have exactly 4 options
            - correctAnswerIndex is zero-based: 0=A, 1=B, 2=C, 3=D
            - All questions and options MUST be in English
            - Do NOT include markdown or text outside JSON
            - If no educational content found, return: {"questions": []}
            
            Transcript:
            """.trimIndent()
            } else {
                """
            You are an expert multilingual MCQ question generator.
            Below is a transcript from a YouTube video in another language ($detectedLang).
            
            First translate to English, then CRITICAL: FOCUS ON CONCEPTS, NOT SPEAKER PERSONALIZATION:
            - Extract ONLY key concepts, principles, facts, and technical information
            - IGNORE ALL speaker's personal expressions, inability statements, or conversational phrases
            - NEVER ask about what the speaker "can/cannot do", "feels", "thinks", or "expresses"
            - Focus on WHAT is being taught, not HOW the speaker says it
            - Convert "I can't show you" → "The process involves"
            - Convert "Now let us move to" → "The next topic is"
            - Convert "As you can see" → "The observation shows"
            - Convert "I will show you" → "The demonstration reveals"
            - Convert "What I want to explain" → "The concept involves"
            - Convert "Let me tell you" → "The information indicates"
            - Convert "In my experience" → "According to the data"
            - Convert "I believe" → "The evidence suggests"
            - Convert "We can see" → "The analysis shows"
            
            QUESTION TYPES TO AVOID:
            - ❌ "What does the speaker express/inability to do?"
            - ❌ "What does the speaker feel/think?"
            - ❌ "What does the speaker want to show?"
            - ❌ "What does the speaker believe?"
            - ❌ Any question about speaker's personal state
            
            QUESTION TYPES TO CREATE:
            - ✅ "What is the principle behind [concept]?"
            - ✅ "How does [process] work?"
            - ✅ "What are the characteristics of [component]?"
            - ✅ "What is the relationship between [A] and [B]?"
            - ✅ "What is the purpose of [function]?"
            - ✅ "How are [components] classified?"
            - ✅ "What are the advantages of [method]?"
            
            Generate high-quality multiple choice questions that test understanding
            of key concepts, facts, and ideas in this content.
            
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
            - Generate 10-20 questions based on content available
            - Questions must be based ONLY on transcript concepts
            - NEVER ask about speaker's personal expressions or abilities
            - Each question must have exactly 4 options
            - correctAnswerIndex is zero-based: 0=A, 1=B, 2=C, 3=D
            - All questions and options MUST be in English
            - Do NOT include markdown or text outside JSON
            - If no educational content found, return: {"questions": []}
            
            Transcript:
            """.trimIndent()
            }

            val result = aiProviderManager.extractQuestionsWithFallback(
                text = safeTranscript,
                source = com.shiva.magics.data.model.InputSource.YouTube,
                fileName = title.ifBlank { "YouTube Video" },
                customPrompt = youtubePrompt,
                preferredAi = prefs.getString("preferred_ai", "auto") ?: "auto"
            )

            val totalTime = System.currentTimeMillis() - jobStart

            when (result) {
                is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.Success -> {
                    android.util.Log.d("YOUTUBE_FLOW", "🎉 ${result.questions.size} questions in ${totalTime}ms from ${result.provider}")
                    if (result.questions.isEmpty()) {
                        _state.value = ProcessingState.Error("No questions found. Try a video with more educational content.")
                    } else {
                        _state.value = ProcessingState.Success(applySettings(result.questions), title.ifBlank { "YouTube Video" })
                    }
                }
                is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.AllFailed -> {
                    android.util.Log.e("YOUTUBE_FLOW", "❌ AI failed: ${result.lastError}")
                    _state.value = ProcessingState.Error(result.lastError)
                }
            }
            android.util.Log.d("YOUTUBE_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        }
    }

    fun processPrompt(userPrompt: String) {
        processingJob?.cancel()
        processingJob = viewModelScope.launch {
            _state.value = ProcessingState.Loading("Generating questions...", 0)
            val jobStart = System.currentTimeMillis()

            android.util.Log.d("PROMPT_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            android.util.Log.d("PROMPT_FLOW", "▶ processPrompt() — DIRECT PROMPT")
            android.util.Log.d("PROMPT_FLOW", "  prompt: $userPrompt")

            // Build prompt for direct user input
            val promptInput = """
            You are an expert MCQ question generator for competitive exam preparation.
            The user has provided the following topic/prompt to generate questions:
            
            USER PROMPT: $userPrompt
            
            Generate high-quality multiple choice questions based on this prompt.
            Focus on key concepts, facts, principles, and technical information related to the topic.
            
            CRITICAL: FOCUS ON CONCEPTS, NOT PERSONAL EXPRESSIONS:
            - Generate questions about concepts, principles, facts, and technical information
            - AVOID questions about personal opinions, feelings, or expressions
            - Focus on WHAT the concept is, not WHO said it or HOW they feel about it
            
            QUESTION TYPES TO CREATE:
            - ✅ "What is the principle behind [concept]?"
            - ✅ "How does [process] work?"
            - ✅ "What are the characteristics of [component]?"
            - ✅ "What is the relationship between [A] and [B]?"
            - ✅ "What is the purpose of [function]?"
            
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
            - Generate 10-20 questions based on the user's prompt
            - Each question must have exactly 4 options
            - correctAnswerIndex is zero-based: 0=A, 1=B, 2=C, 3=D
            - All questions and options MUST be in English
            - Do NOT include markdown or text outside JSON
            - If prompt is too vague, return: {"questions": []}
            """.trimIndent()

            android.util.Log.d("PROMPT_FLOW", "📤 Sending to AI: ${promptInput.length} chars")

            val result = aiProviderManager.extractQuestionsWithFallback(
                text = promptInput,
                source = com.shiva.magics.data.model.InputSource.PROMPT,
                fileName = "User Prompt",
                customPrompt = promptInput
            )

            val totalTime = System.currentTimeMillis() - jobStart

            when (result) {
                is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.Success -> {
                    android.util.Log.d("PROMPT_FLOW", "🎉 ${result.questions.size} questions in ${totalTime}ms from ${result.provider}")
                    if (result.questions.isEmpty()) {
                        _state.value = ProcessingState.Error("No questions found. Try a more specific prompt with clear topics.")
                    } else {
                        _state.value = ProcessingState.Success(applySettings(result.questions), "User Prompt")
                    }
                }
                is com.shiva.magics.data.remote.AiProviderManager.ProviderResult.AllFailed -> {
                    android.util.Log.e("PROMPT_FLOW", "❌ AI failed: ${result.lastError}")
                    _state.value = ProcessingState.Error(result.lastError)
                }
            }
            android.util.Log.d("PROMPT_FLOW", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        }
    }

    class Factory(
        private val aiProviderManager: com.shiva.magics.data.remote.AiProviderManager,
        private val youtubeBackendService: YoutubeBackendService,
        private val geminiService: GeminiService,
        private val context: android.content.Context
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return ProcessingViewModel(aiProviderManager, youtubeBackendService, geminiService, context) as T
        }
    }
}
