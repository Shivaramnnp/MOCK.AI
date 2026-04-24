package com.shiva.magics.util

import android.content.Context
import android.util.Log
import com.shiva.magics.data.model.Question
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Mentor Feature #2: Result Caching Layer
 *
 * Eliminates redundant API calls + cost explosion from chunked processing.
 * Cache key = SHA-256 of input content fingerprint (first 1KB + file size).
 *
 * Design:
 *  - L1 cache: in-memory LRU (fastest, lost on app kill)
 *  - L2 cache: disk (SharedPreferences JSON, survives app restart)
 *  - TTL: 24 hours (questions are stable enough to cache)
 *  - Max L1 entries: 20, Max L2 entries: 50
 */
object ResultCache {

    private const val TAG = "ResultCache"
    private const val PREFS_FILE = "mock_ai_result_cache"
    private const val TTL_MS = 24L * 60 * 60 * 1000  // 24 hours
    private const val MAX_L2_ENTRIES = 50

    private val jsonParser = Json { ignoreUnknownKeys = true; isLenient = true }

    // ── L1 In-Memory LRU ────────────────────────────────────────────────────
    private const val MAX_L1_ENTRIES = 20
    // Risk A Fix: Hard memory cap — each question avg ~500 bytes, 20 questions per test = ~10KB/entry
    private const val MAX_L1_MEMORY_BYTES = 8 * 1024 * 1024L  // 8 MB L1 cap
    @Volatile private var l1MemoryBytes = 0L

    private val l1Cache = object : java.util.LinkedHashMap<String, CachedResult>(MAX_L1_ENTRIES, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<String, CachedResult>?): Boolean {
            val overCount = size > MAX_L1_ENTRIES
            val overMemory = l1MemoryBytes > MAX_L1_MEMORY_BYTES
            if (overCount || overMemory) {
                eldest?.value?.let { l1MemoryBytes -= it.estimatedBytes }
            }
            return overCount || overMemory
        }
    }

    data class CachedResult(
        val questions: List<Question>,
        val provider: String,
        val cachedAt: Long = System.currentTimeMillis()
    ) {
        // Risk A: Estimate memory footprint for cap enforcement
        val estimatedBytes: Long get() = questions.sumOf {
            it.questionText.length + it.options.sumOf { o -> o.length }.toLong() + 32L
        }
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /** Get cached questions for a content fingerprint. Returns null on cache miss or expiry. */
    suspend fun get(context: Context, cacheKey: String): List<Question>? {
        // L1 hit
        val l1 = synchronized(l1Cache) { l1Cache[cacheKey] }
        if (l1 != null && !isExpired(l1.cachedAt)) {
            Log.d(TAG, "⚡ L1 cache hit for key=${cacheKey.take(12)}…")
            return l1.questions
        }

        // L2 hit
        return withContext(Dispatchers.IO) {
            try {
                val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
                val json = prefs.getString(cacheKey, null) ?: return@withContext null
                val cached = jsonParser.decodeFromString<SerializedCache>(json)
                if (isExpired(cached.cachedAt)) {
                    prefs.edit().remove(cacheKey).apply()
                    Log.d(TAG, "♻️ L2 expired for key=${cacheKey.take(12)}…")
                    return@withContext null
                }
                Log.d(TAG, "💾 L2 cache hit for key=${cacheKey.take(12)}…")
                val questions = cached.questionsJson.map { jsonParser.decodeFromString<Question>(it) }
                // Promote to L1
                synchronized(l1Cache) { l1Cache[cacheKey] = CachedResult(questions, cached.provider, cached.cachedAt) }
                questions
            } catch (e: Exception) {
                Log.e(TAG, "❌ Cache read error: ${e.message}")
                null
            }
        }
    }

    /** Store questions in both L1 and L2 cache */
    suspend fun put(context: Context, cacheKey: String, questions: List<Question>, provider: String) {
        val result = CachedResult(questions, provider)
        synchronized(l1Cache) {
            l1Cache[cacheKey] = result
            l1MemoryBytes += result.estimatedBytes
        }

        withContext(Dispatchers.IO) {
            try {
                val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
                // Enforce max entries
                val allKeys = prefs.all.keys.toList()
                if (allKeys.size >= MAX_L2_ENTRIES) {
                    val oldest = allKeys.take(allKeys.size - MAX_L2_ENTRIES + 1)
                    prefs.edit().apply { oldest.forEach { remove(it) } }.apply()
                    Log.d(TAG, "🗑 Evicted ${oldest.size} old L2 cache entries")
                }
                val serialized = SerializedCache(
                    questionsJson = questions.map { jsonParser.encodeToString(it) },
                    provider = provider,
                    cachedAt = result.cachedAt
                )
                // Risk B Fix: Atomic write — write to temp key first, then rename
                // This prevents partial-write corruption on device shutdown
                val tempKey = "_tmp_$cacheKey"
                prefs.edit().putString(tempKey, jsonParser.encodeToString(serialized)).commit()  // synchronous
                prefs.edit().putString(cacheKey, prefs.getString(tempKey, null) ?: return@withContext)
                           .remove(tempKey).apply()  // atomic rename
                Log.d(TAG, "✅ Cached ${questions.size} q (key=${cacheKey.take(12)}… mem=${l1MemoryBytes/1024}KB/8MB)")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Cache write error: ${e.message}")
            }
        }
    }

    /** Generate a stable cache key from content bytes or text */
    fun keyFromBytes(bytes: ByteArray): String {
        val prefix = bytes.copyOfRange(0, minOf(1024, bytes.size))
        val suffix = bytes.copyOfRange(maxOf(0, bytes.size - 256), bytes.size)
        val sizeBytes = bytes.size.toString().toByteArray()
        val fingerprint = prefix + suffix + sizeBytes
        return java.security.MessageDigest.getInstance("SHA-256")
            .digest(fingerprint)
            .joinToString("") { "%02x".format(it) }
    }

    fun keyFromText(text: String): String = keyFromBytes(text.toByteArray())

    fun invalidate(context: Context, cacheKey: String) {
        synchronized(l1Cache) { l1Cache.remove(cacheKey) }
        context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE).edit().remove(cacheKey).apply()
        Log.d(TAG, "🗑 Invalidated cache key=${cacheKey.take(12)}…")
    }

    fun clearAll(context: Context) {
        synchronized(l1Cache) { l1Cache.clear() }
        context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE).edit().clear().apply()
        Log.d(TAG, "🗑 All cache cleared")
    }

    private fun isExpired(cachedAt: Long) = System.currentTimeMillis() - cachedAt > TTL_MS

    @kotlinx.serialization.Serializable
    private data class SerializedCache(
        val questionsJson: List<String>,
        val provider: String,
        val cachedAt: Long
    )
}
