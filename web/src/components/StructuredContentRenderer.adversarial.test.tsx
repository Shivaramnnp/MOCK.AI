import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { OptionContentRenderer, StructuredContentRenderer } from './StructuredContentRenderer';

describe('Adversarial Challenge Suite: OptionContentRenderer & StructuredContentRenderer', () => {
  describe('Dimension 1: Plain text numeric options without images', () => {
    const numericCases = [
      { input: '28', description: 'integer "28"' },
      { input: '0', description: 'zero "0"' },
      { input: '100.5', description: 'decimal "100.5"' },
      { input: '-42', description: 'negative integer "-42"' },
      { input: '1/2', description: 'fraction "1/2"' },
      { input: '9999', description: 'large 4-digit number "9999"' },
      { input: '0.001', description: 'small decimal "0.001"' },
    ];

    numericCases.forEach(({ input, description }) => {
      it(`renders plain text numeric option ${description} cleanly without "Option content missing"`, () => {
        const { container } = render(<OptionContentRenderer fallbackText={input} />);

        // Must display the numeric text
        expect(container.textContent).toContain(input);
        // Must NOT render missing content placeholder
        expect(container.textContent).not.toContain('Option content missing');
        // Must be left-aligned
        const optionDiv = container.querySelector('.option-content');
        expect(optionDiv?.classList.contains('text-left')).toBe(true);
      });
    });

    it('renders "Option content missing" for empty string fallback without image', () => {
      const { container } = render(<OptionContentRenderer fallbackText="" />);
      expect(container.textContent).toContain('Option content missing');
    });

    it('renders "Option content missing" for whitespace-only fallback without image', () => {
      const { container } = render(<OptionContentRenderer fallbackText={'   \n\t  '} />);
      expect(container.textContent).toContain('Option content missing');
    });

    it('renders "Option content missing" when no text and no image provided', () => {
      const { container } = render(<OptionContentRenderer />);
      expect(container.textContent).toContain('Option content missing');
    });
  });

  describe('Dimension 2: Options formatted as labels without images', () => {
    const labelCases = [
      { input: '(A)', description: 'parenthesized uppercase letter "(A)"' },
      { input: '(1)', description: 'parenthesized digit "(1)"' },
      { input: 'A.', description: 'uppercase letter with dot "A."' },
      { input: '1.', description: 'digit with dot "1."' },
      { input: 'iv)', description: 'roman numeral with paren "iv)"' },
      { input: '(iv)', description: 'parenthesized roman numeral "(iv)"' },
      { input: '[A]', description: 'bracketed letter "[A]"' },
      { input: '[1]', description: 'bracketed digit "[1]"' },
      { input: 'Option A', description: 'word prefix "Option A"' },
      { input: 'Option (A)', description: 'word prefix with paren "Option (A)"' },
    ];

    labelCases.forEach(({ input, description }) => {
      it(`renders label option ${description} as valid text when no image is present`, () => {
        const { container } = render(<OptionContentRenderer fallbackText={input} />);

        // In pure text mode, genuine label options must be rendered
        expect(container.textContent).toContain(input);
        expect(container.textContent).not.toContain('Option content missing');
      });
    });
  });

  describe('Dimension 3: Options with image present + numeric OCR fallback', () => {
    const ocrFallbacks = [
      { fallback: '28', ocr: '28', description: 'number "28"' },
      { fallback: '0', ocr: '0', description: 'zero "0"' },
      { fallback: '1', ocr: '1', description: 'option digit "1"' },
      { fallback: '4', ocr: '4', description: 'option digit "4"' },
      { fallback: '100', ocr: '100', description: 'number "100"' },
      { fallback: '(A)', ocr: '(A)', description: 'label "(A)"' },
      { fallback: '(1)', ocr: '(1)', description: 'label "(1)"' },
      { fallback: 'A.', ocr: 'A.', description: 'label "A."' },
      { fallback: '1.', ocr: '1.', description: 'label "1."' },
      { fallback: 'Option (A)', ocr: 'Option (A)', description: 'prefixed label "Option (A)"' },
    ];

    ocrFallbacks.forEach(({ fallback, ocr, description }) => {
      it(`displays image only and quarantines ${description} to .sr-only without duplicate visible text`, () => {
        const { container } = render(
          <OptionContentRenderer
            image="/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q26_opt_a.png"
            fallbackText={fallback}
            ocrText={ocr}
            imageAlt="Option figure"
          />
        );

        // Image must be rendered
        const img = container.querySelector('img');
        expect(img).not.toBeNull();

        // OCR text must be quarantined inside .sr-only
        const srOnly = container.querySelector('.sr-only');
        expect(srOnly).not.toBeNull();
        expect(srOnly?.textContent).toBe(ocr);

        // Visible DOM (outside .sr-only) must NOT contain the fallback/OCR text
        const clone = container.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('.sr-only').forEach((el) => el.remove());
        expect(clone.textContent?.trim()).toBe('');
      });
    });
  });

  describe('Dimension 4: Mixed options (image present + genuine explanatory text)', () => {
    it('displays BOTH image and genuine explanatory text when both exist', () => {
      const genuineText = 'Figure shows the velocity profile with boundary layer thickness delta = 0.5 mm';
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/gate/2025/me/q12_diagram.png"
          fallbackText={genuineText}
          imageAlt="Velocity profile"
        />
      );

      // Both image and text must be present
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(container.textContent).toContain(genuineText);
      expect(container.textContent).not.toContain('Option content missing');

      // Should have rendered in TEXT_AND_IMAGE mode
      const paragraphs = container.querySelectorAll('p, div.leading-relaxed');
      expect(paragraphs.length).toBeGreaterThan(0);
    });

    it('displays BOTH image and structured markdown text with inline math', () => {
      const genuineText = 'Resistance is given by \\(R = \\frac{\\rho L}{A}\\) where \\(\\rho = 1.7 \\times 10^{-8}\\ \\Omega\\cdot\\text{m}\\)';
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/gate/2025/ee/q33_circuit.png"
          fallbackText={genuineText}
        />
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(container.textContent).toContain('Resistance is given by');
      const katexSpans = container.querySelectorAll('.katex');
      expect(katexSpans.length).toBeGreaterThan(0);
    });

    it('displays BOTH image and structured ContentBlock[] when blocks are provided', () => {
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/gate/2025/ce-1/q40_truss.png"
          blocks={[
            { type: 'text', content: 'Zero-force members in the given truss:' },
            { type: 'text', content: 'Members AB, CD, and EF carry no axial load.' },
          ]}
        />
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(container.textContent).toContain('Zero-force members in the given truss:');
      expect(container.textContent).toContain('Members AB, CD, and EF carry no axial load.');
    });
  });

  describe('Dimension 5: Edge cases and displayMode overrides', () => {
    it('respects displayMode="IMAGE_ONLY" override even when genuine text exists', () => {
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/gate/2025/ae/q28_stress.png"
          fallbackText="Normal stress \\sigma_{xx} along the boundary"
          ocrText={'Normal stress \\sigma_{xx}'}
          displayMode="IMAGE_ONLY"
        />
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      const srOnly = container.querySelector('.sr-only');
      expect(srOnly).not.toBeNull();
      expect(srOnly?.textContent).toBe('Normal stress \\sigma_{xx}');

      // Visible text must be suppressed
      const clone = container.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.sr-only').forEach((el) => el.remove());
      expect(clone.textContent?.trim()).toBe('');
    });

    it('respects displayMode="TEXT_ONLY" and omits image rendering', () => {
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/gate/2025/ae/q28_stress.png"
          fallbackText="Pure text option choice"
          displayMode="TEXT_ONLY"
        />
      );

      // In TEXT_ONLY mode, image is omitted
      const img = container.querySelector('img');
      expect(img).toBeNull();
      expect(container.textContent).toContain('Pure text option choice');
    });

    it('handles image present but missing text and missing ocrText gracefully', () => {
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/gate/2025/cs-1/q10_opt_a.png"
        />
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(container.textContent).not.toContain('Option content missing');
    });
  });
});
