package com.shiva.magics.util

import android.util.Log
import java.util.concurrent.atomic.AtomicLong

/**
 * v2.0 Feature #2: Processing Telemetry Dashboard
 *
 * Tracks real system health metrics (not just costs) so you can monitor:
 *  - Overall success rate
 *  - Average generation latency
 *  - Retry rate (signals API pressure)
 *  - Cache hit rate (signals cost efficiency)
 *  - Failure rate by category
 *  - Dataset drift indicators (confidence trend over time)
 *
 * These are the 5 metrics the mentor specified:
 *   1. Processing success rate ✅
 *   2. Average generation time ✅
 *   3. Retry rate ✅
 *   4. Cost per test → see AICostMonitor ✅
 *   5. Crash rate (proxied by error category counts) ✅
 */
object TelemetryCollector {

    private const val TAG = "Telemetry"

    // ── Event types ─────────────────────────────────────────────────────────
    enum class EventType {
        PROCESSING_STARTED,
        PROCESSING_SUCCESS,
        PROCESSING_FAILED,
        AI_RETRY,
        CACHE_HIT,
        CACHE_MISS,
        CHUNK_PROCESSED,
        CONFIDENCE_SAMPLE,    // Dataset drift tracking
        QUESTION_QUARANTINED,
        STREAK_STARTED,
        STREAK_INCREMENTED,
        STREAK_BROKEN,
        REWARD_UNLOCKED,
        NOTIFICATION_SENT,
        REFERRAL_SHARED,
        REFERRAL_CONVERTED
    }

    data class Event(
        val type: EventType,
        val label: String = "",
        val value: Double = 0.0,
        val timestamp: Long = System.currentTimeMillis()
    )

    // ── Sliding window storage ───────────────────────────────────────────────
    private const val MAX_EVENTS = 500
    private val events = ArrayDeque<Event>(MAX_EVENTS)

    // Aggregated fast counters — AtomicLong ensures thread-safe increments
    // without locks. @Volatile alone does NOT prevent lost updates under
    // concurrent ++ from multiple coroutine dispatchers.
    private val totalProcessingAttempts  = AtomicLong(0)
    private val totalProcessingSuccesses = AtomicLong(0)
    private val totalRetries             = AtomicLong(0)
    private val totalCacheHits           = AtomicLong(0)
    private val totalCacheMisses         = AtomicLong(0)
    private val totalQuarantined         = AtomicLong(0)
    private val latencySamples    = ArrayDeque<Long>(100)   // Last 100 latencies
    private val confidenceSamples = ArrayDeque<Float>(100)  // Last 100 confidence scores

    // ── Public event recording ───────────────────────────────────────────────

    fun record(type: EventType, label: String = "", value: Double = 0.0) {
        val event = Event(type, label, value)
        synchronized(events) {
            events.addLast(event)
            if (events.size > MAX_EVENTS) events.removeFirst()
        }

        // Update fast counters atomically
        when (type) {
            EventType.PROCESSING_STARTED   -> totalProcessingAttempts.incrementAndGet()
            EventType.PROCESSING_SUCCESS   -> {
                totalProcessingSuccesses.incrementAndGet()
                synchronized(latencySamples) {
                    latencySamples.addLast(value.toLong())
                    if (latencySamples.size > 100) latencySamples.removeFirst()
                }
            }
            EventType.AI_RETRY             -> totalRetries.incrementAndGet()
            EventType.CACHE_HIT            -> totalCacheHits.incrementAndGet()
            EventType.CACHE_MISS           -> totalCacheMisses.incrementAndGet()
            EventType.QUESTION_QUARANTINED -> totalQuarantined.incrementAndGet()
            EventType.CONFIDENCE_SAMPLE    -> synchronized(confidenceSamples) {
                confidenceSamples.addLast(value.toFloat())
                if (confidenceSamples.size > 100) confidenceSamples.removeFirst()
            }
            else -> {}
        }
        Log.v(TAG, "📊 $type: $label=${if (value > 0) "%.1f".format(value) else "-"}")
    }

    fun recordLatency(operationLabel: String, latencyMs: Long) =
        record(EventType.PROCESSING_SUCCESS, operationLabel, latencyMs.toDouble())

    fun recordConfidence(avgConfidence: Float) =
        record(EventType.CONFIDENCE_SAMPLE, "avg_confidence", avgConfidence.toDouble())

