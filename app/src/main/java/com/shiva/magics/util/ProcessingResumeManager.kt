package com.shiva.magics.util

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Mentor Feature #1: Processing Resume System
 *
 * Persists chunk-processing progress to disk so if the app crashes mid-way
 * through a 50-page PDF, it resumes from the last completed chunk rather
 * than restarting from scratch.
 *
 * State machine: PENDING → IN_PROGRESS → per-chunk DONE → COMPLETE / FAILED
 */
object ProcessingResumeManager {

    private const val TAG = "ResumeManager"
    private const val PREFS_FILE = "mock_ai_resume_state"
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    enum class JobStatus { PENDING, IN_PROGRESS, COMPLETE, FAILED }

    @kotlinx.serialization.Serializable
    data class ChunkState(
        val chunkIndex: Int,
        val pageStart: Int,
        val pageEnd: Int,
        val isDone: Boolean = false,
        val questionCount: Int = 0,
        val cachedResultKey: String = ""  // Cache key for already-processed chunks
    )

    @kotlinx.serialization.Serializable
    data class ProcessingJob(
        val jobId: String,
        val fileName: String,
        val totalChunks: Int,
        val contentCacheKey: String,        // Used to look up full content in ResultCache
        val chunks: List<ChunkState>,
        val status: JobStatus = JobStatus.PENDING,
        val createdAt: Long = System.currentTimeMillis(),
        val lastUpdatedAt: Long = System.currentTimeMillis()
    ) {
        val nextPendingChunk: ChunkState?
            get() = chunks.firstOrNull { !it.isDone }

        val completedChunks: List<ChunkState>
            get() = chunks.filter { it.isDone }

        val progressPercent: Int
            get() = if (totalChunks == 0) 0
                    else (completedChunks.size * 100) / totalChunks

        val isComplete: Boolean get() = status == JobStatus.COMPLETE
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /** Create and persist a new processing job */
    suspend fun createJob(
        context: Context,
        fileName: String,
        totalChunks: Int,
        contentCacheKey: String,
        pageRanges: List<IntRange>
    ): ProcessingJob = withContext(Dispatchers.IO) {
        val jobId = "job_${System.currentTimeMillis()}_${fileName.take(10).replace(" ", "_")}"
        val chunks = pageRanges.mapIndexed { i, range ->
            ChunkState(i, range.first, range.last)
        }
        val job = ProcessingJob(jobId, fileName, totalChunks, contentCacheKey, chunks)
        saveJob(context, job)
        Log.d(TAG, "📋 Created job $jobId for '$fileName' ($totalChunks chunks)")
        job
    }

    /** Mark a chunk as complete and save progress */
    suspend fun markChunkDone(
        context: Context,
        job: ProcessingJob,
        chunkIndex: Int,
        questionCount: Int,
        resultCacheKey: String = ""
    ): ProcessingJob = withContext(Dispatchers.IO) {
        val updatedChunks = job.chunks.map { c ->
            if (c.chunkIndex == chunkIndex) c.copy(isDone = true, questionCount = questionCount, cachedResultKey = resultCacheKey)
            else c
        }
        val allDone = updatedChunks.all { it.isDone }
        val updated = job.copy(
            chunks = updatedChunks,
            status = if (allDone) JobStatus.COMPLETE else JobStatus.IN_PROGRESS,
            lastUpdatedAt = System.currentTimeMillis()
        )
        saveJob(context, updated)
        Log.d(TAG, "✅ Chunk $chunkIndex done (${updated.progressPercent}% complete)")
        updated
    }

    /** Mark job as failed with optional error detail */
    suspend fun markFailed(context: Context, job: ProcessingJob): ProcessingJob =
        withContext(Dispatchers.IO) {
            val updated = job.copy(status = JobStatus.FAILED, lastUpdatedAt = System.currentTimeMillis())
            saveJob(context, updated)
            Log.e(TAG, "❌ Job ${job.jobId} marked FAILED at chunk ${job.completedChunks.size}/${job.totalChunks}")
            updated
        }

    /** Load a saved job by ID — returns null if not found or expired (>24h) */
    suspend fun loadJob(context: Context, jobId: String): ProcessingJob? =
        withContext(Dispatchers.IO) {
            try {
                val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
                val raw = prefs.getString(jobId, null) ?: return@withContext null
                val job = json.decodeFromString<ProcessingJob>(raw)
                // Expire jobs older than 24 hours
                val ageMs = System.currentTimeMillis() - job.createdAt
                if (ageMs > 24 * 60 * 60 * 1000L) {
                    deleteJob(context, jobId)
                    return@withContext null
                }
                Log.d(TAG, "📂 Loaded job ${job.jobId} (${job.progressPercent}% complete, ${job.status})")
                job
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load job $jobId: ${e.message}")
                null
            }
        }

    /** Get the most recent incomplete job for a file name, if any */
    suspend fun findResumableJob(context: Context, fileName: String): ProcessingJob? =
        withContext(Dispatchers.IO) {
            try {
                val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
                prefs.all.values
                    .filterIsInstance<String>()
                    .mapNotNull { runCatching { json.decodeFromString<ProcessingJob>(it) }.getOrNull() }
                    .filter { it.fileName == fileName && it.status == JobStatus.IN_PROGRESS }
                    .maxByOrNull { it.lastUpdatedAt }
                    ?.also { Log.d(TAG, "🔁 Found resumable job ${it.jobId} at ${it.progressPercent}%") }
            } catch (e: Exception) {
                null
            }
        }

    fun deleteJob(context: Context, jobId: String) {
        context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE).edit().remove(jobId).apply()
        Log.d(TAG, "🗑 Deleted job $jobId")
    }

    fun cleanupOldJobs(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
        val cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L
        val toDelete = prefs.all.entries
            .filter { (_, v) ->
                if (v !is String) return@filter true
                runCatching { json.decodeFromString<ProcessingJob>(v).createdAt < cutoff }.getOrDefault(true)
            }
            .map { it.key }
        if (toDelete.isNotEmpty()) {
            prefs.edit().apply { toDelete.forEach { remove(it) } }.apply()
            Log.d(TAG, "🗑 Cleaned up ${toDelete.size} expired jobs")
        }
    }

    private fun saveJob(context: Context, job: ProcessingJob) {
        val encoded = json.encodeToString(job)
        context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
            .edit().putString(job.jobId, encoded).apply()
    }
}
