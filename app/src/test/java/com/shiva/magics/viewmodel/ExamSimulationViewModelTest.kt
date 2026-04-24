package com.shiva.magics.viewmodel

import com.shiva.magics.data.local.ExamIntegrityDao
import io.mockk.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ExamSimulationViewModelTest {

    private val integrityDao = mockk<ExamIntegrityDao>()
    private lateinit var viewModel: ExamSimulationViewModel
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        viewModel = ExamSimulationViewModel(integrityDao)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun testBackgroundViolation_ThresholdTrigger() = runTest {
        coEvery { integrityDao.insertIntegrityEvent(any()) } just Runs
        coEvery { integrityDao.getTimerState(any()) } returns null
        coEvery { integrityDao.saveTimerState(any()) } just Runs
        
        viewModel.startExam("EXAM_1", 3600)
        
        // Violation 1
        viewModel.recordEvent("APP_BACKGROUND")
        advanceUntilIdle()
        assertEquals(1, viewModel.violationCount.value)
        assertTrue(viewModel.isExamActive.value)

        // Violation 2
        viewModel.recordEvent("APP_BACKGROUND")
        advanceUntilIdle()
        assertEquals(2, viewModel.violationCount.value)

        // Violation 3 -> Terminate
        viewModel.recordEvent("APP_BACKGROUND")
        advanceUntilIdle()
        assertEquals(3, viewModel.violationCount.value)
        assertFalse("Exam should be auto-submitted after 3 violations", viewModel.isExamActive.value)
        
        coVerify { integrityDao.insertIntegrityEvent(match { it.eventType == "AUTO_SUBMIT_TRIGGERED" }) }
    }

    @Test
    fun testSessionSaving() = runTest {
        coEvery { integrityDao.insertIntegrityEvent(any()) } just Runs
        coEvery { integrityDao.saveSession(any()) } just Runs
        coEvery { integrityDao.getTimerState(any()) } returns null
        coEvery { integrityDao.saveTimerState(any()) } just Runs
        
        viewModel.startExam("EXAM_1", 3600)
        
        viewModel.saveSession("TEMP_1", 5, 300, "{}")
        advanceUntilIdle()
        
        coVerify { integrityDao.saveSession(match { 
            it.examId == "EXAM_1" && 
            it.currentQuestionIndex == 5 && 
            it.remainingTimeSeconds == 300 
        }) }
    }
}
