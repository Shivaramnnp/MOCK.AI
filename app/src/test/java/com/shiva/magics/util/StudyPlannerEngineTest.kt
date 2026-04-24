package com.shiva.magics.util

import com.shiva.magics.data.local.*
import io.mockk.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class StudyPlannerEngineTest {

    private val masteryDao = mockk<TopicMasteryDao>()
    private val weakTopicDao = mockk<WeakTopicDao>()
    private val predictionDao = mockk<PerformancePredictionDao>()

    @Test
    fun testPlanGeneration_AllocationLogic() = runBlocking {
        // Setup: 1 weak topic, 1 stable topic
        val masteries = listOf(
            TopicMasteryEntity(topic = "Recursion", totalAttempts = 10, correctAttempts = 3, masteryLevel = 30f),
            TopicMasteryEntity(topic = "Strings", totalAttempts = 10, correctAttempts = 8, masteryLevel = 80f)
        )
        
        coEvery { masteryDao.getAllMasteryOnce() } returns masteries
        
        val plan = StudyPlannerEngine.generatePlan(
            masteryDao = masteryDao,
            weakTopicDao = weakTopicDao,
            predictionDao = predictionDao,
            dailyTimeGoalMinutes = 60
        )
        
        assertNotNull(plan)
        assertEquals(7, plan.sessions.size)
        
        // Day 1 tasks check
        val firstSession = plan.sessions[0]
        assertEquals(2, firstSession.tasks.size)
        
        // Weak topic should be Critical Revision (30% mastery)
        val task1 = firstSession.tasks.first { it.topic == "Recursion" }
        assertEquals(TaskType.REVISION, task1.type)
        assertEquals(36, task1.durationMinutes) // 60 * 0.6
        assertEquals(TaskPriority.CRITICAL, task1.priority)
        
        // Stable topic should be Recap
        val task2 = firstSession.tasks.first { it.topic == "Strings" }
        assertEquals(TaskType.RECAP, task2.type)
        assertEquals(24, task2.durationMinutes) // 60 * 0.4
    }

    @Test
    fun testPlanGeneration_EmptyData() = runBlocking {
        coEvery { masteryDao.getAllMasteryOnce() } returns emptyList()
        
        val plan = StudyPlannerEngine.generatePlan(
            masteryDao = masteryDao,
            weakTopicDao = weakTopicDao,
            predictionDao = predictionDao
        )
        
        assertNotNull(plan)
        assertTrue(plan.sessions.all { it.tasks.isEmpty() })
    }
}
