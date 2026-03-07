package com.shivasruthi.magics.viewmodel

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.shivasruthi.magics.data.model.Question
import com.shivasruthi.magics.data.remote.GeminiService
import com.shivasruthi.magics.data.remote.SupadataService
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
    data object Loading : ProcessingState
    data class Success(
        val questions: List<Question>,
        val fileName: String
    ) : ProcessingState
    data class Error(val message: String) : ProcessingState
}

class ProcessingViewModel(
    private val geminiService: GeminiService,
    private val supadataService: SupadataService
) : ViewModel() {

    private val _state = MutableStateFlow<ProcessingState>(ProcessingState.Idle)
    val state: StateFlow<ProcessingState> = _state.asStateFlow()

    private var processingJob: Job? = null

    // Cycling status messages for loading UI
    val statusMessages = listOf(
        "Reading your document...",
        "Asking the AI...",
        "Extracting questions...",
        "Almost there...",
        "Preparing your test..."
    )

    fun processFile(
        context: Context,
        uri: Uri,
        mimeType: String,
        fileName: String
    ) {
        processingJob?.cancel()
        processingJob = viewModelScope.launch {
            _state.value = ProcessingState.Loading
            try {
                val bytes = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)
                        ?.use { it.readBytes() }
                        ?: throw IOException("Cannot read file: $fileName")
                }

                // If DOCX or PPTX use POI to extract text, then pass to text logic
                if (mimeType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
                    mimeType == "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
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
                    if (extractedText.isNullOrBlank()) {
                        _state.value = ProcessingState.Error("Could not extract any text from this file.")
                        return@launch
                    }
                    val safeText = if (extractedText.length > 100000) extractedText.take(100000) else extractedText
                    val result = geminiService.extractQuestionsFromText(safeText, null)
                    result.fold(
                        onSuccess = { questions ->
                            if (questions.isEmpty()) {
                                _state.value = ProcessingState.Error("No questions found in this document.")
                            } else {
                                _state.value = ProcessingState.Success(questions, fileName)
                            }
                        },
                        onFailure = { e ->
                            _state.value = ProcessingState.Error(e.message ?: "An unexpected error occurred")
                        }
                    )
                    return@launch
                }

                val result = geminiService.extractQuestions(bytes, mimeType)
                result.fold(
                    onSuccess = { questions ->
                        if (questions.isEmpty()) {
                            _state.value = ProcessingState.Error(
                                "No MCQ questions found in this document. " +
                                "Make sure it contains multiple choice questions."
                            )
                        } else {
                            _state.value = ProcessingState.Success(questions, fileName)
                        }
                    },
                    onFailure = { e ->
                        _state.value = ProcessingState.Error(
                            e.message ?: "An unexpected error occurred"
                        )
                    }
                )
            } catch (e: CancellationException) {
                _state.value = ProcessingState.Idle
            } catch (e: Exception) {
                _state.value = ProcessingState.Error(e.message ?: "Failed to process file")
            }
        }
    }

    fun generateQuestionsFromText(text: String, source: com.shivasruthi.magics.data.model.InputSource, fileName: String) {
        processingJob?.cancel()
        processingJob = viewModelScope.launch {
            _state.value = ProcessingState.Loading
            try {
                if (source == com.shivasruthi.magics.data.model.InputSource.Json) {
                    // Fast path for raw JSON
                    try {
                        val decoded = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
                            .decodeFromString<com.shivasruthi.magics.data.model.GeminiQuestionResponse>(text)
                        
                        if (decoded.questions.isEmpty()) {
                            _state.value = ProcessingState.Error("No questions found in this JSON.")
                        } else {
                            _state.value = ProcessingState.Success(decoded.questions, fileName)
                        }
                    } catch (e: Exception) {
                        _state.value = ProcessingState.Error("Invalid JSON format. Please check the structure.")
                    }
                    return@launch
                }

                // AI generation for other text
                val customPrompt = if (source == com.shivasruthi.magics.data.model.InputSource.Topic) {
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

                val result = geminiService.extractQuestionsFromText(text, customPrompt)
                result.fold(
                    onSuccess = { questions ->
                        if (questions.isEmpty()) {
                            _state.value = ProcessingState.Error("No MCQ questions could be generated from this text.")
                        } else {
                            _state.value = ProcessingState.Success(questions, fileName)
                        }
                    },
                    onFailure = { e ->
                        _state.value = ProcessingState.Error(e.message ?: "An unexpected error occurred")
                    }
                )
            } catch (e: CancellationException) {
                _state.value = ProcessingState.Idle
            } catch (e: Exception) {
                _state.value = ProcessingState.Error(e.message ?: "Failed to process text")
            }
        }
    }

    fun processWebUrl(url: String) {
        processingJob?.cancel()
        processingJob = viewModelScope.launch {
            _state.value = ProcessingState.Loading
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

                // Chunk/limit the text if it's too massive, though Gemini can handle a lot
                val safeText = if (textContent.length > 50000) textContent.take(50000) else textContent
                
                val result = geminiService.extractQuestionsFromText(safeText, null)
                result.fold(
                    onSuccess = { questions ->
                        if (questions.isEmpty()) {
                            _state.value = ProcessingState.Error("No MCQ questions could be generated from this webpage.")
                        } else {
                            _state.value = ProcessingState.Success(questions, url)
                        }
                    },
                    onFailure = { e ->
                        _state.value = ProcessingState.Error(e.message ?: "An unexpected error occurred while parsing the webpage.")
                    }
                )

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

    override fun onCleared() {
        processingJob?.cancel()
        super.onCleared()
    }

    fun processYouTubeUrl(url: String) {
        processingJob?.cancel()
        processingJob = viewModelScope.launch {
            _state.value = ProcessingState.Loading
            
            // 1. Fetch transcript from Supadata
            val transcriptResult = supadataService.getYouTubeTranscript(url)
            val transcriptText = transcriptResult.getOrElse { e ->
                _state.value = ProcessingState.Error("Failed to fetch YouTube transcript: ${e.message}")
                return@launch
            }

            // 2. Pass transcript to Gemini
            val safeText = if (transcriptText.length > 50000) transcriptText.take(50000) else transcriptText
            val result = geminiService.extractQuestionsFromText(safeText, null)
            
            result.fold(
                onSuccess = { questions ->
                    if (questions.isEmpty()) {
                        _state.value = ProcessingState.Error("No MCQ questions could be generated from this video.")
                    } else {
                        _state.value = ProcessingState.Success(questions, "YouTube Video")
                    }
                },
                onFailure = { e ->
                    _state.value = ProcessingState.Error(e.message ?: "An unexpected error occurred parsing video.")
                }
            )
        }
    }

    class Factory(
        private val geminiService: GeminiService,
        private val supadataService: SupadataService
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return ProcessingViewModel(geminiService, supadataService) as T
        }
    }
}
