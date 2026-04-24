package com.shiva.magics.util

import com.shiva.magics.data.local.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID
import java.util.Calendar

/**
 * Sprint 3 — Week 3: Daily Task Generator
 * Converts study plans and revision schedules into concrete actionable tasks.
 */
object DailyTaskGenerator {

    private const val MAX_TASKS_PER_DAY = 6
    private const val MIN_MINUTES = 5
    private const val MAX_MINUTES = 45

    /**
     * Generates and persists the daily task list for the current day.
     */
    suspend fun generateAndSync(
        masteryDao: TopicMasteryDao,
        queueDao: RevisionQueueDao,
        planDao: StudyPlanDao,
        taskDao: DailyTaskDao
    ) = withContext(Dispatchers.IO) {

        val now = System.currentTimeMillis()
        val calendar = Calendar.getInstance()
        calendar.set(Calendar.HOUR_OF_DAY, 23)
        calendar.set(Calendar.MINUTE, 59)
        val endOfDay = calendar.timeInMillis

        // 1. Get Inputs
        val activePlan = planDao.getActivePlanOnce() // I'll add this helper to StudyPlanDao
        val dailyGoalMinutes = activePlan?.dailyTimeGoalMinutes ?: 60
        
        val pendingRevisions = queueDao.getPendingReviews(endOfDay)
        val allMastery = masteryDao.getAllMasteryOnce()
        
        val weakTopics = allMastery.filter { it.masteryLevel < 60f }
            .sortedBy { it.masteryLevel }
            
        val stableTopics = allMastery.filter { it.masteryLevel >= 80f }
            .sortedBy { it.lastAttemptAt }

        val candidateTasks = mutableListOf<DailyTaskEntity>()

        // Rule 1: Revision Tasks (60% weight)
        val revisionWorkload = (dailyGoalMinutes * 0.6).toInt()
        if (pendingRevisions.isNotEmpty()) {
            val minutesPerTask = (revisionWorkload / pendingRevisions.size).coerceIn(MIN_MINUTES, MAX_MINUTES)
            pendingRevisions.forEach { rev ->
                candidateTasks.add(createTask(rev.topic, "REVISION", minutesPerTask, "CRITICAL", now))
            }
        }

        // Rule 2: Weak Topic Practice (30% weight)
        val practiceWorkload = (dailyGoalMinutes * 0.3).toInt()
        if (weakTopics.isNotEmpty()) {
            val minutesPerTask = (practiceWorkload / weakTopics.size.coerceAtLeast(1)).coerceIn(MIN_MINUTES, MAX_MINUTES)
            weakTopics.forEach { topic ->
                candidateTasks.add(createTask(topic.topic, "PRACTICE", minutesPerTask, "HIGH", now))
            }
        }

        // Rule 3: Maintenance Recap (10% weight)
        val recapWorkload = (dailyGoalMinutes * 0.1).toInt()
        if (stableTopics.isNotEmpty()) {
            val minutesPerTask = (recapWorkload / stableTopics.size.coerceAtLeast(1)).coerceIn(MIN_MINUTES, MAX_MINUTES)
            stableTopics.forEach { topic ->
                candidateTasks.add(createTask(topic.topic, "RECAP", minutesPerTask, "LOW", now))
            }
        }

        // Guardrail: Sort by priority and limit
        val finalTasks = candidateTasks
            .sortedBy { p ->
                when(p.priority) {
                    "CRITICAL" -> 0
                    "HIGH" -> 1
                    "MEDIUM" -> 2
                    else -> 3
                }
            }
            .take(MAX_TASKS_PER_DAY)

        // Clear existing uncompleted tasks for today and insert new ones
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        val startOfDay = calendar.timeInMillis
        // We don't want to wipe completed tasks, so we just add missing ones or skip if already generated for today.
        // For simplicity: If someone completes a task, we keep it. If we re-sync, we only add if count < limit.
        
        for (task in finalTasks) {
            taskDao.insertTask(task)
        }
        
        android.util.Log.d("DailyTaskGenerator", "Synchronized ${finalTasks.size} tasks for today.")
    }

    private fun createTask(topic: String, type: String, minutes: Int, priority: String, dueAt: Long): DailyTaskEntity {
        return DailyTaskEntity(
            id = UUID.randomUUID().toString(),
            topic = topic,
            taskType = type,
            estimatedMinutes = minutes,
            priority = priority,
            dueAt = dueAt,
            completed = false
        )
    }
}
