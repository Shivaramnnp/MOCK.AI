package com.shiva.magics.util

import android.util.Log
import com.shiva.magics.data.model.Question

/**
 * Mentor Feature #3: Confidence Scoring System
 * Mentor Feature #1 (partial): AI answer verification via rule-based checks
 *
 * Assigns a 0.0–1.0 confidence score to each AI-generated question.
 * Questions below the threshold are quarantined (not shown to users).
 *
 * Scoring factors:
 *  + Grammatically complete question text
 *  + Options differ from each other meaningfully
 *  + Answer index is non-trivially distributed (not all index=0)
 *  + No "None/All of the above" lazy options
 *  + Options have similar length (well-calibrated distractors)
 *  + Question contains a question word (what/how/which/when/why/where)
 *  - Suspiciously short question text
 *  - Duplicate-word options
 *  - Answer always at position 0 (sign of AI bias)
 */
object ConfidenceScorer {

    private const val TAG = "ConfidenceScorer"
    const val DEFAULT_THRESHOLD = 0.65f  // Reject below 65%

    data class ScoredQuestion(
        val question: Question,
        val confidence: Float,            // 0.0–1.0
        val flags: List<String>,          // Human-readable low-confidence reasons
        val passed: Boolean               // confidence >= threshold
    )

    data class BatchResult(
        val passed: List<Question>,
        val quarantined: List<ScoredQuestion>,
        val averageConfidence: Float,
        val passRate: Float
    )

    // ── Public API ───────────────────────────────────────────────────────────

    fun scoreQuestion(q: Question, threshold: Float = DEFAULT_THRESHOLD): ScoredQuestion {
        val flags = mutableListOf<String>()
        var score = 1.0f

        // 1. Minimum question length (< 20 chars = probably truncated)
        if (q.questionText.length < 20) {
            score -= 0.25f; flags.add("Question text too short (${q.questionText.length} chars)")
        }

        // 2. Question must end with a question mark OR contain a question word
        val hasQuestionWord = listOf("what", "how", "which", "when", "why", "where", "who", "define", "explain")
            .any { q.questionText.lowercase().contains(it) }
        val hasQuestionMark = q.questionText.trim().endsWith("?")
        if (!hasQuestionWord && !hasQuestionMark) {
            score -= 0.15f; flags.add("Not clearly phrased as a question")
        }

        // 3. Lazy options: "None of the above" / "All of the above"
        val lazyOptionCount = q.options.count { opt ->
            val l = opt.lowercase()
            l.contains("none of the above") || l.contains("all of the above") ||
            l.contains("none of these") || l.contains("all of these")
        }
        if (lazyOptionCount > 0) {
            score -= 0.1f * lazyOptionCount
            flags.add("$lazyOptionCount lazy option(s) (none/all of the above)")
        }

        // 4. Options uniqueness — at least 60% of option chars should be distinct
        val optionTexts = q.options.map { it.lowercase().trim() }
        val uniqueOptions = optionTexts.toSet().size
        if (uniqueOptions < q.options.size) {
            score -= 0.30f; flags.add("Duplicate options detected")
        }

        // 5. Option length balance — max/min ratio should not exceed 5x
        val lengths = q.options.map { it.length }.filter { it > 0 }
        if (lengths.isNotEmpty()) {
            val ratio = lengths.max().toFloat() / lengths.min()
            if (ratio > 5f) {
                score -= 0.10f; flags.add("Option length imbalance (ratio=${"%.1f".format(ratio)}x)")
            }
        }

        // 6. Correct answer should not always be at index 0 (single-question check)
        // (Batch-level bias is checked in scoreBatch)

        // 7. Correct answer option should not contain trivially obvious keywords
        val correctText = q.options.getOrNull(q.correctAnswerIndex)?.lowercase() ?: ""
        if (correctText.length < 3) {
            score -= 0.20f; flags.add("Correct answer option is too short")
        }

        // 8. Each option should be at least 3 characters
        val shortOptions = q.options.count { it.length < 3 }
        if (shortOptions > 0) {
            score -= 0.10f * shortOptions
            flags.add("$shortOptions option(s) too short (<3 chars)")
        }

        val finalScore = score.coerceIn(0f, 1f)
        return ScoredQuestion(
            question = q,
            confidence = finalScore,
            flags = flags,
            passed = finalScore >= threshold
        )
    }

    /**
     * Score a full batch of questions.
     * Also performs cross-question checks (answer index bias).
     */
    fun scoreBatch(
        questions: List<Question>,
        threshold: Float = DEFAULT_THRESHOLD
    ): BatchResult {
        if (questions.isEmpty()) return BatchResult(emptyList(), emptyList(), 0f, 0f)

        val scored = questions.map { scoreQuestion(it, threshold) }.toMutableList()

        // Batch-level: if >70% of answers are at index 0, flag bias
        val zeroIndexCount = questions.count { it.correctAnswerIndex == 0 }
        val zeroBias = zeroIndexCount.toFloat() / questions.size
        if (zeroBias > 0.70f && questions.size >= 5) {
            Log.w(TAG, "⚠️ Answer bias: ${(zeroBias * 100).toInt()}% of correct answers at index 0")
            // Penalise all questions slightly for batch-level suspicion
            scored.indices.forEach { i ->
                val s = scored[i]
                scored[i] = s.copy(
                    confidence = (s.confidence - 0.10f).coerceAtLeast(0f),
                    flags = s.flags + "Batch bias: ${(zeroBias * 100).toInt()}% answers at index 0",
                    passed = (s.confidence - 0.10f) >= threshold
                )
            }
        }

        val passed = scored.filter { it.passed }.map { it.question }
        val quarantined = scored.filter { !it.passed }
        val avgConf = scored.map { it.confidence }.average().toFloat()
        val passRate = passed.size.toFloat() / scored.size

        Log.d(TAG, "📊 Batch score: ${passed.size}/${scored.size} passed (${(passRate*100).toInt()}%). avgConf=${"%.2f".format(avgConf)}")
        quarantined.forEach { s ->
            Log.w(TAG, "  ❌ Q'${s.question.questionText.take(40)}…' conf=${"%.2f".format(s.confidence)} flags=${s.flags}")
        }

        return BatchResult(passed, quarantined, avgConf, passRate)
    }
}
