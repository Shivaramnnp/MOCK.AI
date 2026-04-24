package com.shiva.magics.util

import com.shiva.magics.data.local.*
import io.mockk.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.util.Calendar

class DailyTaskGeneratorTest {

    private val masteryDao = mockk<TopicMasteryDao>()
    private val queueDao = mockk<RevisionQueueDao>()
    private val planDao = mockk<StudyPlanDao>()
    private val taskDao = mockk<DailyTaskDao>()

    @Test
    fun testTaskGeneration_RevisionCreation() = runBlocking {
        // Setup mocks
        coEvery { planDao.getActivePlanOnce() } returns StudyPlanEntity("P1", 0, null, 60, "", true)
        coEvery { queueDao.getPendingReviews(any()) } returns listOf(
            RevisionQueueEntity("Trees", 0, 1, 0.5f)
        )
        coEvery { masteryDao.getAllMasteryOnce() } returns emptyList()
        coEvery { taskDao.insertTask(any()) } just Runs

        DailyTaskGenerator.generateAndSync(masteryDao, queueDao, planDao, taskDao)
        
        // Matcher for REVISION task
        val taskSlot = slot<DailyTaskEntity>()
        coVerify { taskDao.insertTask(capture(taskSlot)) }
        assertEquals("REVISION", taskSlot.captured.taskType)
        assertEquals("Trees", taskSlot.captured.topic)
    }

    @Test
    fun testTaskGeneration_WeakTopicPractice() = runBlocking {
        coEvery { planDao.getActivePlanOnce() } returns StudyPlanEntity("P1", 0, null, 60, "", true)
        coEvery { queueDao.getPendingReviews(any()) } returns emptyList()
        coEvery { masteryDao.getAllMasteryOnce() } returns listOf(
            TopicMasteryEntity(topic = "Hashing", masteryLevel = 30f)
        )
        coEvery { taskDao.insertTask(any()) } just Runs

        DailyTaskGenerator.generateAndSync(masteryDao, queueDao, planDao, taskDao)
        
        val taskSlot = slot<DailyTaskEntity>()
        coVerify { taskDao.insertTask(capture(taskSlot)) }
        assertEquals("PRACTICE", taskSlot.captured.taskType)
        assertEquals("HIGH", taskSlot.captured.priority)
    }

    @Test
    fun testTaskGeneration_LimitEnforcement() = runBlocking {
        coEvery { planDao.getActivePlanOnce() } returns StudyPlanEntity("P1", 0, null, 60, "", true)
        // 10 pending reviews
        val manyReviews = (1..10).map { i -> RevisionQueueEntity("T$i", 0, 1, 0.5f) }
        coEvery { queueDao.getPendingReviews(any()) } returns manyReviews
        coEvery { masteryDao.getAllMasteryOnce() } returns emptyList()
        
        val capturedTasks = mutableListOf<DailyTaskEntity>()
        coEvery { taskDao.insertTask(capture(capturedTasks)) } just Runs

        DailyTaskGenerator.generateAndSync(masteryDao, queueDao, planDao, taskDao)
        
        // Should be limited to 6
        assertEquals(6, capturedTasks.size)
    }
}
