/**
 * Professional Manual Question Editor & Authoring Engine — Forensic Unit Tests
 * Mock.AI Production Ingestion Engine - Prompt 9/10
 *
 * Verifies:
 * 1. MCQ Dynamic Options (>= 2, add, remove, single correct answer validation)
 * 2. MSQ Validation (>= 2 options, >= 1 correct answers supported)
 * 3. NAT Numerical Validation (single value, min/max range, range ordering, tolerance)
 * 4. TRUE_FALSE Binary Options (exactly 2 options, correct answer validation)
 * 5. DESCRIPTIVE Questions (no option requirement, rubric scoring)
 * 6. Content Blocks (LaTeX math syntax, tables, images, code blocks)
 * 7. Scoring Rules (custom positive marks, negative marks, partial scoring)
 * 8. Draft vs Publish Gates (UNVERIFIED vs VERIFIED, strict validation on publish)
 * 9. Intelligent Debounced Autosave (scheduling, hash-deduping, loading, clearing)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateManualQuestion } from './manualQuestionValidator';
import { manualAutosaveService } from './manualAutosaveService';
import { CanonicalQuestion, QuestionType } from '../../../types/canonicalQuestion';
import { AutosavePayload } from './types';

describe('Manual Question Authoring & Editor Engine (PROMPT 9/10)', () => {
  // Helper to build canonical question fixture
  function createBaseQuestion(type: QuestionType = 'MCQ'): CanonicalQuestion {
    return {
      questionId: 'q-manual-001',
      sourceId: 'manual-session-1',
      questionNumber: 1,
      questionType: type,
      sourceType: 'Manual',
      provenance: {
        sourceType: 'Manual',
        sourceFile: 'manual_editor',
      },
      questionText: 'What is the time complexity of binary search on a sorted array?',
      contentBlocks: [
        {
          type: 'text',
          content: 'What is the time complexity of binary search on a sorted array?',
        },
      ],
      options: [
        { id: 'A', text: 'O(1)', isCorrect: false },
        { id: 'B', text: 'O(log n)', isCorrect: true },
        { id: 'C', text: 'O(n)', isCorrect: false },
        { id: 'D', text: 'O(n log n)', isCorrect: false },
      ],
      answer: {
        questionType: type,
        correctOptionId: 'B',
        correctOptionIndex: 1,
      },
      explanation: 'Binary search halves the search space at each step, yielding logarithmic time.',
      scoring: {
        marks: 2,
        negativeMarks: 0.66,
      },
      assets: [],
      verificationStatus: 'UNVERIFIED',
      verificationReasons: [],
      confidence: {
        extraction: 1.0,
        structure: 1.0,
        answer: 1.0,
        asset: 1.0,
      },
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. MCQ Dynamic Options & Correct Answer
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. MCQ (Multiple Choice Questions)', () => {
    it('validates standard 4-option MCQ with exactly one correct answer', () => {
      const q = createBaseQuestion('MCQ');
      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(true);
      expect(res.fieldErrors.options).toBeUndefined();
      expect(res.fieldErrors.answer).toBeUndefined();
    });

    it('supports dynamic option counts: 2 options (minimum allowed)', () => {
      const q = createBaseQuestion('MCQ');
      q.options = [
        { id: 'A', text: 'Linear', isCorrect: false },
        { id: 'B', text: 'Non-linear', isCorrect: true },
      ];
      q.answer = { questionType: 'MCQ', correctOptionIndex: 1, correctOptionId: 'B' };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(true);
      expect(res.fieldErrors.options).toBeUndefined();
    });

    it('supports dynamic option counts: 5 or more options (not hardcoded to 4)', () => {
      const q = createBaseQuestion('MCQ');
      q.options = [
        { id: 'A', text: 'Option A', isCorrect: false },
        { id: 'B', text: 'Option B', isCorrect: false },
        { id: 'C', text: 'Option C', isCorrect: true },
        { id: 'D', text: 'Option D', isCorrect: false },
        { id: 'E', text: 'Option E', isCorrect: false },
        { id: 'F', text: 'Option F', isCorrect: false },
      ];
      q.answer = { questionType: 'MCQ', correctOptionIndex: 2, correctOptionId: 'C' };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(true);
      expect(q.options.length).toBe(6);
    });

    it('rejects MCQ with fewer than 2 options', () => {
      const q = createBaseQuestion('MCQ');
      q.options = [{ id: 'A', text: 'Lone Option', isCorrect: true }];
      q.answer = { questionType: 'MCQ', correctOptionIndex: 0, correctOptionId: 'A' };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.options).toContain('requires at least 2 options');
    });

    it('rejects MCQ if any option text is completely blank and has no media', () => {
      const q = createBaseQuestion('MCQ');
      q.options = [
        { id: 'A', text: 'Valid option', isCorrect: true },
        { id: 'B', text: '   ', isCorrect: false },
      ];
      q.answer = { questionType: 'MCQ', correctOptionIndex: 0, correctOptionId: 'A' };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.options).toContain('cannot be blank');
    });

    it('rejects MCQ if no correct answer is specified', () => {
      const q = createBaseQuestion('MCQ');
      q.answer = { questionType: 'MCQ' }; // No correct option

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.answer).toContain('select exactly one correct answer');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. MSQ (Multiple Select Questions)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. MSQ (Multiple Select Questions)', () => {
    it('validates MSQ with multiple correct answers selected', () => {
      const q = createBaseQuestion('MSQ');
      q.options = [
        { id: 'A', text: 'Dijkstra', isCorrect: true },
        { id: 'B', text: 'Bellman-Ford', isCorrect: true },
        { id: 'C', text: 'Prim', isCorrect: false },
        { id: 'D', text: 'Kruskal', isCorrect: false },
      ];
      q.answer = {
        questionType: 'MSQ',
        correctOptionIds: ['A', 'B'],
        correctOptionIndices: [0, 1],
      };
      q.explanation = 'Dijkstra and Bellman-Ford are shortest path algorithms.';

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(true);
      expect(res.fieldErrors.options).toBeUndefined();
      expect(res.fieldErrors.answer).toBeUndefined();
    });

    it('rejects MSQ when no answers are selected as correct', () => {
      const q = createBaseQuestion('MSQ');
      q.options = [
        { id: 'A', text: 'Choice 1', isCorrect: false },
        { id: 'B', text: 'Choice 2', isCorrect: false },
      ];
      q.answer = {
        questionType: 'MSQ',
        correctOptionIds: [],
        correctOptionIndices: [],
      };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.answer).toContain('require at least one correct answer');
    });

    it('accepts MSQ with all options marked correct', () => {
      const q = createBaseQuestion('MSQ');
      q.options = [
        { id: 'A', text: 'Property 1', isCorrect: true },
        { id: 'B', text: 'Property 2', isCorrect: true },
        { id: 'C', text: 'Property 3', isCorrect: true },
      ];
      q.answer = {
        questionType: 'MSQ',
        correctOptionIds: ['A', 'B', 'C'],
        correctOptionIndices: [0, 1, 2],
      };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. NAT (Numerical Answer Type)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. NAT (Numerical Answer Type)', () => {
    it('validates NAT question with an exact numerical answer', () => {
      const q = createBaseQuestion('NAT');
      q.options = [];
      q.answer = {
        questionType: 'NAT',
        natValue: 3.1415,
      };
      q.explanation = 'Pi rounded to 4 decimals.';

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(true);
      expect(res.fieldErrors.answer).toBeUndefined();
    });

    it('validates NAT question with a valid min-max numerical range', () => {
      const q = createBaseQuestion('NAT');
      q.options = [];
      q.answer = {
        questionType: 'NAT',
        natRange: { min: 42.0, max: 42.5 },
      };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(true);
      expect(res.fieldErrors.answer).toBeUndefined();
    });

    it('rejects NAT question when range minimum exceeds maximum', () => {
      const q = createBaseQuestion('NAT');
      q.options = [];
      q.answer = {
        questionType: 'NAT',
        natRange: { min: 50.0, max: 40.0 }, // Invalid: min > max
      };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.answer).toContain('cannot exceed maximum');
    });

    it('rejects NAT question with missing value and range', () => {
      const q = createBaseQuestion('NAT');
      q.options = [];
      q.answer = {
        questionType: 'NAT',
      };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.answer).toContain('numerical answer or valid numerical range');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. TRUE_FALSE (Binary Choice)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. TRUE_FALSE Questions', () => {
    it('validates TRUE_FALSE question with exactly two binary options', () => {
      const q = createBaseQuestion('TRUE_FALSE');
      q.options = [
        { id: 'T', text: 'True', isCorrect: true },
        { id: 'F', text: 'False', isCorrect: false },
      ];
      q.answer = {
        questionType: 'TRUE_FALSE',
        correctOptionId: 'T',
        correctOptionIndex: 0,
      };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(true);
      expect(res.fieldErrors.options).toBeUndefined();
    });

    it('rejects TRUE_FALSE if options count is not 2', () => {
      const q = createBaseQuestion('TRUE_FALSE');
      q.options = [
        { id: 'T', text: 'True', isCorrect: true },
        { id: 'F', text: 'False', isCorrect: false },
        { id: 'M', text: 'Maybe', isCorrect: false },
      ];

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.options).toContain('must contain exactly 2 options');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. DESCRIPTIVE Questions
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. DESCRIPTIVE Questions', () => {
    it('validates DESCRIPTIVE question without requiring options or answer index', () => {
      const q = createBaseQuestion('DESCRIPTIVE');
      q.options = [];
      q.answer = {
        questionType: 'DESCRIPTIVE',
      };
      q.explanation = 'Rubric: 2 marks for definition, 3 marks for derivation.';

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(true);
      expect(res.fieldErrors.options).toBeUndefined();
      expect(res.fieldErrors.answer).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Content Blocks & Rich Media Validation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('6. Content Blocks & Rich Media', () => {
    it('validates rich content blocks including equations, code, and tables', () => {
      const q = createBaseQuestion('MCQ');
      q.contentBlocks = [
        {
          type: 'equation',
          latex: 'E = mc^2',
        },
        {
          type: 'code',
          content: 'def solve(x):\n    return x * 2',
          language: 'python',
        },
        {
          type: 'table',
          headers: ['Operation', 'Complexity'],
          rows: [
            ['Lookup', 'O(1)'],
            ['Insertion', 'O(1)'],
          ],
        },
      ];

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(true);
      expect(res.fieldErrors.contentBlocks).toBeUndefined();
    });

    it('catches malformed LaTeX equations in question text', () => {
      const q = createBaseQuestion('MCQ');
      q.questionText = 'Solve for $x in the equation: $x^2 + 5x + 6 = 0$'; // Unmatched single dollar

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.questionText).toBeDefined();
    });

    it('catches empty or malformed content blocks with fatal issues', () => {
      const q = createBaseQuestion('MCQ');
      q.contentBlocks = [
        {
          type: 'image',
          assetUrl: '', // Missing URL
        },
      ];

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.contentBlocks).toContain('image');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Scoring Rules & Taxonomies
  // ─────────────────────────────────────────────────────────────────────────────
  describe('7. Scoring Configuration', () => {
    it('validates custom positive marks and negative penalty', () => {
      const q = createBaseQuestion('MCQ');
      q.scoring = {
        marks: 3,
        negativeMarks: 1,
        scoringRule: 'COMPETITIVE_EXAM_GATE',
      };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(true);
      expect(res.fieldErrors.scoring).toBeUndefined();
    });

    it('rejects zero or negative marks for correct answers', () => {
      const q = createBaseQuestion('MCQ');
      q.scoring = {
        marks: 0,
        negativeMarks: 0,
      };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.scoring).toContain('positive number greater than 0');
    });

    it('rejects negative marks less than 0', () => {
      const q = createBaseQuestion('MCQ');
      q.scoring = {
        marks: 2,
        negativeMarks: -0.5,
      };

      const res = validateManualQuestion(q);
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.scoring).toContain('cannot be less than 0');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Draft vs Publish Enforcement
  // ─────────────────────────────────────────────────────────────────────────────
  describe('8. Draft vs Publish Gating', () => {
    it('allows saving incomplete questions as DRAFT without blocking validation errors', () => {
      const draftQuestion = createBaseQuestion('MCQ');
      draftQuestion.questionText = ''; // Incomplete stem
      draftQuestion.verificationStatus = 'UNVERIFIED';

      const res = validateManualQuestion(draftQuestion, true); // isDraft = true
      // Question text shouldn't be a fatal error in draft mode
      expect(res.fieldErrors.questionText).toBeUndefined();
      expect(res.warnings.length).toBeGreaterThan(0);
      expect(res.warnings[0]).toContain('currently empty in this draft');
    });

    it('strictly forbids PUBLISHING questions with empty question stem', () => {
      const publishQuestion = createBaseQuestion('MCQ');
      publishQuestion.questionText = '';
      publishQuestion.verificationStatus = 'VERIFIED';

      const res = validateManualQuestion(publishQuestion, false); // isDraft = false
      expect(res.isValid).toBe(false);
      expect(res.fieldErrors.questionText).toContain('Question text or prompt is required');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Intelligent Debounced Autosave Service
  // ─────────────────────────────────────────────────────────────────────────────
  describe('9. Intelligent Debounced Autosave Service', () => {
    const testId = 'test-manual-save-101';
    let mockStorage: Record<string, string> = {};

    beforeEach(() => {
      mockStorage = {};
      vi.useFakeTimers();

      // Mock window.localStorage
      const storageMock = {
        getItem: vi.fn((key: string) => mockStorage[key] || null),
        setItem: vi.fn((key: string, val: string) => {
          mockStorage[key] = val;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          mockStorage = {};
        }),
      };

      Object.defineProperty(window, 'localStorage', {
        value: storageMock,
        writable: true,
      });
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
      manualAutosaveService.clearDraft(testId);
    });

    it('schedules autosave and persists after debounce interval', () => {
      const payload: AutosavePayload = {
        testId,
        title: 'Algorithms Mock 1',
        category: 'GATE CS',
        isDraft: true,
        questions: [createBaseQuestion('MCQ')],
        updatedAt: Date.now(),
      };

      const onSaved = vi.fn();
      manualAutosaveService.scheduleAutosave(payload, onSaved, 600);

      // Not saved immediately
      expect(onSaved).not.toHaveBeenCalled();

      // Advance timers past 600ms
      vi.advanceTimersByTime(650);

      expect(onSaved).toHaveBeenCalled();
      const saved = manualAutosaveService.loadDraft(testId);
      expect(saved).not.toBeNull();
      expect(saved?.title).toBe('Algorithms Mock 1');
      expect(saved?.questions.length).toBe(1);
    });

    it('debounces rapid keystroke calls and executes once for latest payload', () => {
      const onSaved = vi.fn();

      for (let i = 1; i <= 5; i++) {
        const payload: AutosavePayload = {
          testId,
          title: `Keystroke Version ${i}`,
          category: 'GATE CS',
          isDraft: true,
          questions: [createBaseQuestion('MCQ')],
          updatedAt: Date.now(),
        };
        manualAutosaveService.scheduleAutosave(payload, onSaved, 600);
        vi.advanceTimersByTime(100); // 100ms between keystrokes
      }

      // 5 calls spaced by 100ms; total 500ms elapsed. Debounce timer reset each time.
      expect(onSaved).not.toHaveBeenCalled();

      // Now advance past remaining 600ms
      vi.advanceTimersByTime(650);

      expect(onSaved).toHaveBeenCalledTimes(1);
      const saved = manualAutosaveService.loadDraft(testId);
      expect(saved?.title).toBe('Keystroke Version 5');
    });

    it('persists immediately with persistNow and skips redundant identical writes', () => {
      const payload: AutosavePayload = {
        testId,
        title: 'Static Test',
        category: 'GATE CS',
        isDraft: true,
        questions: [createBaseQuestion('MCQ')],
        updatedAt: 1000,
      };

      const firstWrite = manualAutosaveService.persistNow(payload);
      expect(firstWrite).toBe(true);

      // Writing identical content should skip redundant write
      const secondWrite = manualAutosaveService.persistNow(payload);
      expect(secondWrite).toBe(false);
    });

    it('clears draft from storage and clears timers on clearDraft', () => {
      const payload: AutosavePayload = {
        testId,
        title: 'Draft to Clear',
        category: 'GATE CS',
        isDraft: true,
        questions: [],
        updatedAt: Date.now(),
      };

      manualAutosaveService.persistNow(payload);
      expect(manualAutosaveService.loadDraft(testId)).not.toBeNull();

      manualAutosaveService.clearDraft(testId);
      expect(manualAutosaveService.loadDraft(testId)).toBeNull();
    });
  });
});
