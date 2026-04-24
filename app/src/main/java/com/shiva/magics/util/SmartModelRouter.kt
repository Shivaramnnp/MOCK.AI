package com.shiva.magics.util

import android.util.Log

/**
 * Mentor Feature #5: Smart Model Router
 *
 * Routes AI requests to the best available provider based on:
 *  - Historical latency (rolling avg per provider)
 *  - Historical failure rate (rolling window)
 *  - Content type suitability (vision vs text-only)
 *  - Current provider health (circuit breaker)
 *
 * Implements the Circuit Breaker pattern:
 *  CLOSED (healthy) → OPEN (failing) → HALF_OPEN (probing) → CLOSED
 */
object SmartModelRouter {

    private const val TAG = "ModelRouter"
    private const val WINDOW_SIZE = 10
    private const val FAILURE_THRESHOLD = 0.6f
    private const val CIRCUIT_RESET_MS = 60_000L       // Time before re-probing
    // Risk C Fix: Minimum time circuit stays OPEN before allowing HALF_OPEN probe
    private const val MIN_OPEN_DURATION_MS = 30_000L   // 30 seconds minimum
    // Consecutive successes needed in HALF_OPEN to close circuit (prevents flap)
    private const val HALF_OPEN_SUCCESS_THRESHOLD = 2

    // ── Provider registry ────────────────────────────────────────────────────

    enum class Provider(
        val id: String,
        val supportsVision: Boolean,
        val baseCostPerRequest: Float  // Relative cost (1.0 = baseline)
    ) {
        GEMINI_FLASH("gemini_flash", supportsVision = true, baseCostPerRequest = 1.0f),
        GROQ_LLAMA("groq_llama", supportsVision = false, baseCostPerRequest = 0.3f),
        GEMINI_FLASH_LITE("gemini_flash_lite", supportsVision = true, baseCostPerRequest = 0.5f)
    }

    enum class CircuitState { CLOSED, OPEN, HALF_OPEN }

    data class ProviderStats(
        val provider: Provider,
        val latencyHistory: ArrayDeque<Long> = ArrayDeque(WINDOW_SIZE),
        val resultHistory: ArrayDeque<Boolean> = ArrayDeque(WINDOW_SIZE),
        var circuitState: CircuitState = CircuitState.CLOSED,
        var circuitOpenedAt: Long = 0L,
        // Risk C: Track consecutive half-open successes before closing
        var halfOpenSuccessCount: Int = 0,
        var totalRequests: Long = 0L,
        var totalSuccesses: Long = 0L,
        var totalFailures: Long = 0L,
        var totalLatencyMs: Long = 0L
    ) {
        val avgLatencyMs: Long get() = if (latencyHistory.isEmpty()) 5000L
            else latencyHistory.sum() / latencyHistory.size

        val recentFailureRate: Float get() = if (resultHistory.isEmpty()) 0f
            else resultHistory.count { !it }.toFloat() / resultHistory.size

        val lifetime_successRate: Float get() = if (totalRequests == 0L) 1f
            else totalSuccesses.toFloat() / totalRequests

        fun isHealthy(): Boolean = when (circuitState) {
            CircuitState.CLOSED -> true
            CircuitState.OPEN -> {
                val elapsed = System.currentTimeMillis() - circuitOpenedAt
                // Risk C: Must wait BOTH reset + minimum duration before probe
                val canProbe = elapsed >= CIRCUIT_RESET_MS && elapsed >= MIN_OPEN_DURATION_MS
                if (canProbe && circuitState == CircuitState.OPEN) {
                    circuitState = CircuitState.HALF_OPEN
                    halfOpenSuccessCount = 0
                    Log.d(TAG, "🟡 ${provider.id}: OPEN → HALF_OPEN (elapsed=${elapsed/1000}s)")
                }
                canProbe
            }
            CircuitState.HALF_OPEN -> true  // Allow probes
        }

        fun score(hasImageData: Boolean): Float {
            if (!provider.supportsVision && hasImageData) return -1f  // Cannot handle
            if (!isHealthy()) return -1f  // Circuit open
            // Lower latency = higher score, lower failure = higher score, lower cost = higher score
            val latencyScore = 1f - (avgLatencyMs.toFloat() / 30_000f).coerceIn(0f, 1f)
            val reliabilityScore = 1f - recentFailureRate
            val costScore = 1f - provider.baseCostPerRequest.coerceIn(0f, 1f)
            return (latencyScore * 0.35f) + (reliabilityScore * 0.50f) + (costScore * 0.15f)
        }
    }

