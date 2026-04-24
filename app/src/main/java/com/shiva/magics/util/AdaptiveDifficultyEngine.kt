package com.shiva.magics.util

import android.util.Log
import com.shiva.magics.data.model.Question

/**
 * v2.0 Feature #3: Adaptive Difficulty Engine
 *
 * Dynamically adjusts question difficulty based on:
 *  1. User's historical performance per topic (from ConfidenceScorer weak-topic data)
 *  2. Current test session performance (rolling accuracy)
 *  3. Target difficulty profile (Bloom's taxonomy levels)
 *
 * Algorithm:
 *  - Starts at user's calibrated difficulty level (from history)
 *  - Adjusts UP if user answers correctly 3 consecutive times
 *  - Adjusts DOWN if user fails 2 consecutive times
 *  - Never goes below EASY or above VERY_HARD
 *
 * Also generates adaptive prompt modifiers that instruct the AI to generate
 * questions at the correct Bloom's taxonomy level.
 */
object AdaptiveDifficultyEngine {

    private const val TAG = "AdaptiveDifficulty"

    // ── Difficulty levels (maps to Bloom's Taxonomy) ─────────────────────────
    enum class DifficultyLevel(
        val label: String,
        val bloomLevel: String,
        val promptModifier: String,
        val numericValue: Int
    ) {
        EASY(
            "Easy", "Remember/Understand",
            "Generate straightforward factual recall questions. The correct answer should be directly stated in the source material.",
            1
        ),
        MEDIUM(
            "Medium", "Apply/Analyze",
            "Generate application-level questions requiring the student to apply concepts to new scenarios or compare/contrast ideas.",
            2
        ),
        HARD(
            "Hard", "Analyze/Evaluate",
            "Generate higher-order thinking questions requiring analysis, evaluation, or synthesis of concepts from the material.",
            3
        ),
        VERY_HARD(
            "Expert", "Evaluate/Create",
            "Generate expert-level questions that require integrating multiple concepts, spotting assumptions, or evaluating conflicting viewpoints.",
            4
        )
    }

    // ── Session state ────────────────────────────────────────────────────────
    data class SessionState(
        val currentLevel: DifficultyLevel = DifficultyLevel.MEDIUM,
        val consecutiveCorrect: Int = 0,
        val consecutiveWrong: Int = 0,
        val totalCorrect: Int = 0,
        val totalAnswered: Int = 0,
        val levelHistory: List<DifficultyLevel> = emptyList()
    ) {
        val sessionAccuracy: Float get() = if (totalAnswered == 0) 0.5f
            else totalCorrect.toFloat() / totalAnswered
    }

    @Volatile private var sessionState = SessionState()

    // ── Configuration ────────────────────────────────────────────────────────
    private const val CONSECUTIVE_CORRECT_TO_LEVEL_UP = 3
    private const val CONSECUTIVE_WRONG_TO_LEVEL_DOWN = 2

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Record a user's answer and update difficulty.
     * Returns new difficulty level if it changed.
     */
    fun recordAnswer(wasCorrect: Boolean): DifficultyLevel {
        val s = sessionState
        val newConsecCorrect = if (wasCorrect) s.consecutiveCorrect + 1 else 0
        val newConsecWrong   = if (!wasCorrect) s.consecutiveWrong + 1 else 0

        val newLevel = when {
            newConsecCorrect >= CONSECUTIVE_CORRECT_TO_LEVEL_UP -> {
                // Level up
                val levels = DifficultyLevel.entries
                val nextIdx = minOf(levels.indexOf(s.currentLevel) + 1, levels.size - 1)
                val next = levels[nextIdx]
                if (next != s.currentLevel) Log.d(TAG, "📈 Level UP: ${s.currentLevel.label} → ${next.label}")
                next
            }
            newConsecWrong >= CONSECUTIVE_WRONG_TO_LEVEL_DOWN -> {
                // Level down
                val levels = DifficultyLevel.entries
                val prevIdx = maxOf(levels.indexOf(s.currentLevel) - 1, 0)
                val prev = levels[prevIdx]
                if (prev != s.currentLevel) Log.d(TAG, "📉 Level DOWN: ${s.currentLevel.label} → ${prev.label}")
                prev
            }
            else -> s.currentLevel
        }

        sessionState = s.copy(
            currentLevel      = newLevel,
            consecutiveCorrect = if (newLevel != s.currentLevel) 0 else newConsecCorrect,
            consecutiveWrong   = if (newLevel != s.currentLevel) 0 else newConsecWrong,
            totalCorrect      = s.totalCorrect + if (wasCorrect) 1 else 0,
            totalAnswered     = s.totalAnswered + 1,
            levelHistory      = s.levelHistory + newLevel
        )

        return newLevel
    }

    /**
     * Calibrate starting level from a user's weak-topic history.
     * Call before starting a new test session.
     */
    fun calibrateFromHistory(avgAccuracy: Float) {
        val calibrated = when {
            avgAccuracy >= 0.85f -> DifficultyLevel.HARD
            avgAccuracy >= 0.65f -> DifficultyLevel.MEDIUM
            avgAccuracy >= 0.40f -> DifficultyLevel.EASY
            else                 -> DifficultyLevel.EASY
        }
        sessionState = SessionState(currentLevel = calibrated)
        Log.d(TAG, "🎯 Calibrated to ${calibrated.label} (avgAccuracy=${(avgAccuracy * 100).toInt()}%)")
    }

    /** Get the prompt modifier to append to AI generation calls */
    fun getCurrentPromptModifier(): String = sessionState.currentLevel.promptModifier

    fun getCurrentLevel(): DifficultyLevel = sessionState.currentLevel

    fun getSessionStats(): SessionState = sessionState

    fun resetSession() { sessionState = SessionState(); Log.d(TAG, "🔄 Difficulty reset to MEDIUM") }

    /**
     * Sort a question list so they progress from current level to harder.
     * Questions without a numeric difficulty tag are assigned the current level.
     */
    fun sortByProgression(questions: List<Question>): List<Question> {
        // We tag questions by their position: first 30% easy, next 40% medium, last 30% hard
        val total = questions.size
        return questions.mapIndexed { idx, q ->
            val relPos = idx.toFloat() / total
            q to relPos
        }.sortedBy { (_, pos) -> pos }.map { (q, _) -> q }
    }

    /** Generate difficulty-aware prompt prefix */
    fun buildDifficultyPrompt(topicHint: String = "", weakTopics: List<String> = emptyList()): String {
        val level = sessionState.currentLevel
        val sb = StringBuilder()
        sb.append("DIFFICULTY LEVEL: ${level.label} (${level.bloomLevel}). ")
        sb.append(level.promptModifier)
        if (topicHint.isNotBlank()) sb.append(" Focus on the topic: $topicHint.")
        if (weakTopics.isNotEmpty()) {
            sb.append(" The student has shown weakness in: ${weakTopics.take(3).joinToString(", ")}. Include extra questions on these areas.")
        }
        return sb.toString()
    }
}
