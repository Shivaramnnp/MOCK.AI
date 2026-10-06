/**
 * UADUE Invariant Validation Engine — Comprehensive Test Suite
 */

import { describe, it, expect } from 'vitest';
import {
  checkMathInvariants,
  checkOptionInvariants,
  checkScoringInvariants,
  checkAnswerInvariants,
  checkStemLeakageInvariants,
  evaluateUadueInvariants,
} from './invariants/invariants';
import { CanonicalQuestionIR } from './contracts/canonicalQuestionIR';

function createMockUadueQuestion(overrides: Partial<CanonicalQuestionIR> = {}): CanonicalQuestionIR {
  return {
    id: 'uadue_test_q1',
    sourceId: 'src_doc_001',
    sourceQuestionNumber: 1,
    sectionKey: 'quantitative',
    sectionName: 'Quantitative Aptitude',
    questionType: 'MCQ',
    prompt: {
      text: 'Solve for $x$: $2x + 4 = 10$.',
      contentBlocks: [{ type: 'text', content: 'Solve for x: 2x + 4 = 10.' }],
    },
    options: [
      { key: 'A', index: 0, text: '2', contentBlocks: [] },
      { key: 'B', index: 1, text: '3', contentBlocks: [] },
      { key: 'C', index: 2, text: '4', contentBlocks: [] },
      { key: 'D', index: 3, text: '5', contentBlocks: [] },
    ],
    answer: {
      type: 'MCQ',
      correctKeys: ['B'],
      provenance: 'Official Key',
    },
    scoring: {
      marks: 2,
      negativeMarks: 0.5,
      isConfigured: true,
    },
    evidenceChain: [],
    verification: {
      status: 'UNVERIFIED',
      reasons: [],
      confidenceScore: 1.0,
      invariantsPassed: [],
      invariantsFailed: [],
    },
    ...overrides,
  };
}

