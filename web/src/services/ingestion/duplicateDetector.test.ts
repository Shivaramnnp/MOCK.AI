import { describe, it, expect } from 'vitest';
import {
  normalizeQuestionText,
  computeTokenSimilarity,
  detectDuplicates,
} from './duplicateDetector';
import { CanonicalQuestion } from '../../types/canonicalQuestion';

describe('Duplicate Detector', () => {
  const makeQuestion = (id: string, num: number, text: string): CanonicalQuestion => ({
    questionId: id,
    sourceId: 'src-1',
    sourceType: 'Topic',
    questionNumber: num,
    questionText: text,
    contentBlocks: [{ type: 'text', content: text }],
    questionType: 'MCQ',
    options: [
      { id: 'A', text: 'Option 1' },
      { id: 'B', text: 'Option 2' },
    ],
    answer: { questionType: 'MCQ', correctOptionIndex: 0 },
    scoring: { marks: 1, negativeMarks: 0 },
    provenance: { sourceType: 'Topic' },
    assets: [],
    explanation: '',
    verificationStatus: 'VERIFIED',
    verificationReasons: [],
    confidence: { extraction: 1, structure: 1, answer: 1, asset: 1 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  it('should normalize question text by stripping punctuation and lowercasing', () => {
    const raw = 'What is Newton’s Second Law: $F = m \\times a$?';
    const norm = normalizeQuestionText(raw);
    expect(norm).toContain('what is newtons second law');
    expect(norm).not.toContain('$');
    expect(norm).not.toContain('?');
  });

  it('should calculate high token similarity for paraphrased or near-identical questions', () => {
    const textA = 'What is the capital city of France in Western Europe?';
    const textB = 'What is the capital city of France in Western Europe today?';
    const similarity = computeTokenSimilarity(textA, textB);
    expect(similarity).toBeGreaterThan(0.85);
  });

  it('should detect exact and normalized duplicates in a question set', () => {
    const q1 = makeQuestion('q1', 1, 'Explain the mechanism of enzyme catalysis.');
    const q2 = makeQuestion('q2', 2, 'Explain the mechanism of enzyme catalysis.'); // exact
    const q3 = makeQuestion('q3', 3, 'Explain  the  mechanism of enzyme catalysis! '); // normalized
    const q4 = makeQuestion('q4', 4, 'What is the speed of light in vacuum?'); // distinct

    const report = detectDuplicates([q1, q2, q3, q4]);

    expect(report.hasDuplicates).toBe(true);
    expect(report.uniqueQuestions).toBe(2);
    expect(report.duplicateQuestionIds.has('q2')).toBe(true);
    expect(report.duplicateQuestionIds.has('q3')).toBe(true);
    expect(report.duplicateQuestionIds.has('q4')).toBe(false);
  });

  it('should not flag completely distinct questions as duplicates', () => {
    const q1 = makeQuestion('q1', 1, 'Calculate the limit of sin(x)/x as x approaches 0.');
    const q2 = makeQuestion('q2', 2, 'Determine the eigenvalues of a symmetric 3x3 matrix.');
    const report = detectDuplicates([q1, q2]);

    expect(report.hasDuplicates).toBe(false);
    expect(report.matches.length).toBe(0);
    expect(report.uniqueQuestions).toBe(2);
  });
});
