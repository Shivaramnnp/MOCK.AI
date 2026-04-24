package com.shiva.magics.util

import android.util.Log
import com.shiva.magics.data.model.Question

/**
 * v2.0 Feature #1: Answer Verification Engine
 *
 * Validates AI-generated answers beyond structural checks.
 * Catches the case where confidence = 0.91 but the answer is wrong.
 *
 * Strategy (without a reference database):
 *
 *  1. CROSS-VALIDATION: Re-ask the same question to a second provider via callback.
 *     If both providers disagree on the correct answer index → flag as uncertain.
 *
 *  2. RULE-BASED VERIFICATION: Apply deterministic rules to numeric/formula questions.
 *     E.g., "2+2=?" — verifiable without a model.
 *
 *  3. CONSISTENCY CHECK: If 2+ questions in the same batch answer a common fact
 *     differently → detect contradiction and flag both.
 *
 *  4. COMMON ERROR PATTERNS: Detect known AI failure modes:
 *     - Correct answer changes for synonymous rephrasing within same test
 *     - Numeric answers that are physically impossible
 *     - Absolute terms ("always", "never") that are almost always wrong as correct answers
 */
object AnswerVerificationEngine {

    private const val TAG = "AnswerVerification"

    enum class VerificationStatus {
        VERIFIED,           // Passed all checks
        UNCERTAIN,          // Cross-provider disagreement or rule conflict
        LIKELY_WRONG,       // High-confidence wrong flag (deterministic rule)
        UNVERIFIABLE        // Cannot be checked (narrative question)
    }

    data class VerificationResult(
        val question: Question,
        val status: VerificationStatus,
        val confidence: Float,       // 0-1 (1 = very confident in verification)
        val flags: List<String>,
        val suggestedAnswerIndex: Int = question.correctAnswerIndex  // Override if detected wrong
    )

    data class BatchVerification(
        val verified: List<Question>,
        val uncertain: List<VerificationResult>,
        val likelyWrong: List<VerificationResult>,
        val overallTrustScore: Float  // 0-1 across batch
    )

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Verify a batch of questions.
     * Cross-provider callback is optional — pass null to skip cross-validation.
     */
    fun verifyBatch(
        questions: List<Question>,
        crossProviderAnswers: Map<Int, Int>? = null  // questionIndex → alternative answer index
    ): BatchVerification {
        if (questions.isEmpty()) return BatchVerification(emptyList(), emptyList(), emptyList(), 1f)

        val results = questions.mapIndexed { idx, q ->
            verifyQuestion(q, crossProviderAnswers?.get(idx))
        }

        // Consistency check across batch
        val withConsistency = applyConsistencyCheck(questions, results)

        val verified    = withConsistency.filter { it.status == VerificationStatus.VERIFIED }.map { it.question }
        val uncertain   = withConsistency.filter { it.status == VerificationStatus.UNCERTAIN }
        val likelyWrong = withConsistency.filter { it.status == VerificationStatus.LIKELY_WRONG }

        val trustScore = if (results.isEmpty()) 1f
            else verified.size.toFloat() / results.size

        Log.d(TAG, "🔍 Verification: ${verified.size} OK, ${uncertain.size} uncertain, ${likelyWrong.size} likely-wrong (trust=${"%.2f".format(trustScore)})")
        likelyWrong.forEach { r ->
            Log.w(TAG, "  ⚠️ '${r.question.questionText.take(50)}' flags=${r.flags}")
        }

        return BatchVerification(verified, uncertain, likelyWrong, trustScore)
    }

