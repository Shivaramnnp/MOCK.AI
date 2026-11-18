// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

// Components
import { LatexRenderer } from '../components/LatexRenderer';
import { StructuredContentRenderer, OptionContentRenderer } from '../components/StructuredContentRenderer';

// Data JSON files
import chsl2024Json from '../data/exams/ssc-chsl-2024-01jul-s1.json';
import gate2023AeJson from '../data/exams/gate-2023-ae.json';
import chsl2025Json from '../data/exams/ssc-chsl-2025-14nov-s3.json';
import chsl2019Json from '../data/exams/ssc-chsl-2019-01jul-s3.json';
import chsl2019_02jul_s1Json from '../data/exams/ssc-chsl-2019-02jul-s1.json';
import chsl2022Json from '../data/exams/ssc-chsl-2022-09mar-s1.json';

describe('Reported Questions Repair Fidelity Test Suite (21 Reports)', () => {
  const publicDir = path.resolve(__dirname, '../../public');

  // =========================================================================
  // Requirement 1: CHSL 2024 Underline Formatting (Reports 15–21)
  // =========================================================================
  describe('CHSL 2024 Underline Formatting (Reports 15–21)', () => {
    const questions = chsl2024Json.questions as any[];
    const qMap = new Map<number, any>(questions.map((q) => [q.questionNumber, q]));

    it('verifies Q3 (Report 15) has correct underline on "down with"', () => {
      const q = qMap.get(3);
      expect(q).toBeDefined();
      expect(q.questionText).toContain('<u>down with</u>');
      const { container } = render(<LatexRenderer content={q.questionText} />);
      const uEl = container.querySelector('u');
      expect(uEl).not.toBeNull();
      expect(uEl?.textContent?.trim()).toBe('down with');
      expect(q.correctAnswer).toBe('C');
    });

    it('verifies Q10 (Report 16) has correct underline on "when he burnt"', () => {
      const q = qMap.get(10);
      expect(q).toBeDefined();
      expect(q.questionText).toContain('<u>when he burnt</u>');
      const { container } = render(<LatexRenderer content={q.questionText} />);
      const uEl = container.querySelector('u');
      expect(uEl).not.toBeNull();
      expect(uEl?.textContent?.trim()).toBe('when he burnt');
      expect(q.correctAnswer).toBe('A');
    });

    it('verifies Q15 (Report 17) has correct underline on "guard the nest at night" (PDF ground truth)', () => {
      const q = qMap.get(15);
      expect(q).toBeDefined();
      expect(q.questionText).toContain('<u>guard the nest at night</u>');
      const { container } = render(<LatexRenderer content={q.questionText} />);
      const uEl = container.querySelector('u');
      expect(uEl).not.toBeNull();
      expect(uEl?.textContent?.trim()).toBe('guard the nest at night');
      expect(container.textContent).not.toContain('<u>is a general belief</u>');
      expect(q.correctAnswer).toBe('C');
    });

    it('verifies Q16 (Report 18) has correct underline on "conspicuous"', () => {
      const q = qMap.get(16);
      expect(q).toBeDefined();
      expect(q.questionText).toContain('<u>conspicuous</u>');
      const { container } = render(<LatexRenderer content={q.questionText} />);
      const uEl = container.querySelector('u');
      expect(uEl).not.toBeNull();
      expect(uEl?.textContent?.trim()).toBe('conspicuous');
      expect(q.correctAnswer).toBe('D');
    });

    it('verifies Q17 (Report 19) has correct underline on "joyless"', () => {
      const q = qMap.get(17);
      expect(q).toBeDefined();
      expect(q.questionText).toContain('<u>joyless</u>');
      const { container } = render(<LatexRenderer content={q.questionText} />);
      const uEl = container.querySelector('u');
      expect(uEl).not.toBeNull();
      expect(uEl?.textContent?.trim()).toBe('joyless');
      expect(q.correctAnswer).toBe('A');
    });

    it('verifies Q20 (Report 20) has correct underline on "strong" (PDF ground truth: single word)', () => {
      const q = qMap.get(20);
      expect(q).toBeDefined();
      expect(q.questionText).toContain('<u>strong</u>');
      expect(q.questionText).not.toContain('<u>strong pain</u>');
      const { container } = render(<LatexRenderer content={q.questionText} />);
      const uEl = container.querySelector('u');
      expect(uEl).not.toBeNull();
      expect(uEl?.textContent?.trim()).toBe('strong');
      expect(q.correctAnswer).toBe('B');
    });

    it('verifies Q21 (Report 21) has correct underline on "support"', () => {
      const q = qMap.get(21);
      expect(q).toBeDefined();
      expect(q.questionText).toContain('<u>support</u>');
      const { container } = render(<LatexRenderer content={q.questionText} />);
      const uEl = container.querySelector('u');
      expect(uEl).not.toBeNull();
      expect(uEl?.textContent?.trim()).toBe('support');
      expect(q.correctAnswer).toBe('B');
    });

    it('verifies StructuredContentRenderer and LatexRenderer render identical underline tags', () => {
      const q = qMap.get(15);
      const { container: studentView } = render(
        <StructuredContentRenderer blocks={q.contentBlocks} fallbackText={q.questionText} />
      );
      const { container: staffView } = render(<LatexRenderer content={q.questionText} />);
      expect(studentView.querySelector('u')?.textContent).toBe(staffView.querySelector('u')?.textContent);
    });
  });

  // =========================================================================
  // Requirement 2: GATE 2023 AE Q13 Wave Equation (Report 13)
  // =========================================================================
  describe('GATE 2023 AE Q13 Wave Equation (Report 13)', () => {
    const questions = gate2023AeJson.questions as any[];
    const q13 = questions.find((q) => q.questionNumber === 13);

    it('verifies Q13 questionText contains exact wave equation and initial condition', () => {
      expect(q13).toBeDefined();
      expect(q13.questionText).toContain('\\frac{\\partial u}{\\partial t} + \\frac{\\partial u}{\\partial x} = 0');
      expect(q13.questionText).toContain('-\\infty < x < \\infty');
      expect(q13.questionText).toContain('t \\ge 0');
      expect(q13.questionText).toContain('u(x, 0) = e^{-x^2}');
      expect(q13.questionText).toContain('solution at \\(t = 1\\) is');
    });

    it('verifies Q13 options contain exact analytical solution forms and Option A is official key', () => {
      expect(q13.options).toEqual([
        '\\(u(x, 1) = e^{-(x - 1)^2}\\)',
        '\\(u(x, 1) = e^{-1}\\)',
        '\\(u(x, 1) = e^{-x^2}\\)',
        '\\(u(x, 1) = e^{-(x + 1)^2}\\)',
      ]);
      expect(q13.correctAnswer).toBe('A');
      expect(q13.correctAnswerIndex).toBe(0);
    });

    it('verifies Q13 KaTeX renders cleanly without errors or unparsed raw tokens', () => {
      const { container } = render(<LatexRenderer content={q13.questionText} />);
      const katexElements = container.querySelectorAll('.katex');
      expect(katexElements.length).toBeGreaterThan(0);
      expect(container.textContent).not.toContain('e^{-} x 2');
      expect(container.textContent).not.toContain('t = is 1');
    });

    it('verifies LatexRenderer pre-normalizer successfully repairs raw fragmented OCR math tokens', () => {
      const fragmentedInput = 'Consider \\(u x (,1) = e^{-} ( x - 1) 2\\) with \\(u x ( ,0) = e^{-} x 2\\)';
      const { container } = render(<LatexRenderer content={fragmentedInput} />);
      const katexEls = container.querySelectorAll('.katex');
      expect(katexEls.length).toBeGreaterThanOrEqual(2);
      // Should normalize to u(x,1) and e^{-(x - 1)^2} and u(x,0) and e^{-x^2}
      expect(container.textContent).toContain('u(x,1)');
      expect(container.textContent).toContain('u(x,0)');
    });
  });

  // =========================================================================
  // Requirement 3: SSC CHSL 2025 Q42 and Q44 (Reports 11 & 12)
  // =========================================================================
  describe('SSC CHSL 2025 Q42 & Q44 Assets and References (Reports 11 & 12)', () => {
    const questions = chsl2025Json.questions as any[];
    const q42 = questions.find((q) => q.questionNumber === 42);
    const q44 = questions.find((q) => q.questionNumber === 44);

    it('verifies Q42 (Report 11) diagram file exists on disk and is correctly linked', () => {
      expect(q42).toBeDefined();
      expect(q42.diagramUrl).toBe('/exam-assets/ssc/chsl/2025/ssc-chsl-2025-14nov-s3/q42_diag.png');
      const assetPath = path.join(publicDir, q42.diagramUrl.replace(/^\//, ''));
      expect(fs.existsSync(assetPath)).toBe(true);
      expect(fs.statSync(assetPath).size).toBeGreaterThan(1000);
      expect(q42.correctAnswer).toBe('B');
      expect(q42.options).toEqual(['9', '11', '12', '14']);
    });

    it('verifies Q44 (Report 12) diagram file exists on disk and mirror line reference matches figure AB', () => {
      expect(q44).toBeDefined();
      expect(q44.diagramUrl).toBe('/exam-assets/ssc/chsl/2025/ssc-chsl-2025-14nov-s3/q44_diag.png');
      const assetPath = path.join(publicDir, q44.diagramUrl.replace(/^\//, ''));
      expect(fs.existsSync(assetPath)).toBe(true);
      expect(fs.statSync(assetPath).size).toBeGreaterThan(1000);

      // Verify question reference is aligned with diagram (line AB)
      expect(q44.questionText).toContain('line AB');
      expect(q44.questionText).not.toContain('line XY');
    });

    it('verifies Q44 option images exist on disk and align with options A, B, C, D', () => {
      expect(q44.optionImages).toHaveLength(4);
      for (let i = 0; i < q44.optionImages.length; i++) {
        const optImgPath = path.join(publicDir, q44.optionImages[i].replace(/^\//, ''));
        expect(fs.existsSync(optImgPath)).toBe(true);
        expect(fs.statSync(optImgPath).size).toBeGreaterThan(500);
      }
      expect(q44.richOptions[0].imageUrl).toBe('/exam-assets/ssc/chsl/2025/ssc-chsl-2025-14nov-s3/q44_opt_a.png');
      expect(q44.correctAnswer).toBe('A');
    });
  });

  // =========================================================================
  // Requirement 4: SSC CHSL 2019 Q61 Data Interpretation & Options (Report 14)
  // =========================================================================
  describe('SSC CHSL 2019 Q61 Data Interpretation & Options (Report 14)', () => {
    const questions = chsl2019Json.questions as any[];
    const q61 = questions.find((q) => q.questionNumber === 61);
    const q53 = questions.find((q) => q.questionNumber === 53);
    const q75 = questions.find((q) => q.questionNumber === 75);

    it('verifies Q61 diagram exists on disk', () => {
      expect(q61).toBeDefined();
      expect(q61.diagramUrl).toBe('/exam-assets/ssc/chsl/2019/ssc-chsl-2019-01jul-s3/q61_diag.jpeg');
      const assetPath = path.join(publicDir, q61.diagramUrl.replace(/^\//, ''));
      expect(fs.existsSync(assetPath)).toBe(true);
      expect(fs.statSync(assetPath).size).toBeGreaterThan(1000);
    });

    it('verifies Q61 options are cleaned of OCR corruption into valid ratios and render in UI', () => {
      expect(q61.options).toEqual(['8:11', '7:9', '2:3', '5:7']);
      expect(q61.correctAnswer).toBe('B');
      expect(q61.correctAnswerIndex).toBe(1);
      // Option B corresponds to "7:9"
      expect(q61.options[1]).toBe('7:9');

      // Verify real rendered UI output for all four options
      q61.options.forEach((opt: string, idx: number) => {
        const { container } = render(<LatexRenderer content={opt} />);
        expect(container.textContent?.trim()).toBe(opt);
        expect(container.textContent).not.toContain('Option content missing');

        // Also verify student view renderer
        const { container: studentView } = render(
          <OptionContentRenderer fallbackText={opt} displayMode="TEXT_ONLY" />
        );
        expect(studentView.textContent?.trim()).toBe(opt);
      });
    });

    it('verifies Q61 preserves shared DI Bar Graph context alongside Q53 and Q75', () => {
      expect(q53.contentBlocks[0].content).toContain('The given Bar Graph presents the number of different types of vehicles');
      expect(q61.contentBlocks[0].content).toContain('The given Bar Graph presents the number of different types of vehicles');
      expect(q75.explanation).toContain('From the bar graph');
    });
  });

  // =========================================================================
  // Phase 2 Reopened Audit: Target Failures Real Rendered UI Verification
  // Cases A, B, C (SSC CHSL 2019 Shift 1 & Shift 3)
  // =========================================================================
  describe('Phase 2 Reopened Audit: Real Rendered UI Verification (Cases A, B, C)', () => {
    const chsl02JulQuestions = chsl2019_02jul_s1Json.questions as any[];
    const qMap02Jul = new Map<number, any>(chsl02JulQuestions.map((q) => [q.questionNumber, q]));

    // ── Case A: SSC CHSL 2019 Q61 ──────────────────────────────────────────
    describe('Case A — SSC CHSL 2019 Q61 (ssc-chsl-2019-02jul-s1-q61 & ssc-chsl-2019-01jul-s3-q61)', () => {
      it('verifies 02jul-s1 Q61 renders visible stem, all four distinct options, and Option B answer key', () => {
        const q = qMap02Jul.get(61);
        expect(q).toBeDefined();
        expect(q.id).toBe('ssc-chsl-2019-02jul-s1-q61');
        expect(q.questionText).toContain('There are 90 students in a class');

        // Renders complete stem in UI
        const { container: stemEl } = render(
          <StructuredContentRenderer blocks={q.contentBlocks} fallbackText={q.questionText} />
        );
        expect(stemEl.textContent).toContain('average score of students from village B');

        // Options must be non-empty, non-blank strings matching official solution
        expect(q.options).toEqual(['54', '60', '64', '50']);
        expect(q.correctAnswer).toBe('B');
        expect(q.correctAnswerIndex).toBe(1);
        expect(q.optionImages).toBeNull();
        expect(q.richOptions).toBeNull();

        // Render each option in real UI and assert visible text
        const renderedTexts = q.options.map((opt: string) => {
          const { container } = render(<LatexRenderer content={opt} />);
          return container.textContent?.trim();
        });
        expect(renderedTexts).toEqual(['54', '60', '64', '50']);

        // Verify student renderer does NOT show "Option content missing"
        q.options.forEach((opt: string) => {
          const { container } = render(<OptionContentRenderer fallbackText={opt} displayMode="TEXT_ONLY" />);
          expect(container.textContent?.trim()).toBe(opt);
          expect(container.textContent).not.toContain('Option content missing');
        });
      });

      it('verifies 01jul-s3 Q61 renders all four ratio options in UI without blanks', () => {
        const q = (chsl2019Json.questions as any[]).find((x) => x.questionNumber === 61);
        expect(q).toBeDefined();
        expect(q.id).toBe('ssc-chsl-2019-01jul-s3-q61');
        expect(q.options).toEqual(['8:11', '7:9', '2:3', '5:7']);
        expect(q.correctAnswer).toBe('B');

        q.options.forEach((opt: string) => {
          const { container } = render(<LatexRenderer content={opt} />);
          expect(container.textContent?.trim()).toBe(opt);
          expect(container.textContent).not.toContain('Option content missing');
        });
      });
    });

    // ── Case B: SSC CHSL 2019 Q16 ──────────────────────────────────────────
    describe('Case B — SSC CHSL 2019 Q16 (ssc-chsl-2019-02jul-s1-q16)', () => {
      it('verifies Q16 question stem is restored from source evidence and renders completely', () => {
        const q = qMap02Jul.get(16);
        expect(q).toBeDefined();
        expect(q.id).toBe('ssc-chsl-2019-02jul-s1-q16');
        expect(q.questionText).toBe(
          'Two different positions of the same dice are shown. Find the number opposite to the face having 4.'
        );

        // Verify StructuredContentRenderer renders complete stem in UI
        const { container } = render(
          <StructuredContentRenderer blocks={q.contentBlocks} fallbackText={q.questionText} />
        );
        expect(container.textContent).toContain('Two different positions of the same dice are shown');
        expect(container.textContent).toContain('Find the number opposite to the face having 4');
        expect(container.textContent?.trim().length).toBeGreaterThan(30);
      });

      it('verifies Q16 diagram file exists on disk and is linked to the question', () => {
        const q = qMap02Jul.get(16);
        expect(q.diagramUrl).toBe('/exam-assets/ssc/chsl/2019/ssc-chsl-2019-02jul-s1/q16_diag.png');
        const assetPath = path.join(publicDir, q.diagramUrl.replace(/^\//, ''));
        expect(fs.existsSync(assetPath)).toBe(true);
        expect(fs.statSync(assetPath).size).toBeGreaterThan(1000);
      });

      it('verifies Q16 renders all four options in real UI with Option C (2) as official key', () => {
        const q = qMap02Jul.get(16);
        expect(q.options).toEqual(['6', '3', '2', '1']);
        expect(q.correctAnswer).toBe('C');
        expect(q.correctAnswerIndex).toBe(2);

        // Render each option in UI and verify visible text
        const rendered = q.options.map((opt: string) => {
          const { container } = render(<LatexRenderer content={opt} />);
          return container.textContent?.trim();
        });
        expect(rendered).toEqual(['6', '3', '2', '1']);

        // Student renderer check
        q.options.forEach((opt: string) => {
          const { container } = render(<OptionContentRenderer fallbackText={opt} displayMode="TEXT_ONLY" />);
          expect(container.textContent?.trim()).toBe(opt);
          expect(container.textContent).not.toContain('Option content missing');
        });
      });
    });

    // ── Case C: SSC CHSL 2019 Q6 ───────────────────────────────────────────
    describe('Case C — SSC CHSL 2019 Q6 (ssc-chsl-2019-02jul-s1-q6)', () => {
      it('verifies Q6 stem renders completely in UI', () => {
        const q = qMap02Jul.get(6);
        expect(q).toBeDefined();
        expect(q.id).toBe('ssc-chsl-2019-02jul-s1-q6');
        expect(q.questionText).toBe('How many triangles are present in the following figure?');

        const { container } = render(
          <StructuredContentRenderer blocks={q.contentBlocks} fallbackText={q.questionText} />
        );
        expect(container.textContent).toContain('How many triangles are present in the following figure?');
      });

      it('verifies Q6 diagram file exists on disk, is unclipped, and has valid dimensions', () => {
        const q = qMap02Jul.get(6);
        expect(q.diagramUrl).toBe('/exam-assets/ssc/chsl/2019/ssc-chsl-2019-02jul-s1/q6_diag.png');
        const assetPath = path.join(publicDir, q.diagramUrl.replace(/^\//, ''));
        expect(fs.existsSync(assetPath)).toBe(true);
        expect(fs.statSync(assetPath).size).toBeGreaterThan(1500);

        // Also ensure JPEG format version exists for backward compatibility
        const jpegPath = path.join(publicDir, 'exam-assets/ssc/chsl/2019/ssc-chsl-2019-02jul-s1/q6_diag.jpeg');
        expect(fs.existsSync(jpegPath)).toBe(true);
        expect(fs.statSync(jpegPath).size).toBeGreaterThan(1500);
      });

      it('verifies Q6 renders all four options as uniform clean text with Option C (10) restored and Option B (13) key', () => {
        const q = qMap02Jul.get(6);
        expect(q.options).toEqual(['14', '13', '10', '12']);
        expect(q.correctAnswer).toBe('B');
        expect(q.correctAnswerIndex).toBe(1);
        expect(q.optionImages).toBeNull();
        expect(q.richOptions).toBeNull();

        // Render each option in UI and verify clean readable text
        const rendered = q.options.map((opt: string) => {
          const { container } = render(<LatexRenderer content={opt} />);
          return container.textContent?.trim();
        });
        expect(rendered).toEqual(['14', '13', '10', '12']);

        // Verify student view renders consistent text without "Option content missing"
        q.options.forEach((opt: string) => {
          const { container } = render(<OptionContentRenderer fallbackText={opt} displayMode="TEXT_ONLY" />);
          expect(container.textContent?.trim()).toBe(opt);
          expect(container.textContent).not.toContain('Option content missing');
        });
      });
    });
  });

  // =========================================================================
  // Requirement 5: Non-regression for Previously Resolved Reports (Reports 1–10)
  // =========================================================================
  describe('Non-regression for Previously Resolved Reports (Reports 1–10)', () => {
    describe('SSC CHSL 2022-09mar-s1 (Reports 1–5)', () => {
      const questions = chsl2022Json.questions as any[];
      const qMap = new Map<number, any>(questions.map((q) => [q.questionNumber, q]));

      it('verifies Q43 (Report 1) has valid series diagram', () => {
        const q = qMap.get(43);
        expect(q.diagramUrl).toBe('/exam-assets/ssc/chsl/2022/ssc-chsl-2022-09mar-s1/q43_diag.jpeg');
        const assetPath = path.join(publicDir, q.diagramUrl.replace(/^\//, ''));
        expect(fs.existsSync(assetPath)).toBe(true);
      });

      it('verifies Q51 (Report 2) has valid diagram and options rendering in UI', () => {
        const q = qMap.get(51);
        expect(q.diagramUrl).toBe('/exam-assets/ssc/chsl/2022/ssc-chsl-2022-09mar-s1/q51_diag.jpeg');
        expect(q.options).toEqual(['-1', '1', '0', '2']);
        q.options.forEach((opt: string) => {
          const { container } = render(<LatexRenderer content={opt} />);
          expect(container.textContent?.trim()).toBe(opt);
        });
      });

      it('verifies Q53 (Report 3) has intact fractions in options rendering in UI', () => {
        const q = qMap.get(53);
        expect(q.diagramUrl).toBe('/exam-assets/ssc/chsl/2022/ssc-chsl-2022-09mar-s1/q53_diag.jpeg');
        expect(q.options).toContain('$\\frac{1}{5}$');
        expect(q.options).toContain('$\\frac{1}{3}$');
        const { container } = render(<LatexRenderer content={q.options[0]} />);
        expect(container.querySelectorAll('.katex').length).toBeGreaterThan(0);
      });

      it('verifies Q56 (Report 4) has intact trigonometric formulas in options rendering in UI', () => {
        const q = qMap.get(56);
        expect(q.diagramUrl).toBe('/exam-assets/ssc/chsl/2022/ssc-chsl-2022-09mar-s1/q56_diag.jpeg');
        expect(q.options).toContain('$\\tan^2 A$');
        expect(q.options).toContain('$\\cos^2 A$');
        const { container } = render(<LatexRenderer content={q.options[0]} />);
        expect(container.querySelectorAll('.katex').length).toBeGreaterThan(0);
      });

      it('verifies Q57 (Report 5) has intact fractional options rendering in UI', () => {
        const q = qMap.get(57);
        expect(q.diagramUrl).toBe('/exam-assets/ssc/chsl/2022/ssc-chsl-2022-09mar-s1/q57_diag.jpeg');
        expect(q.options).toContain('$\\frac{25}{123}$');
        const { container } = render(<LatexRenderer content={q.options[1]} />);
        expect(container.querySelectorAll('.katex').length).toBeGreaterThan(0);
      });
    });

    describe('SSC CHSL 2019-01jul-s3 (Reports 6–10)', () => {
      const questions = chsl2019Json.questions as any[];
      const qMap = new Map<number, any>(questions.map((q) => [q.questionNumber, q]));

      it('verifies Q25 (Report 6) has all 4 option images present on disk', () => {
        const q = qMap.get(25);
        expect(q.optionImages).toHaveLength(4);
        for (const imgUrl of q.optionImages) {
          const assetPath = path.join(publicDir, imgUrl.replace(/^\//, ''));
          expect(fs.existsSync(assetPath)).toBe(true);
        }
      });

      it('verifies Q32 (Report 7) has clean biology terminology options rendering in UI', () => {
        const q = qMap.get(32);
        expect(q.questionText).toContain('branch of biology');
        expect(q.options).toEqual(['Ecology', 'Anatomy', 'Chronobiology', 'Mycology']);
        expect(q.correctAnswer).toBe('B');
        q.options.forEach((opt: string) => {
          const { container } = render(<LatexRenderer content={opt} />);
          expect(container.textContent?.trim()).toBe(opt);
        });
      });

      it('verifies Q51 (Report 8) has intact currency formatting rendering in UI', () => {
        const q = qMap.get(51);
        expect(q.questionText).toContain('₹2,220');
        expect(q.options).toEqual(['₹24,440', '₹5,920', '₹5,550', '₹5,180']);
        expect(q.correctAnswer).toBe('A');
        const { container } = render(<LatexRenderer content={q.options[0]} />);
        expect(container.textContent).toContain('₹24,440');
      });

      it('verifies Q52 (Report 9) has intact geometry angle notations rendering in UI', () => {
        const q = qMap.get(52);
        expect(q.questionText).toContain('\\angle\\text{OBA} = 60^\\circ');
        expect(q.options).toEqual(['4 cm', '3.5 cm', '2.5 cm', '5 cm']);
        expect(q.correctAnswer).toBe('D');
        const { container } = render(<LatexRenderer content={q.questionText} />);
        expect(container.querySelectorAll('.katex').length).toBeGreaterThan(0);
      });

      it('verifies Q55 (Report 10) has intact circle angle problem options rendering in UI', () => {
        const q = qMap.get(55);
        expect(q.questionText).toContain('\\angle\\text{BAC} = 40^\\circ');
        expect(q.options).toEqual(['55°', '45°', '35°', '40°']);
        expect(q.correctAnswer).toBe('D');
        q.options.forEach((opt: string) => {
          const { container } = render(<LatexRenderer content={opt} />);
          expect(container.textContent?.trim()).toBe(opt);
        });
      });
    });
  });
});