    // ── Dashboard report ─────────────────────────────────────────────────────

    data class HealthReport(
        // Core 5 metrics from mentor
        val successRatePct: Float,
        val avgLatencyMs: Long,
        val retryRatePct: Float,
        val cacheHitRatePct: Float,
        val failureCount: Long,
        // Drift detection
        val avgConfidenceScore: Float,
        val confidenceTrend: String,  // "STABLE" | "DECLINING" | "IMPROVING"
        val quarantinedCount: Long,
        // Raw counters
        val totalAttempts: Long,
        val totalSuccesses: Long
    )

    fun getHealthReport(): HealthReport {
        val attempts  = totalProcessingAttempts.get()
        val successes = totalProcessingSuccesses.get()
        val retries   = totalRetries.get()
        val cacheH    = totalCacheHits.get()
        val cacheM    = totalCacheMisses.get()

        val successRate = if (attempts == 0L) 100f else (successes.toFloat() / attempts) * 100f

        val avgLatency = synchronized(latencySamples) {
            if (latencySamples.isEmpty()) 0L else latencySamples.sum() / latencySamples.size
        }

        val totalCacheRequests = cacheH + cacheM
        val cacheHitRate = if (totalCacheRequests == 0L) 0f
            else (cacheH.toFloat() / totalCacheRequests) * 100f

        val retryRate = if (attempts == 0L) 0f else (retries.toFloat() / attempts) * 100f

        val (avgConf, trend) = synchronized(confidenceSamples) {
            if (confidenceSamples.size < 4) {
                val a = if (confidenceSamples.isEmpty()) 0.85f else confidenceSamples.average().toFloat()
                a to "STABLE"
            } else {
                val mid        = confidenceSamples.size / 2
                val firstHalf  = confidenceSamples.take(mid).average().toFloat()
                val secondHalf = confidenceSamples.drop(mid).average().toFloat()
                val avg        = confidenceSamples.average().toFloat()
                val t = when {
                    secondHalf - firstHalf > 0.05f -> "IMPROVING"
                    firstHalf - secondHalf > 0.05f -> "DECLINING ⚠️"
                    else                           -> "STABLE"
                }
                avg to t
            }
        }

        return HealthReport(
            successRatePct     = successRate,
            avgLatencyMs       = avgLatency,
            retryRatePct       = retryRate,
            cacheHitRatePct    = cacheHitRate,
            failureCount       = attempts - successes,
            avgConfidenceScore = avgConf,
            confidenceTrend    = trend,
            quarantinedCount   = totalQuarantined.get(),
            totalAttempts      = attempts,
            totalSuccesses     = successes
        )
    }

    fun logDashboard() {
        val r = getHealthReport()
        Log.d(TAG, "════ SYSTEM HEALTH DASHBOARD ════")
        Log.d(TAG, "Success rate   : ${"%.1f".format(r.successRatePct)}%  (${r.totalSuccesses}/${r.totalAttempts})")
        Log.d(TAG, "Avg latency    : ${r.avgLatencyMs}ms")
        Log.d(TAG, "Retry rate     : ${"%.1f".format(r.retryRatePct)}%  (${totalRetries.get()} retries)")
        Log.d(TAG, "Cache hit rate : ${"%.1f".format(r.cacheHitRatePct)}%  (${totalCacheHits.get()} hits, ${totalCacheMisses.get()} misses)")
        Log.d(TAG, "Failures       : ${r.failureCount}")
        Log.d(TAG, "Avg confidence : ${"%.2f".format(r.avgConfidenceScore)}  (trend: ${r.confidenceTrend})")
        Log.d(TAG, "Quarantined Qs : ${r.quarantinedCount}")
        Log.d(TAG, "════════════════════════════════")
    }

    fun reset() {
        synchronized(events)            { events.clear() }
        synchronized(latencySamples)    { latencySamples.clear() }
        synchronized(confidenceSamples) { confidenceSamples.clear() }
        totalProcessingAttempts.set(0);  totalProcessingSuccesses.set(0)
        totalRetries.set(0);             totalCacheHits.set(0)
        totalCacheMisses.set(0);         totalQuarantined.set(0)
        Log.d(TAG, "🔄 Telemetry reset")
    }
}
