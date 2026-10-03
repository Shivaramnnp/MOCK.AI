import { describe, it, expect } from 'vitest';
import {
  toCanonicalQuestion,
  toLegacyQuestion,
  toCompetitiveQuestion,
  toCanonicalContentBlock,
  fromCanonicalContentBlock,
} from './questionMigrator';
import { CompetitiveQuestion, ContentBlock } from '../../types';
import { CanonicalQuestion } from '../../types/canonicalQuestion';

describe('Empirical Stress Testing: Question Migrators (questionMigrator.ts)', () => {
  describe('1. Empty String Option Handling (GATE 2024 DA Q9 & SSC CHSL Q26 Invariant)', () => {
    it('preserves empty string options without coercing to undefined or fallback in CompetitiveQuestion round-trip', () => {
      const cq: CompetitiveQuestion = {
        id: 'q-empty-opt-1',
        questionNumber: 26,
        sectionId: 'sec_reasoning',
        sectionName: 'General Intelligence',
        questionText: 'Select the correct mirror image of the given figure.',
        options: ['', '', '', ''],
        optionImages: [
          '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_a.png',
          '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_b.png',
          '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_c.png',
          '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_d.png',
        ],
        richOptions: [
          { id: 'A', text: '', imageUrl: '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_a.png', displayMode: 'IMAGE_ONLY', ocrText: '28' },
          { id: 'B', text: '', imageUrl: '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_b.png', displayMode: 'IMAGE_ONLY', ocrText: '25' },
          { id: 'C', text: '', imageUrl: '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_c.png', displayMode: 'IMAGE_ONLY', ocrText: '22' },
          { id: 'D', text: '', imageUrl: '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_d.png', displayMode: 'IMAGE_ONLY', ocrText: '30' },
        ],
        correctAnswer: 'A',
        correctAnswerIndex: 0,
        explanation: 'Mirror reflection across horizontal line MN.',
        marks: 2,
        negativeMarks: 0.5,
        examId: 'ssc-chsl-2024-01jul-s1',
        year: 2024,
        date: '2024-07-01',
        shift: '1',
        tier: '1',
        language: 'English',
        confidence: 'VERIFIED',
      };

      const canonical = toCanonicalQuestion(cq);

      // Verify canonical options preserve empty string text
      expect(canonical.options.length).toBe(4);
      expect(canonical.options[0].text).toBe('');
      expect(canonical.options[1].text).toBe('');
      expect(canonical.options[2].text).toBe('');
      expect(canonical.options[3].text).toBe('');

      // Verify metadata is preserved
      expect(canonical.options[0].displayMode).toBe('IMAGE_ONLY');
      expect(canonical.options[0].ocrText).toBe('28');
      expect(canonical.options[0].imageUrl).toBe('/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_a.png');

      // Round-trip back to CompetitiveQuestion
      const roundTrip = toCompetitiveQuestion(canonical);
      expect(roundTrip.options).toEqual(['', '', '', '']);
      expect(roundTrip.optionImages).toEqual([
        '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_a.png',
        '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_b.png',
        '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_c.png',
        '/exam-assets/ssc/chsl/2024/01jul-s1/q26_opt_d.png',
      ]);
      expect(roundTrip.richOptions?.[0].text).toBe('');
      expect(roundTrip.richOptions?.[0].ocrText).toBe('28');
      expect(roundTrip.richOptions?.[0].displayMode).toBe('IMAGE_ONLY');
    });

    it('falls back to "Option X" in legacy Question when option text is empty string', () => {
      const canonical: CanonicalQuestion = {
        questionId: 'q-legacy-fallback',
        sourceId: 'test',
        sourceType: 'PDF',
        questionNumber: 1,
        questionText: 'Visual question',
        contentBlocks: [{ type: 'text', content: 'Visual question' }],
        questionType: 'MCQ',
        options: [
          { id: 'A', text: '', imageUrl: '/opt_a.png' },
          { id: 'B', text: '', imageUrl: '/opt_b.png' },
        ],
        answer: { questionType: 'MCQ', correctOptionId: 'A', correctOptionIndex: 0 },
        scoring: { marks: 1, negativeMarks: 0, scoringRule: 'STANDARD' },
        provenance: { sourceType: 'PDF' },
        assets: [],
        explanation: '',
        verificationStatus: 'VERIFIED',
        verificationReasons: [],
        confidence: { extraction: 1, structure: 1, answer: 1, asset: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const legacy = toLegacyQuestion(canonical);
      expect(legacy.options).toEqual(['Option A', 'Option B']);
      expect(legacy.correctAnswerIndex).toBe(0);
    });
  });

  describe('2. Null and Undefined Handling in Options and Assets', () => {
    it('gracefully handles undefined and null options arrays without throwing', () => {
      const cqWithUndefinedOpts = {
        id: 'q-undef-opts',
        questionNumber: 1,
        sectionId: 'sec_1',
        sectionName: 'General',
        questionText: 'NAT question with no options',
        questionType: 'NAT',
        options: undefined as any,
        answerRange: { min: 42, max: 42 },
        correctAnswer: '42',
        correctAnswerIndex: -1,
        marks: 2,
        negativeMarks: 0,
        examId: 'test',
        year: 2025,
        date: '',
        shift: '',
        tier: '',
        language: 'English',
        explanation: '',
      } as CompetitiveQuestion;

      const canonical1 = toCanonicalQuestion(cqWithUndefinedOpts);
      expect(canonical1.options).toEqual([]);
      expect(canonical1.questionType).toBe('NAT');

      const cqWithNullOpts = {
        id: 'q-null-opts',
        questionNumber: 2,
        sectionId: 'sec_1',
        sectionName: 'General',
        questionText: 'Question with null options',
        questionType: 'MCQ',
        options: null as any,
        correctAnswer: 'A',
        correctAnswerIndex: 0,
        marks: 1,
        negativeMarks: 0,
        examId: 'test',
        year: 2025,
        date: '',
        shift: '',
        tier: '',
        language: 'English',
        explanation: '',
      } as CompetitiveQuestion;

      const canonical2 = toCanonicalQuestion(cqWithNullOpts);
      expect(canonical2.options).toEqual([]);
    });

    it('handles null and undefined elements inside options array', () => {
      const cqWithNullElements: CompetitiveQuestion = {
        id: 'q-null-elements',
        questionNumber: 3,
        sectionId: 'sec_1',
        sectionName: 'General',
        questionText: 'Question with corrupt option elements',
        options: [null as any, undefined as any, '', 'Valid Text'],
        correctAnswer: 'D',
        correctAnswerIndex: 3,
        marks: 1,
        negativeMarks: 0,
        examId: 'test-exam',
        year: 2025,
        date: '',
        shift: '',
        tier: '',
        language: 'English',
        explanation: '',
      };

      const canonical = toCanonicalQuestion(cqWithNullElements);
      expect(canonical.options.length).toBe(4);
      expect(canonical.options[0].text).toBeNull();
      expect(canonical.options[1].text).toBeUndefined();
      expect(canonical.options[2].text).toBe('');
      expect(canonical.options[3].text).toBe('Valid Text');

      // toLegacyQuestion handles null/undefined/empty string by providing fallback
      const legacy = toLegacyQuestion(canonical);
      expect(legacy.options[0]).toBe('Option A');
      expect(legacy.options[1]).toBe('Option B');
      expect(legacy.options[2]).toBe('Option C');
      expect(legacy.options[3]).toBe('Valid Text');
    });

    it('handles null and undefined richOptions gracefully', () => {
      const cqNullRichOpts: CompetitiveQuestion = {
        id: 'q-null-rich',
        questionNumber: 4,
        sectionId: 'sec_1',
        sectionName: 'General',
        questionText: 'Question with null richOptions',
        options: ['Alpha', 'Beta'],
        richOptions: null as any,
        optionImages: null as any,
        correctAnswer: 'A',
        correctAnswerIndex: 0,
        marks: 1,
        negativeMarks: 0,
        examId: 'test-exam',
        year: 2025,
        date: '',
        shift: '',
        tier: '',
        language: 'English',
        explanation: '',
      };

      const canonical = toCanonicalQuestion(cqNullRichOpts);
      expect(canonical.options.length).toBe(2);
      expect(canonical.options[0].text).toBe('Alpha');
      expect(canonical.options[0].imageUrl).toBeNull();
    });

    it('handles missing or out-of-order richOptions IDs', () => {
      const cqUnordered: CompetitiveQuestion = {
        id: 'q-unordered-rich',
        questionNumber: 5,
        sectionId: 'sec_1',
        sectionName: 'General',
        questionText: 'Unordered rich options',
        options: ['Choice 1', 'Choice 2', 'Choice 3', 'Choice 4'],
        richOptions: [
          { id: 'C', text: 'Overridden Choice 3', displayMode: 'TEXT_ONLY' },
          { id: 'A', text: 'Overridden Choice 1', displayMode: 'TEXT_ONLY' },
        ],
        correctAnswer: 'C',
        correctAnswerIndex: 2,
        marks: 1,
        negativeMarks: 0,
        examId: 'test',
        year: 2025,
        date: '',
        shift: '',
        tier: '',
        language: 'English',
        explanation: '',
      };

      const canonical = toCanonicalQuestion(cqUnordered);
      expect(canonical.options[0].text).toBe('Overridden Choice 1'); // matched by id: 'A'
      expect(canonical.options[1].text).toBe('Choice 2'); // fell back to options[1]
      expect(canonical.options[2].text).toBe('Overridden Choice 3'); // matched by id: 'C'
      expect(canonical.options[3].text).toBe('Choice 4'); // fell back to options[3]
    });
  });

  describe('3. Mixed Options Diversity (TEXT_ONLY, IMAGE_ONLY, TEXT_AND_IMAGE)', () => {
    it('faithfully preserves diverse option modes in a single question', () => {
      const mixedCq: CompetitiveQuestion = {
        id: 'q-mixed-opts',
        questionNumber: 10,
        sectionId: 'sec_mixed',
        sectionName: 'Integrated Reasoning',
        questionText: 'Match the representation to its symbol.',
        options: ['Symbol Alpha Text', '', 'Formula \\(x^2\\)', ''],
        optionImages: [null, '/assets/symbol_b.png', null, '/assets/symbol_d.png'],
        richOptions: [
          { id: 'A', text: 'Symbol Alpha Text', displayMode: 'TEXT_ONLY' },
          { id: 'B', text: '', imageUrl: '/assets/symbol_b.png', displayMode: 'IMAGE_ONLY', ocrText: 'Beta' },
          { id: 'C', text: 'Formula \\(x^2\\)', displayMode: 'TEXT_ONLY' },
          { id: 'D', text: '', imageUrl: '/assets/symbol_d.png', displayMode: 'IMAGE_ONLY', ocrText: 'Delta' },
        ],
        correctAnswer: 'B',
        correctAnswerIndex: 1,
        explanation: 'Symbol Beta corresponds to the definition.',
        marks: 2,
        negativeMarks: 0.66,
        examId: 'mixed-exam',
        year: 2025,
        date: '2025-01-01',
        shift: '1',
        tier: '1',
        language: 'English',
      };

      const canonical = toCanonicalQuestion(mixedCq);

      expect(canonical.options[0].displayMode).toBe('TEXT_ONLY');
      expect(canonical.options[0].text).toBe('Symbol Alpha Text');
      expect(canonical.options[0].imageUrl).toBeNull();

      expect(canonical.options[1].displayMode).toBe('IMAGE_ONLY');
      expect(canonical.options[1].text).toBe('');
      expect(canonical.options[1].imageUrl).toBe('/assets/symbol_b.png');
      expect(canonical.options[1].ocrText).toBe('Beta');

      expect(canonical.options[2].displayMode).toBe('TEXT_ONLY');
      expect(canonical.options[2].text).toBe('Formula \\(x^2\\)');

      expect(canonical.options[3].displayMode).toBe('IMAGE_ONLY');
      expect(canonical.options[3].text).toBe('');
      expect(canonical.options[3].imageUrl).toBe('/assets/symbol_d.png');

      const competitive = toCompetitiveQuestion(canonical);
      expect(competitive.options).toEqual(['Symbol Alpha Text', '', 'Formula \\(x^2\\)', '']);
      expect(competitive.optionImages).toEqual([null, '/assets/symbol_b.png', null, '/assets/symbol_d.png']);
      expect(competitive.richOptions?.[1].ocrText).toBe('Beta');
    });
  });

  describe('4. NAT and MSQ Complex Answer Formats', () => {
    it('migrates NAT with numeric range correctly', () => {
      const natCq: CompetitiveQuestion = {
        id: 'q-nat-1',
        questionNumber: 50,
        sectionId: 'sec_1',
        sectionName: 'General',
        questionText: 'Calculate the integral value.',
        questionType: 'NAT',
        options: [],
        answerRange: { min: 3.14, max: 3.16 },
        correctAnswer: '3.14 to 3.16',
        correctAnswerIndex: -1,
        marks: 2,
        negativeMarks: 0,
        examId: 'gate-2025-ma',
        year: 2025,
        date: '',
        shift: '',
        tier: '',
        language: 'English',
        explanation: 'Pi approximation.',
      };

      const canonical = toCanonicalQuestion(natCq);
      expect(canonical.questionType).toBe('NAT');
      expect(canonical.answer.natRange).toEqual({ min: 3.14, max: 3.16 });
      expect(canonical.scoring.scoringRule).toBe('GATE_NAT');

      const back = toCompetitiveQuestion(canonical);
      expect(back.answerRange).toEqual({ min: 3.14, max: 3.16 });
    });

    it('migrates MSQ with multi-option answer sets correctly', () => {
      const msqCq: CompetitiveQuestion = {
        id: 'q-msq-1',
        questionNumber: 15,
        sectionId: 'sec_1',
        sectionName: 'General',
        questionText: 'Which of the following statements are TRUE?',
        questionType: 'MSQ',
        options: ['Statement A', 'Statement B', 'Statement C', 'Statement D'],
        correctAnswerSet: ['A', 'C'],
        correctAnswerIndices: [0, 2],
        correctAnswerSets: [['A', 'C']],
        correctAnswer: 'A;C',
        correctAnswerIndex: -1,
        marks: 2,
        negativeMarks: 0,
        examId: 'gate-2025-cs',
        year: 2025,
        date: '',
        shift: '',
        tier: '',
        language: 'English',
        explanation: 'A and C are theorems.',
      };

      const canonical = toCanonicalQuestion(msqCq);
      expect(canonical.questionType).toBe('MSQ');
      expect(canonical.answer.correctOptionIds).toEqual(['A', 'C']);
      expect(canonical.answer.correctOptionIndices).toEqual([0, 2]);
      expect(canonical.scoring.partialMarking).toBe(true);
      expect(canonical.scoring.scoringRule).toBe('GATE_MSQ');

      const back = toCompetitiveQuestion(canonical);
      expect(back.correctAnswerSet).toEqual(['A', 'C']);
      expect(back.correctAnswerIndices).toEqual([0, 2]);
      expect(back.correctAnswer).toBe('A;C');
    });
  });

  describe('5. Nested ContentBlocks and ContentBlock Transformations', () => {
    it('safely round-trips nested ContentBlocks with table and math', () => {
      const rawBlock: ContentBlock = {
        type: 'table',
        headers: ['Col 1', 'Col 2'],
        rows: [['Data A', 'Data B'], ['Data C', 'Data D']],
        confidence: 'VERIFIED',
        blocks: [
          {
            type: 'math',
            latex: '\\int_0^1 x dx = 0.5',
            content: '\\int_0^1 x dx = 0.5',
          },
        ],
      };

      const canonicalBlock = toCanonicalContentBlock(rawBlock);
      expect(canonicalBlock.headers).toEqual(['Col 1', 'Col 2']);
      expect(canonicalBlock.rows?.length).toBe(2);
      expect(canonicalBlock.blocks?.length).toBe(1);
      expect(canonicalBlock.blocks?.[0].type).toBe('math');

      const backToRaw = fromCanonicalContentBlock(canonicalBlock);
      expect(backToRaw).toEqual(rawBlock);
    });

    it('handles undefined nested blocks without creating empty arrays', () => {
      const blockWithoutBlocks: ContentBlock = {
        type: 'text',
        content: 'Simple text prompt',
      };

      const canonical = toCanonicalContentBlock(blockWithoutBlocks);
      expect(canonical.blocks).toBeUndefined();

      const back = fromCanonicalContentBlock(canonical);
      expect(back.blocks).toBeUndefined();
    });
  });
});
