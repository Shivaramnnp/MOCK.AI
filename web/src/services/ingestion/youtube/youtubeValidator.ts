/**
 * YouTube Question & Evidence Validator
 * Verifies that questions, answers, and citations are strictly supported by transcript evidence.
 * Detects hallucinated facts, validates LaTeX math syntax, and ensures options distinctness.
 */

import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { YouTubeQuestionEvidence, YouTubeSemanticChunk, YouTubeTranscriptSegment } from './types';
import { validateMathSyntax } from '../topic/topicValidator';

// Common stop words to exclude when checking keyword grounding
const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'of', 'to',
  'what', 'how', 'why', 'when', 'where', 'who', 'whom', 'this', 'that', 'these',
  'those', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'shall',
  'following', 'statement', 'correct', 'true', 'false', 'select', 'among',
]);

/**
 * Normalizes text for evidence matching.
 */
function normalizeForSearch(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts significant conceptual keywords from text.
 */
function extractSignificantKeywords(text: string): string[] {
  const norm = normalizeForSearch(text);
  return norm
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Checks whether an excerpt or key phrase exists in transcript text.
 */
export function isExcerptInTranscript(excerpt: string, transcriptText: string): boolean {
  if (!excerpt || !transcriptText) return false;
  const normExcerpt = normalizeForSearch(excerpt);
  const normTrans = normalizeForSearch(transcriptText);

  if (!normExcerpt || normExcerpt.length < 5) return false;

  // Direct substring match
  if (normTrans.includes(normExcerpt)) return true;

  // Fuzzy word sequence overlap (at least 75% of excerpt words appear contiguously)
  const words = normExcerpt.split(' ').filter(Boolean);
  if (words.length >= 4) {
    const windowSize = words.length + 3;
    const transWords = normTrans.split(' ').filter(Boolean);

    for (let i = 0; i <= transWords.length - windowSize; i++) {
      const window = transWords.slice(i, i + windowSize);
      let matchCount = 0;
      for (const w of words) {
        if (window.includes(w)) matchCount++;
      }
      if (matchCount / words.length >= 0.75) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Verifies a single YouTube canonical question against chunk and full transcript evidence.
 */
export function verifyQuestionAgainstTranscript(
  question: CanonicalQuestion,
  chunk: YouTubeSemanticChunk,
  fullTranscriptText: string
): YouTubeQuestionEvidence {
  const reasons: string[] = [];
  const hallucinatedTerms: string[] = [];
  let score = 1.0;

  // 1. Check Citation / Source Excerpt
  const excerpt =
    question.citation?.sourceExactText ||
    question.provenance?.sourceExactText ||
    '';

  const excerptInChunk = isExcerptInTranscript(excerpt, chunk.text);
  const excerptInFull = isExcerptInTranscript(excerpt, fullTranscriptText);

  if (!excerpt) {
    score -= 0.35;
    reasons.push('Question lacks an exact transcript source citation.');
  } else if (!excerptInChunk && !excerptInFull) {
    score -= 0.50;
    reasons.push(`Cited transcript excerpt "${excerpt.slice(0, 50)}..." was not found in the video transcript.`);
    hallucinatedTerms.push(excerpt);
  }

  // 2. Check Question Stem Grounding
  const stemKeywords = extractSignificantKeywords(question.questionText);
  const normChunk = normalizeForSearch(chunk.text);
  const normFull = normalizeForSearch(fullTranscriptText);

  let groundedKeywordsCount = 0;
  for (const kw of stemKeywords) {
    if (normChunk.includes(kw) || normFull.includes(kw)) {
      groundedKeywordsCount++;
    } else {
      hallucinatedTerms.push(kw);
    }
  }

  const keywordGroundingRatio =
    stemKeywords.length > 0 ? groundedKeywordsCount / stemKeywords.length : 1.0;

  if (keywordGroundingRatio < 0.50) {
    score -= 0.40;
    reasons.push(`Question references unmentioned terminology (${Math.round((1 - keywordGroundingRatio) * 100)}% terms missing from transcript).`);
  }

  // 3. Check Option Distinctness
  if (Array.isArray(question.options) && question.options.length >= 2) {
    const texts = new Set<string>();
    for (const opt of question.options) {
      const clean = opt.text.trim().toLowerCase();
      if (texts.has(clean)) {
        score -= 0.40;
        reasons.push(`Duplicate option choices detected: "${opt.text}".`);
        break;
      }
      texts.add(clean);
    }
  } else {
    score -= 0.50;
    reasons.push('Question must have at least 2 distinct options.');
  }

  // 4. Check Math Syntax Balance
  const stemMath = validateMathSyntax(question.questionText);
  if (!stemMath.valid) {
    score -= 0.50;
    reasons.push(`Mathematical typesetting error: ${stemMath.error}`);
  }

  if (Array.isArray(question.options)) {
    for (const opt of question.options) {
      const optMath = validateMathSyntax(opt.text);
      if (!optMath.valid) {
        score -= 0.50;
        reasons.push(`Option ${opt.id} mathematical typesetting error: ${optMath.error}`);
      }
    }
  }

  // 5. Check Timestamp Validity
  const ts = question.citation?.youtubeTimestamp || question.provenance?.sourceTimestamp || '';
  let timestampSeconds = 0;

  if (ts) {
    const parts = ts.split(':').map((p: string) => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      timestampSeconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      timestampSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }

  const finalConfidence = Math.max(0.0, Math.min(1.0, parseFloat(score.toFixed(2))));
  const verified = finalConfidence >= 0.70 && reasons.length === 0;

  return {
    verified,
    confidence: finalConfidence,
    sourceExcerpt: excerpt,
    timestamp: ts,
    timestampSeconds,
    reasons,
    hallucinatedTerms: hallucinatedTerms.length > 0 ? hallucinatedTerms : undefined,
  };
}
