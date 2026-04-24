package com.shiva.magics.util

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentLinkedDeque
import kotlin.random.Random

/**
 * Gap #4: No queue system | Gap #5: Timeout failures
 * Gap #6: No retry mechanism | Gap #14: No rate limiting
 *
 * RISK FIXES applied:
 *  Risk 1 — Deadlock: lock is NEVER held during coroutine suspension (delay)
 *  Risk 3 — Retry storm: ±25% jitter added to exponential backoff
 */
object RateLimiter {

    private const val TAG = "RateLimiter"

    // ── Token bucket ────────────────────────────────────────────────────────
    private const val MAX_TOKENS = 5
    private const val REFILL_INTERVAL_MS = 12_000L  // 5 req/min
    private const val SESSION_MAX_REQUESTS = 20

    @Volatile private var tokens = MAX_TOKENS
    @Volatile private var lastRefillTime = System.currentTimeMillis()
    @Volatile private var sessionRequestCount = 0
    private val mutex = Mutex()

    // ── Queue ───────────────────────────────────────────────────────────────
    data class QueuedRequest(val id: String, val enqueuedAt: Long = System.currentTimeMillis())
    private val queue = ConcurrentLinkedDeque<QueuedRequest>()
    const val MAX_QUEUE_SIZE = 10

    // ── Retry config ────────────────────────────────────────────────────────
    const val MAX_RETRIES = 3
    const val BASE_DELAY_MS = 2_000L
    const val MAX_DELAY_MS = 30_000L
    const val TIMEOUT_MS = 60_000L

    /**
     * Acquire a rate-limit token. Suspends until one is available.
     * Risk 1: Mutex is RELEASED before any delay() call — cannot deadlock.
     * Returns false if session cap or queue cap is exceeded.
     */
    suspend fun acquire(requestId: String = "req"): Boolean {
        // Fast path — no suspension needed
        val fastAcquired = mutex.withLock {
            refillTokens()
            when {
                sessionRequestCount >= SESSION_MAX_REQUESTS -> {
                    Log.w(TAG, "Session cap reached. Rejecting '$requestId'.")
                    false
                }
                tokens > 0 -> {
                    tokens--; sessionRequestCount++
                    Log.d(TAG, "✅ Fast-acquired '$requestId'. tokens=$tokens session=$sessionRequestCount")
                    true
                }
                queue.size >= MAX_QUEUE_SIZE -> {
                    Log.w(TAG, "Queue full. Dropping '$requestId'.")
                    false
                }
                else -> null  // must wait
            }
        }
        if (fastAcquired != null) return fastAcquired

        // Slow path — queue and wait, mutex is NOT held during delay (Risk 1 fix)
        val qr = QueuedRequest(requestId)
        queue.add(qr)
        Log.d(TAG, "⏳ Enqueued '$requestId' (queue=${queue.size})")
        try {
            while (true) {
                val waitMs = mutex.withLock {
                    refillTokens()
                    REFILL_INTERVAL_MS - (System.currentTimeMillis() - lastRefillTime)
                }
                // >>> Mutex is NOT held here during suspension <<<
                if (waitMs > 0) kotlinx.coroutines.delay(waitMs)

                val acquired = mutex.withLock {
                    refillTokens()
                    if (tokens > 0 && sessionRequestCount < SESSION_MAX_REQUESTS) {
                        tokens--; sessionRequestCount++; true
                    } else false
                }
                if (acquired) {
                    queue.remove(qr)
                    Log.d(TAG, "✅ Dequeued '$requestId'. tokens=$tokens")
                    return true
                }
            }
        } catch (e: CancellationException) {
            // Risk 1: Always free the queue slot on coroutine cancellation
            queue.remove(qr)
            Log.w(TAG, "🚫 '$requestId' cancelled — queue slot released")
            throw e
        }
    }

    /** Call on sign-out or new session start */
    fun resetSession() {
        sessionRequestCount = 0; tokens = MAX_TOKENS; queue.clear()
        Log.d(TAG, "🔄 RateLimiter reset")
    }

    private fun refillTokens() {
        val now = System.currentTimeMillis()
        val add = ((now - lastRefillTime) / REFILL_INTERVAL_MS).toInt()
        if (add > 0) { tokens = minOf(MAX_TOKENS, tokens + add); lastRefillTime = now }
    }

    /**
     * Retry wrapper: exponential backoff + ±25% jitter (Risk 3) + 60s timeout (Gap #5).
     *
     * Jitter prevents all failed requests from retrying simultaneously
     * (the "thundering herd" / retry storm problem).
     */
    suspend fun <T> withRetry(
        operationName: String,
        maxRetries: Int = MAX_RETRIES,
        block: suspend () -> Result<T>
    ): Result<T> {
        var baseDelayMs = BASE_DELAY_MS
        var lastError: Throwable? = null

        repeat(maxRetries + 1) { attempt ->
            try {
                val result = kotlinx.coroutines.withTimeout(TIMEOUT_MS) { block() }
                if (result.isSuccess) {
                    if (attempt > 0) Log.d(TAG, "✅ '$operationName' OK on attempt ${attempt + 1}")
                    return result
                }
                lastError = result.exceptionOrNull()
                val msg = lastError?.message ?: ""
                Log.w(TAG, "⚠️ '$operationName' attempt ${attempt + 1}: $msg")
                if (!isTransientError(msg)) { Log.e(TAG, "💥 Non-transient, aborting"); return result }
            } catch (e: CancellationException) {
                throw e  // Never swallow coroutine cancellation
            } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
                lastError = e
                Log.w(TAG, "⏰ '$operationName' timed out (attempt ${attempt + 1})")
            } catch (e: Exception) {
                lastError = e
                Log.w(TAG, "💥 '$operationName' threw (attempt ${attempt + 1}): ${e.message}")
                if (!isTransientError(e.message ?: "")) return Result.failure(e)
            }

            if (attempt < maxRetries) {
                // Risk 3: Jitter ±25% — spreads retries across a time window
                val jitter = Random.nextDouble(0.75, 1.25)
                val delay = (baseDelayMs * jitter).toLong()
                Log.d(TAG, "⏳ '$operationName' retry in ${delay}ms (base=${baseDelayMs}ms, j=${"%.2f".format(jitter)})")
                kotlinx.coroutines.delay(delay)
                baseDelayMs = minOf(baseDelayMs * 2, MAX_DELAY_MS)
            }
        }

        return Result.failure(lastError ?: Exception("$operationName: all $maxRetries retries exhausted"))
    }

    private fun isTransientError(msg: String): Boolean {
        val l = msg.lowercase()
        return l.contains("429") || l.contains("timeout") || l.contains("503") ||
               l.contains("502") || l.contains("socket") || l.contains("connect")
    }
}
