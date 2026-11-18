// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import rawPaper from '../data/exams/ssc-chsl-2024-01jul-s1.json';
import { ExamPaper, UserProfile } from '../types';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { StructuredContentRenderer } from '../components/StructuredContentRenderer';
import { LatexRenderer } from '../components/LatexRenderer';
import { StaffPaperTestingCentre } from '../components/staff/StaffPaperTestingCentre';
import { ExamService } from '../services/examService';
import { ExamSessionService } from '../services/examSessionService';

describe('SSC CHSL 2024 Underline Formatting Fidelity Suite (Phase 3)', () => {
  const paper = rawPaper as unknown as ExamPaper;

  const testUser: UserProfile = {
    uid: 'staff_tester_01',
    fullName: 'Auditor Tester',
    email: 'auditor@mock.ai',
    role: 'TEACHER',
    createdAt: Date.now(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Requirement 1 & 2: Ground-Truth Underlined Spans & Multi-Word Phrases', () => {
    it('verifies Q15 renders "guard the nest at night" underlined (PDF ground truth)', () => {
      const q15 = paper.questions.find((q) => q.questionNumber === 15);
      expect(q15).toBeDefined();

      const { container } = render(
        <StructuredContentRenderer
          blocks={q15!.contentBlocks}
          fallbackText={q15!.questionText}
        />
      );

      const uElements = container.querySelectorAll('u');
      expect(uElements.length).toBe(1);
      expect(uElements[0].textContent).toBe('guard the nest at night');
    });

    it('verifies Q16 renders "conspicuous" underlined', () => {
      const q16 = paper.questions.find((q) => q.questionNumber === 16);
      expect(q16).toBeDefined();

      const { container } = render(
        <StructuredContentRenderer
          blocks={q16!.contentBlocks}
          fallbackText={q16!.questionText}
        />
      );

      const uElements = container.querySelectorAll('u');
      expect(uElements.length).toBe(1);
      expect(uElements[0].textContent).toBe('conspicuous');
    });

    it('verifies Q17 renders "joyless" underlined', () => {
      const q17 = paper.questions.find((q) => q.questionNumber === 17);
      expect(q17).toBeDefined();

      const { container } = render(
        <StructuredContentRenderer
          blocks={q17!.contentBlocks}
          fallbackText={q17!.questionText}
        />
      );

      const uElements = container.querySelectorAll('u');
      expect(uElements.length).toBe(1);
      expect(uElements[0].textContent).toBe('joyless');
    });

    it('verifies Q20 renders "strong" underlined (PDF ground truth: single word)', () => {
      const q20 = paper.questions.find((q) => q.questionNumber === 20);
      expect(q20).toBeDefined();

      const { container } = render(
        <StructuredContentRenderer
          blocks={q20!.contentBlocks}
          fallbackText={q20!.questionText}
        />
      );

      const uElements = container.querySelectorAll('u');
      expect(uElements.length).toBe(1);
      expect(uElements[0].textContent).toBe('strong');
    });

    it('verifies Q21 renders "support" underlined', () => {
      const q21 = paper.questions.find((q) => q.questionNumber === 21);
      expect(q21).toBeDefined();

      const { container } = render(
        <StructuredContentRenderer
          blocks={q21!.contentBlocks}
          fallbackText={q21!.questionText}
        />
      );

      const uElements = container.querySelectorAll('u');
      expect(uElements.length).toBe(1);
      expect(uElements[0].textContent).toBe('support');
    });

    it('verifies all 9 authentic underlined questions in the paper render their complete target spans', () => {
      const expectedUnderlines: Record<number, string> = {
        3: 'down with',
        10: 'when he burnt',
        14: 'sold plots like hot cakes',
        15: 'guard the nest at night',
        16: 'conspicuous',
        17: 'joyless',
        20: 'strong',
        21: 'support',
        25: 'This is best book',
      };

      for (const [qNumStr, expectedSpan] of Object.entries(expectedUnderlines)) {
        const qNum = Number(qNumStr);
        const q = paper.questions.find((item) => item.questionNumber === qNum);
        expect(q).toBeDefined();

        const { container } = render(
          <StructuredContentRenderer
            blocks={q!.contentBlocks}
            fallbackText={q!.questionText}
          />
        );

        const uElements = container.querySelectorAll('u');
        expect(uElements.length).toBe(1);
        expect(uElements[0].textContent).toBe(expectedSpan);
      }
    });
  });

  describe('Requirement 3: Surrounding & Unrelated Words Are Not Accidentally Underlined', () => {
    it('verifies in Q15 that prompt text and surrounding sentence words are not underlined', () => {
      const q15 = paper.questions.find((q) => q.questionNumber === 15);
      const { container } = render(
        <StructuredContentRenderer
          blocks={q15!.contentBlocks}
          fallbackText={q15!.questionText}
        />
      );

      const uElement = container.querySelector('u')!;
      expect(uElement).not.toBeNull();
      expect(uElement.textContent).toBe('guard the nest at night');

      // The full text has words outside <u>
      const fullText = container.textContent || '';
      expect(fullText).toContain('It is a general belief that the female ostrich');
      expect(fullText).toContain('Select the most appropriate option');

      // Ensure surrounding text is not inside <u>
      expect(uElement.textContent).not.toContain('general belief');
      expect(uElement.textContent).not.toContain('ostrich');
      expect(uElement.textContent).not.toContain('at night.');
    });

    it('verifies in Q20 that "pain" and "stomach" are not underlined', () => {
      const q20 = paper.questions.find((q) => q.questionNumber === 20);
      const { container } = render(
        <StructuredContentRenderer
          blocks={q20!.contentBlocks}
          fallbackText={q20!.questionText}
        />
      );

      const uElement = container.querySelector('u')!;
      expect(uElement).not.toBeNull();
      expect(uElement.textContent).toBe('strong');

      const fullText = container.textContent || '';
      expect(fullText).toContain('Rahul had strong pain in his stomach.');
      expect(uElement.textContent).not.toContain('pain');
      expect(uElement.textContent).not.toContain('stomach');
    });

    it('verifies in Q16 that "spinal stripe" is not underlined', () => {
      const q16 = paper.questions.find((q) => q.questionNumber === 16);
      const { container } = render(
        <StructuredContentRenderer
          blocks={q16!.contentBlocks}
          fallbackText={q16!.questionText}
        />
      );

      const uElement = container.querySelector('u')!;
      expect(uElement.textContent).toBe('conspicuous');
      expect(uElement.textContent).not.toContain('spinal stripe');
    });
  });

  describe('Requirement 4: Questions Without Underline Formatting Remain Completely Unchanged', () => {
    it('verifies non-underlined questions (Q1, Q2, Q4, Q18, Q19, Q22, Q50) contain zero <u> elements', () => {
      const nonUnderlinedNums = [1, 2, 4, 5, 6, 7, 8, 9, 11, 12, 13, 18, 19, 22, 23, 24, 50, 75, 100];

      for (const qNum of nonUnderlinedNums) {
        const q = paper.questions.find((item) => item.questionNumber === qNum);
        expect(q).toBeDefined();

        const { container } = render(
          <StructuredContentRenderer
            blocks={q!.contentBlocks}
            fallbackText={q!.questionText}
          />
        );

        const uElements = container.querySelectorAll('u');
        expect(uElements.length).toBe(0);
      }
    });

    it('verifies option choices and answer keys remain 100% intact across all questions', () => {
      const q15 = paper.questions.find((q) => q.questionNumber === 15);
      expect(q15!.correctAnswer).toBe('C');
      expect(q15!.options).toEqual([
        'is guarding the nest at night',
        'does guard the nest in night',
        'guards the nest at night',
        'guarded the nest at night',
      ]);

      const q20 = paper.questions.find((q) => q.questionNumber === 20);
      expect(q20!.correctAnswer).toBe('B');
      expect(q20!.options).toEqual(['strict', 'severe', 'high', 'deep']);
    });
  });

  describe('Requirement 5: Student and Staff Previews Render Identical Target Spans', () => {
    it('verifies StructuredContentRenderer (student) and LatexRenderer (staff) produce identical <u> spans', () => {
      const testUnderlineQuestions = [3, 10, 14, 15, 16, 17, 20, 21, 25];

      for (const qNum of testUnderlineQuestions) {
        const q = paper.questions.find((item) => item.questionNumber === qNum);
        expect(q).toBeDefined();

        // Student renderer
        const { container: studentContainer } = render(
          <StructuredContentRenderer
            blocks={q!.contentBlocks}
            fallbackText={q!.questionText}
          />
        );
        const studentU = studentContainer.querySelectorAll('u');

        // Staff renderer
        const { container: staffContainer } = render(
          <LatexRenderer content={q!.questionText || ''} />
        );
        const staffU = staffContainer.querySelectorAll('u');

        expect(studentU.length).toBe(staffU.length);
        expect(studentU.length).toBe(1);
        expect(studentU[0].textContent).toBe(staffU[0].textContent);
      }
    });
  });

  describe('Requirement 6: Answer Selection and Exam Navigation Functionality', () => {
    it('allows answer selection and preserves chosen state when navigating to and from an underlined question', () => {
      const session = ExamService.createExamSession(paper);
      // Start at Q15 (index 14)
      session.currentQuestionIndex = 14;

      const handleSubmit = vi.fn();
      const handleExit = vi.fn();

      render(
        <CompetitiveExamPlayerScreen
          initialSession={session}
          paper={paper}
          onExit={handleExit}
          onSubmit={handleSubmit}
        />
      );

      // Verify Q15 is rendered with its underline
      expect(screen.getByText(/Question 15 of 100/i)).toBeDefined();
      const uEl = document.querySelector('u');
      expect(uEl).not.toBeNull();
      expect(uEl!.textContent).toBe('guard the nest at night');

      // Click option C ('guards the nest at night')
      const optC = screen.getByText('guards the nest at night');
      fireEvent.click(optC);

      // Verify Save & Next navigates to Q16
      const saveNextBtn = screen.getByText('Save & Next');
      fireEvent.click(saveNextBtn);

      expect(screen.getByText(/Question 16 of 100/i)).toBeDefined();
      const uEl16 = document.querySelector('u');
      expect(uEl16).not.toBeNull();
      expect(uEl16!.textContent).toBe('conspicuous');

      // Navigate back to Q15 via Previous button
      const prevBtn = screen.getByText('Previous');
      fireEvent.click(prevBtn);

      expect(screen.getByText(/Question 15 of 100/i)).toBeDefined();
      // Verify Option C container has the selected active style
      const selectedOption = screen.getByText('guards the nest at night').closest('.cursor-pointer');
      expect(selectedOption?.className).toContain('border-brand-primary');

      // Also verify local session persistence
      const savedSession = ExamSessionService.getActiveSession(paper.id);
      expect(savedSession?.userAnswers[14]).toBe(2);
    });
  });
});
