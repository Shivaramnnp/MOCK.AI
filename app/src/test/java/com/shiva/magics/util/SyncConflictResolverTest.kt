package com.shiva.magics.util

import org.junit.Assert.*
import org.junit.Test

class SyncConflictResolverTest {

    @Test
    fun testServerWinsForTimestampIfVersionSame() {
        val result = SyncConflictResolver.resolve(
            fieldName = "title",
            localValue = "Local Title",
            serverValue = "Server Title",
            localTimestamp = 100L,
            serverTimestamp = 200L,
            localVersion = 1L,
            serverVersion = 1L
        )
        assertEquals(SyncConflictResolver.Strategy.SERVER_WINS, result.strategy)
        assertEquals("Server Title", result.resolvedValue)
    }

    @Test
    fun testLocalWinsForHigherVersion() {
        val result = SyncConflictResolver.resolve(
            fieldName = "title",
            localValue = "Local Title",
            serverValue = "Server Title",
            localTimestamp = 100L,
            serverTimestamp = 200L,
            localVersion = 2L,
            serverVersion = 1L
        )
        assertEquals(SyncConflictResolver.Strategy.CLIENT_WINS, result.strategy)
        assertEquals("Local Title", result.resolvedValue)
    }

    @Test
    fun testMergeMaxScore() {
        val result = SyncConflictResolver.resolve(
            fieldName = "bestScore",
            localValue = 85,
            serverValue = 90,
            localTimestamp = 100L,
            serverTimestamp = 50L
        )
        assertEquals(SyncConflictResolver.Strategy.MERGE_MAX_SCORE, result.strategy)
        assertEquals(90, result.resolvedValue)
    }
}
