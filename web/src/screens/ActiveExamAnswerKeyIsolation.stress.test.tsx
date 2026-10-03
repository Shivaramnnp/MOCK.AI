import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { ExamPaper } from '../types';
import { toExamPresentationPaper } from '../services/examService';
import sscChslSample from '../data/exams/ssc-chsl-2024-01jul-s1.json';

describe('Empirical Audit: Active Exam Answer-Key Isolation (Objective 3)', () => {
  const samplePaper = sscChslSample as unknown as ExamPaper;

  it('verifies that in-memory sanitizedQuestions strips correctAnswer from active rendering DOM', () => {
    const handleExit = vi.fn();
    const handleSubmit = vi.fn();

    const { container } = render(
      <CompetitiveExamPlayerScreen
        paper={samplePaper}
        userId="test_candidate_1"
        user={{
          uid: 'test_candidate_1',
          name: 'Test Candidate',
          email: 'test@candidate.com',
          role: 'STUDENT',
          createdAt: Date.now(),
        } as any}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    // Active DOM must NOT expose correctAnswer or explanation in data attributes
    expect(container.querySelector('[data-correct-answer]')).toBeNull();
    expect(container.querySelector('[data-correct-index]')).toBeNull();

    // Active DOM must NOT render explanation text
    const q1Explanation = samplePaper.questions[0].explanation;
    if (q1Explanation && q1Explanation.length > 5) {
      expect(container.textContent).not.toContain(q1Explanation);
    }
  });

  it('audits props leak: checks whether active exam player receives unquarantined ExamPaper containing answers in props', () => {
    // In current implementation, props.paper is typed as ExamPaper, not a presentation-only schema
    // Verify that the incoming prop object still contains correctAnswer
    expect(samplePaper.questions[0].correctAnswer).toBeDefined();
    expect(samplePaper.questions[0].correctAnswer).not.toBe('');

    // In a fully quarantined architecture (RCA Section 7.4), the active session must receive
    // an ExamPresentationPaper where correctAnswer, correctAnswerIndex, and explanation are strictly stripped
    // before reaching component props or client network bundles.
    const propHasAnswers = samplePaper.questions.some(
      (q) => q.correctAnswer !== undefined || q.correctAnswerIndex !== -1 || (q.explanation && q.explanation.length > 0)
    );
    expect(propHasAnswers).toBe(true);
  });

  it('certifies Active Exam Answer-Key Isolation (R1): toExamPresentationPaper strips all keys and renders safely', () => {
    const handleExit = vi.fn();
    const handleSubmit = vi.fn();
    const presentationPaper = toExamPresentationPaper(samplePaper);

    expect(presentationPaper.isPresentationOnly).toBe(true);

    // Verify all questions have 0 answer keys, indices, ranges, or explanations
    const hasAnyAnswers = presentationPaper.questions.some(
      (q: any) =>
        q.correctAnswer !== undefined ||
        q.correctAnswerIndex !== undefined ||
        q.correctAnswerSet !== undefined ||
        q.answerRange !== undefined ||
        (q.explanation && q.explanation.length > 0) ||
        (q.modelSolution && q.modelSolution.length > 0)
    );
    expect(hasAnyAnswers).toBe(false);

    // Verify player mounts, functions, and isolates props with presentationPaper
    const { container } = render(
      <CompetitiveExamPlayerScreen
        paper={presentationPaper}
        userId="test_candidate_isolated"
        user={{
          uid: 'test_candidate_isolated',
          name: 'Test Candidate Isolated',
          email: 'isolated@candidate.com',
          role: 'STUDENT',
          createdAt: Date.now(),
        } as any}
        onExit={handleExit}
        onSubmit={handleSubmit}
      />
    );

    expect(container.querySelector('[data-correct-answer]')).toBeNull();
    expect(container.querySelector('[data-correct-index]')).toBeNull();
  });
});

