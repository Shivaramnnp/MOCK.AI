package com.shiva.magics.util

import android.util.Log
import com.shiva.magics.data.model.Question

/**
 * v2.0 Feature #4: Syllabus Mapping Engine
 *
 * Maps AI-generated questions to a structured academic hierarchy:
 *   Subject → Chapter → Topic → Sub-topic
 *
 * This is critical for exam preparation (GATE, JEE, UPSC, professional certs)
 * where knowing WHICH chapter is weak is more valuable than raw question count.
 *
 * Approach: Keyword extraction + subject taxonomy matching.
 * No external API required — runs entirely on-device.
 *
 * Supported subjects: Computer Science, Mathematics, Physics, Chemistry,
 *                     General English, Business/Management
 */
object SyllabusMapper {

    private const val TAG = "SyllabusMapper"

    // ── Data structures ──────────────────────────────────────────────────────

    data class SyllabusTag(
        val subject: String,
        val chapter: String,
        val topic: String,
        val subTopic: String = "",
        val confidence: Float = 1.0f  // How confident the match is
    ) {
        override fun toString() = "$subject > $chapter > $topic${if (subTopic.isNotEmpty()) " > $subTopic" else ""}"
    }

    data class MappedQuestion(
        val question: Question,
        val tag: SyllabusTag?       // null = could not map
    )

    data class SyllabusReport(
        val mappedQuestions: List<MappedQuestion>,
        val coverageBySubject: Map<String, Int>,    // subject → q count
        val coverageByChapter: Map<String, Int>,    // chapter → q count
        val unmappedCount: Int,
        val mappingCoverage: Float                  // % successfully mapped
    )

    // ── Taxonomy: Subject → Chapter → keywords ───────────────────────────────
    // Each entry: "chapter_name" to listOf("keyword1", "keyword2", ...)
    private val taxonomy: Map<String, Map<String, List<String>>> = mapOf(

        "Computer Science" to mapOf(
            "Data Structures" to listOf("array", "linked list", "stack", "queue", "tree", "graph", "heap", "hash", "bst", "binary tree", "trie", "deque"),
            "Algorithms" to listOf("sorting", "searching", "recursion", "dynamic programming", "greedy", "backtrack", "complexity", "big o", "divide and conquer", "bfs", "dfs"),
            "Operating Systems" to listOf("process", "thread", "deadlock", "semaphore", "mutex", "scheduler", "memory", "paging", "segmentation", "file system", "ipc"),
            "DBMS" to listOf("sql", "database", "normalization", "transaction", "acid", "join", "index", "query", "relation", "er diagram", "foreign key"),
            "Computer Networks" to listOf("tcp", "udp", "ip", "http", "dns", "router", "protocol", "osi", "network layer", "subnet", "bandwidth"),
            "OOP & Languages" to listOf("class", "object", "inheritance", "polymorphism", "encapsulation", "abstraction", "interface", "override", "constructor"),
            "Compiler Design" to listOf("grammar", "parsing", "lexer", "token", "ambiguous", "automata", "context free", "derivation"),
            "Software Engineering" to listOf("agile", "sdlc", "testing", "requirement", "uml", "design pattern", "sprint", "scrum"),
        ),

        "Mathematics" to mapOf(
            "Calculus" to listOf("derivative", "integral", "limit", "continuity", "differentiation", "integration", "partial derivative"),
            "Linear Algebra" to listOf("matrix", "vector", "determinant", "eigenvalue", "rank", "span", "orthogonal", "linear transformation"),
            "Probability & Statistics" to listOf("probability", "distribution", "mean", "variance", "standard deviation", "bayes", "random variable", "normal distribution"),
            "Discrete Mathematics" to listOf("set", "relation", "function", "logic", "proposition", "proof", "combinatorics", "permutation", "combination"),
            "Algebra" to listOf("polynomial", "equation", "quadratic", "logarithm", "exponential", "series", "arithmetic", "geometric"),
            "Geometry" to listOf("triangle", "circle", "angle", "coordinate", "ellipse", "parabola", "hyperbola"),
        ),

        "Physics" to mapOf(
            "Mechanics" to listOf("force", "motion", "velocity", "acceleration", "momentum", "gravity", "friction", "torque", "newton"),
            "Thermodynamics" to listOf("heat", "temperature", "entropy", "carnot", "gas law", "specific heat", "thermal"),
            "Electromagnetism" to listOf("electric field", "magnetic field", "current", "resistance", "capacitor", "inductor", "wave", "electromagnetic"),
            "Optics" to listOf("light", "lens", "mirror", "reflection", "refraction", "diffraction", "interference"),
            "Modern Physics" to listOf("quantum", "photon", "nucleus", "atom", "radioactive", "relativity", "electron"),
        ),

        "General English" to mapOf(
            "Grammar" to listOf("tense", "verb", "noun", "adjective", "adverb", "preposition", "article", "conjunction"),
            "Vocabulary" to listOf("synonym", "antonym", "idiom", "phrase", "meaning", "word"),
            "Reading Comprehension" to listOf("passage", "inference", "main idea", "author", "tone"),
            "Writing" to listOf("essay", "paragraph", "sentence", "summarize", "argument"),
        ),

        "Business" to mapOf(
            "Marketing" to listOf("marketing", "branding", "customer", "market", "product", "price", "promotion", "distribution"),
            "Finance" to listOf("finance", "balance sheet", "cash flow", "profit", "loss", "investment", "return", "asset"),
            "Management" to listOf("management", "leadership", "organization", "planning", "strategy", "human resource"),
            "Economics" to listOf("demand", "supply", "gdp", "inflation", "market", "cost", "revenue", "monopoly"),
        )
    )

