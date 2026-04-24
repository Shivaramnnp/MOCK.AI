package com.shiva.magics.util

import com.shiva.magics.data.model.ExamAttempt
import com.shiva.magics.data.model.ReadinessStatus
import org.junit.Assert.*
import org.junit.Test

class ExamAnalyticsEngineTest {

    @Test
    fun testScoreCalculation() {
        val attempt = ExamAttempt(
            id = "1",
            templateId = "test_template",
            startedAt = 0,
            correctCount = 40,
            totalQuestions = 50
        )
        val analytics = ExamAnalyticsEngine.generateAnalytics(attempt)
        
        assertEquals(80f, analytics.score)
        assertEquals(ReadinessStatus.READY.name, analytics.readinessStatus)
    }

    @Test
    fun testTimeEfficiency() {
        val attempt = ExamAttempt(
            id = "1",
            templateId = "test_template",
            startedAt = 0,
            timeSpentSeconds = 3000,
            questionsAttempted = 50
        )
        val analytics = ExamAnalyticsEngine.generateAnalytics(attempt)
        
        assertEquals(60f, analytics.averageTimePerQuestion)
        assertEquals("OPTIMAL", ExamAnalyticsEngine.classifyEfficiency(analytics.averageTimePerQuestion))
    }

    @Test
    fun testStressIndex() {
        // (70 * 0.6) + (50 * 0.4) = 42 + 20 = 62
        val attempt = ExamAttempt(
            id = "1",
            templateId = "test_template",
            startedAt = 0,
            timePressureScore = 70,
            errorRateScore = 50
        )
        val analytics = ExamAnalyticsEngine.generateAnalytics(attempt)
        
        assertEquals(62f, analytics.stressIndex)
    }

    @Test
    fun testReadinessMapping() {
        val nearReady = ExamAttempt(
            id = "1",
            templateId = "test_template",
            startedAt = 0,
            correctCount = 34,
            totalQuestions = 50
        ) // 68%
        val analytics = ExamAnalyticsEngine.generateAnalytics(nearReady)
        
        assertEquals(ReadinessStatus.NEAR_READY.name, analytics.readinessStatus)
    }
}
