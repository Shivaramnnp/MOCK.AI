// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { ExamPaper } from '../types';
import sscChsl2023Aug02S1 from '../data/exams/ssc-chsl-2023-02aug-s1.json';
import sscChsl2023Aug02S2 from '../data/exams/ssc-chsl-2023-02aug-s2.json';
import sscChsl2023Aug14S3 from '../data/exams/ssc-chsl-2023-14aug-s3.json';

describe('SSC CHSL 2023 Browser & UI Forensic Fidelity Suite', () => {
  let paper: ExamPaper;

  beforeEach(() => {
    localStorage.clear();
    paper = sscChsl2023Aug02S1 as unknown as ExamPaper;
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Elimination of Unwanted Image Chips & Clean Text/Math Promotion', () => {
    it('verifies Q26 number-pairs are promoted to clean native text without option images', () => {
      const q26 = paper.questions.find((q) => q.questionNumber === 26);
      expect(q26).toBeDefined();
      expect(q26!.questionText).toMatch(/numbe[rt]-pairs/);
      expect(q26!.optionImages).toBeNull();
      expect(q26!.options).toEqual(['(25, 81)', '(36, 112)', '(45, 138)', '(24, 77)']);
      expect(q26!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q29 number-triads are promoted to clean native text without option images', () => {
      const q29 = paper.questions.find((q) => q.questionNumber === 29);
      expect(q29).toBeDefined();
      expect(q29!.questionText).toContain('Select the set in which the numbers are related');
      expect(q29!.optionImages).toBeNull();
      expect(q29!.options).toEqual(['(18, 9, 165)', '(14. 31, 440)', '(21, 25, 530)', '(38, 7, 270)']);
      expect(q29!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q43 code language options are promoted to clean native text', () => {
      const q43 = paper.questions.find((q) => q.questionNumber === 43);
      expect(q43).toBeDefined();
      expect(q43!.questionText).toContain('will come back');
      expect(q43!.optionImages).toBeNull();
      expect(q43!.options).toEqual(['pl', 'rq', 'jn', 'mp']);
      expect(q43!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q48 blood relation options are promoted to clean native text', () => {
      const q48 = paper.questions.find((q) => q.questionNumber === 48);
      expect(q48).toBeDefined();
      expect(q48!.questionText).toContain('sister of G');
      expect(q48!.optionImages).toBeNull();
      expect(q48!.options).toEqual(["Wife's sister", "Brother's daughter", "Sister's daughter", 'Daughter']);
      expect(q48!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q92 economics options are promoted to full clean sentences', () => {
      const q92 = paper.questions.find((q) => q.questionNumber === 92);
      expect(q92).toBeDefined();
      expect(q92!.questionText).toContain('general interest rate');
      expect(q92!.optionImages).toBeNull();
      expect(q92!.options[0]).toContain('Most people will expect the interest rate to rise in the future');
      expect(q92!.options[1]).toContain('Most people will prefer to hold bonds');
      expect(q92!.verificationStatus).toBe('VERIFIED');
    });
  });

  describe('2. Resolution of Mathematical Operators & Numeric Classifications', () => {
    it('verifies Q35 operator choices are promoted to clean native text with distinct choices', () => {
      const q35 = paper.questions.find((q) => q.questionNumber === 35);
      expect(q35).toBeDefined();
      expect(q35!.optionImages).toBeNull();
      expect(q35!.options).toEqual(['+ and x', '- and +', '- and x', '+ and -']);
      const uniqueOpts = new Set(q35!.options);
      expect(uniqueOpts.size).toBe(4);
      expect(q35!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q37 classification choices are promoted to clean native text with distinct choices', () => {
      const q37 = paper.questions.find((q) => q.questionNumber === 37);
      expect(q37).toBeDefined();
      expect(q37!.optionImages).toBeNull();
      expect(q37!.options).toEqual(['46-41-12', '16-9-21', '23-18-15', '34-28-18']);
      const uniqueOpts = new Set(q37!.options);
      expect(uniqueOpts.size).toBe(4);
      expect(q37!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q49 number pairs choices are promoted to clean native text with distinct choices', () => {
      const q49 = paper.questions.find((q) => q.questionNumber === 49);
      expect(q49).toBeDefined();
      expect(q49!.optionImages).toBeNull();
      expect(q49!.options).toEqual(['46-141', '55-168', '35-108', '29-88']);
      const uniqueOpts = new Set(q49!.options);
      expect(uniqueOpts.size).toBe(4);
      expect(q49!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q53 triangle inequality choices are promoted to clean KaTeX LaTeX math', () => {
      const q53 = paper.questions.find((q) => q.questionNumber === 53);
      expect(q53).toBeDefined();
      expect(q53!.optionImages).toBeNull();
      expect(q53!.options).toEqual([
        '$15 < S < 33$',
        '$15 \\le S < 33$',
        '$15 < S \\le 33$',
        '$15 \\le S \\le 33$',
      ]);
      const uniqueOpts = new Set(q53!.options);
      expect(uniqueOpts.size).toBe(4);
      expect(q53!.verificationStatus).toBe('VERIFIED');
    });
  });

  describe('3. Visual Reasoning & Single-Ownership UI Invariant', () => {
    it('verifies Q34 mirror image diagram and visual options render with disjoint asset paths', () => {
      const q34 = paper.questions.find((q) => q.questionNumber === 34);
      expect(q34).toBeDefined();
      expect(q34!.diagramUrl).toBeDefined();
      expect(q34!.diagramUrl).toContain('q34_diag');
      expect(q34!.optionImages?.length).toBe(4);
      // Stem diagram must NOT be in option images
      expect(q34!.optionImages?.includes(q34!.diagramUrl!)).toBe(false);
      expect(q34!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q50 visual series renders authentic figure and options in IMAGE_ONLY display mode', () => {
      const q50 = paper.questions.find((q) => q.questionNumber === 50);
      expect(q50).toBeDefined();
      expect(q50!.diagramUrl).toContain('q50_diag');
      expect(q50!.richOptions).toBeDefined();
      q50!.richOptions?.forEach((opt) => {
        expect(opt.displayMode).toBe('IMAGE_ONLY');
        expect(opt.text).toBe(''); // Zero OCR contamination in rendered text
      });
      expect(q50!.verificationStatus).toBe('VERIFIED');
    });
  });

  describe('4. Full Player Screen UI Integration', () => {
    it('renders CompetitiveExamPlayerScreen without throwing or missing palette numbers', () => {
      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          onExit={() => {}}
          onSubmit={() => {}}
        />
      );

      // Question subheader should be rendered
      expect(screen.getByText(/Question 1 of/i)).toBeDefined();
      // Section header should be present
      expect(screen.getAllByText(/English Language/i).length).toBeGreaterThan(0);
      // Exam title should be present
      expect(screen.getByText(/SSC CHSL Tier 1 — 02 Aug 2023/i)).toBeDefined();
    });
  });

  describe('5. Geometric Isolation & Anti-Bleed Invariants (02 Aug Shift 2 — Category H Forensic Truth)', () => {
    let paperS2: ExamPaper;

    beforeEach(() => {
      paperS2 = sscChsl2023Aug02S2 as unknown as ExamPaper;
    });

    it('verifies Q26 owns its GAMU stem and EUOT/DINS/ETOS/CTOU options without Q27 bleeding into Option D', () => {
      const q26 = paperS2.questions.find((q) => q.questionNumber === 26);
      expect(q26).toBeDefined();
      expect(q26!.questionText).toContain('GAMU is related to JDPX');
      expect(q26!.questionText).not.toBe('EUOT'); // Option 1 was not promoted to stem
      expect(q26!.options).toEqual(['EUOT', 'DINS', 'ETOS', 'CTOU']);
      expect(q26!.options[3]).not.toMatch(/which of the following|series|question mark/i); // No stem bleeding
      expect(q26!.correctAnswer).toBe('A');
    });

    it('verifies Q27 owns its series stem and 57/53/45/69 options without Q28 bleeding into Option D', () => {
      const q27 = paperS2.questions.find((q) => q.questionNumber === 27);
      expect(q27).toBeDefined();
      expect(q27!.questionText).toContain('Which of the following');
      expect(q27!.questionText).toContain('8, 17,');
      expect(q27!.questionText).not.toBe('57');
      expect(q27!.options).toEqual(['57', '53', '45', '69']);
      expect(q27!.options[3]).not.toMatch(/stands for|equation/i);
      expect(q27!.correctAnswer).toBe('B');
    });

    it('verifies Q28 owns its algebra equation stem and 329/319/289/309 options without Q29 bleeding into Option D', () => {
      const q28 = paperS2.questions.find((q) => q.questionNumber === 28);
      expect(q28).toBeDefined();
      expect(q28!.questionText).toContain('stands for');
      expect(q28!.questionText).toContain('23C13B841A29D91');
      expect(q28!.questionText).not.toBe('329');
      expect(q28!.options).toEqual(['329', '319', '289', '309']);
      expect(q28!.options[3]).not.toMatch(/letters in the word/i);
      expect(q28!.correctAnswer).toBe('D');
    });

    it('verifies Q29 owns its word stem and None/Three/One/Two options', () => {
      const q29 = paperS2.questions.find((q) => q.questionNumber === 29);
      expect(q29).toBeDefined();
      expect(q29!.questionText).toContain('ANOTHER');
      expect(q29!.options).toEqual(['None', 'Three', 'One', 'Two']);
      expect(q29!.correctAnswer).toBe('B');
    });

    it('verifies Option D anti-bleed guard across all reasoning questions Q26-Q50', () => {
      for (let qn = 26; qn <= 50; qn++) {
        const q = paperS2.questions.find((item) => item.questionNumber === qn);
        expect(q).toBeDefined();
        if (q!.options && q!.options.length >= 4 && q!.options[3]) {
          const optD = q!.options[3];
          // Option D must never be a full question stem sentence
          expect(optD).not.toMatch(/which of the following numbers|stands for|in the following equation/i);
        }
      }
    });

    it('renders Q26, Q27, Q28 in CompetitiveExamPlayerScreen without 1-off errors', () => {
      const { unmount } = render(
        <CompetitiveExamPlayerScreen
          paper={paperS2}
          onExit={() => {}}
          onSubmit={() => {}}
        />
      );
      // Verify Shift 2 title is rendered in player
      expect(screen.getByText(/SSC CHSL Tier 1 — 02 Aug 2023/i)).toBeDefined();

      // Click General Intelligence & Reasoning section tab
      const reasoningTab = screen.getByRole('button', { name: /General Intelligence & Reasoning/i });
      fireEvent.click(reasoningTab);

      // Current question is now Q26 (Question 26 of 100)
      expect(screen.getByText(/GAMU is related to JDPX/i)).toBeDefined();
      expect(screen.getByText(/EUOT/i)).toBeDefined();
      expect(screen.getByText(/DINS/i)).toBeDefined();
      expect(screen.getByText(/ETOS/i)).toBeDefined();
      expect(screen.getByText(/CTOU/i)).toBeDefined();

      // Click Question 27 on the palette
      const q27Button = screen.getByRole('button', { name: '27' });
      fireEvent.click(q27Button);

      // Q27 prompt and options rendered cleanly
      expect(screen.getByText(/Which of the following mimbers will replace/i)).toBeDefined();
      expect(screen.getByText('57')).toBeDefined();
      expect(screen.getByText('53')).toBeDefined();
      expect(screen.getAllByText('45').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('69')).toBeDefined();

      // Click Question 28 on the palette
      const q28Button = screen.getByRole('button', { name: '28' });
      fireEvent.click(q28Button);

      // Q28 prompt and options rendered cleanly
      expect(screen.getByText(/23C13B841A29D91/i)).toBeDefined();
      expect(screen.getByText('329')).toBeDefined();
      expect(screen.getByText('319')).toBeDefined();
      expect(screen.getByText('289')).toBeDefined();
      expect(screen.getByText('309')).toBeDefined();

      unmount();
    });
  });

  describe('6. Promotion of Decimal Angles, Comma Pairs, and Trigonometric Math (14 Aug Shift 3)', () => {
    const paper14S3 = sscChsl2023Aug14S3 as unknown as ExamPaper;

    it('verifies Q61 race letter-decimal comma choices are promoted to native text without option images', () => {
      const q61 = paper14S3.questions.find((q) => q.questionNumber === 61);
      expect(q61).toBeDefined();
      expect(q61!.questionText).toContain('In a 120 metre race');
      expect(q61!.optionImages).toBeNull();
      expect(q61!.options).toEqual(['S, 2.63', 'P, 3.63', 'S, 3.63', 'P, 2.63']);
      expect(q61!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q62 pie chart angle choices are promoted to clean degree text without option images', () => {
      const q62 = paper14S3.questions.find((q) => q.questionNumber === 62);
      expect(q62).toBeDefined();
      expect(q62!.optionImages).toBeNull();
      expect(q62!.options).toEqual(['43.2°', '64.8°', '50.4°', '63.2°']);
      expect(q62!.contentBlocks).toEqual([
        expect.objectContaining({ type: 'image', assetUrl: expect.stringContaining('q62_diag') }),
      ]);
      expect(q62!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q63 trigonometric choices are promoted to KaTeX LaTeX math without option images', () => {
      const q63 = paper14S3.questions.find((q) => q.questionNumber === 63);
      expect(q63).toBeDefined();
      expect(q63!.optionImages).toBeNull();
      expect(q63!.options).toEqual(['$2\\sec A$', '$2\\cosec A$', '$\\sec A$', '$\\cosec A$']);
      expect(q63!.verificationStatus).toBe('VERIFIED');
    });

    it('renders Q61, Q62, Q63 in CompetitiveExamPlayerScreen with native text and LaTeX without option images', () => {
      const { unmount } = render(
        <CompetitiveExamPlayerScreen
          paper={paper14S3}
          onExit={() => {}}
          onSubmit={() => {}}
        />
      );

      // Switch to Quantitative Aptitude section
      const quantTab = screen.getAllByRole('button', { name: /Quantitative/i })[0];
      fireEvent.click(quantTab);

      // Navigate to Q61
      const q61Button = screen.getByRole('button', { name: '61' });
      fireEvent.click(q61Button);
      expect(screen.getByText(/In a 120 metre race/i)).toBeDefined();
      expect(screen.getAllByText(/S, 2.63/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/P, 3.63/i).length).toBeGreaterThanOrEqual(1);

      // Navigate to Q62
      const q62Button = screen.getByRole('button', { name: '62' });
      fireEvent.click(q62Button);
      expect(screen.getAllByText(/43.2°/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/64.8°/i).length).toBeGreaterThanOrEqual(1);

      // Navigate to Q63
      const q63Button = screen.getByRole('button', { name: '63' });
      fireEvent.click(q63Button);
      // KaTeX math rendered in the DOM for sec A and cosec A
      expect(screen.getAllByText(/sec/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/cosec/i).length).toBeGreaterThanOrEqual(1);

      unmount();
    });
  });
});