    // ── Public API ───────────────────────────────────────────────────────────

    /** Map a single question to the best syllabus tag */
    fun mapQuestion(question: Question): SyllabusTag? {
        val text = (question.questionText + " " + question.options.joinToString(" ")).lowercase()

        data class Match(val subject: String, val chapter: String, val score: Int)
        val matches = mutableListOf<Match>()

        for ((subject, chapters) in taxonomy) {
            for ((chapter, keywords) in chapters) {
                val score = keywords.count { text.contains(it) }
                if (score > 0) matches.add(Match(subject, chapter, score))
            }
        }

        if (matches.isEmpty()) {
            Log.v(TAG, "❓ Could not map: '${question.questionText.take(50)}'")
            return null
        }

        val best = matches.maxByOrNull { it.score }!!
        val topic = extractTopic(text, best.subject, best.chapter)
        val confidence = minOf(1f, best.score.toFloat() / 3f)

        return SyllabusTag(
            subject    = best.subject,
            chapter    = best.chapter,
            topic      = topic,
            confidence = confidence
        )
    }

    /** Map a full question list and return a structured report */
    fun mapBatch(questions: List<Question>): SyllabusReport {
        val mapped = questions.map { MappedQuestion(it, mapQuestion(it)) }
        val bySubject = mapped.mapNotNull { it.tag?.subject }
            .groupingBy { it }.eachCount()
        val byChapter = mapped.mapNotNull { it.tag?.chapter }
            .groupingBy { it }.eachCount()
        val unmapped = mapped.count { it.tag == null }
        val coverage = if (questions.isEmpty()) 0f
            else (questions.size - unmapped).toFloat() / questions.size

        Log.d(TAG, "📚 Syllabus map: ${questions.size} questions, ${(coverage * 100).toInt()}% mapped, subjects=${bySubject.keys}")
        return SyllabusReport(mapped, bySubject, byChapter, unmapped, coverage)
    }

    /** Generate a syllabus-aware prompt section for the AI */
    fun buildSyllabusPrompt(subject: String?, chapter: String?, topic: String?): String {
        val parts = listOfNotNull(
            subject?.let { "Subject: $it" },
            chapter?.let { "Chapter: $it" },
            topic?.let   { "Topic: $it" }
        )
        return if (parts.isEmpty()) ""
        else "Generate questions specifically covering — ${parts.joinToString(", ")}."
    }

    private fun extractTopic(text: String, subject: String, chapter: String): String {
        // Best-effort sub-topic extraction by finding the most specific matched keyword
        val chapterKeywords = taxonomy[subject]?.get(chapter) ?: return chapter
        return chapterKeywords.filter { text.contains(it) }
            .maxByOrNull { it.length } ?: chapter
    }
}
