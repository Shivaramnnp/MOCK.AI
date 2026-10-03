import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';
import { extractYouTubeVideoId, validateYouTubeUrl } from '../youtube/urlValidator';
import { processYouTubeVideo } from '../youtube/youtubeEngine';
import { fetchYouTubeTranscript } from '../youtube/transcriptFetcher';

export { extractYouTubeVideoId } from '../youtube/urlValidator';

export interface YouTubeInput {
  url: string;
  titleHint?: string;
}

export class YouTubeSourceAdapter implements SourceAdapter<YouTubeInput> {
  readonly sourceType = 'YouTube';

  async validateInput(input: YouTubeInput): Promise<{ valid: boolean; error?: string }> {
    if (!input || !input.url || typeof input.url !== 'string') {
      return { valid: false, error: 'YouTube URL is required.' };
    }
    const check = validateYouTubeUrl(input.url);
    if (!check.valid) {
      return { valid: false, error: check.error || 'Invalid YouTube URL. Please provide a standard watch, share, or shorts link.' };
    }
    return { valid: true };
  }

  /**
   * Fetches real captions/transcript from YouTube backend or API.
   * Backward-compatible helper method.
   */
  async fetchTranscript(videoUrl: string, videoId: string): Promise<{ transcript: string; title: string }> {
    try {
      const res = await fetchYouTubeTranscript(videoUrl);
      return {
        transcript: res.normalizedText || res.rawText,
        title: res.title,
      };
    } catch (err: any) {
      throw createIngestionError(
        'TRANSCRIPTION_FAILED',
        err?.message || 'Unable to extract transcripts or captions for this YouTube video. Please ensure the video has closed captions/subtitles enabled.',
        `Transcript extraction failed for video ${videoId}: ${err?.details || err?.message}`,
        false,
        'YOUTUBE_TRANSCRIPTION'
      );
    }
  }

  async process(input: YouTubeInput, options?: IngestionOptions): Promise<IngestionResult> {
    const res = await processYouTubeVideo(input, {
      requestedCount: options?.requestedCount || 6,
      difficulty: options?.difficulty,
      onProgress: options?.onProgress,
    });

    if (!res.success || res.questions.length === 0) {
      const errReason = res.error?.code || 'TRANSCRIPTION_FAILED';
      throw createIngestionError(
        errReason === 'SSRF_BLOCKED' ? 'INVALID_FILE' : 'TRANSCRIPTION_FAILED',
        res.error?.message || 'Failed to process YouTube video transcript.',
        res.error?.details || `Engine failed with error code: ${errReason}`,
        false,
        'YOUTUBE_PROCESSING'
      );
    }

    // Evaluate Quality Gate
    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    res.questions.forEach((q, index) => {
      q.questionNumber = index + 1;
      const evalRes = evaluateQualityGate(q);
      evaluations.push(evalRes);

      q.verificationStatus = evalRes.status;
      q.verificationReasons = evalRes.reasons;
      q.confidence = evalRes.confidence;

      if (evalRes.status === 'VERIFIED') verifiedCount++;
      else if (evalRes.status === 'PARTIAL') partialCount++;
      else if (evalRes.status === 'REVIEW_REQUIRED') reviewCount++;
      else if (evalRes.status === 'FAILED') failedCount++;
    });

    return {
      success: res.questions.length > 0,
      sourceType: 'YouTube',
      sourceTitle: `${res.title} - Mock Exam`,
      questions: res.questions,
      legacyQuestions: res.questions.map(toLegacyQuestion),
      qualityReport: {
        total: res.questions.length,
        verified: verifiedCount,
        partial: partialCount,
        reviewRequired: reviewCount,
        failed: failedCount,
        evaluations,
      },
    };
  }
}
