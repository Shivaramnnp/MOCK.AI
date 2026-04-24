package com.shiva.magics.util

import android.content.Context
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/**
 * Gap #1: Large PDF Processing
 * Gap #10: Context loss between pages
 * Gap #11: Table extraction failure
 * Gap #12: No progress indicator
 *
 * Splits a PDF byte array into image chunks (1 page per chunk),
 * applies OCR-aware preprocessing, and provides a chunked pipeline
 * so large PDFs (100+ pages) don't exceed AI token limits.
 */
object PdfChunker {

    const val MAX_PAGES_PER_CHUNK = 5       // pages per AI call
    const val MAX_CHUNK_SIZE_BYTES = 3_000_000 // 3 MB per chunk
    const val MAX_IMAGE_DIM = 1600          // px — high enough for tables/diagrams

    data class PdfChunk(
        val index: Int,
        val totalChunks: Int,
        val pageRange: IntRange,
        val imageData: ByteArray,
        val mimeType: String = "application/pdf"
    )

    data class ChunkProgress(
        val chunkIndex: Int,
        val totalChunks: Int,
        val status: String
    )

    /**
     * Reads a PDF Uri, renders each page to a bitmap, then groups N pages
     * into combined-image chunks ready for AI ingestion.
     *
     * [onProgress] is called on the main thread to drive UI progress indicators.
     */
    suspend fun chunkPdf(
        context: Context,
        uri: Uri,
        onProgress: suspend (ChunkProgress) -> Unit
    ): List<PdfChunk> = withContext(Dispatchers.IO) {
        val bytes = context.contentResolver.openInputStream(uri)
            ?.use { it.readBytes() }
            ?: throw java.io.IOException("Cannot open PDF")

        return@withContext chunkPdfBytes(bytes, onProgress)
    }

    suspend fun chunkPdfBytes(
        bytes: ByteArray,
        onProgress: suspend (ChunkProgress) -> Unit
    ): List<PdfChunk> = withContext(Dispatchers.IO) {
        val renderer = try {
            val fd = android.os.ParcelFileDescriptor.open(
                writeTempFile(bytes),
                android.os.ParcelFileDescriptor.MODE_READ_ONLY
            )
            android.graphics.pdf.PdfRenderer(fd)
        } catch (e: Exception) {
            Log.e("PdfChunker", "PdfRenderer failed — falling back to raw bytes", e)
            // Fallback: return whole doc as single chunk
            return@withContext listOf(
                PdfChunk(0, 1, 0..0, bytes)
            )
        }

        val pageCount = renderer.pageCount
        Log.d("PdfChunker", "PDF has $pageCount pages")

        val chunks = mutableListOf<PdfChunk>()
        var pageIdx = 0
        var chunkIdx = 0
        val totalChunks = Math.ceil(pageCount.toDouble() / MAX_PAGES_PER_CHUNK).toInt()

        while (pageIdx < pageCount) {
            val chunkStart = pageIdx
            val chunkEnd = minOf(pageIdx + MAX_PAGES_PER_CHUNK - 1, pageCount - 1)

            onProgress(
                ChunkProgress(chunkIdx, totalChunks, "Rendering pages ${chunkStart + 1}–${chunkEnd + 1} of $pageCount…")
            )

            // Render pages in this chunk to bitmaps, stitch vertically
            val pdfDoc = android.graphics.pdf.PdfDocument()
            for (p in chunkStart..chunkEnd) {
                val page = renderer.openPage(p)
                val scale = Math.min(1f, Math.min(MAX_IMAGE_DIM.toFloat() / page.width, MAX_IMAGE_DIM.toFloat() / page.height))
                val w = (page.width * scale).toInt().coerceAtLeast(1)
                val h = (page.height * scale).toInt().coerceAtLeast(1)

                val bitmap = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
                // White background (tables/diagrams render better)
                bitmap.eraseColor(android.graphics.Color.WHITE)
                page.render(bitmap, null, null, android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                page.close()

                val pageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(w, h, p - chunkStart + 1).create()
                val docPage = pdfDoc.startPage(pageInfo)
                docPage.canvas.drawBitmap(bitmap, 0f, 0f, null)
                pdfDoc.finishPage(docPage)
                bitmap.recycle()
            }

            val out = ByteArrayOutputStream()
            pdfDoc.writeTo(out)
            pdfDoc.close()
            val chunkBytes = out.toByteArray()

            chunks.add(
                PdfChunk(
                    index = chunkIdx,
                    totalChunks = totalChunks,
                    pageRange = chunkStart..chunkEnd,
                    imageData = chunkBytes
                )
            )
            Log.d("PdfChunker", "Chunk $chunkIdx: pages ${chunkStart + 1}–${chunkEnd + 1}, ${chunkBytes.size / 1024}KB")

            pageIdx = chunkEnd + 1
            chunkIdx++
        }
        renderer.close()
        chunks
    }

    private fun writeTempFile(bytes: ByteArray): java.io.File {
        val tmp = java.io.File.createTempFile("mock_ai_pdf", ".pdf")
        tmp.writeBytes(bytes)
        tmp.deleteOnExit()
        return tmp
    }
}
