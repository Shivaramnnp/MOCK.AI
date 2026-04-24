package com.shiva.magics.util

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

/**
 * Day 3-5: SourceIndexer Unit Tests
 */
class SourceIndexerTest {

    // Test 1 — Deterministic Hash
    @Test
    fun `test deterministic hash returns identical output for identical bytes`() {
        val input = "Hello World".toByteArray()
        val hash1 = SourceIndexerImpl.hashBytes(input)
        val hash2 = SourceIndexerImpl.hashBytes(input)
        
        assertEquals("Hash must be absolutely deterministic", hash1, hash2)
        assertEquals("SHA-256 length must be 64 characters", 64, hash1.length)
    }

    // Test 4 — Normalization
    @Test
    fun `test normalization pipeline formats text correctly`() {
        val input = "Hello, World!   \n CPU performs arithmetic operations."
        val expected = "hello world cpu performs arithmetic operations"
        
        val output = SourceIndexerImpl.normalizeText(input)
        assertEquals("Text must be lowercased, punctuation removed, and whitespace flattened", expected, output)
    }

    // Test 2 — Cache Hit
    // Test 3 — Memory Safety Proxy (Cache Hit)
    @Test
    fun `test source index cache hit bypasses generator`() {
        runBlocking {
            // Setup temporary cache directory
            val tempDir = Files.createTempDirectory("mock_ai_test_cache").toFile()
            
            val sourceHash = "fake_test_hash"
            var generationCounter = 0
            
            // Initial generation
            val index1 = SourceIndexerImpl.getOrCreateIndex(tempDir, sourceHash) {
                generationCounter++
                mapOf(
                    SourceLocation(pageNumber = 1) to IndexedChunk(
                        location = SourceLocation(pageNumber = 1),
                        rawText = "Page 1 Text",
                        normalizedText = "page 1 text",
                        tokenCount = 3
                    )
                )
            }
            
            assertEquals(1, generationCounter)
            assertEquals(1, index1.size)
            
            // Read from cache
            val index2 = SourceIndexerImpl.getOrCreateIndex(tempDir, sourceHash) {
                generationCounter++ // Should not be called!
                emptyMap()
            }
            
            assertEquals("Generator must NOT be called on cache hit", 1, generationCounter)
            assertEquals("Index size should match the cached version", 1, index2.size)
            assertEquals("page 1 text", index2[SourceLocation(pageNumber = 1)]?.normalizedText)
            
            // Cleanup
            tempDir.deleteRecursively()
        }
    }
}
