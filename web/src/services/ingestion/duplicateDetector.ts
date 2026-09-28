import { CanonicalQuestion } from '../../types/canonicalQuestion';

export interface DuplicateMatch {
  questionId1: string;
  questionNumber1: number;
  questionId2: string;
  questionNumber2: number;
  matchType: 'EXACT' | 'NORMALIZED' | 'SIMILAR';
  similarityScore: number; // 0.0 - 1.0
  reason: string;
}

export interface DuplicateReport {
  hasDuplicates: boolean;
  totalQuestions: number;
  uniqueQuestions: number;
  matches: DuplicateMatch[];
  duplicateQuestionIds: Set<string>;
}

/**
 * Normalizes text by removing punctuation, converting math tokens, collapsing whitespace,
 * and converting to lowercase for robust duplicate detection.
 */
export function normalizeQuestionText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\$\{\}\\\(\)\[\]_^\+\-\*\/=]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes Jaccard word token similarity between two strings.
 */
export function computeTokenSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(normalizeQuestionText(textA).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeQuestionText(textB).split(' ').filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersectionCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionCount++;
    }
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  return unionSize > 0 ? intersectionCount / unionSize : 0;
}

/**
 * Scans a list of CanonicalQuestions for exact, normalized, or high-similarity duplicates.
 * Threshold defaults to 0.85 (85% token overlap).
 */
export function detectDuplicates(
  questions: CanonicalQuestion[],
  similarityThreshold = 0.85
): DuplicateReport {
  const matches: DuplicateMatch[] = [];
  const duplicateIds = new Set<string>();

  for (let i = 0; i < questions.length; i++) {
    const q1 = questions[i];
    const text1 = q1.questionText.trim();
    const norm1 = normalizeQuestionText(text1);

    for (let j = i + 1; j < questions.length; j++) {
      const q2 = questions[j];
      const text2 = q2.questionText.trim();
      const norm2 = normalizeQuestionText(text2);

      // 1. Exact match
      if (text1 === text2 && text1.length > 0) {
        matches.push({
          questionId1: q1.questionId,
          questionNumber1: q1.questionNumber,
          questionId2: q2.questionId,
          questionNumber2: q2.questionNumber,
          matchType: 'EXACT',
          similarityScore: 1.0,
          reason: `Exact identical question text with Question #${q1.questionNumber}`,
        });
        duplicateIds.add(q2.questionId);
        continue;
      }

      // 2. Normalized match (ignoring whitespace, case, symbols)
      if (norm1 === norm2 && norm1.length > 0) {
        matches.push({
          questionId1: q1.questionId,
          questionNumber1: q1.questionNumber,
          questionId2: q2.questionId,
          questionNumber2: q2.questionNumber,
          matchType: 'NORMALIZED',
          similarityScore: 0.98,
          reason: `Substantively identical text (normalized match) with Question #${q1.questionNumber}`,
        });
        duplicateIds.add(q2.questionId);
        continue;
      }

      // 3. High token similarity
      if (norm1.length > 20 && norm2.length > 20) {
        const similarity = computeTokenSimilarity(text1, text2);
        if (similarity >= similarityThreshold) {
          matches.push({
            questionId1: q1.questionId,
            questionNumber1: q1.questionNumber,
            questionId2: q2.questionId,
            questionNumber2: q2.questionNumber,
            matchType: 'SIMILAR',
            similarityScore: Math.round(similarity * 100) / 100,
            reason: `Near-duplicate question stem (${Math.round(similarity * 100)}% token similarity) with Question #${q1.questionNumber}`,
          });
          duplicateIds.add(q2.questionId);
        }
      }
    }
  }

  return {
    hasDuplicates: matches.length > 0,
    totalQuestions: questions.length,
    uniqueQuestions: questions.length - duplicateIds.size,
    matches,
    duplicateQuestionIds: duplicateIds,
  };
}
