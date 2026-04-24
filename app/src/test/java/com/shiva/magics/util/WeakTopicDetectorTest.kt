package com.shiva.magics.util

import com.shiva.magics.data.local.TopicMasteryEntity
import org.junit.Assert.*
import org.junit.Test

class WeakTopicDetectorTest {

    // Test 1 — Low Mastery Detection
    @Test
    fun testLowMasteryDetection_HighRisk() {
        val mastery = TopicMasteryEntity(
            topic = "Trees",
            totalAttempts = 6,
            correctAttempts = 2, // 33%
            masteryLevel = 33.3f
        )
        
        val result = WeakTopicDetector.classifyTopic(mastery)
        
        assertNotNull(result)
        assertEquals("Trees", result?.topic)
        assertEquals(RiskLevel.CRITICAL, result?.riskLevel)
    }

    @Test
    fun testLowMasteryDetection_MediumRisk() {
        val mastery = TopicMasteryEntity(
            topic = "Hashing",
            totalAttempts = 10,
            correctAttempts = 5, // 50%
            masteryLevel = 50.0f
        )
        
        val result = WeakTopicDetector.classifyTopic(mastery)
        
        assertNotNull(result)
        assertEquals(RiskLevel.MEDIUM, result?.riskLevel)
    }

    // Test 2 — Insufficient Attempts
    @Test
    fun testInsufficientAttempts_NoDetection() {
        val mastery = TopicMasteryEntity(
            topic = "Graphs",
            totalAttempts = 2,
            correctAttempts = 0,
            masteryLevel = 0.0f
        )
        
        val result = WeakTopicDetector.classifyTopic(mastery)
        
        assertNull("Should not detect weak topic with < 5 attempts", result)
    }

    // Test 3 — Mastery Above Threshold
    @Test
    fun testHighMastery_NoDetection() {
        val mastery = TopicMasteryEntity(
            topic = "Arrays",
            totalAttempts = 10,
            correctAttempts = 9,
            masteryLevel = 90.0f
        )
        
        val result = WeakTopicDetector.classifyTopic(mastery)
        
        assertNull("Should not detect weak topic with > 60% mastery", result)
    }

    // Test 4 — Deterministic Output
    @Test
    fun testDeterministicOutput() {
        val mastery = TopicMasteryEntity(
            topic = "Stacks",
            totalAttempts = 5,
            correctAttempts = 2, // 40%
            masteryLevel = 40.0f
        )
        
        val result1 = WeakTopicDetector.classifyTopic(mastery)
        val result2 = WeakTopicDetector.classifyTopic(mastery)
        
        assertEquals(result1, result2)
        assertEquals(RiskLevel.HIGH, result1?.riskLevel) 
    }
}
