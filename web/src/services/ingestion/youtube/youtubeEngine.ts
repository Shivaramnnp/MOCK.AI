/**
 * YouTube Video Ingestion Engine
 * Master Orchestrator for YouTube Video -> Knowledge -> MCQ Pipeline.
 *
 * Pipeline Flow:
 * URL -> Validation & SSRF Check -> Metadata -> Cache Check -> Transcript Acquisition
 * -> Transcript Normalization -> Timestamp Preservation -> Semantic Chunking
 * -> Question Generation -> Transcript Grounding Validation -> Deduplication -> Canonical Package
 */

import {
  YouTubeFailureReason,
  YouTubeIngestionOptions,
  YouTubeIngestionResult,
  YouTubeSemanticChunk,
  YouTubeTranscriptResult,
  YouTubeVideoMetadata,
} from './types';
import { validateYouTubeUrl } from './urlValidator';
import { fetchYouTubeTranscript, YouTubeFetchError } from './transcriptFetcher';
import { normalizeTranscriptSegments } from './transcriptNormalizer';
import { chunkTranscript } from './transcriptChunker';
import { youtubeTranscriptCache } from './transcriptCache';
import { generateQuestionsForChunk } from './youtubeQuestionGenerator';
import { verifyQuestionAgainstTranscript } from './youtubeValidator';
import { auditBatchDuplicates } from '../topic/topicDeduplicator';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';

export interface ProcessYouTubeInput {
  url: string;
  titleHint?: string;
}

/**
 * Executes the complete YouTube Ingestion Engine pipeline.
 */
