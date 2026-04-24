package com.shiva.magics.util

import com.shiva.magics.data.local.*
import io.mockk.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class RevisionSchedulerTest {

    private val masteryDao = mockk<TopicMasteryDao>()
    private val queueDao = mockk<RevisionQueueDao>()

    // Test 1 — Low Mastery Scheduling
    @Test
    fun testLowMasteryScheduling_Interval1Day() = runBlocking {
        coEvery { masteryDao.getAllMasteryOnce() } returns listOf(
            TopicMasteryEntity(topic = "Trees", masteryLevel = 35f, totalAttempts = 5)
        )
        coEvery { queueDao.clearHistory() } just Runs
        val items = mutableListOf<RevisionQueueEntity>()
        coEvery { queueDao.upsertReview(capture(items)) } just Runs
        
        RevisionScheduler.syncQueue(masteryDao, queueDao)
        
        assertEquals(1, items.first().intervalDays)
    }

    // Test 2 — High Mastery Scheduling
    @Test
    fun testHighMasteryScheduling_Interval14Days() = runBlocking {
        coEvery { masteryDao.getAllMasteryOnce() } returns listOf(
            TopicMasteryEntity(topic = "Arrays", masteryLevel = 85f, totalAttempts = 5)
        )
        coEvery { queueDao.clearHistory() } just Runs
        val items = mutableListOf<RevisionQueueEntity>()
        coEvery { queueDao.upsertReview(capture(items)) } just Runs
        
        RevisionScheduler.syncQueue(masteryDao, queueDao)
        
        assertEquals(14, items.first().intervalDays)
    }

    // Test 3 — Retention Calculation
    @Test
    fun testRetentionCalculation() = runBlocking {
        // daysSinceLastReview = 3, mastery = 60 (0.6)
        // SF = 0.6 * 10 = 6
        // Retention = e^(-3 / 6) = e^(-0.5) approx 0.606
        
        coEvery { masteryDao.getAllMasteryOnce() } returns listOf(
            TopicMasteryEntity(
                topic = "Stacks", 
                masteryLevel = 60f, 
                lastAttemptAt = System.currentTimeMillis() - (3 * 24 * 60 * 60 * 1000L)
            )
        )
        coEvery { queueDao.clearHistory() } just Runs
        val items = mutableListOf<RevisionQueueEntity>()
        coEvery { queueDao.upsertReview(capture(items)) } just Runs
        
        RevisionScheduler.syncQueue(masteryDao, queueDao)
        
        val retention = items.first().retentionProbability
        assertTrue("Retention probability should be > 0 and < 1", retention > 0f && retention < 1f)
        assertEquals(0.606f, retention, 0.01f)
    }

    // Test 4 — Queue Limit Enforcement
    @Test
    fun testQueueLimitEnforcement() = runBlocking {
        val manyTopics = (1..15).map { i ->
            TopicMasteryEntity(topic = "Topic $i", masteryLevel = 50f)
        }
        coEvery { masteryDao.getAllMasteryOnce() } returns manyTopics
        coEvery { queueDao.clearHistory() } just Runs
        val items = mutableListOf<RevisionQueueEntity>()
        coEvery { queueDao.upsertReview(capture(items)) } just Runs
        
        RevisionScheduler.syncQueue(masteryDao, queueDao)
        
        assertEquals(10, items.size)
    }
}
