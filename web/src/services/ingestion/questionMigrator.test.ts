import { describe, it, expect } from 'vitest';
import {
  toCanonicalQuestion,
  toLegacyQuestion,
  toCompetitiveQuestion,
} from './questionMigrator';
import { Question, CompetitiveQuestion } from '../../types';

describe('Question Migrator (Bidirectional Schema Conversion)', () => {
  it('should convert a legacy Question to CanonicalQuestion preserving fields honestly', () => {
    const legacy: Question = {
      id: 'legacy-1',
      questionText: 'What is the speed of light in vacuum?',
      options: ['3 x 10^8 m/s', '2 x 10^8 m/s', '1 x 10^8 m/s', '4 x 10^8 m/s'],
      correctAnswerIndex: 0,
      topic: 'Physics',
      explanation: 'Exact definition is 299,792,458 m/s.',
      verificationStatus: 'VERIFIED',
      trustScore: 0.95,
      verifiedAt: 123456789,
    };

    const canonical = toCanonicalQuestion(legacy);

    expect(canonical.questionId).toBe('legacy-1');
    expect(canonical.questionText).toBe('What is the speed of light in vacuum?');
    expect(canonical.options.length).toBe(4);
    expect(canonical.options[0].text).toBe('3 x 10^8 m/s');
    expect(canonical.answer.correctOptionIndex).toBe(0);
    expect(canonical.answer.correctOptionId).toBe('A');
    expect(canonical.contentBlocks.length).toBe(1);
    expect(canonical.contentBlocks[0].content).toBe('What is the speed of light in vacuum?');
  });

  it('should convert a CompetitiveQuestion with rich ContentBlocks, NAT, and diagrams to CanonicalQuestion', () => {
    const compQ: CompetitiveQuestion = {
      id: 'gate-2025-da-q1',
      questionNumber: 1,
      sectionId: 'da_general',
      sectionName: 'General Aptitude',
      questionText: 'Given the matrix $A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$, compute $\\det(A)$.',
      contentBlocks: [
        {
          type: 'text',
          content: 'Given the matrix $A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$, compute $\\det(A)$.',
        },
      ],
      questionType: 'NAT',
      options: [],
      correctAnswer: '-2',
      correctAnswerIndex: -1,
      answerRange: { min: -2, max: -2 },
      explanation: 'Determinant is $1(4) - 2(3) = 4 - 6 = -2$.',
      diagramUrl: null,
      marks: 1,
      negativeMarks: 0,
      examId: 'gate-2025-da',
      year: 2025,
      date: '2025-02-01',
      shift: 'Morning',
      tier: '1',
      language: 'English',
      confidence: 'VERIFIED',
    };

    const canonical = toCanonicalQuestion(compQ, {
      sourceType: 'PDF',
      sourceFile: 'gate-2025-da.pdf',
    });

    expect(canonical.questionType).toBe('NAT');
    expect(canonical.answer.natRange).toEqual({ min: -2, max: -2 });
    expect(canonical.scoring.marks).toBe(1);
    expect(canonical.scoring.negativeMarks).toBe(0);
    expect(canonical.provenance.sourceFile).toBe('gate-2025-da.pdf');
    expect(canonical.verificationStatus).toBe('VERIFIED');
  });

  it('should round-trip from CanonicalQuestion back to legacy Question without data loss', () => {
    const compQ: CompetitiveQuestion = {
      id: 'gate-2025-da-q2',
      questionNumber: 2,
      sectionId: 'da_core',
      sectionName: 'Core',
      questionText: 'Which data structure supports $O(1)$ amortized insertion and deletion at both ends?',
      questionType: 'MCQ',
      options: ['Deque', 'Stack', 'Queue', 'Array'],
      correctAnswer: 'A',
      correctAnswerIndex: 0,
      explanation: 'Double-ended queue (deque) supports push and pop at both head and tail in $O(1)$ amortized time.',
      marks: 2,
      negativeMarks: 0.66,
      examId: 'gate-2025-da',
      year: 2025,
      date: '2025-02-01',
      shift: 'Morning',
      tier: '1',
      language: 'English',
    };

    const canonical = toCanonicalQuestion(compQ);
    const legacy = toLegacyQuestion(canonical);

    expect(legacy.questionText).toBe(compQ.questionText);
    expect(legacy.options).toEqual(['Deque', 'Stack', 'Queue', 'Array']);
    expect(legacy.correctAnswerIndex).toBe(0);
    expect(legacy.explanation).toBe(compQ.explanation);
  });
});