describe('UADUE Invariant Validation Engine', () => {
  describe('Mathematical Invariants', () => {
    it('passes clean LaTeX equations with balanced dollars', () => {
      const reports = checkMathInvariants('Calculate $\\int_{0}^{1} x^2 dx$ and $\\frac{a}{b}$.');
      expect(reports.every((r) => r.passed)).toBe(true);
    });

    it('flags unclosed inline dollar math', () => {
      const reports = checkMathInvariants('Find the value of $x + y when z = 5.');
      const unclosed = reports.find((r) => r.invariantName === 'UNCLOSED_INLINE_MATH');
      expect(unclosed?.passed).toBe(false);
      expect(unclosed?.severity).toBe('REVIEW_REQUIRED');
    });

    it('flags unbalanced LaTeX parentheses \\( vs \\)', () => {
      const reports = checkMathInvariants('Consider \\( \\alpha + \\beta and let x = 1.');
      const unbalanced = reports.find((r) => r.invariantName === 'UNBALANCED_LATEX_PARENS');
      expect(unbalanced?.passed).toBe(false);
    });

    it('flags unbalanced LaTeX brackets \\[ vs \\]', () => {
      const reports = checkMathInvariants('The matrix equation is \\[ A x = b');
      const unbalanced = reports.find((r) => r.invariantName === 'UNBALANCED_LATEX_BRACKETS');
      expect(unbalanced?.passed).toBe(false);
    });
  });

  describe('Stem Leakage & Option Entanglement Invariants', () => {
    it('passes clean options with no stem entanglement', () => {
      const q = createMockUadueQuestion();
      const reports = checkStemLeakageInvariants(q);
      expect(reports.every((r) => r.passed)).toBe(true);
      expect(reports[0].invariantName).toBe('STEM_LEAKAGE_FREE');
    });

    it('detects and flags stem leakage when option contains next question pattern', () => {
      const q = createMockUadueQuestion({
        options: [
          { key: 'A', index: 0, text: 'Clean option A', contentBlocks: [] },
          { key: 'B', index: 1, text: 'Clean option B', contentBlocks: [] },
          { key: 'C', index: 2, text: 'Clean option C', contentBlocks: [] },
          {
            key: 'D',
            index: 3,
            text: 'Valid short answer. 27. Which of the following numbers will replace the question mark in the given series?',
            contentBlocks: [],
          },
        ],
      });
      const reports = checkStemLeakageInvariants(q);
      const leakage = reports.find((r) => r.invariantName === 'STEM_LEAKAGE_DETECTED');
      expect(leakage).toBeDefined();
      expect(leakage?.passed).toBe(false);
      expect(leakage?.severity).toBe('REVIEW_REQUIRED');
    });
  });

  describe('Option Invariants (Dynamic Counts & Uniqueness)', () => {
    it('supports 5 options (Banking / IBPS PO)', () => {
      const q = createMockUadueQuestion({
        options: [
          { key: 'A', index: 0, text: 'Option A', contentBlocks: [] },
          { key: 'B', index: 1, text: 'Option B', contentBlocks: [] },
          { key: 'C', index: 2, text: 'Option C', contentBlocks: [] },
          { key: 'D', index: 3, text: 'Option D', contentBlocks: [] },
          { key: 'E', index: 4, text: 'Option E', contentBlocks: [] },
        ],
      });
      const reports = checkOptionInvariants(q);
      expect(reports.every((r) => r.passed)).toBe(true);
    });

    it('supports 2 options (True / False)', () => {
      const q = createMockUadueQuestion({
        questionType: 'TRUE_FALSE',
        options: [
          { key: 'A', index: 0, text: 'True', contentBlocks: [] },
          { key: 'B', index: 1, text: 'False', contentBlocks: [] },
        ],
      });
      const reports = checkOptionInvariants(q);
      expect(reports.every((r) => r.passed)).toBe(true);
    });

    it('flags duplicate option keys as FATAL', () => {
      const q = createMockUadueQuestion({
        options: [
          { key: 'A', index: 0, text: 'First A', contentBlocks: [] },
          { key: 'A', index: 1, text: 'Duplicate A', contentBlocks: [] },
          { key: 'B', index: 2, text: 'Option B', contentBlocks: [] },
        ],
      });
      const reports = checkOptionInvariants(q);
      const dup = reports.find((r) => r.invariantName === 'UNIQUE_OPTION_KEYS');
      expect(dup?.passed).toBe(false);
      expect(dup?.severity).toBe('FATAL');
    });

    it('validates optionless NAT questions without flagging option count', () => {
      const q = createMockUadueQuestion({
        questionType: 'NAT',
        options: [],
        answer: {
          type: 'NAT',
          numericValue: 42,
          provenance: 'Official Answer Key',
        },
      });
      const reports = checkOptionInvariants(q);
      expect(reports.every((r) => r.passed)).toBe(true);
    });
  });

  describe('Scoring Invariants', () => {
    it('flags non-positive marks as warning', () => {
      const q = createMockUadueQuestion({
        scoring: { marks: 0, negativeMarks: 0, isConfigured: true },
      });
      const reports = checkScoringInvariants(q);
      const marksReport = reports.find((r) => r.invariantName === 'POSITIVE_MARKS');
      expect(marksReport?.passed).toBe(false);
      expect(marksReport?.severity).toBe('WARNING');
    });

    it('flags negative penalty values below 0', () => {
      const q = createMockUadueQuestion({
        scoring: { marks: 2, negativeMarks: -0.5, isConfigured: true },
      });
      const reports = checkScoringInvariants(q);
      const penaltyReport = reports.find((r) => r.invariantName === 'NON_NEGATIVE_PENALTY');
      expect(penaltyReport?.passed).toBe(false);
    });
  });

  describe('Answer Invariants (Zero Option-A Coercion & NAT Verification)', () => {
    it('flags MCQ answer that targets a non-existent option without coercing to A', () => {
      const q = createMockUadueQuestion({
        options: [
          { key: 'A', index: 0, text: 'Option A', contentBlocks: [] },
          { key: 'B', index: 1, text: 'Option B', contentBlocks: [] },
        ],
        answer: {
          type: 'MCQ',
          correctKeys: ['Z'], // Non-existent key
          provenance: 'Unverified Key',
        },
      });
      const reports = checkAnswerInvariants(q);
      const ansReport = reports.find((r) => r.invariantName === 'VALID_MCQ_ANSWER_TARGET');
      expect(ansReport?.passed).toBe(false);
      expect(ansReport?.severity).toBe('REVIEW_REQUIRED');
    });

    it('validates NAT numeric range where min <= max', () => {
      const q = createMockUadueQuestion({
        questionType: 'NAT',
        options: [],
        answer: {
          type: 'NAT',
          numericRange: { min: 3.14, max: 3.15 },
          provenance: 'GATE Official Key',
        },
      });
      const reports = checkAnswerInvariants(q);
      const natReport = reports.find((r) => r.invariantName === 'VALID_NAT_NUMERIC_RANGE');
      expect(natReport?.passed).toBe(true);
    });

    it('flags NAT numeric range where min > max', () => {
      const q = createMockUadueQuestion({
        questionType: 'NAT',
        options: [],
        answer: {
          type: 'NAT',
          numericRange: { min: 10, max: 5 }, // Inverted range
          provenance: 'Defective Key',
        },
      });
      const reports = checkAnswerInvariants(q);
      const natReport = reports.find((r) => r.invariantName === 'VALID_NAT_NUMERIC_RANGE');
      expect(natReport?.passed).toBe(false);
    });
  });

  describe('Master Certification Verdict & 9-Metric Forensic Confidence Vector', () => {
    it('auto-certifies clean question with all invariants passing and full confidence vector', () => {
      const q = createMockUadueQuestion();
      const verdict = evaluateUadueInvariants(q);
      expect(verdict.status).toBe('CERTIFIED');
      expect(verdict.confidence).toBe(1.0);
      expect(verdict.requiresManualReview).toBe(false);
      expect(verdict.suggestedAction).toBe('AUTO_PUBLISH');

      // Check all 9 dimensions of ForensicConfidenceVector
      const v = verdict.confidenceVector;
      expect(v.boundaryConfidence).toBe(1.0);
      expect(v.ownershipConfidence).toBe(1.0);
      expect(v.textConfidence).toBe(1.0);
      expect(v.mathConfidence).toBe(1.0);
      expect(v.tableConfidence).toBe(1.0);
      expect(v.visualConfidence).toBe(1.0);
      expect(v.answerConfidence).toBe(1.0);
      expect(v.identityConfidence).toBe(1.0);
      expect(v.uiFidelityScore).toBe(1.0);
    });

    it('routes question with math anomaly to REVIEW_REQUIRED and sets mathConfidence to 0.0', () => {
      const q = createMockUadueQuestion({
        prompt: {
          text: 'What is $x + y when z = 1?', // unclosed dollar
          contentBlocks: [],
        },
      });
      const verdict = evaluateUadueInvariants(q);
      expect(verdict.status).toBe('REVIEW_REQUIRED');
      expect(verdict.requiresManualReview).toBe(true);
      expect(verdict.suggestedAction).toBe('ENQUEUE_STAFF_REVIEW');
      expect(verdict.confidenceVector.mathConfidence).toBe(0.0);
    });

    it('fails question with duplicate option keys as FAILED with fatal veto and zero confidence', () => {
      const q = createMockUadueQuestion({
        options: [
          { key: 'A', index: 0, text: 'Opt 1', contentBlocks: [] },
          { key: 'A', index: 1, text: 'Opt 2', contentBlocks: [] },
        ],
      });
      const verdict = evaluateUadueInvariants(q);
      expect(verdict.status).toBe('FAILED');
      expect(verdict.confidence).toBe(0.0);
      expect(verdict.fatalVetoTriggered).toBe(true);
      expect(verdict.vetoReason).toContain('Duplicate option keys');
      expect(verdict.confidenceVector.identityConfidence).toBe(0.0);
      expect(verdict.suggestedAction).toBe('REJECT_SOURCE');
    });

    it('reduces ownership confidence when stem leakage is detected in an option', () => {
      const q = createMockUadueQuestion({
        options: [
          { key: 'A', index: 0, text: 'Option A', contentBlocks: [] },
          { key: 'B', index: 1, text: 'Option B', contentBlocks: [] },
          { key: 'C', index: 2, text: 'Option C', contentBlocks: [] },
          { key: 'D', index: 3, text: 'Option D with stem leakage: Q.27 What is the value of y?', contentBlocks: [] },
        ],
      });
      const verdict = evaluateUadueInvariants(q);
      expect(verdict.status).toBe('REVIEW_REQUIRED');
      expect(verdict.confidenceVector.ownershipConfidence).toBeLessThan(0.5);
    });
  });
});