    // ── State ────────────────────────────────────────────────────────────────
    private val stats = Provider.entries.associateWith { ProviderStats(it) }.toMutableMap()

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Recommend the best provider order for a given request type.
     * Returns providers sorted by score (highest first), skipping unavailable ones.
     */
    fun recommend(
        hasImageData: Boolean,
        preferredProviderId: String = "auto"
    ): List<Provider> {
        // Respect explicit user preference if provider is healthy
        if (preferredProviderId != "auto") {
            val preferred = Provider.entries.firstOrNull { it.id == preferredProviderId }
            if (preferred != null && stats[preferred]?.isHealthy() == true) {
                val others = Provider.entries
                    .filter { it != preferred && (stats[it]?.isHealthy() == true) }
                    .sortedByDescending { stats[it]?.score(hasImageData) ?: -1f }
                Log.d(TAG, "👤 User preference: $preferredProviderId → [${(listOf(preferred) + others).joinToString { it.id }}]")
                return listOf(preferred) + others
            }
        }

        val ordered = Provider.entries
            .map { p -> p to (stats[p]?.score(hasImageData) ?: -1f) }
            .filter { (_, score) -> score >= 0f }
            .sortedByDescending { (_, score) -> score }
            .map { (p, _) -> p }

        Log.d(TAG, "🤖 Smart route (vision=$hasImageData): [${ordered.joinToString { it.id }}]")
        ordered.forEach { p ->
            val s = stats[p]
            Log.d(TAG, "   ${p.id}: score=${"%.2f".format(s?.score(hasImageData))} latency=${s?.avgLatencyMs}ms failRate=${"%.0f".format((s?.recentFailureRate ?: 0f) * 100)}% circuit=${s?.circuitState}")
        }
        return ordered
    }

    /** Record a successful request for a provider (updates stats + circuit) */
    fun recordSuccess(provider: Provider, latencyMs: Long) {
        val s = stats[provider] ?: return
        s.latencyHistory.addLast(latencyMs); if (s.latencyHistory.size > WINDOW_SIZE) s.latencyHistory.removeFirst()
        s.resultHistory.addLast(true); if (s.resultHistory.size > WINDOW_SIZE) s.resultHistory.removeFirst()
        s.totalRequests++; s.totalSuccesses++; s.totalLatencyMs += latencyMs

        when (s.circuitState) {
            CircuitState.HALF_OPEN -> {
                s.halfOpenSuccessCount++
                if (s.halfOpenSuccessCount >= HALF_OPEN_SUCCESS_THRESHOLD) {
                    s.circuitState = CircuitState.CLOSED
                    s.halfOpenSuccessCount = 0
                    Log.d(TAG, "✅ ${provider.id}: HALF_OPEN → CLOSED after $HALF_OPEN_SUCCESS_THRESHOLD probes")
                } else {
                    Log.d(TAG, "🟡 ${provider.id}: HALF_OPEN probe ${s.halfOpenSuccessCount}/$HALF_OPEN_SUCCESS_THRESHOLD")
                }
            }
            CircuitState.OPEN -> {
                // Shouldn't happen but guard against it
                s.circuitState = CircuitState.CLOSED
            }
            CircuitState.CLOSED -> { /* normal */ }
        }
        Log.d(TAG, "✅ ${provider.id}: ${latencyMs}ms (avg=${s.avgLatencyMs}ms, window-fail=${"%.0f".format(s.recentFailureRate*100)}%)")
    }

    /** Record a failed request (may open the circuit breaker) */
    fun recordFailure(provider: Provider, errorMsg: String) {
        val s = stats[provider] ?: return
        s.latencyHistory.addLast(CIRCUIT_RESET_MS)  // Penalise latency
        if (s.latencyHistory.size > WINDOW_SIZE) s.latencyHistory.removeFirst()
        s.resultHistory.addLast(false); if (s.resultHistory.size > WINDOW_SIZE) s.resultHistory.removeFirst()
        s.totalRequests++; s.totalFailures++

        if (s.recentFailureRate >= FAILURE_THRESHOLD && s.circuitState == CircuitState.CLOSED) {
            s.circuitState = CircuitState.OPEN
            s.circuitOpenedAt = System.currentTimeMillis()
            Log.w(TAG, "🔴 ${provider.id} circuit OPEN (failRate=${"%.0f".format(s.recentFailureRate * 100)}%): $errorMsg")
        } else {
            Log.w(TAG, "⚠️ ${provider.id}: failure (failRate=${"%.0f".format(s.recentFailureRate * 100)}%): $errorMsg")
        }
    }

    /** Get a health summary for display in admin/debug screens */
    fun getHealthReport(): Map<String, Map<String, Any>> = stats.entries.associate { (p, s) ->
        p.id to mapOf(
            "circuit" to s.circuitState.name,
            "avgLatencyMs" to s.avgLatencyMs,
            "recentFailureRate" to "${"%.0f".format(s.recentFailureRate * 100)}%",
            "lifetimeSuccessRate" to "${"%.0f".format(s.lifetime_successRate * 100)}%",
            "totalRequests" to s.totalRequests
        )
    }

    /** Reset — call on app start or sign-out */
    fun reset() {
        stats.forEach { (_, s) ->
            s.latencyHistory.clear(); s.resultHistory.clear()
            s.circuitState = CircuitState.CLOSED; s.totalRequests = 0L
            s.totalSuccesses = 0L; s.totalFailures = 0L; s.totalLatencyMs = 0L
        }
        Log.d(TAG, "🔄 SmartModelRouter reset")
    }
}
