import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeMcqOption,
  normalizeMsqOptions,
  normalizeNatAnswer,
  isMtaToken,
  extractAnswerKeyFromLines,
  calculateNegativeMarks,
} from './answerKeyExtractor';
import {
  resolvePaperIdentity,
  validateSourceIdentityCompatibility,
} from './paperIdentityResolver';
import {
  validateQuestionSequence,
  matchQuestionsWithAnswerKey,
} from './deterministicMatcher';
import { ingestPairedExamSources } from './sourcePairingEngine';
import { CanonicalQuestion, CanonicalOption } from '../../../types/canonicalQuestion';

describe('Source Pairing & Verification Engine Test Suite', () => {
  // =========================================================================
  // Category A & B: Normalization Tests
  // =========================================================================
  describe('Category B: Answer Normalization & Syntax Tests', () => {
    it('normalizes single MCQ options from various formats', () => {
      expect(normalizeMcqOption('A')).toBe('A');
      expect(normalizeMcqOption('a')).toBe('A');
      expect(normalizeMcqOption('(B)')).toBe('B');
      expect(normalizeMcqOption('Option C')).toBe('C');
      expect(normalizeMcqOption('Ans: D')).toBe('D');
      expect(normalizeMcqOption('InvalidOption')).toBeNull();
    });

    it('normalizes MSQ option combinations into sorted unique letter arrays', () => {
      expect(normalizeMsqOptions('A,C,D')).toEqual(['A', 'C', 'D']);
      expect(normalizeMsqOptions('A C D')).toEqual(['A', 'C', 'D']);
      expect(normalizeMsqOptions('ACD')).toEqual(['A', 'C', 'D']);
      expect(normalizeMsqOptions('D, B, A')).toEqual(['A', 'B', 'D']);
      expect(normalizeMsqOptions('B; C')).toEqual(['B', 'C']);
      expect(normalizeMsqOptions('A')).toBeNull(); // Single letter is handled by MCQ
    });

    it('normalizes NAT numerical values and inclusive ranges', () => {
      // Range formats
      const range1 = normalizeNatAnswer('3.14 to 3.15');
      expect(range1?.natRange).toEqual({ min: 3.14, max: 3.15 });

      const range2 = normalizeNatAnswer('3.14 - 3.15');
      expect(range2?.natRange).toEqual({ min: 3.14, max: 3.15 });

      const range3 = normalizeNatAnswer('3.14 -- 3.15');
      expect(range3?.natRange).toEqual({ min: 3.14, max: 3.15 });

      // Negative ranges
      const negRange = normalizeNatAnswer('-10 to -5');
      expect(negRange?.natRange).toEqual({ min: -10, max: -5 });

      // Single values
      const single = normalizeNatAnswer('42');
      expect(single?.natValue).toBe(42);
      expect(single?.natRange).toEqual({ min: 42, max: 42 });

      const dec = normalizeNatAnswer('0.005');
      expect(dec?.natValue).toBe(0.005);

      // Non-numeric text
      expect(normalizeNatAnswer('NotANumber')).toBeNull();
    });

    it('detects Marks To All (MTA) tokens accurately', () => {
      expect(isMtaToken('MTA')).toBe(true);
      expect(isMtaToken('Marks to All')).toBe(true);
      expect(isMtaToken('MARKS TO ALL')).toBe(true);
      expect(isMtaToken('Option A')).toBe(false);
    });
  });

  // =========================================================================
  // Category C: Paper Identity & Compatibility Tests
  // =========================================================================
  describe('Category C: Paper Identity & Source Compatibility Tests', () => {
    it('resolves GATE paper identity from headers and text', () => {
      const lines = [
        'GATE 2024 Examination',
        'DA: Data Science and Artificial Intelligence',
        'Session 1',
        'Organizing Institute: IISc Bangalore',
      ];
      const identity = resolvePaperIdentity(lines, 'GATE_2024_DA.pdf');
      expect(identity.exam).toBe('GATE');
      expect(identity.year).toBe(2024);
      expect(identity.paperCode).toBe('DA');
      expect(identity.subject).toBe('Data Science & Artificial Intelligence');
    });

    it('flags SOURCE_MISMATCH when Question Paper (DA) and Answer Key (CS) codes differ', () => {
      const qpIdentity = { exam: 'GATE', year: 2025, paperCode: 'DA', confidence: 0.9 };
      const akIdentity = { exam: 'GATE', year: 2025, paperCode: 'CS', confidence: 0.9 };

      const check = validateSourceIdentityCompatibility(qpIdentity, akIdentity);
      expect(check.isCompatible).toBe(false);
      expect(check.mismatchReason).toContain('Discipline mismatch');
      expect(check.mismatchReason).toContain('DA');
      expect(check.mismatchReason).toContain('CS');
    });

    it('flags SOURCE_MISMATCH when examination years differ', () => {
      const qpIdentity = { exam: 'GATE', year: 2024, paperCode: 'CS', confidence: 0.9 };
      const akIdentity = { exam: 'GATE', year: 2025, paperCode: 'CS', confidence: 0.9 };

      const check = validateSourceIdentityCompatibility(qpIdentity, akIdentity);
      expect(check.isCompatible).toBe(false);
      expect(check.mismatchReason).toContain('Year mismatch');
    });

    it('allows matching when identity matches or is compatible', () => {
      const qpIdentity = { exam: 'GATE', year: 2025, paperCode: 'DA', confidence: 0.9 };
      const akIdentity = { exam: 'GATE', year: 2025, paperCode: 'DA', confidence: 0.9 };

      const check = validateSourceIdentityCompatibility(qpIdentity, akIdentity);
      expect(check.isCompatible).toBe(true);
    });
  });

  // =========================================================================
  // Category D & E: Answer Key Parsing & Question Type Extraction
  // =========================================================================
  describe('Category D: Answer Key Table Parsing Tests', () => {
    it('parses tabular official GATE Master Answer Key lines', () => {
      const tableLines = [
        'Q.No. | Session | Question Type | Section | Key/Range | Mark',
        '1 | 1 | MCQ | GA | B | 1',
        '16 | 1 | MSQ | DA | A, C, D | 2',
        '25 | 1 | NAT | DA | 3.14 to 3.15 | 2',
        '33 | 1 | MCQ | DA | MTA | 1',
      ];

      const entries = extractAnswerKeyFromLines(tableLines);
      expect(entries.length).toBe(4);

      // Q1: MCQ
      expect(entries[0].questionNumber).toBe(1);
      expect(entries[0].detectedType).toBe('MCQ');
      expect(entries[0].mcqOption).toBe('B');
      expect(entries[0].marks).toBe(1);
      expect(entries[0].negativeMarks).toBe(0.33);

      // Q16: MSQ
      expect(entries[1].questionNumber).toBe(16);
      expect(entries[1].detectedType).toBe('MSQ');
      expect(entries[1].msqOptions).toEqual(['A', 'C', 'D']);
      expect(entries[1].marks).toBe(2);
      expect(entries[1].negativeMarks).toBe(0); // Zero negative marks for MSQ!

      // Q25: NAT
      expect(entries[2].questionNumber).toBe(25);
      expect(entries[2].detectedType).toBe('NAT');
      expect(entries[2].natRange).toEqual({ min: 3.14, max: 3.15 });
      expect(entries[2].marks).toBe(2);
      expect(entries[2].negativeMarks).toBe(0); // Zero negative marks for NAT!

      // Q33: MTA
      expect(entries[3].questionNumber).toBe(33);
      expect(entries[3].isMta).toBe(true);
    });
  });

  // =========================================================================
  // Category F & G: Deterministic Matching & Sequence Monotonicity
  // =========================================================================
  describe('Category F: Deterministic Sequence & Matching Tests', () => {
    it('detects MISSING_QUESTION_NUMBER when sequence has missing gaps', () => {
      const seq = validateQuestionSequence([1, 2, 4, 5]);
      expect(seq.hasAnomaly).toBe(true);
      expect(seq.missingNumbers).toEqual([3]);
      expect(seq.anomalyReasons[0]).toContain('MISSING_QUESTION_NUMBER: Question 3');
    });

    it('detects DUPLICATE_QUESTION_NUMBER when numbers repeat', () => {
      const seq = validateQuestionSequence([1, 2, 3, 3, 4]);
      expect(seq.hasAnomaly).toBe(true);
      expect(seq.duplicateNumbers).toEqual([3]);
      expect(seq.anomalyReasons[0]).toContain('DUPLICATE_QUESTION_NUMBER: Question 3');
    });

    it('detects QUESTION_SEQUENCE_ANOMALY on sudden numbering jumps', () => {
      const seq = validateQuestionSequence([1, 2, 8, 9]);
      expect(seq.hasAnomaly).toBe(true);
      expect(seq.anomalyReasons.some((r) => r.includes('QUESTION_SEQUENCE_ANOMALY'))).toBe(true);
    });

    it('matches questions deterministically without altering question stem or visual assets', () => {
      const mockQuestion: CanonicalQuestion = {
        questionId: 'q_test_1',
        sourceId: 'hash123',
        sourceType: 'PDF',
        questionNumber: 1,
        questionText: 'What is the limit of $f(x)$ as $x \\to 0$?',
        contentBlocks: [{ type: 'text', content: 'What is the limit of $f(x)$ as $x \\to 0$?' }],
        questionType: 'MCQ',
        options: [
          { id: 'A', text: '0', isCorrect: false },
          { id: 'B', text: '1', isCorrect: false },
          { id: 'C', text: 'Infinity', isCorrect: false },
        ],
        answer: { questionType: 'MCQ' },
        scoring: { marks: 1, negativeMarks: 0.33, scoringRule: 'STANDARD' },
        provenance: { sourceType: 'PDF', sourceFile: 'GATE_2025.pdf', sourcePage: 1 },
        assets: [
          { assetId: 'diag_1', assetType: 'diagram', assetUrl: '/assets/diag1.png', ownership: 'question' },
        ],
        explanation: '',
        verificationStatus: 'UNVERIFIED',
        verificationReasons: [],
        confidence: { extraction: 1, structure: 1, answer: 0.5, asset: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const mockAnswerEntry = {
        questionNumber: 1,
        rawAnswerText: 'B',
        detectedType: 'MCQ' as const,
        mcqOption: 'B',
        marks: 1,
        negativeMarks: 0.33,
      };

      const result = matchQuestionsWithAnswerKey([mockQuestion], [mockAnswerEntry]);
      expect(result.matchedCount).toBe(1);
      expect(result.reviewRequiredCount).toBe(0);

      // Question content & assets must remain 100% intact (Section 11)
      expect(mockQuestion.questionText).toBe('What is the limit of $f(x)$ as $x \\to 0$?');
      expect(mockQuestion.assets.length).toBe(1);
      expect(mockQuestion.assets[0].ownership).toBe('question');

      // Answer & scoring must be accurately updated
      expect(mockQuestion.answer.correctOptionId).toBe('B');
      expect(mockQuestion.options[1].isCorrect).toBe(true);
      expect(mockQuestion.verificationStatus).toBe('VERIFIED');
    });

    it('flags SOURCE_CONFLICT when Answer Key specifies option not present in question', () => {
      const mockQuestion: CanonicalQuestion = {
        questionId: 'q_test_2',
        sourceId: 'hash123',
        sourceType: 'PDF',
        questionNumber: 2,
        questionText: 'Sample question stem with 3 options.',
        contentBlocks: [],
        questionType: 'MCQ',
        options: [
          { id: 'A', text: 'Alpha' },
          { id: 'B', text: 'Beta' },
          { id: 'C', text: 'Gamma' },
        ],
        answer: { questionType: 'MCQ' },
        scoring: { marks: 1, negativeMarks: 0.33 },
        provenance: { sourceType: 'PDF' },
        assets: [],
        explanation: '',
        verificationStatus: 'UNVERIFIED',
        verificationReasons: [],
        confidence: { extraction: 1, structure: 1, answer: 0.5, asset: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Answer key claims D, but question only has A, B, C!
      const mockAnswerEntry = {
        questionNumber: 2,
        rawAnswerText: 'D',
        detectedType: 'MCQ' as const,
        mcqOption: 'D',
      };

      const result = matchQuestionsWithAnswerKey([mockQuestion], [mockAnswerEntry]);
      expect(result.sourceConflictsCount).toBe(1);
      expect(mockQuestion.verificationStatus).toBe('REVIEW_REQUIRED');
      expect(mockQuestion.verificationReasons[0]).toContain('SOURCE_CONFLICT');
    });
  });

  // =========================================================================
  // Category H & J: Standalone & "Continue without Answer Key" Modes
  // =========================================================================
  describe('Category H: Standalone Ingestion Modes', () => {
    it('sets UNVERIFIED and answer pending when continuing without answer key', () => {
      const mockQuestion: CanonicalQuestion = {
        questionId: 'q_test_3',
        sourceId: 'hash123',
        sourceType: 'PDF',
        questionNumber: 1,
        questionText: 'Question without answer key',
        contentBlocks: [],
        questionType: 'MCQ',
        options: [
          { id: 'A', text: 'Opt A' },
          { id: 'B', text: 'Opt B' },
        ],
        answer: { questionType: 'MCQ' },
        scoring: { marks: 1, negativeMarks: 0.33 },
        provenance: { sourceType: 'PDF' },
        assets: [],
        explanation: '',
        verificationStatus: 'UNVERIFIED',
        verificationReasons: [],
        confidence: { extraction: 1, structure: 1, answer: 0, asset: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = matchQuestionsWithAnswerKey([mockQuestion], [], { isStandaloneQp: true });
      expect(result.matches[0].matchStatus).toBe('QUESTION_PAPER_ONLY');
      expect(mockQuestion.verificationStatus).toBe('UNVERIFIED');
      expect(mockQuestion.verificationReasons[0]).toContain('Verification pending official key upload');
      expect(mockQuestion.answer.correctOptionId).toBeUndefined(); // Never silently guess Option A!
    });
  });

  // =========================================================================
  // Category K & L: Scoring & Regression Tests
  // =========================================================================
  describe('Category L: GATE Negative Marking Rules', () => {
    it('computes exact GATE negative marks for 1-mark and 2-mark MCQs', () => {
      expect(calculateNegativeMarks('MCQ', 1)).toBe(0.33);
      expect(calculateNegativeMarks('MCQ', 2)).toBe(0.66);
    });

    it('computes zero negative marks for MSQ and NAT', () => {
      expect(calculateNegativeMarks('MSQ', 1)).toBe(0);
      expect(calculateNegativeMarks('MSQ', 2)).toBe(0);
      expect(calculateNegativeMarks('NAT', 1)).toBe(0);
      expect(calculateNegativeMarks('NAT', 2)).toBe(0);
    });
  });
});
