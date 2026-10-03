/**
 * Topic Question Deduplicator
 * Detects exact duplicates, near duplicates, option permutations, and numerical template copies.
 */

import { CanonicalQuestion } from '../../../types/canonicalQuestion';

export type DuplicateType = 'EXACT' | 'NEAR' | 'PERMUTED_OPTIONS' | 'NUMERICAL_TEMPLATE';

export interface DuplicateMatch {
  isDuplicate: boolean;
  duplicateType?: DuplicateType;
  matchedQuestionId?: string;
  similarityScore?: number;
  reason?: string;
}

export interface BatchDeduplicationReport {
  hasDuplicates: boolean;
  totalQuestions: number;
  duplicateCount: number;
  duplicateRate: number; // 0.0 to 1.0
  matches: Array<{
    slotIndex: number;
    questionId: string;
    duplicateOfId: string;
    type: DuplicateType;
    reason: string;
  }>;
}

/**
 * Normalizes question stem for textual comparison.
 */
export function normalizeQuestionStem(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\$+/g, '') // remove LaTeX math delimiters
    .replace(/\\(?:frac|sqrt|times|le|ge|pm|sum|int|infty|alpha|beta|gamma)/g, '') // remove common LaTeX tokens
    .replace(/[^\w\s]/g, ' ') // replace punctuation with spaces
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

/**
 * Tokenizes text into unique set of significant words (length > 2).
 */
function getSignificantTokens(text: string): Set<string> {
  const norm = normalizeQuestionStem(text);
  const words = norm.split(' ').filter((w) => w.length > 2);
  return new Set(words);
}

/**
 * Computes Jaccard similarity between two token sets.
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Replaces numerical digits with a placeholder token to detect cloned templates with changed numbers.
 */
export function maskNumericalValues(text: string): string {
  if (!text) return '';
  const norm = normalizeQuestionStem(text);
  return norm.replace(/\b\d+(?:\.\d+)?\b/g, '<NUM>');
}

/**
 * Checks a single candidate question against a collection of existing questions.
 */
export function checkQuestionDuplicate(
  candidate: CanonicalQuestion,
  existingQuestions: CanonicalQuestion[]
): DuplicateMatch {
  if (!candidate || !existingQuestions || existingQuestions.length === 0) {
    return { isDuplicate: false };
  }

  const candNorm = normalizeQuestionStem(candidate.questionText);
  const candTokens = getSignificantTokens(candidate.questionText);
  const candTemplate = maskNumericalValues(candidate.questionText);
  const candOptionsNorm = new Set(
    candidate.options.map((o) => normalizeQuestionStem(o.text)).filter(Boolean)
  );

  for (const existing of existingQuestions) {
    if (existing.questionId === candidate.questionId) continue;

    const existNorm = normalizeQuestionStem(existing.questionText);
    const existTokens = getSignificantTokens(existing.questionText);

    // 1. Exact Duplicate (normalized stem identity)
    if (candNorm === existNorm && candNorm.length > 15) {
      return {
        isDuplicate: true,
        duplicateType: 'EXACT',
        matchedQuestionId: existing.questionId,
        similarityScore: 1.0,
        reason: `Exact text duplicate of Question ${existing.questionNumber || existing.questionId}`,
      };
    }

    const tokenSim = jaccardSimilarity(candTokens, existTokens);

    // 2. Option Permutation (stem similarity >= 0.65 AND identical option sets in different order)
    if (tokenSim >= 0.65 && candOptionsNorm.size >= 2) {
      const existOptionsNorm = new Set(
        existing.options.map((o) => normalizeQuestionStem(o.text)).filter(Boolean)
      );
      let optIntersection = 0;
      for (const opt of candOptionsNorm) {
        if (existOptionsNorm.has(opt)) optIntersection++;
      }
      if (optIntersection === candOptionsNorm.size && optIntersection === existOptionsNorm.size) {
        const isSameOrder = candidate.options.every(
          (o, idx) => existing.options[idx] && normalizeQuestionStem(o.text) === normalizeQuestionStem(existing.options[idx].text)
        );
        if (!isSameOrder) {
          return {
            isDuplicate: true,
            duplicateType: 'PERMUTED_OPTIONS',
            matchedQuestionId: existing.questionId,
            similarityScore: 0.95,
            reason: `Same problem with reordered options as Question ${existing.questionNumber || existing.questionId}`,
          };
        }
      }
    }

    // 3. Numerical Template Variation (identical problem structure with different numerical parameters)
    const existTemplate = maskNumericalValues(existing.questionText);
    if (
      candTemplate === existTemplate &&
      candTemplate.includes('<NUM>') &&
      candTemplate.length > 25
    ) {
      return {
        isDuplicate: true,
        duplicateType: 'NUMERICAL_TEMPLATE',
        matchedQuestionId: existing.questionId,
        similarityScore: 0.90,
        reason: `Same underlying mathematical problem with only numerical values changed as Question ${existing.questionNumber || existing.questionId}`,
      };
    }

    // 4. Near Duplicate (high Jaccard token overlap)
    if (tokenSim >= 0.85 && candTokens.size >= 5) {
      return {
        isDuplicate: true,
        duplicateType: 'NEAR',
        matchedQuestionId: existing.questionId,
        similarityScore: tokenSim,
        reason: `Near duplicate (${Math.round(tokenSim * 100)}% token similarity) of Question ${existing.questionNumber || existing.questionId}`,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Audits an entire batch of questions and returns deduplication statistics.
 */
export function auditBatchDuplicates(questions: CanonicalQuestion[]): BatchDeduplicationReport {
  const matches: BatchDeduplicationReport['matches'] = [];
  const processed: CanonicalQuestion[] = [];

  for (let i = 0; i < questions.length; i++) {
    const current = questions[i];
    const check = checkQuestionDuplicate(current, processed);

    if (check.isDuplicate && check.duplicateType && check.matchedQuestionId) {
      matches.push({
        slotIndex: i + 1,
        questionId: current.questionId,
        duplicateOfId: check.matchedQuestionId,
        type: check.duplicateType,
        reason: check.reason || 'Duplicate detected',
      });
    } else {
      processed.push(current);
    }
  }

  const total = questions.length;
  const duplicateCount = matches.length;
  const duplicateRate = total === 0 ? 0 : duplicateCount / total;

  return {
    hasDuplicates: duplicateCount > 0,
    totalQuestions: total,
    duplicateCount,
    duplicateRate,
    matches,
  };
}
