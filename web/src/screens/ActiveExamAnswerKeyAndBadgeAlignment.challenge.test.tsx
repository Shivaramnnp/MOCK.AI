// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { OptionContentRenderer } from '../components/StructuredContentRenderer';
import { ExamAsset } from '../components/ExamAsset';
import { ExamPaper, CompetitiveQuestion } from '../types';
import { toExamPresentationPaper, extractSolutionManifest } from '../services/examService';
import sscChslSample from '../data/exams/ssc-chsl-2024-01jul-s1.json';

describe('Empirical Adversarial Challenge: Answer-Key Isolation (R1) & Option Badge Alignment', () => {
  const samplePaper = sscChslSample as unknown as ExamPaper;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Dimension 1: Deep Answer-Key Isolation Attack (R1)', () => {
    it('exhaustively audits all 100 questions in presentation paper for 0 answer keys or explanations', () => {
      const presentationPaper = toExamPresentationPaper(samplePaper);

      expect(presentationPaper.isPresentationOnly).toBe(true);
      expect(presentationPaper.questions).toHaveLength(samplePaper.questions.length);

      // Audit every single question across all sections
      presentationPaper.questions.forEach((q: any, idx) => {
        expect(q.correctAnswer, `Q${idx + 1} leaked correctAnswer`).toBeUndefined();
        expect(q.correctAnswerIndex, `Q${idx + 1} leaked correctAnswerIndex`).toBeUndefined();
        expect(q.correctAnswerSet, `Q${idx + 1} leaked correctAnswerSet`).toBeUndefined();
        expect(q.correctAnswerSets, `Q${idx + 1} leaked correctAnswerSets`).toBeUndefined();
        expect(q.correctAnswerIndices, `Q${idx + 1} leaked correctAnswerIndices`).toBeUndefined();
        expect(q.answerRange, `Q${idx + 1} leaked answerRange`).toBeUndefined();
        expect(q.answerRanges, `Q${idx + 1} leaked answerRanges`).toBeUndefined();
        expect(q.explanation, `Q${idx + 1} leaked explanation`).toBeUndefined();
        expect(q.modelSolution, `Q${idx + 1} leaked modelSolution`).toBeUndefined();
        expect(q.isMta, `Q${idx + 1} leaked isMta`).toBeUndefined();
      });

      // String serialization attack: Ensure sensitive key strings are not present in questions JSON
      const serialized = JSON.stringify(presentationPaper.questions);
      expect(serialized).not.toMatch(/"correctAnswer"/);
      expect(serialized).not.toMatch(/"correctAnswerIndex"/);
      expect(serialized).not.toMatch(/"explanation"/);
      expect(serialized).not.toMatch(/"modelSolution"/);
      expect(serialized).not.toMatch(/"answerRange"/);
    });

    it('verifies solution manifest is cleanly extracted and severed from presentation paper', () => {
      const presentationPaper = toExamPresentationPaper(samplePaper);
      const manifest = extractSolutionManifest(samplePaper);

      expect(manifest.paperId).toBe(samplePaper.id);
      expect(manifest.solutions).toHaveLength(samplePaper.questions.length);
      expect(manifest.solutions[0].correctAnswer).toBeDefined();

      // Presentation paper must have no reference to manifest
      expect((presentationPaper as any).solutions).toBeUndefined();
      expect((presentationPaper as any).manifest).toBeUndefined();
    });

    it('verifies synthetic MSQ, NAT, and Descriptive question types are completely stripped', () => {
      const syntheticPaper: ExamPaper = {
        ...samplePaper,
        id: 'synthetic-multi-type-paper',
        questions: [
          {
            id: 'syn-mcq',
            questionNumber: 1,
            sectionId: 'test',
            sectionName: 'Test',
            questionText: 'Synthetic MCQ',
            questionType: 'MCQ',
            options: ['Option 1', 'Option 2'],
            correctAnswer: 'A',
            correctAnswerIndex: 0,
            explanation: 'Secret MCQ explanation that must never leak',
            marks: 2,
            negativeMarks: 0.5,
            examId: 'test',
            year: 2024,
            date: '2024-07-01',
            shift: '1',
            tier: '1',
            language: 'en',
          },
          {
            id: 'syn-msq',
            questionNumber: 2,
            sectionId: 'test',
            sectionName: 'Test',
            questionText: 'Synthetic MSQ',
            questionType: 'MSQ',
            options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
            correctAnswer: 'A;C',
            correctAnswerIndex: -1,
            correctAnswerSet: ['A', 'C'],
            correctAnswerSets: [['A', 'C']],
            correctAnswerIndices: [0, 2],
            explanation: 'Secret MSQ explanation',
            marks: 2,
            negativeMarks: 0,
            examId: 'test',
            year: 2024,
            date: '2024-07-01',
            shift: '1',
            tier: '1',
            language: 'en',
          },
          {
            id: 'syn-nat',
            questionNumber: 3,
            sectionId: 'test',
            sectionName: 'Test',
            questionText: 'Synthetic NAT',
            questionType: 'NAT',
            options: [],
            correctAnswer: '42.5',
            correctAnswerIndex: -1,
            answerRange: { min: 42.0, max: 43.0 },
            answerRanges: [{ min: 42.0, max: 43.0 }],
            explanation: 'Secret NAT explanation',
            marks: 2,
            negativeMarks: 0,
            examId: 'test',
            year: 2024,
            date: '2024-07-01',
            shift: '1',
            tier: '1',
            language: 'en',
          },
          {
            id: 'syn-desc',
            questionNumber: 4,
            sectionId: 'test',
            sectionName: 'Test',
            questionText: 'Synthetic Descriptive',
            options: [],
            correctAnswer: '',
            correctAnswerIndex: -1,
            explanation: 'Secret Descriptive explanation',
            modelSolution: 'Top secret model essay solution',
            marks: 10,
            negativeMarks: 0,
            examId: 'test',
            year: 2024,
            date: '2024-07-01',
            shift: '1',
            tier: '1',
            language: 'en',
          },
        ] as CompetitiveQuestion[],
      };

      const presentation = toExamPresentationPaper(syntheticPaper);

      presentation.questions.forEach((q: any) => {
        expect(q.correctAnswer).toBeUndefined();
        expect(q.correctAnswerIndex).toBeUndefined();
        expect(q.correctAnswerSet).toBeUndefined();
        expect(q.correctAnswerSets).toBeUndefined();
        expect(q.correctAnswerIndices).toBeUndefined();
        expect(q.answerRange).toBeUndefined();
        expect(q.answerRanges).toBeUndefined();
        expect(q.explanation).toBeUndefined();
        expect(q.modelSolution).toBeUndefined();
      });
    });

    it('attacks DOM and localStorage during active exam: verifies zero leakage', () => {
      const presentation = toExamPresentationPaper(samplePaper);

      const { container } = render(
        <CompetitiveExamPlayerScreen
          paper={presentation}
          userId="adversary_candidate"
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      // 1. Attack data attributes in DOM
      const elementsWithAttributes = container.querySelectorAll('*');
      elementsWithAttributes.forEach((el) => {
        const attrs = el.getAttributeNames();
        attrs.forEach((attr) => {
          expect(attr).not.toMatch(/data-.*correct/i);
          expect(attr).not.toMatch(/data-.*answer/i);
          expect(attr).not.toMatch(/data-.*solution/i);
          expect(attr).not.toMatch(/data-.*explanation/i);
        });
      });

      // 2. Attack localStorage session structure
      const sessionKeys = Object.keys(localStorage);
      sessionKeys.forEach((key) => {
        const val = localStorage.getItem(key);
        if (val) {
          expect(val).not.toContain('"correctAnswer"');
          expect(val).not.toContain('"modelSolution"');
          // Explanation strings of any questions must not appear in session storage
          const q0Exp = samplePaper.questions[0].explanation;
          if (q0Exp && q0Exp.length > 5) {
            expect(val).not.toContain(q0Exp);
          }
        }
      });
    });
  });

  describe('Dimension 2: Option Badge Alignment & Non-Distortion Stress Tests', () => {
    it('verifies items-start layout prevents vertical distortion on multi-line text options', () => {
      const multiLineText =
        'This is an exceptionally long option description intended to span four or five lines across typical responsive viewport widths. It contains detailed reasoning, contextual qualifiers, and extensive commentary that tests whether the option badge remains cleanly aligned at the top-left rather than floating in the center of the vertical block.';

      const multiLinePaper: ExamPaper = {
        ...samplePaper,
        id: 'test-multiline-badge-paper',
        questions: [
          {
            ...samplePaper.questions[0],
            id: 'q-multiline-1',
            questionNumber: 1,
            options: [
              multiLineText,
              'Short option B',
              'Short option C',
              'Short option D',
            ],
          },
        ],
      };

      const { container } = render(
        <CompetitiveExamPlayerScreen
          paper={toExamPresentationPaper(multiLinePaper)}
          userId="candidate_multiline"
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      // Locate top-level option cards
      const optionCards = container.querySelectorAll('.space-y-3 > div.flex.items-start');
      expect(optionCards).toHaveLength(4);

      // Check the parent flex container of the option
      const firstOptionRow = optionCards[0];
      expect(firstOptionRow).not.toBeNull();
      expect(firstOptionRow.className).toContain('flex');
      expect(firstOptionRow.className).toContain('items-start');
      expect(firstOptionRow.className).not.toContain('items-center');

      // Check the letter badge
      const badge = firstOptionRow.firstElementChild as HTMLElement;
      expect(badge).not.toBeNull();
      expect(badge.className).toContain('shrink-0');
      expect(badge.className).toContain('w-6');
      expect(badge.className).toContain('h-6');
      expect(badge.className).toContain('mt-0.5');
      expect(badge.textContent).toBe('A');

      // Verify content container has matching top padding and flex-1
      const contentContainer = firstOptionRow.children[1] as HTMLElement;
      expect(contentContainer).not.toBeNull();
      expect(contentContainer.className).toContain('flex-1');
      expect(contentContainer.className).toContain('pt-0.5');
      expect(contentContainer.textContent).toContain(multiLineText);
    });

    it('verifies items-start layout and aspect ratio preservation on diagram options', () => {
      const diagramPaper: ExamPaper = {
        ...samplePaper,
        id: 'test-diagram-badge-paper',
        questions: [
          {
            ...samplePaper.questions[26], // Q27 with authentic visual option images
            questionNumber: 1,
          },
        ],
      };

      const { container } = render(
        <CompetitiveExamPlayerScreen
          paper={toExamPresentationPaper(diagramPaper)}
          userId="candidate_diagram_badge"
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const optionCards = container.querySelectorAll('.space-y-3 > div.flex.items-start');
      expect(optionCards).toHaveLength(4);

      const firstOptionRow = optionCards[0];
      expect(firstOptionRow).not.toBeNull();
      expect(firstOptionRow.className).toContain('flex');
      expect(firstOptionRow.className).toContain('items-start');

      // Check badge remains shrink-0 and mt-0.5
      const badge = firstOptionRow.firstElementChild as HTMLElement;
      expect(badge.className).toContain('shrink-0');
      expect(badge.className).toContain('mt-0.5');

      // Check image element has object-contain to prevent aspect ratio distortion
      const img = firstOptionRow.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.className).toContain('object-contain');
      expect(img?.className).toContain('max-h-24');
    });

    it('stress-tests OptionContentRenderer directly with pure numbers, text, images, and mixed modes', () => {
      // 1. Pure number text without image: MUST render number
      const { container: c1 } = render(
        <OptionContentRenderer fallbackText="28" image={null} />
      );
      expect(c1.textContent).toBe('28');
      expect(c1.textContent).not.toContain('Option content missing');

      // 2. Pure number text with IMAGE_ONLY display mode: OCR suppressed, image rendered
      const { container: c2 } = render(
        <OptionContentRenderer
          fallbackText="28"
          image="/test/q26_opt_a.png"
          displayMode="IMAGE_ONLY"
          ocrText="28"
        />
      );
      const img2 = c2.querySelector('img');
      expect(img2).not.toBeNull();
      expect(img2?.getAttribute('src')).toBe('/test/q26_opt_a.png');
      // Visible text must be empty (OCR quarantined in sr-only)
      const srOnly = c2.querySelector('.sr-only');
      expect(srOnly?.textContent).toBe('28');

      // 3. Multi-line text option without image
      const longText = 'Line 1\nLine 2\nLine 3\nLine 4';
      const { container: c3 } = render(
        <OptionContentRenderer fallbackText={longText} image={null} />
      );
      expect(c3.textContent).toContain('Line 1');
      expect(c3.textContent).not.toContain('Option content missing');
    });
  });
});
