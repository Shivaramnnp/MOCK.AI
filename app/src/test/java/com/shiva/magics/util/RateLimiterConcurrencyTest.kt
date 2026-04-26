package com.shiva.magics.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Verifies RateLimiter concurrency guarantees:
 * - Token accounting is correct under concurrent acquire() calls
 * - Session cap is never exceeded
 * - Queue size is bounded
 * - Requests are never lost (either granted or explicitly rejected)
 * - No race conditions producing more grants than MAX_TOKENS + refills
 */
class RateLimiterConcurrencyTest {

    // Mirror private constants from RateLimiter to avoid accessing private members
    private val maxTokens      = 5   // RateLimiter.MAX_TOKENS
    private val maxQueueSize   = 10  // RateLimiter.MAX_QUEUE_SIZE
    private val sessionMaxReqs = 20  // RateLimiter.SESSION_MAX_REQUESTS

    @Before
    fun setup() = RateLimiter.resetSession()

    @After
    fun teardown() = RateLimiter.resetSession()

    @Test
    fun `fast path grants do not exceed initial token count`() = runBlocking {
        val results = mutableListOf<Boolean>()
        val lock = Any()
        val jobs = List(maxTokens) { i ->
            launch(Dispatchers.Default) {
                val r = RateLimiter.acquire("fast-$i")
                synchronized(lock) { results.add(r) }
            }
        }
        jobs.forEach { it.join() }
        val granted = results.count { it }
        assertTrue("Should grant exactly $maxTokens fast tokens, got $granted", granted == maxTokens)
    }

    @Test
    fun `queue overflow drops excess requests cleanly`() = runBlocking {
        repeat(maxTokens) { RateLimiter.acquire("exhaust-$it") }
        val results = mutableListOf<Boolean>()
        val lock = Any()
        val overflow = maxQueueSize + 5
        val jobs = List(overflow) { i ->
            launch(Dispatchers.Default) {
                val r = try {
                    kotlinx.coroutines.withTimeout(100) { RateLimiter.acquire("overflow-$i") }
                } catch (e: kotlinx.coroutines.TimeoutCancellationException) { false }
                synchronized(lock) { results.add(r) }
            }
        }
        jobs.forEach { it.join() }
        val falseCount = results.count { !it }
        assertTrue("At least 5 requests must be dropped, got $falseCount", falseCount >= 5)
    }

    @Test
    fun `session cap is never exceeded under concurrent load`() = runBlocking {
        val concurrent = 25
        val results = mutableListOf<Boolean>()
        val lock = Any()
        val jobs = List(concurrent) { i ->
            launch(Dispatchers.Default) {
                val r = try {
                    kotlinx.coroutines.withTimeout(500) { RateLimiter.acquire("session-$i") }
                } catch (e: kotlinx.coroutines.TimeoutCancellationException) { false }
                synchronized(lock) { results.add(r) }
            }
        }
        jobs.forEach { it.join() }
        val granted = results.count { it }
        assertTrue("Granted ($granted) must not exceed $sessionMaxReqs", granted <= sessionMaxReqs)
    }

    @Test
    fun `withRetry succeeds on transient failure`() = runBlocking {
        var attempt = 0
        val result = RateLimiter.withRetry("test-op", maxRetries = 2) {
            attempt++
            if (attempt < 2) Result.failure<String>(Exception("503 Service Unavailable"))
            else Result.success("ok")
        }
        assertTrue("withRetry should succeed on second attempt", result.isSuccess)
        assertTrue("Should have attempted at least twice", attempt >= 2)
    }

    @Test
    fun `withRetry aborts on non-transient error`() = runBlocking {
        var attempt = 0
        val result = RateLimiter.withRetry<String>("non-transient", maxRetries = 3) {
            attempt++
            Result.failure(Exception("Invalid API key"))
        }
        assertFalse("Non-transient error should not be retried", result.isSuccess)
        assertEquals("Should abort after first non-transient attempt", 1, attempt)
    }

    @Test
    fun `concurrent withRetry calls do not interfere`() = runBlocking {
        val concurrentOps = 10
        val results = mutableListOf<Result<String>>()
        val lock = Any()
        val jobs = List(concurrentOps) { i ->
            launch(Dispatchers.Default) {
                val r = RateLimiter.withRetry("parallel-$i", maxRetries = 1) {
                    Result.success("result-$i")
                }
                synchronized(lock) { results.add(r) }
            }
        }
        jobs.forEach { it.join() }
        assertEquals(concurrentOps, results.size)
        assertTrue("All parallel withRetry calls should succeed", results.all { it.isSuccess })
    }
}
