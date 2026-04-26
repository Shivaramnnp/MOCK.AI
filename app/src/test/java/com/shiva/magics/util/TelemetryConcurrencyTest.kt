package com.shiva.magics.util

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

/**
 * Verifies that TelemetryCollector counters are thread-safe under concurrent access.
 * Prior implementation used @Volatile Long with ++, which is NOT atomic and loses
 * updates under concurrent writes. AtomicLong.incrementAndGet() must produce
 * exact counts across any number of concurrent callers.
 */
class TelemetryConcurrencyTest {

    @Before
    fun setup() = TelemetryCollector.reset()

    @After
    fun teardown() = TelemetryCollector.reset()

    @Test
    fun `concurrent PROCESSING_STARTED events produce exact count`() = runBlocking {
        val threads    = 50
        val eventsEach = 100
        val expected   = (threads * eventsEach).toLong()

        val jobs = List(threads) {
            launch(Dispatchers.Default) {
                repeat(eventsEach) {
                    TelemetryCollector.record(TelemetryCollector.EventType.PROCESSING_STARTED)
                }
            }
        }
        jobs.forEach { it.join() }

        val report = TelemetryCollector.getHealthReport()
        assertEquals(
            "Expected $expected PROCESSING_STARTED events, got ${report.totalAttempts}",
            expected, report.totalAttempts
        )
    }

    @Test
    fun `concurrent PROCESSING_SUCCESS events produce exact count`() = runBlocking {
        val threads    = 50
        val eventsEach = 100
        val expected   = (threads * eventsEach).toLong()

        val jobs = List(threads) {
            launch(Dispatchers.Default) {
                repeat(eventsEach) {
                    TelemetryCollector.record(TelemetryCollector.EventType.PROCESSING_SUCCESS, value = 100.0)
                }
            }
        }
        jobs.forEach { it.join() }

        val report = TelemetryCollector.getHealthReport()
        assertEquals(
            "Expected $expected PROCESSING_SUCCESS events, got ${report.totalSuccesses}",
            expected, report.totalSuccesses
        )
    }

    @Test
    fun `concurrent mixed events maintain consistent success rate`() = runBlocking {
        val threads    = 20
        val eventsEach = 50

        val jobs = List(threads) { i ->
            launch(Dispatchers.Default) {
                repeat(eventsEach) {
                    TelemetryCollector.record(TelemetryCollector.EventType.PROCESSING_STARTED)
                    if (i % 2 == 0) {
                        TelemetryCollector.record(TelemetryCollector.EventType.PROCESSING_SUCCESS, value = 200.0)
                    }
                }
            }
        }
        jobs.forEach { it.join() }

        val report = TelemetryCollector.getHealthReport()
        val totalAttempts  = (threads * eventsEach).toLong()
        val totalSuccesses = (threads / 2 * eventsEach).toLong()

        assertEquals(totalAttempts,  report.totalAttempts)
        assertEquals(totalSuccesses, report.totalSuccesses)
    }

    @Test
    fun `concurrent cache events produce exact hit and miss counts`() = runBlocking {
        val threads = 40
        val hitsEach  = 30
        val missesEach = 20

        val jobs = List(threads) {
            launch(Dispatchers.Default) {
                repeat(hitsEach)  { TelemetryCollector.record(TelemetryCollector.EventType.CACHE_HIT) }
                repeat(missesEach) { TelemetryCollector.record(TelemetryCollector.EventType.CACHE_MISS) }
            }
        }
        jobs.forEach { it.join() }

        val report      = TelemetryCollector.getHealthReport()
        val expectedRate = (threads * hitsEach).toFloat() / (threads * (hitsEach + missesEach)) * 100f

        assertEquals(
            "Cache hit rate mismatch",
            expectedRate, report.cacheHitRatePct, 0.01f
        )
    }

    @Test
    fun `reset clears all counters correctly`() = runBlocking {
        repeat(100) { TelemetryCollector.record(TelemetryCollector.EventType.PROCESSING_STARTED) }
        TelemetryCollector.reset()
        val report = TelemetryCollector.getHealthReport()
        assertEquals(0L, report.totalAttempts)
        assertEquals(0L, report.totalSuccesses)
        assertEquals(100f, report.successRatePct, 0.001f) // default when 0 attempts
    }
}
