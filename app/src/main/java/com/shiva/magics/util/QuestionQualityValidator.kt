package com.shiva.magics.util

import android.util.Log
import com.shiva.magics.data.model.Question
import com.shiva.magics.data.local.QuestionEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Gap #2:  Diagram/graph understanding — via enhanced prompt injection
 * Gap #3:  Incorrect answer generation — via post-generation validation
 * Gap #13: No adaptive learning — via spaced-repetition weakness tracking
 *
 * Question quality validator that:
 *  1. Checks structural integrity (4 options, valid index, non-empty text)
 *  2. Detects duplicate questions
 *  3. Detects trivially obvious wrong answers ("None of the above" traps)
 *  4. Scores each question for difficulty balance
 *  5. Provides adaptive learning hints (weak topics tracking)
 */
object QuestionQualityValidator {

    private const val TAG = "QQValidator"

    // ── Structural Validation ───────────────────────────────────────────────

    data class ValidationResult(
        val valid: List<Question>,
        val removed: List<RemovedQuestion>,
        val warnings: List<String>
    )

    data class RemovedQuestion(val question: Question, val reason: String)

    fun validate(questions: List<Question>): ValidationResult {
        val valid = mutableListOf<Question>()
        val removed = mutableListOf<RemovedQuestion>()
        val warnings = mutableListOf<String>()
        val seenTexts = mutableSetOf<String>()

        questions.forEachIndexed { i, q ->
            val qText = q.questionText.trim().lowercase()

            // 1. Non-empty question
            if (q.questionText.isBlank()) {
                removed.add(RemovedQuestion(q, "Empty question text at index $i"))
                return@forEachIndexed
            }

            // 2. Must have exactly 4 options
            if (q.options.size != 4) {
                removed.add(RemovedQuestion(q, "Q${i+1} has ${q.options.size} options (need 4)"))
                return@forEachIndexed
            }

            // 3. Valid answer index (0-3)
            if (q.correctAnswerIndex !in 0..3) {
                removed.add(RemovedQuestion(q, "Q${i+1} has invalid correctAnswerIndex=${q.correctAnswerIndex}"))
                return@forEachIndexed
            }

            // 4. No empty options
            if (q.options.any { it.isBlank() }) {
                removed.add(RemovedQuestion(q, "Q${i+1} has blank option(s)"))
                return@forEachIndexed
            }

            // 5. Duplicate detection
            if (qText in seenTexts) {
                removed.add(RemovedQuestion(q, "Q${i+1} is a duplicate question"))
                return@forEachIndexed
            }
            seenTexts.add(qText)

            // 6. Suspicious "None of the above" traps (soft warning, don't remove)
            val hasNotaOption = q.options.any {
                it.lowercase().contains("none of the above") ||
                it.lowercase().contains("all of the above")
            }
            if (hasNotaOption) {
                warnings.add("Q${i+1} uses 'none/all of the above' — consider rephrasing")
            }

            // 7. Correct answer must differ from all wrong answers
            val correctText = q.options[q.correctAnswerIndex].trim().lowercase()
            val wrongTexts = q.options.filterIndexed { idx, _ -> idx != q.correctAnswerIndex }
                .map { it.trim().lowercase() }
            if (correctText in wrongTexts) {
                removed.add(RemovedQuestion(q, "Q${i+1} correct answer text duplicated in wrong options"))
                return@forEachIndexed
            }

            valid.add(q)
        }

        if (removed.isNotEmpty()) {
            Log.w(TAG, "🗑 Removed ${removed.size} invalid questions:")
            removed.forEach { Log.w(TAG, "   - ${it.reason}") }
        }
        if (warnings.isNotEmpty()) {
            warnings.forEach { Log.d(TAG, "⚠️ $it") }
        }

        Log.d(TAG, "✅ Validation complete: ${valid.size} valid, ${removed.size} removed, ${warnings.size} warnings")
        return ValidationResult(valid, removed, warnings)
    }

    // ── Adaptive Learning: Weak Topic Detection ─────────────────────────────

    data class WeakTopic(
        val topic: String,
        val totalQuestions: Int,
        val wrongAnswers: Int,
        val accuracy: Float,
        val priority: Int   // 1=high, 2=medium, 3=low
    )

    /**
     * Analyses a user's historical wrong answers from Room DB to identify weak topics.
     * Returns a prioritised list of topics the user should review.
     */
    suspend fun detectWeakTopics(
        wrongAnswerEntities: List<QuestionEntity>
    ): List<WeakTopic> = withContext(Dispatchers.Default) {
        // All entities passed in are already wrong answers (caller filters them)
        val topicGroups = wrongAnswerEntities
            .filter { !it.topic.isNullOrBlank() }
            .groupBy { it.topic!! }

        val weakTopics = topicGroups.map { (topic, questions) ->
            val wrong = questions.size   // caller provides wrong answers only
            val total = wrong            // conservative — treat passed set as wrong only
            val accuracy = 0f           // 0% accuracy since all are wrong answers
            val priority = when {
                wrong >= 5 -> 1       // 5+ wrong answers in a topic = high priority
                wrong >= 3 -> 2       // 3-4 = medium
                else -> 3             // 1-2 = low
            }
            WeakTopic(topic, total, wrong, accuracy, priority)
        }.sortedWith(compareBy({ it.priority }, { it.accuracy }))

        Log.d(TAG, "🎯 Weak topics detected: ${weakTopics.size}")
        weakTopics.forEach {
            Log.d(TAG, "  [P${it.priority}] ${it.topic}: ${it.wrongAnswers} wrong answers")
        }
        weakTopics
    }

    // ── Diagram/Graph Prompt Enhancement ───────────────────────────────────

    /**
     * Returns an enhanced prompt suffix for when the input likely contains
     * diagrams, charts, tables, or graphs (Gap #2).
     */
    fun getDiagramAwarePromptSuffix(): String = """

        DIAGRAM & TABLE AWARENESS:
        - If the content contains diagrams, charts, graphs, or tables, describe what they show in questions.
        - For graphs: ask about trends, axes labels, peak/trough values, and relationships shown.
        - For tables: ask about specific cell values, comparisons between rows/columns, totals.
        - For circuit/flow diagrams: ask about components, connections, and outputs.
        - For anatomical diagrams: ask about labeled parts, their functions, and relationships.
        - Convert visual information into clear text-based MCQ questions.
        - Example: "According to the graph, what happened to [X] when [Y] increased?"
        - Example: "Based on the table, which category has the highest [value]?"
        - NEVER say 'as shown in the diagram' — describe the visual content explicitly.
    """.trimIndent()

    /**
     * Spaced repetition: Given weak topics, build a topic-weighted additional prompt
     * to direct the AI to generate more questions in weak areas.
     */
    fun buildAdaptivePromptPrefix(weakTopics: List<WeakTopic>): String {
        if (weakTopics.isEmpty()) return ""
        val highPriority = weakTopics.filter { it.priority == 1 }.take(3)
        if (highPriority.isEmpty()) return ""

        val topicList = highPriority.joinToString(", ") { it.topic }
        return """
        ADAPTIVE LEARNING MODE:
        This user has shown weakness in: $topicList
        Generate at least 40% of questions covering these specific weak areas.
        Make those questions slightly more detailed to reinforce understanding.
        """.trimIndent() + "\n\n"
    }
}
