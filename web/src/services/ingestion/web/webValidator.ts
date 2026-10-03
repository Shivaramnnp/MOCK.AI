/**
 * Web Question Evidence Grounding Validator
 * Verifies that questions, answers, and citations are strictly supported by the extracted source text.
 * Flags hallucinated claims, non-existent quotes, and mathematical syntax issues.
 */

import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { WebSemanticChunk, WebValidationResult } from './types';

/**
 * Validates LaTeX mathematical delimiters for balanced pairs.
 */
export function validateMathSyntax(text: string): { valid: boolean; error?: string } {
  if (!text) return { valid: true };

  // Count unescaped dollar signs
  const matches = text.match(/(?<!\\)\$/g);
  if (matches && matches.length % 2 !== 0) {
    return { valid: false, error: 'Unbalanced LaTeX math delimiter ($).' };
  }

  // Check for common malformed tokens
  if (/\\(?:frac|sqrt)\s*\{[^}]*$/.test(text)) {
    return { valid: false, error: 'Unclosed LaTeX macro bracket.' };
  }

  return { valid: true };
}

/**
 * Normalizes text for fuzzy phrase containment.
 */
function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifies a single question against the source chunk and document text.
 */
export function verifyQuestionAgainstWebSource(
  question: CanonicalQuestion,
  chunk: WebSemanticChunk,
  fullDocumentText: string
): WebValidationResult {
  const reasons: string[] = [];
  let score = 0.0;

  const quote =
    question.citation?.sourceExactText ||
    question.provenance?.sourceExactText ||
    '';

  const normQuote = normalizeForMatching(quote);
  const normChunkText = normalizeForMatching(chunk.text);
  const normFullText = normalizeForMatching(fullDocumentText);

  // 1. Evidence Quote Verification
  if (normQuote && normQuote.length >= 10) {
    if (normChunkText.includes(normQuote)) {
      score += 0.50; // Found in the primary chunk
    } else if (normFullText.includes(normQuote)) {
      score += 0.35; // Found in another section of the document
      reasons.push('Source quote found in another document section rather than current chunk.');
    } else {
      score -= 0.40;
      reasons.push(`Hallucinated source quote: "${quote.slice(0, 60)}..." was not found in webpage text.`);
    }
  } else {
    // Check if key question terms exist in chunk
    const stemTerms = normalizeForMatching(question.questionText)
      .split(' ')
      .filter((w) => w.length > 4);

    let foundTerms = 0;
    for (const term of stemTerms) {
      if (normChunkText.includes(term)) foundTerms++;
    }
    const overlapRatio = stemTerms.length > 0 ? foundTerms / stemTerms.length : 0;
    if (overlapRatio >= 0.5) {
      score += 0.30;
    } else {
      score -= 0.30;
      reasons.push('Question stem exhibits low semantic overlap with extracted webpage text.');
    }
  }

  // 2. Correct Option Verification
  const correctOption = question.options?.find(
    (o) => o.id === question.answer?.correctAnswer || o.id === question.answer?.correctOptionId
  );

  if (correctOption) {
    const normAns = normalizeForMatching(correctOption.text);
    if (normAns.length > 5) {
      if (normChunkText.includes(normAns) || normFullText.includes(normAns)) {
        score += 0.30;
      } else {
        // Check partial word overlap
        const ansWords = normAns.split(' ').filter((w) => w.length > 3);
        const matched = ansWords.filter((w) => normChunkText.includes(w));
        if (ansWords.length > 0 && matched.length / ansWords.length >= 0.4) {
          score += 0.20;
        } else {
          score -= 0.15;
          reasons.push('Correct option statements have weak evidence in webpage content.');
        }
      }
    }
  }

  // 3. Option Distinctness
  if (Array.isArray(question.options) && question.options.length >= 2) {
    const optionTexts = new Set(question.options.map((o) => normalizeForMatching(o.text)));
    if (optionTexts.size < question.options.length) {
      score -= 0.50;
      reasons.push('Identical or redundant options detected in question options.');
    } else {
      score += 0.20;
    }
  }

  // 4. Mathematical Typesetting Integrity
  const stemMath = validateMathSyntax(question.questionText);
  if (!stemMath.valid) {
    score -= 0.40;
    reasons.push(`LaTeX typesetting syntax error in stem: ${stemMath.error}`);
  }

  if (Array.isArray(question.options)) {
    for (const opt of question.options) {
      const optMath = validateMathSyntax(opt.text);
      if (!optMath.valid) {
        score -= 0.40;
        reasons.push(`Option ${opt.id} math syntax error: ${optMath.error}`);
      }
    }
  }

  const finalConfidence = Math.max(0.0, Math.min(1.0, parseFloat(score.toFixed(2))));
  const verified = finalConfidence >= 0.70 && !reasons.some((r) => r.startsWith('Hallucinated'));

  return {
    verified,
    confidence: finalConfidence,
    reasons,
    matchedExcerpt: quote || undefined,
  };
}
