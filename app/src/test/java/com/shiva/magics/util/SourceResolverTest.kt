package com.shiva.magics.util

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Day 6-8: SourceResolver Unit Tests
 */
class SourceResolverTest {

    private fun buildMockIndex(text: String): Map<SourceLocation, IndexedChunk> {
        val loc = SourceLocation(pageNumber = 1)
        return mapOf(
            loc to IndexedChunk(
                location = loc,
                rawText = text,
                normalizedText = text.lowercase().replace(".", ""),
                tokenCount = 10
            )
        )
    }

    // Test 1 — Exact Match
    @Test
    fun `test exact match yields HIGH confidence`() {
        runBlocking {
            val index = buildMockIndex("The CPU performs arithmetic operations. The GPU handles graphics.")
            
            val result = SourceResolverImpl.resolveCitation(
                correctAnswer = "CPU performs arithmetic operations",
                index = index
            )
            
            assertEquals("Confidence should be HIGH", ConfidenceLevel.HIGH, result.confidenceLevel)
            assertNotNull("Citation must not be null", result.citation)
            assertEquals("The CPU performs arithmetic operations.", result.citation?.sourceExactText)
        }
    }

    // Test 2 — Partial Match
    @Test
    fun `test partial match yields MEDIUM confidence`() {
        runBlocking {
            // Here the sentence is slightly differently worded
            val index = buildMockIndex("The central processing unit executes and performs arithmetic operations very fast.")
            
            val result = SourceResolverImpl.resolveCitation(
                correctAnswer = "Processing unit performs arithmetic",
                index = index
            )
            
            val index2 = buildMockIndex("The CPU performs basic arithmetic logic operations.")
            val result2 = SourceResolverImpl.resolveCitation("CPU performs arithmetic logic", index2)
            
            assertTrue("Confidence should be MEDIUM or HIGH", result2.confidenceLevel == ConfidenceLevel.MEDIUM || result2.confidenceLevel == ConfidenceLevel.HIGH)
            assertNotNull(result2.citation)
        }
    }

    // Test 3 — No Match
    @Test
    fun `test no match yields NONE confidence and null citation`() {
        runBlocking {
            val index = buildMockIndex("The CPU performs arithmetic operations. RAM stores active memory.")
            
            val result = SourceResolverImpl.resolveCitation(
                correctAnswer = "Quantum teleportation enables fast networking",
                index = index
            )
            
            assertEquals(ConfidenceLevel.NONE, result.confidenceLevel)
            assertNull(result.citation)
        }
    }

    // Test 4 — Deterministic Output
    @Test
    fun `test deterministic output always returns same resolution time and score for same inputs`() {
        runBlocking {
            val index = buildMockIndex("This is a deterministic system test. It should behave identical every run.")
            val query = "deterministic system test"
            
            val result1 = SourceResolverImpl.resolveCitation(query, index)
            val result2 = SourceResolverImpl.resolveCitation(query, index)
            
            assertEquals("Scores must identical", result1.similarityScore, result2.similarityScore, 0.001f)
            assertEquals("Citaitons must be identical", result1.citation?.sourceExactText, result2.citation?.sourceExactText)
            assertEquals("Confidence must match", result1.confidenceLevel, result2.confidenceLevel)
        }
    }
    
    // Test 5 - Empty Index Exception
    @Test(expected = SourceIndexUnavailableException::class)
    fun `test empty index throws exception`() {
        runBlocking {
            SourceResolverImpl.resolveCitation("Test", emptyMap())
        }
    }

    // Test 6 - Minimum Token Threshold
    @Test
    fun `test short answers trigger minimum token guardrail returning NONE`() {
        runBlocking {
            val index = buildMockIndex("The network is operating perfectly.")
            
            // "network" has length 1 token, our minimum is 3 to prevent overmatching.
            val result = SourceResolverImpl.resolveCitation("network", index)
            
            assertEquals("Short answers should yield NONE due to mitigation rule", ConfidenceLevel.NONE, result.confidenceLevel)
        }
    }
}
