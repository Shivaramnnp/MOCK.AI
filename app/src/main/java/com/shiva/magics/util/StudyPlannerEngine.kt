package com.shiva.magics.util

import com.shiva.magics.data.local.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

/**
 * Sprint 3 — Week 1: Study Planner Engine
 * Orchestrates study schedules by combining current mastery, risks, and forecasts.
 */
object StudyPlannerEngine {

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Generates a personalized 7-day study plan based on the student's intelligence footprint.
     */
    suspend fun generatePlan(
        masteryDao: TopicMasteryDao,
        weakTopicDao: WeakTopicDao,
        predictionDao: PerformancePredictionDao,
        dailyTimeGoalMinutes: Int = 60,
        examDate: Long? = null
    ): StudyPlan = withContext(Dispatchers.IO) {

        val masteries = masteryDao.getAllMasteryOnce()
        // We get weak topics from the DAO as Flow, but here we'll assume a suspend fetch is better.
        // I'll add a quick helper for that.
        val weakTopics = masteries.filter { it.masteryLevel < 60 && it.totalAttempts >= 5 }
            .sortedBy { it.masteryLevel }

        val sessions = mutableListOf<StudySession>()
        val startTime = System.currentTimeMillis()

        // Generate for the next 7 days
        for (dayOffset in 0 until 7) {
            val date = startTime + (dayOffset * 24 * 60 * 60 * 1000L)
            val dayTasks = mutableListOf<StudyTask>()
            
            // Prioritize topics: 60% Weak, 30% Recent/Stable Recap, 10% Trust verification
            val timeForWeak = (dailyTimeGoalMinutes * 0.6).toInt()
            val timeForRecap = (dailyTimeGoalMinutes * 0.4).toInt()

            // 1. Allocate Weak Topics (Practice/Revision)
            if (weakTopics.isNotEmpty()) {
                val topicIndex = dayOffset % weakTopics.size
                val targetTopic = weakTopics[topicIndex]
                
                dayTasks.add(
                    StudyTask(
                        topic = targetTopic.topic,
                        type = if (targetTopic.masteryLevel < 40) TaskType.REVISION else TaskType.PRACTICE,
                        durationMinutes = timeForWeak,
                        description = "Focus on ${targetTopic.topic} concepts and difficult questions.",
                        priority = if (targetTopic.masteryLevel < 40) TaskPriority.CRITICAL else TaskPriority.HIGH
                    )
                )
            }

            // 2. Allocate Recap for Stable Topics
            val stableTopics = masteries.filter { it.masteryLevel >= 60 }
            if (stableTopics.isNotEmpty()) {
                val recapTopic = stableTopics[dayOffset % stableTopics.size]
                dayTasks.add(
                    StudyTask(
                        topic = recapTopic.topic,
                        type = TaskType.RECAP,
                        durationMinutes = timeForRecap,
                        description = "Quick review of ${recapTopic.topic} to maintain mastery.",
                        priority = TaskPriority.LOW
                    )
                )
            }

            sessions.add(
                StudySession(
                    date = date,
                    totalDurationMinutes = dailyTimeGoalMinutes,
                    tasks = dayTasks
                )
            )
        }

        StudyPlan(
            id = UUID.randomUUID().toString(),
            examDate = examDate,
            dailyTimeGoalMinutes = dailyTimeGoalMinutes,
            sessions = sessions,
            overallStatus = "Adapting to your performance..."
        )
    }

    suspend fun saveAndActivatePlan(
        plan: StudyPlan,
        dao: StudyPlanDao
    ) = withContext(Dispatchers.IO) {
        val entity = StudyPlanEntity(
            id = plan.id,
            generatedAt = plan.generatedAt,
            examDate = plan.examDate,
            dailyTimeGoalMinutes = plan.dailyTimeGoalMinutes,
            planJson = json.encodeToString(plan),
            isActive = true
        )
        dao.deactivateOthers(entity.id)
        dao.insertPlan(entity)
    }
}