export async function processYouTubeVideo(
  input: ProcessYouTubeInput | string,
  options: YouTubeIngestionOptions = {}
): Promise<YouTubeIngestionResult> {
  const startTime = performance.now();
  const rawUrl = typeof input === 'string' ? input : input?.url;
  const titleHint = typeof input === 'object' ? input?.titleHint : undefined;
  const count = Math.max(1, Math.min(options.requestedCount || 6, 50));
  const onProgress = options.onProgress;

  // 1. URL Validation & SSRF Protection
  onProgress?.({
    stage: 'VALIDATING',
    message: 'Validating YouTube URL and verifying security constraints...',
    percentage: 10,
  });

  const urlCheck = validateYouTubeUrl(rawUrl);
  if (!urlCheck.valid || !urlCheck.videoId || !urlCheck.canonicalUrl) {
    const code: YouTubeFailureReason = urlCheck.isSsrfAttempt ? 'SSRF_BLOCKED' : 'INVALID_URL';
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      success: false,
      videoId: urlCheck.videoId || '',
      title: titleHint || 'Invalid YouTube URL',
      metadata: {
        videoId: urlCheck.videoId || '',
        title: titleHint || 'Invalid YouTube URL',
        author: 'Unknown',
        availableLanguages: [],
        captionsAvailable: false,
      },
      transcriptSummary: {
        totalDuration: 0,
        segmentCount: 0,
        chunkCount: 0,
        captionType: 'MANUAL',
        language: 'en',
        wordCount: 0,
      },
      questions: [],
      chunks: [],
      groundingFidelityScore: 0.0,
      latencyMs,
      cached: false,
      error: {
        code,
        message: urlCheck.error || 'Invalid YouTube URL format.',
      },
    };
  }

  const videoId = urlCheck.videoId;
  const canonicalUrl = urlCheck.canonicalUrl;

  // 2. Cache Lookup
  onProgress?.({
    stage: 'FETCHING_METADATA',
    message: `Checking transcript cache for video ${videoId}...`,
    percentage: 20,
  });

  let transcriptResult: YouTubeTranscriptResult | null = null;
  let fromCache = false;

  if (options.mockTranscriptResult) {
    transcriptResult = options.mockTranscriptResult;
  } else {
    // Check cache
    const cached = youtubeTranscriptCache.get(videoId);
    if (cached) {
      transcriptResult = cached;
      fromCache = true;
    }
  }

  // 3. Transcript Acquisition (if not cached)
  if (!transcriptResult) {
    onProgress?.({
      stage: 'FETCHING_TRANSCRIPT',
      message: `Acquiring official captions and transcript for video ${videoId}...`,
      percentage: 35,
    });

    try {
      transcriptResult = await fetchYouTubeTranscript(
        canonicalUrl,
        options.preferredLanguage || 'en'
      );
      // Store in cache
      youtubeTranscriptCache.set(videoId, transcriptResult.version, transcriptResult);
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      const code: YouTubeFailureReason =
        err instanceof YouTubeFetchError ? err.code : 'SOURCE_UNAVAILABLE';

      return {
        success: false,
        videoId,
        title: titleHint || `YouTube Video (${videoId})`,
        metadata: {
          videoId,
          title: titleHint || `YouTube Video (${videoId})`,
          author: 'Unknown',
          availableLanguages: [],
          captionsAvailable: false,
        },
        transcriptSummary: {
          totalDuration: 0,
          segmentCount: 0,
          chunkCount: 0,
          captionType: 'MANUAL',
          language: 'en',
          wordCount: 0,
        },
        questions: [],
        chunks: [],
        groundingFidelityScore: 0.0,
        latencyMs,
        cached: false,
        error: {
          code,
          message: err?.message || 'Failed to acquire video transcript.',
          details: err?.details,
        },
      };
    }
  }

  // 4. Transcript Normalization & Timestamp Preservation
  onProgress?.({
    stage: 'NORMALIZING',
    message: 'Normalizing speech artifacts, stripping sound effects, and aligning timestamps...',
    percentage: 50,
  });

  const normalized = normalizeTranscriptSegments(transcriptResult.segments, {
    removeSoundEffects: true,
    cleanFillerWords: true,
    mergeMicroSegments: true,
  });

  // 5. Semantic Chunking
  onProgress?.({
    stage: 'CHUNKING',
    message: `Chunking ${normalized.segments.length} segments across semantic time windows...`,
    percentage: 60,
  });

  const chunks = chunkTranscript(normalized.segments, {
    targetChunkMinutes: options.chunkSizeMinutes || 5.0,
    overlapSeconds: options.overlapSeconds || 20,
  });

  // 6. Question Generation across Chunks
  onProgress?.({
    stage: 'GENERATING',
    message: `Generating ${count} questions distributed across ${chunks.length} semantic chunks...`,
    percentage: 75,
  });

  const effectiveTitle = titleHint || transcriptResult.title || `YouTube Video (${videoId})`;
  const allCandidateQuestions: CanonicalQuestion[] = [];

  // Distribute requested questions evenly across chunks
  const questionsPerChunk = Math.max(1, Math.ceil(count / Math.max(1, chunks.length)));

  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx];
    const chunkTargetCount = Math.min(questionsPerChunk, count - allCandidateQuestions.length);

    if (chunkTargetCount <= 0) break;

    const chunkQuestions = await generateQuestionsForChunk({
      chunk,
      count: chunkTargetCount,
      videoId,
      videoTitle: effectiveTitle,
      videoUrl: canonicalUrl,
      difficulty: options.difficulty,
      mockAiGenerator: options.mockAiGenerator,
    });

    allCandidateQuestions.push(...chunkQuestions);
  }

  // 7. Grounding Validation & Hallucination Check
  onProgress?.({
    stage: 'VALIDATING_QUESTIONS',
    message: 'Verifying evidence citations and detecting hallucinated facts...',
    percentage: 85,
  });

  const fullText = normalized.normalizedText;
  const verifiedQuestions: CanonicalQuestion[] = [];
  let totalFidelityScore = 0;

  for (let i = 0; i < allCandidateQuestions.length; i++) {
    const q = allCandidateQuestions[i];
    const matchingChunk = chunks.find((c) => c.title === q.subtopic) || chunks[0];

    const evidence = verifyQuestionAgainstTranscript(q, matchingChunk, fullText);
    totalFidelityScore += evidence.confidence;

    q.verificationStatus = evidence.verified
      ? 'VERIFIED'
      : evidence.confidence >= 0.5
      ? 'REVIEW_REQUIRED'
      : 'FAILED';

    q.verificationReasons = evidence.reasons;
    q.confidence = {
      extraction: evidence.confidence,
      structure: evidence.confidence,
      answer: evidence.confidence,
      asset: 1.0,
    };

    if (q.verificationStatus !== 'FAILED') {
      verifiedQuestions.push(q);
    }
  }

  // 8. Deduplication Engine
  onProgress?.({
    stage: 'DEDUPLICATING',
    message: 'Auditing questions for exact, near, and permuted duplicates...',
    percentage: 95,
  });

  const dupAudit = auditBatchDuplicates(verifiedQuestions);
  const duplicateIds = new Set(dupAudit.matches.map((m) => m.questionId));
  const uniqueQuestions = verifiedQuestions.filter((q) => !duplicateIds.has(q.questionId));

  // Monotonically re-index question numbers (1..N)
  uniqueQuestions.forEach((q, idx) => {
    q.questionNumber = idx + 1;
  });

  const finalQuestions = uniqueQuestions.slice(0, count);
  const averageFidelity =
    finalQuestions.length > 0 ? totalFidelityScore / finalQuestions.length : 0.0;
  const latencyMs = Math.round(performance.now() - startTime);

  onProgress?.({
    stage: 'COMPLETED',
    message: `Generated ${finalQuestions.length} verified questions with ${Math.round(averageFidelity * 100)}% grounding fidelity in ${latencyMs}ms.`,
    percentage: 100,
  });

  return {
    success: finalQuestions.length > 0,
    videoId,
    title: effectiveTitle,
    metadata: transcriptResult.metadata,
    transcriptSummary: {
      totalDuration: normalized.durationSeconds,
      segmentCount: normalized.segments.length,
      chunkCount: chunks.length,
      captionType: transcriptResult.captionType,
      language: transcriptResult.language,
      wordCount: normalized.wordCount,
    },
    questions: finalQuestions,
    chunks,
    groundingFidelityScore: parseFloat(averageFidelity.toFixed(2)),
    latencyMs,
    cached: fromCache,
  };
}
