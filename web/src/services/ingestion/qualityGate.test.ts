import { describe, it, expect } from 'vitest';
import { evaluateQualityGate, checkMathSyntax, validateContentBlock } from './qualityGate';
import { CanonicalQuestion } from '../../types/canonicalQuestion';

describe('Quality Gate & Validation Engine', () => {
  const createValidQuestion = (): CanonicalQuestion => ({
    questionId: 'test-q1',
    sourceId: 'test-source',
    sourceType: 'Topic',
    questionNumber: 1,
    questionText: 'What is the SI unit of electric capacitance in physics?',
    contentBlocks: [
      {
        type: 'text',
        content: 'What is the SI unit of electric capacitance in physics?',
      },
    ],
    questionType: 'MCQ',
    options: [
      { id: 'A', text: 'Farad (F)' },
      { id: 'B', text: 'Henry (H)' },
      { id: 'C', text: 'Tesla (T)' },
      { id: 'D', text: 'Weber (Wb)' },
    ],
    answer: {
      questionType: 'MCQ',
      correctOptionIndex: 0,
      correctOptionId: 'A',
    },
    scoring: {
      marks: 1,
      negativeMarks: 0.33,
    },
    provenance: {
      sourceType: 'Topic',
    },
    assets: [],
    explanation: 'The SI unit of capacitance is the farad (F), named after Michael Faraday.',
    topic: 'Physics',
    verificationStatus: 'UNVERIFIED',
    verificationReasons: [],
    confidence: {
      extraction: 1.0,
      structure: 1.0,
      answer: 1.0,
      asset: 1.0,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  it('should accept a completely valid MCQ question as VERIFIED', () => {
    const q = createValidQuestion();
    const result = evaluateQualityGate(q);

    expect(result.isValid).toBe(true);
    expect(result.canPublish).toBe(true);
    expect(result.status).toBe('VERIFIED');
    expect(result.confidence.answer).toBe(1.0);
    expect(result.confidence.structure).toBe(1.0);
  });

  it('should flag an empty question text as FATAL and not publishable', () => {
    const q = createValidQuestion();
    q.questionText = '';
    const result = evaluateQualityGate(q);

    expect(result.isValid).toBe(false);
    expect(result.canPublish).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.reasons).toContain('Question stem is completely empty.');
  });

  it('should flag suspiciously short or placeholder question stems', () => {
    const q = createValidQuestion();
    q.questionText = 'Question 1';
    const result = evaluateQualityGate(q);

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.reasons.some((r) => r.includes('placeholder'))).toBe(true);
  });

  it('should NEVER coerce a missing or out-of-bounds MCQ answer to Option A', () => {
    const q = createValidQuestion();
    q.answer = {
      questionType: 'MCQ',
      correctOptionIndex: -1, // missing
      correctOptionId: undefined,
    };
    const result = evaluateQualityGate(q);

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.confidence.answer).toBe(0.0);
    expect(result.reasons.some((r) => r.includes('lacks a valid designated correct answer'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('NEVER silently coerce to Option A'))).toBe(true);
  });

  it('should detect unclosed LaTeX dollar signs in math expressions', () => {
    const issues = checkMathSyntax('Calculate the integral $E = mc^2 where $m is mass');
    // Here we have 2 dollar signs, so even count.
    expect(issues.length).toBe(0);

    const brokenIssues = checkMathSyntax('Calculate $E = mc^2 without closing dollar');
    expect(brokenIssues.length).toBeGreaterThan(0);
    expect(brokenIssues[0].code).toBe('UNCLOSED_INLINE_MATH');
  });

  it('should detect unbalanced LaTeX parentheses and brackets', () => {
    const issuesParen = checkMathSyntax('Formula \\( x + y = z without closing paren');
    expect(issuesParen.some((i) => i.code === 'UNBALANCED_PAREN_MATH')).toBe(true);

    const issuesBracket = checkMathSyntax('Formula \\[ A = B \\] and extra \\[');
    expect(issuesBracket.some((i) => i.code === 'UNBALANCED_BRACKET_MATH')).toBe(true);
  });

  it('should validate table blocks for matching column counts', () => {
    const validBlock = {
      type: 'table' as const,
      headers: ['Col A', 'Col B'],
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
    };
    expect(validateContentBlock(validBlock, 0).length).toBe(0);

    const mismatchBlock = {
      type: 'table' as const,
      headers: ['Col A', 'Col B'],
      rows: [
        ['1', '2'],
        ['3'], // Missing col 2
      ],
    };
    const issues = validateContentBlock(mismatchBlock, 0);
    expect(issues.some((i) => i.code === 'TABLE_COLUMN_MISMATCH')).toBe(true);
  });

  it('should enforce provenance presence for source-based ingestion', () => {
    const q = createValidQuestion();
    q.sourceType = 'PDF';
    q.provenance = { sourceType: 'PDF' }; // missing sourceFile or page
    const result = evaluateQualityGate(q);

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.reasons.some((r) => r.includes('lacks provenance'))).toBe(true);
  });

  it('should validate NAT questions requiring numeric range', () => {
    const q = createValidQuestion();
    q.questionType = 'NAT';
    q.options = [];
    q.answer = {
      questionType: 'NAT',
      natRange: { min: 4.5, max: 5.5 },
    };
    const result = evaluateQualityGate(q);
    expect(result.status).toBe('VERIFIED');

    // Missing NAT range
    q.answer = { questionType: 'NAT' };
    const brokenResult = evaluateQualityGate(q);
    expect(brokenResult.status).toBe('REVIEW_REQUIRED');
    expect(brokenResult.reasons.some((r) => r.includes('lacks a valid numeric range'))).toBe(true);
  });
});
