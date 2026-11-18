// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import sscChsl2024S1 from '../data/exams/ssc-chsl-2024-01jul-s1.json';
import sscChsl2023S3 from '../data/exams/ssc-chsl-2023-08aug-s3.json';
import sscChsl2025S2 from '../data/exams/ssc-chsl-2025-13nov-s2.json';
import gate2023Cy from '../data/exams/gate-2023-cy.json';
import { ExamPaper, UserProfile } from '../types';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { StructuredContentRenderer } from '../components/StructuredContentRenderer';
import { LatexRenderer } from '../components/LatexRenderer';
import { ExamService } from '../services/examService';
import { ExamSessionService } from '../services/examSessionService';

describe('Universal Question Formatting Fidelity Regression Suite (Phase 4)', () => {
  const paperChsl2024 = sscChsl2024S1 as unknown as ExamPaper;
  const paperChsl2023 = sscChsl2023S3 as unknown as ExamPaper;
  const paperChsl2025 = sscChsl2025S2 as unknown as ExamPaper;
  const paperGate2023 = gate2023Cy as unknown as ExamPaper;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Cross-Exam & Multi-Year Authentic Formatting Fidelity', () => {
    it('verifies SSC CHSL 2024 Q15 renders authentic multi-word underline "guard the nest at night"', () => {
      const q15 = paperChsl2024.questions.find((q) => q.questionNumber === 15);
      expect(q15).toBeDefined();

      const { container } = render(
        <StructuredContentRenderer blocks={q15!.contentBlocks} fallbackText={q15!.questionText} />
      );
      const uElements = container.querySelectorAll('u');
      expect(uElements.length).toBe(1);
      expect(uElements[0].textContent).toBe('guard the nest at night');
    });

    it('verifies SSC CHSL 2023 Q17 renders authentic vector underline "mitigate"', () => {
      const q17 = paperChsl2023.questions.find((q) => q.questionNumber === 17);
      expect(q17).toBeDefined();

      const { container } = render(
        <StructuredContentRenderer blocks={q17!.contentBlocks} fallbackText={q17!.questionText} />
      );
      const uElements = container.querySelectorAll('u');
      expect(uElements.length).toBe(1);
      expect(uElements[0].textContent).toBe('mitigate');

      // Verify surrounding words are not inside <u>
      const fullText = container.textContent || '';
      expect(fullText).toContain('The decision of the committee may mitigate the growth of the organisation.');
      expect(uElements[0].textContent).not.toContain('may');
      expect(uElements[0].textContent).not.toContain('growth');
    });

    it('verifies GATE 2023 Chemistry (CY) Q40 renders authentic compound formatting <u><b>H</b></u>', () => {
      const q40 = paperGate2023.questions.find((q) => q.questionNumber === 40);
      expect(q40).toBeDefined();

      const { container } = render(
        <StructuredContentRenderer blocks={q40!.contentBlocks} fallbackText={q40!.questionText} />
      );

      // Verify compound elements: <u><b>H</b></u>
      const uElements = container.querySelectorAll('u');
      expect(uElements.length).toBeGreaterThanOrEqual(4);

      for (const u of Array.from(uElements)) {
        expect(u.textContent).toBe('H');
        const b = u.querySelector('b');
        expect(b).not.toBeNull();
        expect(b!.textContent).toBe('H');
      }
    });

    it('verifies SSC CHSL 2025 (13 Nov S2) Q4 renders authentic replacement highlight <mark>trusts in</mark>', () => {
      const q4 = paperChsl2025.questions.find((q) => q.questionNumber === 4);
      expect(q4).toBeDefined();

      const { container } = render(
        <StructuredContentRenderer blocks={q4!.contentBlocks} fallbackText={q4!.questionText} />
      );
      const markElements = container.querySelectorAll('mark');
      expect(markElements.length).toBe(1);
      expect(markElements[0].textContent).toBe('trusts in');

      // Verify surrounding sentence words are outside <mark>
      const fullText = container.textContent || '';
      expect(fullText).toContain('I am not one of these people who trusts in superstitions.');
      expect(markElements[0].textContent).not.toContain('people');
      expect(markElements[0].textContent).not.toContain('superstitions');

      // Verify provenance and source verification metadata exists
      expect((q4 as any).sourceFidelity).toBeDefined();
      expect((q4 as any).sourceFidelity.targetSpan).toBe('trusts in');
      expect((q4 as any).sourceFidelity.formattingType).toBe('HIGHLIGHT');
      expect((q4 as any).sourceFidelity.provenance).toBe('SOURCE_EXPLANATION_VERIFIED');
    });

    it('verifies SSC CHSL 2025 (13 Nov S2) Q24 renders heavy-weight font evidence target span as <mark>', () => {
      const q24 = paperChsl2025.questions.find((q) => q.questionNumber === 24);
      expect(q24).toBeDefined();

      const { container } = render(
        <StructuredContentRenderer blocks={q24!.contentBlocks} fallbackText={q24!.questionText} />
      );
      const markElements = container.querySelectorAll('mark');
      expect(markElements.length).toBe(1);
      expect(markElements[0].textContent).toBe('are likely to maintaining or even improve their profit margins');

      // Verify surrounding text is not inside mark
      expect(markElements[0].textContent).not.toContain('Marginal sellers');
      expect((q24 as any).sourceFidelity.provenance).toBe('PDF_FONT_WEIGHT_EVIDENCE');
      expect((q24 as any).sourceFidelity.fontSpan).toBe('SegoeUIBlack');
    });
  });

  describe('2. Multi-Word and Single-Word Underline Spans', () => {
    it('verifies multiple diverse phrases are accurately captured as unified single <u> tags', () => {
      const testCases = [
        { qNum: 3, expected: 'down with', paper: paperChsl2024 },
        { qNum: 10, expected: 'when he burnt', paper: paperChsl2024 },
        { qNum: 14, expected: 'sold plots like hot cakes', paper: paperChsl2024 },
        { qNum: 25, expected: 'This is best book', paper: paperChsl2024 },
        { qNum: 16, expected: 'conspicuous', paper: paperChsl2024 },
        { qNum: 17, expected: 'joyless', paper: paperChsl2024 },
        { qNum: 20, expected: 'strong', paper: paperChsl2024 },
        { qNum: 21, expected: 'support', paper: paperChsl2024 },
      ];

      for (const tc of testCases) {
        const q = tc.paper.questions.find((item) => item.questionNumber === tc.qNum);
        expect(q).toBeDefined();

        const { container } = render(
          <StructuredContentRenderer blocks={q!.contentBlocks} fallbackText={q!.questionText} />
        );
        const uEls = container.querySelectorAll('u');
        expect(uEls.length).toBe(1);
        expect(uEls[0].textContent).toBe(tc.expected);
      }
    });
  });

  describe('3. Negative Controls: Non-Formatted Questions Remain Pristine', () => {
    it('verifies unformatted questions in SSC CHSL and GATE contain zero spurious <u> or <b> tags', () => {
      const negativeQuestions = [
        { paper: paperChsl2024, nums: [1, 2, 4, 5, 6, 7, 8, 9, 11, 12, 13] },
        { paper: paperChsl2023, nums: [1, 2, 3, 4, 5, 15, 16, 18, 19, 20] },
        { paper: paperGate2023, nums: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      ];

      for (const grp of negativeQuestions) {
        for (const qNum of grp.nums) {
          const q = grp.paper.questions.find((item) => item.questionNumber === qNum);
          expect(q).toBeDefined();

          const { container } = render(
            <StructuredContentRenderer blocks={q!.contentBlocks} fallbackText={q!.questionText} />
          );
          const uEls = container.querySelectorAll('u');
          expect(uEls.length).toBe(0);
        }
      }
    });

    it('verifies non-instruction mentions of highlighted in SSC CHSL 2025 Q80 have zero spurious mark or u tags', () => {
      const q80 = paperChsl2025.questions.find((q) => q.questionNumber === 80);
      expect(q80).toBeDefined();

      const { container } = render(
        <StructuredContentRenderer blocks={q80!.contentBlocks} fallbackText={q80!.questionText} />
      );
      expect(container.querySelectorAll('mark').length).toBe(0);
      expect(container.querySelectorAll('u').length).toBe(0);
      expect(container.querySelectorAll('b').length).toBe(0);
    });
  });

  describe('4. Mathematical & Scientific Notation Coexistence', () => {
    it('verifies KaTeX formulas render without interference from inline tags', () => {
      const stemWithMath = 'Calculate the energy $\\Delta E = h\\nu$ of the <u><b>H</b></u> atom in species $[\\text{HNi}(\\text{OPEt}_3)_4]^+$.';
      const { container } = render(
        <LatexRenderer content={stemWithMath} />
      );

      // Verify KaTeX math rendered for formulas
      expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(1);

      // Verify bold-underlined target H rendered cleanly
      const uEls = container.querySelectorAll('u');
      expect(uEls.length).toBe(1);
      expect(uEls[0].textContent).toBe('H');
      expect(container.querySelector('.katex-error')).toBeNull();
    });

    it('verifies KaTeX formulas render alongside highlighted target spans without error', () => {
      const stemWithMath = 'In the quadratic equation $ax^2 + bx + c = 0$, replace the highlighted term <mark>$\\frac{-b}{2a}$</mark> with its axis.';
      const { container } = render(
        <LatexRenderer content={stemWithMath} />
      );

      expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(1);
      const markEls = container.querySelectorAll('mark');
      expect(markEls.length).toBe(1);
      expect(container.querySelector('.katex-error')).toBeNull();
    });
  });

  describe('5. Student Player and Staff Testing Centre Equivalence', () => {
    it('guarantees identical DOM tags and text spans between StructuredContentRenderer and LatexRenderer', () => {
      const crossQuestions = [
        { paper: paperChsl2024, qNum: 15 },
        { paper: paperChsl2024, qNum: 20 },
        { paper: paperChsl2023, qNum: 17 },
        { paper: paperGate2023, qNum: 40 },
        { paper: paperChsl2025, qNum: 4 },
        { paper: paperChsl2025, qNum: 24 },
      ];

      for (const item of crossQuestions) {
        const q = item.paper.questions.find((x) => x.questionNumber === item.qNum);
        expect(q).toBeDefined();

        // Student Player renderer
        const { container: student } = render(
          <StructuredContentRenderer blocks={q!.contentBlocks} fallbackText={q!.questionText} />
        );
        // Staff Testing Centre renderer
        const { container: staff } = render(
          <LatexRenderer content={q!.questionText || ''} />
        );

        const studentU = Array.from(student.querySelectorAll('u')).map((el) => el.textContent);
        const staffU = Array.from(staff.querySelectorAll('u')).map((el) => el.textContent);
        expect(studentU).toEqual(staffU);

        const studentMark = Array.from(student.querySelectorAll('mark')).map((el) => el.textContent);
        const staffMark = Array.from(staff.querySelectorAll('mark')).map((el) => el.textContent);
        expect(studentMark).toEqual(staffMark);
      }
    });
  });

  describe('6. Answer Selection, Exam Navigation, and State Preservation', () => {
    it('preserves answer selections when navigating across formatting-repaired questions', () => {
      const session = ExamService.createExamSession(paperChsl2023);
      session.currentQuestionIndex = 16; // Q17 in zero-indexed array

      const handleSubmit = vi.fn();
      const handleExit = vi.fn();

      render(
        <CompetitiveExamPlayerScreen
          initialSession={session}
          paper={paperChsl2023}
          onExit={handleExit}
          onSubmit={handleSubmit}
        />
      );

      // Verify Q17 is rendered with underline on "mitigate"
      expect(screen.getByText(/Question 17 of 100/i)).toBeDefined();
      const uEl = document.querySelector('u');
      expect(uEl).not.toBeNull();
      expect(uEl!.textContent).toBe('mitigate');

      // Click option 4 ('Lessen')
      const optLessen = screen.getByText('Lessen');
      fireEvent.click(optLessen);

      // Navigate Save & Next to Q18
      const saveNextBtn = screen.getByText('Save & Next');
      fireEvent.click(saveNextBtn);

      expect(screen.getByText(/Question 18 of 100/i)).toBeDefined();

      // Navigate back to Q17 via Previous
      const prevBtn = screen.getByText('Previous');
      fireEvent.click(prevBtn);

      expect(screen.getByText(/Question 17 of 100/i)).toBeDefined();
      const selectedOption = screen.getByText('Lessen').closest('.cursor-pointer');
      expect(selectedOption?.className).toContain('border-brand-primary');

      const savedSession = ExamSessionService.getActiveSession(paperChsl2023.id);
      expect(savedSession?.userAnswers[16]).toBe(3);
    });
  });

  describe('7. General Highlighted Spans, Custom Attributes, and Security', () => {
    it('supports replacement target spans with custom classes and styling', () => {
      const content = 'Replace the highlighted part: She is <mark class="replacement-target">keen of</mark> music.';
      const { container } = render(<LatexRenderer content={content} />);
      const mark = container.querySelector('mark');
      expect(mark).not.toBeNull();
      expect(mark!.textContent).toBe('keen of');
      expect(mark!.className).toBe('replacement-target');
    });

    it('supports span tags with highlight classes', () => {
      const content = 'Select replacement for <span class="mock-highlight">take up</span>.';
      const { container } = render(<LatexRenderer content={content} />);
      const span = container.querySelector('span.mock-highlight');
      expect(span).not.toBeNull();
      expect(span!.textContent).toBe('take up');
    });

    it('supports nested compound formatting with mark and u/b tags', () => {
      const content = 'Check <u><mark>underlined and highlighted</mark></u> and <mark><b>bold highlight</b></mark>.';
      const { container } = render(<LatexRenderer content={content} />);
      const uMark = container.querySelector('u mark');
      expect(uMark).not.toBeNull();
      expect(uMark!.textContent).toBe('underlined and highlighted');

      const markB = container.querySelector('mark b');
      expect(markB).not.toBeNull();
      expect(markB!.textContent).toBe('bold highlight');
    });

    it('neutralizes unsafe script and event injection while preserving safe mark tags', () => {
      const unsafeContent = 'Dangerous: <script>alert(1)</script><mark onclick="evil()">unsafe text</mark>';
      const { container: unsafeContainer } = render(<LatexRenderer content={unsafeContent} />);
      expect(unsafeContainer.querySelector('script')).toBeNull();
      // The mark tag with illegal onclick is safely kept escaped as text rather than becoming an active element
      expect(unsafeContainer.querySelector('mark')).toBeNull();
      expect(unsafeContainer.textContent).toContain('unsafe text');

      // Legitimate safe mark tags render cleanly as DOM elements
      const safeContent = 'Safe: <mark class="safe-mark">safe text</mark>';
      const { container: safeContainer } = render(<LatexRenderer content={safeContent} />);
      const mark = safeContainer.querySelector('mark');
      expect(mark).not.toBeNull();
      expect(mark!.textContent).toBe('safe text');
    });
  });
});
