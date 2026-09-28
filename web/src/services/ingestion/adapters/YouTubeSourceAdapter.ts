import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { aiProviderService } from '../../ai/aiProviderService';
import { parseCanonicalQuestionsJson } from '../../ai/adapters/adapterHelpers';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';

export interface YouTubeInput {
  url: string;
  titleHint?: string;
}

export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
  if (!isYouTube) return null;

  const patterns = [
    /(?:v=)([0-9A-Za-z_-]{11})/i,
    /(?:youtu\.be\/)([0-9A-Za-z_-]{11})/i,
    /(?:shorts\/)([0-9A-Za-z_-]{11})/i,
    /(?:embed\/)([0-9A-Za-z_-]{11})/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

export class YouTubeSourceAdapter implements SourceAdapter<YouTubeInput> {
  readonly sourceType = 'YouTube';

  async validateInput(input: YouTubeInput): Promise<{ valid: boolean; error?: string }> {
    if (!input || !input.url || typeof input.url !== 'string') {
      return { valid: false, error: 'YouTube URL is required.' };
    }
    const videoId = extractYouTubeVideoId(input.url);
    if (!videoId) {
      return { valid: false, error: 'Invalid YouTube URL. Please provide a standard watch, share, or shorts link.' };
    }
    return { valid: true };
  }

  /**
   * Fetches real captions/transcript from YouTube backend or API.
   */
  async fetchTranscript(videoUrl: string, videoId: string): Promise<{ transcript: string; title: string }> {
    // 1. Try local or configured backend endpoints
    const endpoints = [
      `/api/youtube/transcript?url=${encodeURIComponent(videoUrl)}`,
      `http://localhost:5001/transcript?url=${encodeURIComponent(videoUrl)}`,
      `http://127.0.0.1:5001/transcript?url=${encodeURIComponent(videoUrl)}`,
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, { method: 'GET', headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          if (data && data.transcript && typeof data.transcript === 'string' && data.transcript.trim()) {
            return {
              transcript: data.transcript.trim(),
              title: data.title || `YouTube Video (${videoId})`,
            };
          }
        }
      } catch {
        // Continue to next endpoint attempt
      }
    }

    // 2. If backend is unreachable, throw typed error. NEVER hallucinate from URL alone!
    throw createIngestionError(
      'TRANSCRIPTION_FAILED',
      'Unable to extract transcripts or captions for this YouTube video. Please ensure the video has closed captions/subtitles enabled, or start the Mock.AI YouTube backend service on port 5001.',
      `Transcript extraction failed for video ${videoId}. No working transcript service returned content.`,
      false,
      'YOUTUBE_TRANSCRIPTION'
    );
  }

  async process(input: YouTubeInput, options?: IngestionOptions): Promise<IngestionResult> {
    const videoId = extractYouTubeVideoId(input.url);
    if (!videoId) {
      throw createIngestionError(
        'INVALID_FILE',
        'Invalid YouTube video URL.',
        `Could not extract 11-char videoId from ${input.url}`,
        false,
        'URL_VALIDATION'
      );
    }

    const { transcript, title } = await this.fetchTranscript(input.url, videoId);
    const count = options?.requestedCount || 6;

    const prompt = `
Source Material: YouTube Video Lecture
Video Title: "${title}"
Video URL: "${input.url}"

Actual Video Transcript Content:
"""
${transcript.slice(0, 20000)}
"""

Task:
Extract and generate exactly ${count} rigorous competitive exam questions based strictly on the factual, conceptual, and procedural content explained in this transcript.
Ignore filler speech and transcript stutter.
If formulas or principles are taught, preserve them in LaTeX $...$.

Return ONLY a valid JSON object:
{
  "questions": [
    {
      "questionNumber": 1,
      "questionType": "MCQ",
      "questionText": "Question stem here...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "topic": "${title}",
      "explanation": "Detailed explanation...",
      "citation": {
        "youtubeTimestamp": "00:00",
        "sourceExactText": "Exact quote or concept from transcript"
      }
    }
  ]
}
`;

    const active = aiProviderService.getActiveAdapter();
    if (!active) {
      throw createIngestionError(
        'AI_PROVIDER_ERROR',
        'No AI provider is configured to process the video transcript. Please set up a provider in Settings.',
        'Active adapter is missing',
        false,
        'PROVIDER_SELECTION'
      );
    }

    const rawResponse = await active.adapter.generateQuestions(prompt, active.connection, { count });
    const questions = parseCanonicalQuestionsJson(JSON.stringify({ questions: rawResponse }), {
      sourceType: 'YouTube',
      sourceId: videoId,
      sourceUrl: input.url,
      sourceFile: title,
    });

    // Evaluate Quality Gate
    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    questions.forEach((q, index) => {
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
      success: questions.length > 0,
      sourceType: 'YouTube',
      sourceTitle: `${title} - Mock Exam`,
      questions,
      legacyQuestions: questions.map(toLegacyQuestion),
      qualityReport: {
        total: questions.length,
        verified: verifiedCount,
        partial: partialCount,
        reviewRequired: reviewCount,
        failed: failedCount,
        evaluations,
      },
    };
  }
}
