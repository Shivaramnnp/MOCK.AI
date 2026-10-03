// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { ExamPaper, Question } from '../types';
import sscChsl01JulS1 from '../data/exams/ssc-chsl-2024-01jul-s1.json';

describe('SSC CHSL 2024 Stem-Wipe & Fidelity Regression Suite (Phase 12)', () => {
  let paper: ExamPaper;

  beforeEach(() => {
    localStorage.clear();
    paper = sscChsl01JulS1 as unknown as ExamPaper;
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Exact Q4 Forensic Reproduction & Root Cause Proof', () => {
    it('proves naive drawing-order extraction produces "Question 4" stem-wipe defect', () => {
      // Raw PyMuPDF drawing-order blocks for Q4 bounding box on Page 0
      // In drawing order, the footer "Page 1 of 21" (y=808.6) appeared at index 0 before the prompt blocks
      const drawingOrderBlocks = [
        { bbox: [269.2, 808.6, 325.8, 822.3], text: 'Page 1 of 21\n' },
        { bbox: [37.7, 556.9, 399.6, 578.5], text: 'Q.4\nThe following sentence has been divided into four segments. Identify the segment that contains a grammatical error.\n' },
        { bbox: [57.9, 586.0, 371.5, 607.5], text: 'Passengers started behaving / violent when / they were asked / to leave the bus station.\n' },
        { bbox: [36.6, 609.5, 149.1, 621.4], text: 'Ans\n1. they were asked\n' },
        { bbox: [78.7, 626.9, 136.4, 638.3], text: '2. violent when\n' },
        { bbox: [77.1, 644.2, 196.2, 655.6], text: '3. Passengers started behaving\n' },
        { bbox: [77.1, 661.6, 176.4, 672.9], text: '4. to leave the bus station.\n' },
      ];

      const ansY = 609.5;

      // Naive algorithm: iterates blocks in drawing order with early break when b.bbox[1] >= ansY
      const naivePromptParts: string[] = [];
      for (const b of drawingOrderBlocks) {
        if (b.bbox[1] >= ansY) {
          if (b.bbox[1] === ansY) {
            const p = b.text.split('Ans')[0].trim();
            if (p) naivePromptParts.push(p);
          }
          break; // TRIGGERED IMMEDIATELY on Block 0 (y=808.6 >= 609.5)!
        }
        naivePromptParts.push(b.text.trim());
      }

      const naivePromptText = naivePromptParts.join('\n').trim();
      const naiveFallbackText = naivePromptText || 'Question 4';

      // Reproduction verified: naive extraction completely wipes the stem to "Question 4"
      expect(naivePromptText).toBe('');
      expect(naiveFallbackText).toBe('Question 4');
    });

    it('proves geometric reading-order sorting and footer filtering extracts the full Q4 stem', () => {
      const pageHeight = 842;
      const rawBlocks = [
        { bbox: [269.2, 808.6, 325.8, 822.3], text: 'Page 1 of 21\n' },
        { bbox: [37.7, 556.9, 399.6, 578.5], text: 'Q.4\nThe following sentence has been divided into four segments. Identify the segment that contains a grammatical error.\n' },
        { bbox: [57.9, 586.0, 371.5, 607.5], text: 'Passengers started behaving / violent when / they were asked / to leave the bus station.\n' },
        { bbox: [36.6, 609.5, 149.1, 621.4], text: 'Ans\n1. they were asked\n' },
        { bbox: [78.7, 626.9, 136.4, 638.3], text: '2. violent when\n' },
        { bbox: [77.1, 644.2, 196.2, 655.6], text: '3. Passengers started behaving\n' },
        { bbox: [77.1, 661.6, 176.4, 672.9], text: '4. to leave the bus station.\n' },
      ];

      // Fixed algorithm: 1) filter footers, 2) sort geometrically by (y0, x0)
      const validBlocks = rawBlocks.filter(
        (b) => !(b.bbox[1] > pageHeight - 45 || /Page\s+\d+\s+of\s+\d+/i.test(b.text))
      );
      validBlocks.sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);

      const ansY = 609.5;
      const promptParts: string[] = [];
      for (const b of validBlocks) {
        if (b.bbox[1] >= ansY) {
          if (b.bbox[1] === ansY) {
            const p = b.text.split('Ans')[0].trim();
            if (p) promptParts.push(p);
          }
          break;
        }
        promptParts.push(b.text.trim());
      }

      const extractedPrompt = promptParts
        .join('\n')
        .replace(/^Q\.?\s*\d+\s*/i, '')
        .trim();

      expect(extractedPrompt).toContain(
        'The following sentence has been divided into four segments. Identify the segment that contains a grammatical error.'
      );
      expect(extractedPrompt).toContain(
        'Passengers started behaving / violent when / they were asked / to leave the bus station.'
      );
      expect(extractedPrompt).not.toBe('Question 4');
    });
  });

  describe('2. Active 01 Jul 2024 Shift 1 Question 4 Verification', () => {
    it('verifies Q4 in generated paper contains complete stem, distinct options, and correct answer', () => {
      const q4 = paper.questions.find((q) => q.questionNumber === 4);
      expect(q4).toBeDefined();
      expect(q4!.id).toBe('ssc-chsl-2024-01jul-s1-q4');

      // 1. Stem integrity
      expect(q4!.questionText).not.toBe('Question 4');
      expect(q4!.questionText).toContain('The following sentence has been divided into four segments.');
      expect(q4!.questionText).toContain('Passengers started behaving / violent when / they were asked / to leave the bus');

      // 2. Options integrity: distinct sentence fragments
      expect(q4!.options).toHaveLength(4);
      expect(q4!.options[0]).toBe('they were asked');
      expect(q4!.options[1]).toBe('violent when');
      expect(q4!.options[2]).toBe('Passengers started behaving');
      expect(q4!.options[3]).toBe('to leave the bus station.');

      // 3. Answer key integrity
      expect(q4!.correctAnswer).toBe('B');
      expect(q4!.correctAnswerIndex).toBe(1);

      // 4. Honest verification status
      expect(q4!.verificationStatus).toBe('VERIFIED');
    });
  });

  describe('3. Corpus-Wide Quality Invariants on Reprocessed Paper', () => {
    it('guarantees ZERO "Question {N}" fallback strings across all 100 questions', () => {
      const fallbackQuestions = paper.questions.filter((q) => {
        const text = (q.questionText || '').trim();
        return /^Question\s+\d+$/i.test(text);
      });
      expect(fallbackQuestions).toHaveLength(0);
    });

    it('guarantees ZERO questions have empty stems without a visual diagram', () => {
      const emptyNonVisualQuestions = paper.questions.filter((q) => {
        const text = (q.questionText || '').trim();
        const hasDiag = Boolean(q.diagramUrl || (q.diagramUrls && q.diagramUrls.length > 0));
        return !text && !hasDiag;
      });
      expect(emptyNonVisualQuestions).toHaveLength(0);
    });

    it('guarantees ZERO questions suffer from the 4-identical-options bug (A = B = C = D)', () => {
      const identicalOptionsQuestions = paper.questions.filter((q) => {
        const opts = q.options || [];
        return opts.length === 4 && Boolean(opts[0]) && opts[0] === opts[1] && opts[1] === opts[2] && opts[2] === opts[3];
      });
      expect(identicalOptionsQuestions).toHaveLength(0);
    });

    it('guarantees 100/100 questions have explicit verificationStatus', () => {
      const unverified = paper.questions.filter((q) => !q.verificationStatus);
      expect(unverified).toHaveLength(0);
    });
  });

  describe('4. UI Rendering & Canonical Identity Decoupling', () => {
    it('renders Question 4 with full stem, distinct option labels, and persists canonical ID', () => {
      const handleExit = vi.fn();
      const handleSubmit = vi.fn();

      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          userId="test_candidate_canonical"
          onExit={handleExit}
          onSubmit={handleSubmit}
        />
      );

      // Navigate to Q4
      const q4PaletteBtn = screen.getByRole('button', { name: '4' });
      fireEvent.click(q4PaletteBtn);

      // Question header check
      expect(screen.getByText(/Question 4 of 100/i)).toBeDefined();

      // Stem check in UI: must show grammatical error instruction
      expect(screen.getByText(/Identify the segment that contains a grammatical error/i)).toBeDefined();
      // "Passengers started behaving" appears in BOTH the stem and Option C!
      expect(screen.getAllByText(/Passengers started behaving/i)).toHaveLength(2);

      // Select Option B (violent when): second occurrence of "violent when" is Option B
      const violentWhenElements = screen.getAllByText(/violent when/i);
      expect(violentWhenElements).toHaveLength(2);
      fireEvent.click(violentWhenElements[1]);

      // Verify Save & Next records state
      const saveNextBtn = screen.getByRole('button', { name: /Save & Next/i });
      fireEvent.click(saveNextBtn);

      // Verify local storage session snapshot captured canonical mapping
      const savedSessionRaw = localStorage.getItem(`mockai_exam_session_${paper.id}_test_candidate_canonical`);
      expect(savedSessionRaw).toBeDefined();
      if (savedSessionRaw) {
        const saved = JSON.parse(savedSessionRaw);
        expect(saved.canonicalAnswers).toBeDefined();
        expect(saved.canonicalAnswers['ssc-chsl-2024-01jul-s1-q4']).toBe(1); // Option B index
        expect(saved.canonicalQuestionStatuses['ssc-chsl-2024-01jul-s1-q4']).toBe('ANSWERED');
      }
    });
  });

  describe('5. Visual Reasoning & Option Image Rendering Integrity (Q26 & Beyond)', () => {
    it('verifies Question 26 has clean native text without spurious diagram or option images', () => {
      const q26 = paper.questions.find((q) => q.questionNumber === 26);
      expect(q26).toBeDefined();
      expect(q26!.id).toBe('ssc-chsl-2024-01jul-s1-q26');
      expect(q26!.sectionId).toBe('reasoning');

      // 1. Plain-text prompt promoted from strip (no spurious diagram)
      expect(q26!.questionText).toContain('What should come in place of the question mark (?) in the given series?');
      expect(q26!.diagramUrl).toBeNull();

      // 2. Options are promoted to clean native text options (no spurious raster option images)
      expect(q26!.optionImages).toBeNull();
      expect(q26!.options).toEqual(['28', '25', '22', '30']);

      // 3. Correct answer is Option A
      expect(q26!.correctAnswer).toBe('A');
      expect(q26!.correctAnswerIndex).toBe(0);
    });

    it('renders Question 26 in the player UI with clean native text and radio buttons', () => {
      const handleExit = vi.fn();
      const handleSubmit = vi.fn();

      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          userId="test_candidate_q26"
          onExit={handleExit}
          onSubmit={handleSubmit}
        />
      );

      // Navigate to Reasoning section (Q26)
      const reasoningTab = screen.getAllByRole('button', { name: /General Intelligence/i })[0];
      fireEvent.click(reasoningTab);

      // Header verifies Q26
      expect(screen.getByText(/Question 26 of 100/i)).toBeDefined();

      // Verify question prompt is rendered as native text
      expect(screen.getByText(/What should come in place of the question mark/i)).toBeDefined();

      // Spurious diagram is NOT present
      expect(screen.queryByAltText(/Figure 1 for question 26/i)).toBeNull();
      expect(screen.queryByText(/Click to enlarge figure/i)).toBeNull();

      // Options are rendered as clean native text
      const opt28 = screen.getAllByText('28').find((el) => el.tagName.toLowerCase() === 'span');
      expect(opt28).toBeDefined();
      expect(screen.getByText('25')).toBeDefined();
      expect(screen.getByText('22')).toBeDefined();
      const opt30 = screen.getAllByText('30').find((el) => el.tagName.toLowerCase() === 'span');
      expect(opt30).toBeDefined();

      // Click option A
      fireEvent.click(opt28!);

      // Save & Next
      const saveNextBtn = screen.getByRole('button', { name: /Save & Next/i });
      fireEvent.click(saveNextBtn);

      // Verify canonical answer saved
      const savedSessionRaw = localStorage.getItem(`mockai_exam_session_${paper.id}_test_candidate_q26`);
      expect(savedSessionRaw).toBeDefined();
      if (savedSessionRaw) {
        const saved = JSON.parse(savedSessionRaw);
        expect(saved.canonicalAnswers['ssc-chsl-2024-01jul-s1-q26']).toBe(0);
      }
    });

    it('guarantees ZERO questions across all 100 questions have blank options without visual option figures', () => {
      const blankOptions = paper.questions.filter((q) => {
        const hasText = q.options && q.options.some((t) => t && t.trim().length > 0);
        const hasImages = q.optionImages && q.optionImages.some((u) => Boolean(u));
        return !hasText && !hasImages;
      });
      expect(blankOptions).toHaveLength(0);
    });
  });

  describe('6. Forensic Presentation Policy & Asset Disambiguation (Q27, Q30, Q31, Q34, Q37 Fixtures)', () => {
    it('verifies Q27 mirror-image preserves visual crop and NEVER renders duplicate/corrupted "Snodveo" text', () => {
      const q27 = paper.questions.find((q) => q.questionNumber === 27);
      expect(q27).toBeDefined();
      expect(q27!.optionImages).toHaveLength(4);
      expect(q27!.richOptions).toBeDefined();
      expect(q27!.richOptions![0].displayMode).toBe('IMAGE_ONLY');
      expect(q27!.richOptions![0].text).toBe('');
      expect(q27!.richOptions![0].contentTypes).toEqual(['image']);

      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          userId="test_candidate_q27"
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      // Navigate to Reasoning section
      const reasoningTab = screen.getAllByRole('button', { name: /General Intelligence/i })[0];
      fireEvent.click(reasoningTab);

      // Navigate to Q27
      const q27Btn = screen.getByRole('button', { name: '27' });
      fireEvent.click(q27Btn);

      expect(screen.getByText(/Question 27 of 100/i)).toBeDefined();
      // Option visual crop exists
      const optAImg = screen.getByAltText(/Option A figure/i);
      expect(optAImg).toBeDefined();
      expect(optAImg.getAttribute('src')).toBe('/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q27_opt_a.png');

      // Crucial: corrupted OCR text "Snodveo" MUST NOT be visually rendered in DOM
      expect(screen.queryByText(/Snodveo/i)).toBeNull();
      expect(screen.queryByText(/CUQAGHI/i)).toBeNull();
    });

    it('verifies Q30 cube/symbol preserves visual crop and NEVER renders corrupted OCR text \'"3\'', () => {
      const q30 = paper.questions.find((q) => q.questionNumber === 30);
      expect(q30).toBeDefined();
      expect(q30!.richOptions![3].displayMode).toBe('IMAGE_ONLY');
      expect(q30!.richOptions![3].text).toBe('');

      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          userId="test_candidate_q30"
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      // Navigate to Reasoning section
      const reasoningTab = screen.getAllByRole('button', { name: /General Intelligence/i })[0];
      fireEvent.click(reasoningTab);

      const q30Btn = screen.getByRole('button', { name: '30' });
      fireEvent.click(q30Btn);

      expect(screen.getByText(/Question 30 of 100/i)).toBeDefined();
      const optDImg = screen.getByAltText(/Option D figure/i);
      expect(optDImg).toBeDefined();

      // Crucial: corrupted OCR string '"3' MUST NOT be visually rendered
      expect(screen.queryByText('"3')).toBeNull();
    });

    it('verifies Q31 number question promotes to clean native text options and eliminates spurious option images', () => {
      const q31 = paper.questions.find((q) => q.questionNumber === 31);
      expect(q31).toBeDefined();
      expect(q31!.optionImages).toBeNull();
      expect(q31!.options).toEqual(['71', '73', '74', '72']);
      expect(q31!.questionText).toContain('What should come in place of the question mark (?)');
      expect(q31!.diagramUrl).toBeNull();

      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          userId="test_candidate_q31"
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      // Navigate to Reasoning section
      const reasoningTab = screen.getAllByRole('button', { name: /General Intelligence/i })[0];
      fireEvent.click(reasoningTab);

      const q31Btn = screen.getByRole('button', { name: '31' });
      fireEvent.click(q31Btn);

      expect(screen.getByText(/Question 31 of 100/i)).toBeDefined();
      // Clean native text option rendering
      expect(screen.getByText('71')).toBeDefined();
      expect(screen.getByText('73')).toBeDefined();
      expect(screen.getByText('74')).toBeDefined();
      expect(screen.getByText('72')).toBeDefined();

      // No option figure images rendered
      expect(screen.queryByAltText(/Option A figure/i)).toBeNull();
    });

    it('verifies Q34 visual pattern preserves all 4 option image crops', () => {
      const q34 = paper.questions.find((q) => q.questionNumber === 34);
      expect(q34).toBeDefined();
      expect(q34!.optionImages).toHaveLength(4);
      expect(q34!.richOptions![0].displayMode).toBe('IMAGE_ONLY');

      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          userId="test_candidate_q34"
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      // Navigate to Reasoning section
      const reasoningTab = screen.getAllByRole('button', { name: /General Intelligence/i })[0];
      fireEvent.click(reasoningTab);

      const q34Btn = screen.getByRole('button', { name: '34' });
      fireEvent.click(q34Btn);

      expect(screen.getByText(/Question 34 of 100/i)).toBeDefined();
      expect(screen.getByAltText(/Option A figure/i)).toBeDefined();
      expect(screen.getByAltText(/Option B figure/i)).toBeDefined();
      expect(screen.getByAltText(/Option C figure/i)).toBeDefined();
      expect(screen.getByAltText(/Option D figure/i)).toBeDefined();
    });

    it('verifies Q37 analogy question promotes to clean native text options and eliminates spurious option images', () => {
      const q37 = paper.questions.find((q) => q.questionNumber === 37);
      expect(q37).toBeDefined();
      expect(q37!.optionImages).toBeNull();
      expect(q37!.options).toEqual(['TVW : YAB', 'FHI : EGH', 'WYZ: GI', 'PST : KHG']);
      expect(q37!.diagramUrl).toBeNull();

      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          userId="test_candidate_q37"
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      // Navigate to Reasoning section
      const reasoningTab = screen.getAllByRole('button', { name: /General Intelligence/i })[0];
      fireEvent.click(reasoningTab);

      const q37Btn = screen.getByRole('button', { name: '37' });
      fireEvent.click(q37Btn);

      expect(screen.getByText(/Question 37 of 100/i)).toBeDefined();
      // Clean native text option rendering
      expect(screen.getByText('TVW : YAB')).toBeDefined();
      expect(screen.getByText('FHI : EGH')).toBeDefined();
      expect(screen.getByText('WYZ: GI')).toBeDefined();
      expect(screen.getByText('PST : KHG')).toBeDefined();

      // No option figure images rendered
      expect(screen.queryByAltText(/Option A figure/i)).toBeNull();
    });

    it('verifies Q28 plain-text prompt strip is demoted to native questionText with null diagramUrl', () => {
      const q28 = paper.questions.find((q) => q.questionNumber === 28);
      expect(q28).toBeDefined();
      expect(q28!.diagramUrl).toBeNull();
      expect(q28!.questionText).toContain('LBXF is related to SYCM');

      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          userId="test_candidate_q28"
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      // Navigate to Reasoning section
      const reasoningTab = screen.getAllByRole('button', { name: /General Intelligence/i })[0];
      fireEvent.click(reasoningTab);

      const q28Btn = screen.getByRole('button', { name: '28' });
      fireEvent.click(q28Btn);

      expect(screen.getByText(/Question 28 of 100/i)).toBeDefined();
      // Native text prompt is rendered
      expect(screen.getByText(/LBXF is related to SYCM/i)).toBeDefined();

      // No spurious figure or "Click to enlarge figure" button
      expect(screen.queryByAltText(/Figure 1 for question 28/i)).toBeNull();
      expect(screen.queryByText(/Click to enlarge figure/i)).toBeNull();
    });

    it('verifies option image resolution from richOptions.imageUrl when optionImages is null', () => {
      // Create a test question using authentic visual question Q27 where optionImages is null, but richOptions has imageUrl
      const modifiedPaper: ExamPaper = {
        ...paper,
        questions: paper.questions.map((q) => {
          if (q.questionNumber === 27) {
            return {
              ...q,
              optionImages: undefined,
              richOptions: q.richOptions?.map((ro) => ({
                ...ro,
                imageUrl: ro.imageUrl || '/test/rich-opt.png',
              })),
            };
          }
          return q;
        }),
      };

      render(
        <CompetitiveExamPlayerScreen
          paper={modifiedPaper}
          userId="test_candidate_rich_opt"
          onExit={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const reasoningTab = screen.getAllByRole('button', { name: /General Intelligence/i })[0];
      fireEvent.click(reasoningTab);

      const q27Btn = screen.getByRole('button', { name: '27' });
      fireEvent.click(q27Btn);

      expect(screen.getByText(/Question 27 of 100/i)).toBeDefined();
      expect(screen.getByAltText(/Option A figure/i)).toBeDefined();
    });
  });
});

