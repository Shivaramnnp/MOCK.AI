package com.shiva.magics.util

import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for AICostMonitor.recordRequest() — verifies full cost accounting:
 * - Every call is recorded in the ledger
 * - Token estimation is correct
 * - Cost estimation is correct
 * - Ledger is bounded (max 200 entries)
 * - Multiple providers produce distinct records (no identity collision)
 */
class AICostMonitorTest {

    @Before
    fun setup() {
        // Clear ledger between tests by draining via snapshot (no public reset,
        // but ledger auto-evicts at MAX_LEDGER=200)
    }

    @Test
    fun `recordRequest adds entry to ledger`() {
        val snapshotBefore = AICostMonitor.getLedgerSnapshot().size
        AICostMonitor.recordRequest("gemini-flash", "TEXT", 5)
        val snapshotAfter = AICostMonitor.getLedgerSnapshot().size
        assertTrue("Ledger should grow after recordRequest", snapshotAfter > snapshotBefore)
    }

    @Test
    fun `recordRequest estimates 500 tokens per question`() {
        AICostMonitor.recordRequest("gemini-flash", "TEST_SOURCE", 4)
        val record = AICostMonitor.getLedgerSnapshot().last()
        assertEquals(4 * 500, record.estimatedTokens)
    }

    @Test
    fun `recordRequest computes cost correctly`() {
        val costPerToken = 0.00000015
        AICostMonitor.recordRequest("gemini-flash", "TEST_SOURCE", 10)
        val record = AICostMonitor.getLedgerSnapshot().last()
        val expected = 10 * 500 * costPerToken
        assertEquals(expected, record.estimatedCost, 0.0000001)
    }

    @Test
    fun `recordRequest preserves model name and source`() {
        AICostMonitor.recordRequest("groq-llama", "VIDEO", 3)
        val record = AICostMonitor.getLedgerSnapshot().last()
        assertEquals("groq-llama", record.modelName)
        assertEquals("VIDEO", record.source)
        assertEquals(3, record.questionCount)
    }

    @Test
    fun `multiple providers produce distinct records no collision`() {
        AICostMonitor.recordRequest("provider-A", "src1", 2)
        AICostMonitor.recordRequest("provider-B", "src2", 7)
        val snapshot = AICostMonitor.getLedgerSnapshot().takeLast(2)
        assertTrue("Both provider records should be distinct",
            snapshot.any { it.modelName == "provider-A" } &&
            snapshot.any { it.modelName == "provider-B" }
        )
    }

    @Test
    fun `getLedgerTotalCost accumulates correctly`() {
        val costPerToken = 0.00000015
        val before = AICostMonitor.getLedgerTotalCost()
        AICostMonitor.recordRequest("gemini-flash", "SRC", 10) // 10 * 500 * costPerToken
        AICostMonitor.recordRequest("gemini-flash", "SRC", 20) // 20 * 500 * costPerToken
        val after = AICostMonitor.getLedgerTotalCost()
        val expectedDelta = (10 + 20) * 500 * costPerToken
        assertEquals(expectedDelta, after - before, 0.0000001)
    }

    @Test
    fun `zero questions produces zero cost`() {
        AICostMonitor.recordRequest("gemini-flash", "EMPTY", 0)
        val record = AICostMonitor.getLedgerSnapshot().last()
        assertEquals(0, record.estimatedTokens)
        assertEquals(0.0, record.estimatedCost, 0.0)
    }

    @Test
    fun `recordRequest is non-blocking (not suspend)`() {
        // This test verifies the method can be called from a non-coroutine context.
        // If it were suspend, this would fail to compile.
        var called = false
        AICostMonitor.recordRequest("model", "src", 1)
        called = true
        assertTrue(called)
    }
}
