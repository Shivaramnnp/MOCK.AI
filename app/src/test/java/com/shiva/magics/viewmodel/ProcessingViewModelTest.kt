package com.shiva.magics.viewmodel

import app.cash.turbine.test
import com.shiva.magics.data.model.InputSource
import com.shiva.magics.data.model.Question
import com.shiva.magics.data.remote.AiProviderManager
import com.shiva.magics.data.remote.GeminiService
import com.shiva.magics.data.remote.YoutubeBackendService
import io.mockk.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for ProcessingViewModel state machine.
 *
 * Coverage:
 *  - Idle → Loading → Success (text / JSON paths)
 *  - Idle → Loading → Error (all-providers-failed)
 *  - Cancellation → Idle
 *  - Retry re-runs last input (no duplicate)
 *  - Empty result produces Error, not Success
 *  - Invalid YouTube URL produces Error without network call
 *  - Invalid JSON input produces Error
 *  - cancel() always returns to Idle
 *  - reset() always returns to Idle
 *  - onCleared() cancels processing job
 *  - Second call cancels first (no duplicate processing)
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ProcessingViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    // ── Mocks ──────────────────────────────────────────────────────────────────
    private lateinit var aiProviderManager: AiProviderManager
    private lateinit var youtubeBackendService: YoutubeBackendService
    private lateinit var geminiService: GeminiService
    private lateinit var context: android.content.Context
    private lateinit var prefs: android.content.SharedPreferences

    private lateinit var viewModel: ProcessingViewModel

    // ── Sample data ───────────────────────────────────────────────────────────
    private val sampleQuestions = listOf(
        Question(questionText = "What is photosynthesis?", options = listOf("A", "B", "C", "D"), correctAnswerIndex = 0),
        Question(questionText = "Define mitosis.", options = listOf("A", "B", "C", "D"), correctAnswerIndex = 1)
    )

    private val successResult = AiProviderManager.ProviderResult.Success(sampleQuestions, "gemini_flash")
    private val emptyResult   = AiProviderManager.ProviderResult.Success(emptyList(), "gemini_flash")
    private val failResult    = AiProviderManager.ProviderResult.AllFailed("503 All providers exhausted")

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)

        aiProviderManager    = mockk(relaxed = true)
        youtubeBackendService = mockk(relaxed = true)
        geminiService        = mockk(relaxed = true)
        context              = mockk(relaxed = true)
        prefs                = mockk(relaxed = true)

        // Default prefs behavior
        every { context.getSharedPreferences(any(), any()) } returns prefs
        every { prefs.getBoolean("shuffle_questions", false) } returns false
        every { prefs.getInt("questions_per_test", 0) } returns 0
        every { prefs.getString("preferred_ai", "auto") } returns "auto"

        viewModel = ProcessingViewModel(aiProviderManager, youtubeBackendService, geminiService, context)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // ── 1. Initial State ──────────────────────────────────────────────────────

    @Test
    fun `initial state is Idle`() {
        assertEquals(ProcessingState.Idle, viewModel.state.value)
    }

    // ── 2. Text Processing — Success Path ─────────────────────────────────────

    @Test
    fun `generateQuestionsFromText emits Loading then Success`() = runTest {
        coEvery {
            aiProviderManager.extractQuestionsWithFallback(
                text = any(), source = any(), fileName = any(),
                customPrompt = any(), preferredAi = any()
            )
        } returns successResult

        viewModel.state.test {
            assertEquals(ProcessingState.Idle, awaitItem())

            viewModel.generateQuestionsFromText("Biology notes", InputSource.Manual, "notes.txt")
            advanceUntilIdle()

            val loading = awaitItem()
            assertTrue("Expected Loading, got $loading", loading is ProcessingState.Loading)

            val success = awaitItem()
            assertTrue("Expected Success, got $success", success is ProcessingState.Success)
            assertEquals(2, (success as ProcessingState.Success).questions.size)
            assertEquals("notes.txt", success.fileName)
        }
    }

    @Test
    fun `generateQuestionsFromText with empty result emits Error`() = runTest {
        coEvery {
            aiProviderManager.extractQuestionsWithFallback(any(), any(), any(), any(), any())
        } returns emptyResult

        viewModel.generateQuestionsFromText("sparse content", InputSource.Manual, "test.txt")
        advanceUntilIdle()

        assertTrue(viewModel.state.value is ProcessingState.Error)
    }

    @Test
    fun `generateQuestionsFromText with AllFailed emits Error`() = runTest {
        coEvery {
            aiProviderManager.extractQuestionsWithFallback(any(), any(), any(), any(), any())
        } returns failResult

        viewModel.generateQuestionsFromText("some text", InputSource.Manual, "test.txt")
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue("Expected Error, got $state", state is ProcessingState.Error)
        assertTrue((state as ProcessingState.Error).message.contains("503"))
    }

    // ── 3. JSON Fast Path ──────────────────────────────────────────────────────

    @Test
    fun `generateQuestionsFromText with valid JSON skips AI call`() = runTest {
        val json = """{"questions":[{"questionText":"Q1","options":["A","B","C","D"],"correctAnswerIndex":0}]}"""

        viewModel.generateQuestionsFromText(json, InputSource.Json, "shared.json")
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue("Expected Success for valid JSON, got $state", state is ProcessingState.Success)
        // Verify AI was NOT called
        coVerify(exactly = 0) { aiProviderManager.extractQuestionsWithFallback(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `generateQuestionsFromText with invalid JSON emits Error without AI call`() = runTest {
        viewModel.generateQuestionsFromText("{broken json", InputSource.Json, "bad.json")
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue("Expected Error for invalid JSON, got $state", state is ProcessingState.Error)
        coVerify(exactly = 0) { aiProviderManager.extractQuestionsWithFallback(any(), any(), any(), any(), any()) }
    }

    // ── 4. Cancellation ──────────────────────────────────────────────────────

    @Test
    fun `cancel() sets state to Idle`() = runTest {
        coEvery {
            aiProviderManager.extractQuestionsWithFallback(any(), any(), any(), any(), any())
        } coAnswers {
            kotlinx.coroutines.delay(5_000) // simulate slow AI
            successResult
        }

        viewModel.generateQuestionsFromText("long text", InputSource.Manual, "file.txt")
        advanceTimeBy(100)

        viewModel.cancel()
        advanceUntilIdle()

        assertEquals(ProcessingState.Idle, viewModel.state.value)
    }

    @Test
    fun `reset() sets state to Idle from any state`() = runTest {
        coEvery {
            aiProviderManager.extractQuestionsWithFallback(any(), any(), any(), any(), any())
        } returns failResult

        viewModel.generateQuestionsFromText("text", InputSource.Manual, "f.txt")
        advanceUntilIdle()

        assertTrue(viewModel.state.value is ProcessingState.Error)

        viewModel.reset()
        assertEquals(ProcessingState.Idle, viewModel.state.value)
    }

    // ── 5. Retry Logic ────────────────────────────────────────────────────────

    @Test
    fun `retry() re-runs last text input exactly once`() = runTest {
        coEvery {
            aiProviderManager.extractQuestionsWithFallback(any(), any(), any(), any(), any())
        } returnsMany listOf(failResult, successResult)

        viewModel.generateQuestionsFromText("bio text", InputSource.Manual, "bio.txt")
        advanceUntilIdle()

        assertTrue(viewModel.state.value is ProcessingState.Error)

        viewModel.retry()
        advanceUntilIdle()

        assertTrue("Retry should succeed, got ${viewModel.state.value}", viewModel.state.value is ProcessingState.Success)
        coVerify(exactly = 2) { aiProviderManager.extractQuestionsWithFallback(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `retry() with no previous input sets state to Idle`() = runTest {
        viewModel.retry()
        advanceUntilIdle()
        assertEquals(ProcessingState.Idle, viewModel.state.value)
    }

    // ── 6. Second call cancels first (no duplicate processing) ────────────────

    @Test
    fun `second generateQuestionsFromText cancels first job`() = runTest {
        var firstCallCount = 0
        coEvery {
            aiProviderManager.extractQuestionsWithFallback(any(), any(), any(), any(), any())
        } coAnswers {
            firstCallCount++
            if (firstCallCount == 1) kotlinx.coroutines.delay(5_000) // first call is slow
            successResult
        }

        viewModel.generateQuestionsFromText("first text", InputSource.Manual, "first.txt")
        advanceTimeBy(100)

        // Second call — should cancel the first
        viewModel.generateQuestionsFromText("second text", InputSource.Manual, "second.txt")
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue("Second call should produce Success, got $state", state is ProcessingState.Success)
        // The second call's fileName should be the final state
        assertEquals("second.txt", (state as ProcessingState.Success).fileName)
    }

    // ── 7. YouTube URL Validation ─────────────────────────────────────────────

    @Test
    fun `invalid YouTube URL emits Error without network call`() = runTest {
        viewModel.processYouTubeUrl("https://vimeo.com/12345")
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue("Expected Error for invalid YouTube URL, got $state", state is ProcessingState.Error)
        coVerify(exactly = 0) { youtubeBackendService.getTranscript(any()) }
    }

    @Test
    fun `valid YouTube URL calls transcript service`() = runTest {
        coEvery { youtubeBackendService.getTranscript(any()) } returns
            Result.failure(Exception("Network error"))

        viewModel.processYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        advanceUntilIdle()

        coVerify(exactly = 1) { youtubeBackendService.getTranscript(any()) }
        assertTrue(viewModel.state.value is ProcessingState.Error)
    }

    // ── 8. FileBytes Processing ───────────────────────────────────────────────

    @Test
    fun `processFileBytes success emits Success state`() = runTest {
        coEvery {
            aiProviderManager.extractQuestionsWithFallback(
                text = any(), imageData = any(), mimeType = any(),
                source = any(), fileName = any(),
                customPrompt = any(), preferredAi = any()
            )
        } returns successResult

        viewModel.processFileBytes("fake pdf content".toByteArray(), "application/pdf", "test.pdf")
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue("Expected Success, got $state", state is ProcessingState.Success)
        assertEquals("test.pdf", (state as ProcessingState.Success).fileName)
    }

    @Test
    fun `processFileBytes AllFailed emits Error`() = runTest {
        coEvery {
            aiProviderManager.extractQuestionsWithFallback(
                text = any(), imageData = any(), mimeType = any(),
                source = any(), fileName = any(),
                customPrompt = any(), preferredAi = any()
            )
        } returns failResult

        viewModel.processFileBytes(ByteArray(10), "image/jpeg", "photo.jpg")
        advanceUntilIdle()

        assertTrue(viewModel.state.value is ProcessingState.Error)
    }

    // ── 9. State Transition Completeness ──────────────────────────────────────

    @Test
    fun `state transitions through Idle Loading Success in order`() = runTest {
        coEvery {
            aiProviderManager.extractQuestionsWithFallback(any(), any(), any(), any(), any())
        } returns successResult

        val states = mutableListOf<ProcessingState>()

        viewModel.state.test {
            states.add(awaitItem()) // Idle

            viewModel.generateQuestionsFromText("text", InputSource.Manual, "f.txt")
            advanceUntilIdle()

            states.add(awaitItem()) // Loading
            states.add(awaitItem()) // Success
            cancelAndIgnoreRemainingEvents()
        }

        assertEquals(3, states.size)
        assertTrue(states[0] is ProcessingState.Idle)
        assertTrue(states[1] is ProcessingState.Loading)
        assertTrue(states[2] is ProcessingState.Success)
    }

    @Test
    fun `state transitions through Idle Loading Error in order`() = runTest {
        coEvery {
            aiProviderManager.extractQuestionsWithFallback(any(), any(), any(), any(), any())
        } returns failResult

        val states = mutableListOf<ProcessingState>()

        viewModel.state.test {
            states.add(awaitItem()) // Idle

            viewModel.generateQuestionsFromText("text", InputSource.Manual, "f.txt")
            advanceUntilIdle()

            states.add(awaitItem()) // Loading
            states.add(awaitItem()) // Error
            cancelAndIgnoreRemainingEvents()
        }

        assertEquals(3, states.size)
        assertTrue(states[0] is ProcessingState.Idle)
        assertTrue(states[1] is ProcessingState.Loading)
        assertTrue(states[2] is ProcessingState.Error)
    }
}
