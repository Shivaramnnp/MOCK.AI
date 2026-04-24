package com.shiva.magics.util

import com.shiva.magics.data.local.ExamIntegrityDao
import com.shiva.magics.data.local.ExamTimerStateEntity
import io.mockk.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ExamTimerControllerTest {

    private val dao = mockk<ExamIntegrityDao>()
    private val testScope = TestScope()
    
    private class TestTimeProvider : TimeProvider {
        var currentMillis = 1000000L
        var elapsedReal = 1000000L
        
        override fun currentTimeMillis() = currentMillis
        override fun elapsedRealtime() = elapsedReal
        
        fun advance(seconds: Int) {
            currentMillis += seconds * 1000L
            elapsedReal += seconds * 1000L
        }
    }

    private val timeProvider = TestTimeProvider()

    @Before
    fun setup() {
        coEvery { dao.saveTimerState(any()) } just Runs
        coEvery { dao.getTimerState(any()) } returns null
    }

    @Test
    fun testCountdownAccuracy_10Seconds() = testScope.runTest {
        val controller = ExamTimerController("EXAM_1", dao, this, timeProvider)
        controller.startTimer(10)
        
        // Initial check
        runCurrent()
        assertEquals(10, controller.remainingSeconds.value)
        
        // Advance in 1-second steps
        repeat(5) {
            timeProvider.advance(1)
            advanceTimeBy(1000)
            runCurrent()
        }
        
        assertEquals(5, controller.remainingSeconds.value)
        controller.stop()
    }

    @Test
    fun testCrashRecovery_CalculatesElapsedTime() = testScope.runTest {
        val controller = ExamTimerController("EXAM_1", dao, this, timeProvider)
        
        // Mock a state saved 30 seconds before "now"
        val lastSaveTime = timeProvider.currentMillis - 30000
        coEvery { dao.getTimerState("EXAM_1") } returns ExamTimerStateEntity("EXAM_1", 1800, lastSaveTime)

        controller.startTimer(1800)
        runCurrent()
        
        // It should recover at 1800 - 30 = 1770
        assertEquals(1770, controller.remainingSeconds.value)
        controller.stop()
    }
}
