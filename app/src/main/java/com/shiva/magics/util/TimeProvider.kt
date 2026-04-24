package com.shiva.magics.util

/**
 * Interface to provide clock time, allowing for deterministic testing of temporal components.
 */
interface TimeProvider {
    fun currentTimeMillis(): Long
    fun elapsedRealtime(): Long
}

object DefaultTimeProvider : TimeProvider {
    override fun currentTimeMillis() = System.currentTimeMillis()
    override fun elapsedRealtime() = android.os.SystemClock.elapsedRealtime()
}
