package com.shiva.magics.data.model

import com.shiva.magics.data.local.QuestionEntity
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 🛡️ Day 1 Evidence Engine Guardrail Tests
 */
class EvidenceEngineDataTest {

    private val json = Json { ignoreUnknownKeys = true }

    // Test 2 — Null Citation Handling
    @Test
    fun `test null citation handling loads normally`() {
        val q = Question(
            questionText = "What is the capital of France?",
            options = listOf("Paris", "London", "Berlin", "Rome"),
            correctAnswerIndex = 0,
            citation = null // Explicitly null
        )

        assertNull("Citation should be null without breaking the model", q.citation)
        assertEquals("Trust score must default to 0f", 0f, q.trustScore)
        assertEquals("Verification status must default to UNVERIFIED", VerificationStatus.UNVERIFIED, q.verificationStatus)
    }

    // Test 3 — Trust Score Default
    @Test
    fun `test trust score default is exactly 0f`() {
        val q = Question(
            questionText = "How many bytes in a kilobyte?",
            options = listOf("1000", "1024", "100", "512"),
            correctAnswerIndex = 1
        )
        // Guardrail 5: Keep Trust Score Lightweight
        assertEquals(0f, q.trustScore)
        assertEquals(VerificationStatus.UNVERIFIED, q.verificationStatus)
    }

    // Test 4 — Serialization Round Trip
    @Test
    fun `test citation serialization survives round trip safely`() {
        val citation = Citation(
            pageNumber = 12,
            youtubeTimestamp = "01:30-01:45",
            sourceExactText = "The cpu performs arithmetic operations."
        )

        val q = Question(
            questionText = "What operates arithmetic?",
            options = listOf("CPU", "RAM", "GPU", "SSD"),
            correctAnswerIndex = 0,
            citation = citation,
            trustScore = 0.95f,
            verificationStatus = VerificationStatus.VERIFIED,
            verifiedAt = 1680000000L
        )

        // Serialize
        val encoded = json.encodeToString(q)
        
        // Deserialize (survives network / cache)
        val decoded = json.decodeFromString<Question>(encoded)

        assertEquals("Source exact text must match perfectly", citation.sourceExactText, decoded.citation?.sourceExactText)
        assertEquals("Page number must survive JSON intact", 12, decoded.citation?.pageNumber)
        assertEquals(0.95f, decoded.trustScore)
        assertEquals(VerificationStatus.VERIFIED, decoded.verificationStatus)
        assertEquals(1680000000L, decoded.verifiedAt)
    }

    @Test
    fun `test entity mapping maintains defaults safely`() {
        // Verify default mapping logic in the entity directly
        val entity = QuestionEntity(
            testId = 1L,
            questionIndex = 0,
            questionText = "Q1",
            optionsJson = "[]",
            correctAnswerIndex = 0
            // omit new fields, they must take default values correctly
        )
        
        assertNull(entity.citationJson)
        assertNull(entity.pageNumber)
        assertEquals("UNVERIFIED", entity.verificationStatus)
        assertEquals(0f, entity.trustScore)
        assertNull(entity.verifiedAt)
    }
}
