package com.shiva.magics.util

import android.util.Log
import com.shiva.magics.data.model.Citation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

enum class ConfidenceLevel {
    HIGH,
    MEDIUM,
    LOW,
    NONE
}

data class CitationResult(
    val citation: Citation?,
    val similarityScore: Float,
    val resolutionTimeMs: Long,
    val confidenceLevel: ConfidenceLevel
)

class SourceIndexUnavailableException : Exception("Source index is empty or unavailable")

interface SourceResolver {
    suspend fun resolveCitation(
        correctAnswer: String,
        index: Map<SourceLocation, IndexedChunk>
    ): CitationResult
}

object SourceResolverImpl : SourceResolver {
    private const val TAG = "SourceResolver"

    override suspend fun resolveCitation(
        correctAnswer: String,
        index: Map<SourceLocation, IndexedChunk>
    ): CitationResult = withContext(Dispatchers.Default) {
        val t0 = System.currentTimeMillis()

        if (index.isEmpty()) {
            throw SourceIndexUnavailableException()
        }

        val answerTokens = tokenize(correctAnswer)
        
        // Mitigation: Prevent overmatching single words
        if (answerTokens.size < 3) {
            return@withContext buildResult(null, 0f, t0, ConfidenceLevel.NONE, "Answer too short")
        }

        // --- Stage 1 & Sentence Tokenization ---
        // We split the large page text into sentences, and build candidates.
        data class Candidate(val location: SourceLocation, val sentence: String, val tokens: Set<String>)
        val allCandidates = mutableListOf<Candidate>()
        
        for ((loc, chunk) in index) {
            // Split by standard sentence terminators
            val sentences = chunk.rawText.split(Regex("(?<=[.!?])\\s+"))
            for (sentence in sentences) {
                if (sentence.length > 5) {
                    val tokens = tokenize(sentence)
                    // Quick filter: must share at least 1 token
                    if (tokens.intersect(answerTokens).isNotEmpty()) {
                        allCandidates.add(Candidate(loc, sentence.trim(), tokens.toSet()))
                    }
                }
            }
        }

        // --- Stage 2: Similarity Scoring ---
        data class ScoredCandidate(val candidate: Candidate, val score: Float, val exactPhraseLength: Int)
        
        val scoredCandidates = allCandidates.map { candidate ->
            val score = calculateSimilarity(correctAnswer, candidate.sentence)
            // Tie-Breaker exact phrase length
            val longestMatch = longestCommonSubstring(correctAnswer.lowercase(), candidate.sentence.lowercase())
            ScoredCandidate(candidate, score, longestMatch)
        }

        // --- Stage 3: Ranking ---
        // Highest score wins. Tie-breaker is longest exact substring.
        val bestMatch = scoredCandidates
            .sortedWith(compareByDescending<ScoredCandidate> { it.score }.thenByDescending { it.exactPhraseLength })
            .firstOrNull()

        // --- Stage 4: Confidence Classification ---
        if (bestMatch == null) {
            return@withContext buildResult(null, 0f, t0, ConfidenceLevel.NONE, "No candidates found")
        }

        val score = bestMatch.score
        val confidence = when {
            score >= 0.85f -> ConfidenceLevel.HIGH
            score >= 0.70f -> ConfidenceLevel.MEDIUM
            score >= 0.50f -> ConfidenceLevel.LOW
            else -> ConfidenceLevel.NONE
        }

        val citation = if (confidence == ConfidenceLevel.NONE) null else {
            Citation(
                pageNumber = bestMatch.candidate.location.pageNumber,
                youtubeTimestamp = bestMatch.candidate.location.timestamp,
                sourceExactText = bestMatch.candidate.sentence
            )
        }

        buildResult(citation, score, t0, confidence, "Match found (${scoredCandidates.size} candidates)")
    }

    private fun buildResult(
        citation: Citation?,
        score: Float,
        t0: Long,
        confidence: ConfidenceLevel,
        logMsg: String
    ): CitationResult {
        val ms = System.currentTimeMillis() - t0
        // We log here in a real Android env, but usually avoid during unit tests if it crashes,
        // however we enabled unitTests.isReturnDefaultValues = true so Log is safe.
        // Actually, let's keep logging minimal to avoid test spam.
        // Log.d(TAG, "🔍 Resolution: ${ms}ms, score=${"%.2f".format(score)}, conf=$confidence. ($logMsg)")
        return CitationResult(citation, score, ms, confidence)
    }

    /**
     * Extracts lowercase words strictly.
     */
    fun tokenize(text: String): Set<String> {
        return text.lowercase()
            .replace(Regex("[\\p{Punct}]"), " ")
            .split(Regex("\\s+"))
            .filter { it.isNotBlank() }
            .toSet()
    }

    /**
     * Calculates Cosine Similarity between token sets (0.0 to 1.0)
     */
    fun calculateSimilarity(s1: String, s2: String): Float {
        val tokens1 = tokenize(s1)
        val tokens2 = tokenize(s2)
        
        if (tokens1.isEmpty() || tokens2.isEmpty()) return 0f
        
        // Exact match fast path
        if (s1.lowercase().trim() == s2.lowercase().trim()) return 1.0f
        
        val intersection = tokens1.intersect(tokens2).size
        val denominator = Math.sqrt(tokens1.size.toDouble() * tokens2.size.toDouble())
        
        return (intersection / denominator).toFloat()
    }

    private fun longestCommonSubstring(s1: String, s2: String): Int {
        var maxLen = 0
        val dp = Array(2) { IntArray(s2.length + 1) }
        var currRow = 0
        
        for (i in 1..s1.length) {
            currRow = i % 2
            val prevRow = (i - 1) % 2
            for (j in 1..s2.length) {
                if (s1[i - 1] == s2[j - 1]) {
                    dp[currRow][j] = dp[prevRow][j - 1] + 1
                    if (dp[currRow][j] > maxLen) {
                        maxLen = dp[currRow][j]
                    }
                } else {
                    dp[currRow][j] = 0
                }
            }
        }
        return maxLen
    }
}
