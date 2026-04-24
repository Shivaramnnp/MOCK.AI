package com.shiva.magics.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.security.MessageDigest

@Serializable
data class SourceLocation(
    val pageNumber: Int? = null,
    val timestamp: String? = null
)

@Serializable
data class IndexedChunk(
    val location: SourceLocation,
    val rawText: String,
    val normalizedText: String,
    val tokenCount: Int
)

data class TranscriptSegment(
    val startTimestamp: String,
    val text: String
)

interface SourceIndexer {
    suspend fun indexPdf(context: Context, file: File): Map<SourceLocation, IndexedChunk>
    suspend fun indexYoutubeTranscript(transcript: List<TranscriptSegment>): Map<SourceLocation, IndexedChunk>
    suspend fun getOrCreateIndex(
        cacheDir: File,
        sourceHash: String,
        generator: suspend () -> Map<SourceLocation, IndexedChunk>
    ): Map<SourceLocation, IndexedChunk>
}

object SourceIndexerImpl : SourceIndexer {

    private const val TAG = "SourceIndexer"
    const val INDEX_VERSION = 1
    
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun indexPdf(context: Context, file: File): Map<SourceLocation, IndexedChunk> = withContext(Dispatchers.IO) {
        val result = mutableMapOf<SourceLocation, IndexedChunk>()
        var fd: ParcelFileDescriptor? = null
        var renderer: PdfRenderer? = null
        
        try {
            fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            renderer = PdfRenderer(fd)
            val pageCount = renderer.pageCount
            Log.d(TAG, "Indexing PDF with $pageCount pages...")
            
            val t0 = System.currentTimeMillis()
            var totalTokens = 0
            
            // To ensure safety, initialize the text recognizer only when needed
            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

            for (i in 0 until pageCount) {
                var page: PdfRenderer.Page? = null
                var bitmap: Bitmap? = null
                try {
                    page = renderer.openPage(i)
                    // Keep scale small enough to prevent OOM but large enough for ML Kit
                    val scale = Math.min(1f, 1000f / Math.max(page.width, page.height))
                    val w = (page.width * scale).toInt().coerceAtLeast(1)
                    val h = (page.height * scale).toInt().coerceAtLeast(1)
                    
                    bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    
                    val image = InputImage.fromBitmap(bitmap, 0)
                    val text = recognizer.process(image).await().text
                    
                    if (text.isNotBlank()) {
                        val normalized = normalizeText(text)
                        val tokenCount = estimateTokens(normalized)
                        totalTokens += tokenCount
                        
                        val loc = SourceLocation(pageNumber = i + 1)
                        result[loc] = IndexedChunk(
                            location = loc,
                            rawText = text,
                            normalizedText = normalized,
                            tokenCount = tokenCount
                        )
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to index page ${i+1}, skipping", e)
                } finally {
                    page?.close()
                    bitmap?.recycle()
                }
            }
            
            val duration = System.currentTimeMillis() - t0
            Log.d(TAG, "✅ Indexed $pageCount pages in ${duration}ms. Elements: ${result.size}, Tokens: $totalTokens")
            
        } catch (e: Exception) {
            Log.e(TAG, "PDF indexing aborted due to unrecoverable error", e)
        } finally {
            renderer?.close()
            fd?.close()
        }
        
        result
    }

    override suspend fun indexYoutubeTranscript(transcript: List<TranscriptSegment>): Map<SourceLocation, IndexedChunk> = withContext(Dispatchers.Default) {
        val result = mutableMapOf<SourceLocation, IndexedChunk>()
        var totalTokens = 0
        for (segment in transcript) {
            if (segment.text.isNotBlank()) {
                val normalized = normalizeText(segment.text)
                val tokenCount = estimateTokens(normalized)
                totalTokens += tokenCount
                
                val loc = SourceLocation(timestamp = segment.startTimestamp)
                result[loc] = IndexedChunk(
                    location = loc,
                    rawText = segment.text,
                    normalizedText = normalized,
                    tokenCount = tokenCount
                )
            }
        }
        Log.d(TAG, "✅ Indexed ${transcript.size} YouTube segments. Tokens: $totalTokens")
        result
    }

    override suspend fun getOrCreateIndex(
        cacheDir: File,
        sourceHash: String,
        generator: suspend () -> Map<SourceLocation, IndexedChunk>
    ): Map<SourceLocation, IndexedChunk> = withContext(Dispatchers.IO) {
        val finalCacheDir = File(cacheDir, "source_indices").apply { mkdirs() }
        val cacheFile = File(finalCacheDir, "${sourceHash}_v${INDEX_VERSION}.json")
        
        if (cacheFile.exists()) {
            try {
                val t0 = System.currentTimeMillis()
                val jsonString = cacheFile.readText()
                val cachedList = json.decodeFromString<List<IndexedChunk>>(jsonString)
                val map = cachedList.associateBy { it.location }
                Log.d(TAG, "⚡ Cache hit for index $sourceHash in ${System.currentTimeMillis() - t0}ms")
                return@withContext map
            } catch (e: Exception) {
                Log.w(TAG, "Cache file corrupted, will regenerate: ${e.message}")
                cacheFile.delete()
            }
        }
        
        // Generate and save
        val newIndex = generator()
        try {
            val listToSave = newIndex.values.toList()
            val tempFile = File(cacheDir, "${sourceHash}_v${INDEX_VERSION}.tmp")
            tempFile.writeText(json.encodeToString(listToSave))
            tempFile.renameTo(cacheFile) // Atomic write pattern
            Log.d(TAG, "💾 Saved new index for $sourceHash. Size: ${cacheFile.length() / 1024}KB")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save index cache", e)
        }
        
        newIndex
    }

    /**
     * Requirement: Text Normalization Pipeline
     * Lowercases, strips punctuation, normalizes whitespace and unicode.
     */
    fun normalizeText(input: String): String {
        return input.lowercase()
            .replace(Regex("[\\p{Punct}]"), "") // Removes punctuation
            .replace(Regex("\\s+"), " ")        // Flattens whitespace
            .trim()
    }

    /**
     * Deterministic SHA-256 Hashing for cache keys
     */
    fun hashBytes(bytes: ByteArray): String {
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(bytes)
        return digest.joinToString("") { "%02x".format(it) }
    }

    /**
     * Roughly estimates GPT tokens (4 chars ~ 1 token)
     */
    private fun estimateTokens(text: String): Int {
        return Math.max(1, text.length / 4)
    }
}