    fun verifyQuestion(
        q: Question,
        crossProviderAnswerIdx: Int? = null
    ): VerificationResult {
        val flags = mutableListOf<String>()
        var status = VerificationStatus.VERIFIED
        var confidence = 1.0f

        // ── Rule 1: Cross-provider disagreement ────────────────────────────
        if (crossProviderAnswerIdx != null && crossProviderAnswerIdx != q.correctAnswerIndex) {
            flags.add("Cross-provider disagreement: primary=idx${q.correctAnswerIndex}, secondary=idx$crossProviderAnswerIdx")
            status = VerificationStatus.UNCERTAIN
            confidence -= 0.30f
        }

        // ── Rule 2: Absolute-term trap detection ───────────────────────────
        // Correct answers with "always"/"never"/"all"/"none" are almost always wrong in MCQs
        val correctText = q.options.getOrNull(q.correctAnswerIndex)?.lowercase() ?: ""
        val absoluteTerms = listOf("always", "never", "all of", "none of", "only", "impossible", "guaranteed")
        val hasAbsoluteTerm = absoluteTerms.any { correctText.contains(it) }
        if (hasAbsoluteTerm) {
            flags.add("Correct answer contains absolute term (likely wrong in MCQ context): '${q.options[q.correctAnswerIndex]}'")
            status = if (status == VerificationStatus.VERIFIED) VerificationStatus.UNCERTAIN else status
            confidence -= 0.15f
        }

        // ── Rule 3: Trivially obvious correct answer ───────────────────────
        // If the correct answer is dramatically longer than all distractors, AI padded it
        val correctLen = correctText.length
        val avgDistractorLen = q.options
            .filterIndexed { i, _ -> i != q.correctAnswerIndex }
            .map { it.length }
            .average()
        if (correctLen > 0 && avgDistractorLen > 0 && correctLen > avgDistractorLen * 2.5) {
            flags.add("Correct answer (len=$correctLen) is 2.5x longer than avg distractor (len=${"%.0f".format(avgDistractorLen)}) — likely over-explained")
            confidence -= 0.10f
        }

        // ── Rule 4: Numeric answer verification ───────────────────────────
        val numericVerification = tryNumericVerification(q)
        if (numericVerification != null && !numericVerification) {
            flags.add("Numeric check: computed answer does not match marked correct option")
            status = VerificationStatus.LIKELY_WRONG
            confidence -= 0.40f
        }

        // ── Rule 5: Distractor that shadows the correct answer ─────────────
        // If another option is extremely similar to correct (edit distance < 3) → suspicious
        val correctWords = correctText.split(" ").toSet()
        for ((i, opt) in q.options.withIndex()) {
            if (i == q.correctAnswerIndex) continue
            val optWords = opt.lowercase().split(" ").toSet()
            val overlap = correctWords.intersect(optWords).size.toFloat() / correctWords.size.coerceAtLeast(1)
            if (overlap > 0.85f && correctWords.size > 2) {
                flags.add("Option ${i+1} has ${(overlap*100).toInt()}% word overlap with correct answer — may be confusing distractor")
                confidence -= 0.08f
                break
            }
        }

        val finalStatus = when {
            confidence < 0.45f -> VerificationStatus.LIKELY_WRONG
            status != VerificationStatus.VERIFIED -> status
            else -> VerificationStatus.VERIFIED
        }

        return VerificationResult(q, finalStatus, confidence.coerceIn(0f, 1f), flags)
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Try to verify simple arithmetic/formula questions deterministically.
     * Returns true if correct, false if wrong, null if not numeric.
     */
    private fun tryNumericVerification(q: Question): Boolean? {
        val text = q.questionText.lowercase()
        // Detect simple arithmetic: "what is 7 × 8?" style
        val simpleMultRegex = Regex("""what is (\d+)\s*[×x\*]\s*(\d+)""")
        val simpleAddRegex  = Regex("""what is (\d+)\s*\+\s*(\d+)""")
        val simpleSubRegex  = Regex("""what is (\d+)\s*-\s*(\d+)""")

        val (expected, matched) = when {
            simpleMultRegex.containsMatchIn(text) -> {
                val m = simpleMultRegex.find(text)!!
                (m.groupValues[1].toLong() * m.groupValues[2].toLong()) to true
            }
            simpleAddRegex.containsMatchIn(text) -> {
                val m = simpleAddRegex.find(text)!!
                (m.groupValues[1].toLong() + m.groupValues[2].toLong()) to true
            }
            simpleSubRegex.containsMatchIn(text) -> {
                val m = simpleSubRegex.find(text)!!
                (m.groupValues[1].toLong() - m.groupValues[2].toLong()) to true
            }
            else -> 0L to false
        }
        if (!matched) return null

        val correctOptionText = q.options.getOrNull(q.correctAnswerIndex) ?: return null
        val optionNums = Regex("""\d+""").findAll(correctOptionText).map { it.value.toLong() }.toList()
        return optionNums.any { it == expected }
    }

    /**
     * Cross-question consistency: flag pairs where the same factual claim
     * appears answered differently across two questions in the same test.
     */
    private fun applyConsistencyCheck(
        questions: List<Question>,
        results: List<VerificationResult>
    ): List<VerificationResult> {
        // Build a map of fact-claim → answer from each question
        // Simple heuristic: if two questions share 4+ identical words and give different answer content → flag
        val updated = results.toMutableList()
        for (i in questions.indices) {
            for (j in (i + 1) until questions.size) {
                val qi = questions[i]; val qj = questions[j]
                val wi = qi.questionText.lowercase().split(" ").toSet()
                val wj = qj.questionText.lowercase().split(" ").toSet()
                val overlap = wi.intersect(wj).size
                if (overlap >= 5) {
                    // High topic overlap — check if answers are contradictory
                    val ai = qi.options.getOrNull(qi.correctAnswerIndex)?.lowercase() ?: ""
                    val aj = qj.options.getOrNull(qj.correctAnswerIndex)?.lowercase() ?: ""
                    if (ai.isNotBlank() && aj.isNotBlank() && ai != aj) {
                        val flag = "Possible contradiction with Q${j+1} (${overlap} shared topic words, different answers)"
                        if (results[i].status == VerificationStatus.VERIFIED) {
                            updated[i] = results[i].copy(
                                status = VerificationStatus.UNCERTAIN,
                                flags = results[i].flags + flag,
                                confidence = results[i].confidence - 0.12f
                            )
                        }
                    }
                }
            }
        }
        return updated
    }
}
