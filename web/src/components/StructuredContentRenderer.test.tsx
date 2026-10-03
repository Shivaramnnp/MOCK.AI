import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import {
  StructuredContentRenderer,
  OptionContentRenderer,
  MathRenderer,
  TextRenderer,
  RelationalAlgebraRenderer,
  ImageRenderer,
  TableRenderer,
  CodeRenderer,
} from './StructuredContentRenderer';
import { ContentBlock } from '../types';

describe('StructuredContentRenderer - Option Content Alignment', () => {
  it('1. renders plain text option with left alignment', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'The language is context-free but not regular' },
    ];
    const { container } = render(
      <StructuredContentRenderer blocks={blocks} isOption={true} />
    );

    const optionContent = container.querySelector('.option-content');
    expect(optionContent).not.toBeNull();
    expect(optionContent?.classList.contains('text-left')).toBe(true);
    expect(container.textContent).toContain('The language is context-free but not regular');
  });

  it('2. renders fraction math option left-aligned without inner bordered card box', () => {
    const blocks: ContentBlock[] = [
      { type: 'math', latex: '\\frac{1}{10!}', content: '\\(\\frac{1}{10!}\\)' },
    ];
    const { container } = render(
      <StructuredContentRenderer blocks={blocks} isOption={true} />
    );

    const mathDiv = container.querySelector('.overflow-x-auto');
    expect(mathDiv).not.toBeNull();
    expect(mathDiv?.classList.contains('text-left')).toBe(true);
    expect(mathDiv?.classList.contains('katex-left')).toBe(true);
    expect(mathDiv?.classList.contains('text-center')).toBe(false);
    // Should NOT have the heavy standalone question card background
    expect(mathDiv?.classList.contains('bg-surface-elev1/40')).toBe(false);
  });

  it('3. renders subscript/superscript option with left alignment', () => {
    const blocks: ContentBlock[] = [
      { type: 'math', latex: 'S_1 \\equiv S_3', content: '\\(S_1 \\equiv S_3\\)' },
    ];
    const { container } = render(
      <StructuredContentRenderer blocks={blocks} isOption={true} />
    );

    const mathDiv = container.querySelector('.katex-left');
    expect(mathDiv).not.toBeNull();
    expect(mathDiv?.classList.contains('text-left')).toBe(true);
  });

  it('4. renders long equation option with left alignment and horizontal scrolling container', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'equation',
        latex: '\\sum_{k=0}^{n} \\binom{n}{k} a^k b^{n-k} = (a+b)^n \\implies \\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}',
      },
    ];
    const { container } = render(
      <StructuredContentRenderer blocks={blocks} isOption={true} />
    );

    const mathDiv = container.querySelector('.overflow-x-auto');
    expect(mathDiv).not.toBeNull();
    expect(mathDiv?.classList.contains('text-left')).toBe(true);
    expect(mathDiv?.classList.contains('katex-left')).toBe(true);
  });

  it('5. renders matrix option left-aligned without center alignment', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'matrix',
        latex: '\\begin{pmatrix} 1 & 2 \\\\ 0 & 1 \\end{pmatrix}',
      },
    ];
    const { container } = render(
      <StructuredContentRenderer blocks={blocks} isOption={true} />
    );

    const matrixDiv = container.querySelector('.katex-left');
    expect(matrixDiv).not.toBeNull();
    expect(matrixDiv?.classList.contains('text-left')).toBe(true);
    expect(matrixDiv?.classList.contains('text-center')).toBe(false);
  });

  it('6. renders mixed text + math option left-aligned', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'mixed',
        blocks: [
          { type: 'text', content: 'The eigenvalue ' },
          { type: 'inline_math', latex: '\\lambda = 2' },
          { type: 'text', content: ' corresponds to eigenvector ' },
          { type: 'inline_math', latex: 'v = [1, 0]^T' },
        ],
      },
    ];
    const { container } = render(
      <StructuredContentRenderer blocks={blocks} isOption={true} />
    );

    const optionContent = container.querySelector('.option-content');
    expect(optionContent?.classList.contains('text-left')).toBe(true);
    expect(container.textContent).toContain('The eigenvalue');
    expect(container.textContent).toContain('corresponds to eigenvector');
  });

  it('7. renders image option left-aligned with compact margins', () => {
    const blocks: ContentBlock[] = [
      { type: 'image', assetUrl: '/exam-assets/gate/2025/da/q14_diag.png', caption: 'State Diagram' },
    ];
    const { container } = render(
      <StructuredContentRenderer blocks={blocks} isOption={true} />
    );

    const figure = container.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure?.classList.contains('text-left')).toBe(true);
    expect(figure?.classList.contains('text-center')).toBe(false);
  });

  it('8. renders code option left-aligned with syntax container', () => {
    const blocks: ContentBlock[] = [
      { type: 'code', content: 'while (x > 0) { x = x - 1; }', language: 'c' },
    ];
    const { container } = render(
      <StructuredContentRenderer blocks={blocks} isOption={true} />
    );

    const codeDiv = container.querySelector('.bg-slate-900');
    expect(codeDiv).not.toBeNull();
    expect(codeDiv?.classList.contains('text-left')).toBe(true);
  });

  it('9. renders relational algebra option left-aligned without massive banner when isOption is true', () => {
    const blocks: ContentBlock[] = [
      { type: 'relational_algebra', latex: '\\pi_{A}(R) \\bowtie \\sigma_{B=1}(S)' },
    ];
    const { container } = render(
      <StructuredContentRenderer blocks={blocks} isOption={true} />
    );

    const mathDiv = container.querySelector('.katex-left');
    expect(mathDiv).not.toBeNull();
    expect(mathDiv?.classList.contains('text-left')).toBe(true);
    // Should NOT have the large banner
    expect(container.textContent).not.toContain('Relational Algebra Expression');
  });

  it('10. renders table option with left alignment', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'table',
        headers: ['State', 'Next'],
        rows: [['q0', 'q1']],
        caption: 'Transition Table',
      },
    ];
    const { container } = render(
      <StructuredContentRenderer blocks={blocks} isOption={true} />
    );

    const tableWrapper = container.querySelector('.overflow-x-auto');
    expect(tableWrapper?.classList.contains('text-left')).toBe(true);
  });

  it('11. OptionContentRenderer renders image asset and structured content left-aligned', () => {
    const { container } = render(
      <OptionContentRenderer
        fallbackText="Simple fallback option text"
        image="/test/img.png"
        imageAlt="Option A figure"
      />
    );

    const optionContent = container.querySelector('.option-content');
    expect(optionContent).not.toBeNull();
    expect(optionContent?.classList.contains('text-left')).toBe(true);
    expect(container.textContent).toContain('Simple fallback option text');
  });

  it('12. preserves center alignment for question statement math when isOption is false', () => {
    const blocks: ContentBlock[] = [
      { type: 'math', latex: 'E = mc^2' },
    ];
    const { container } = render(
      <StructuredContentRenderer blocks={blocks} isOption={false} />
    );

    const mathDiv = container.querySelector('.overflow-x-auto');
    expect(mathDiv?.classList.contains('text-center')).toBe(true);
    expect(mathDiv?.classList.contains('bg-surface-elev1/40')).toBe(true);
  });

  describe('Markdown Table Parsing & Fallback Rendering', () => {
    it('13. renders markdown table in fallbackText with table, thead, tbody, th, and td elements', () => {
      const fallback = `
| Column-I | Column-II |
| :--- | :--- |
| P. Item 1 | 1. Match 1 |
| Q. Item 2 | 2. Match 2 |
`;
      const { container } = render(<StructuredContentRenderer fallbackText={fallback} />);
      const table = container.querySelector('table');
      expect(table).not.toBeNull();
      const ths = container.querySelectorAll('th');
      expect(ths.length).toBe(2);
      expect(ths[0].textContent).toBe('Column-I');
      expect(ths[1].textContent).toBe('Column-II');
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(2);
      const cells = rows[0].querySelectorAll('td');
      expect(cells[0].textContent).toBe('P. Item 1');
      expect(cells[1].textContent).toBe('1. Match 1');
    });

    it('14. respects column alignment markers (:--- left, :---: center, ---: right)', () => {
      const fallback = `
| Left Col | Center Col | Right Col |
| :--- | :---: | ---: |
| L | C | R |
`;
      const { container } = render(<StructuredContentRenderer fallbackText={fallback} />);
      const ths = container.querySelectorAll('th');
      expect(ths[0].classList.contains('text-left')).toBe(true);
      expect(ths[1].classList.contains('text-center')).toBe(true);
      expect(ths[2].classList.contains('text-right')).toBe(true);

      const tds = container.querySelectorAll('tbody tr td');
      expect(tds[0].classList.contains('text-left')).toBe(true);
      expect(tds[1].classList.contains('text-center')).toBe(true);
      expect(tds[2].classList.contains('text-right')).toBe(true);
    });

    it('15. renders KaTeX math inside table cells seamlessly', () => {
      const fallback = `
| Formula | Symbol |
| :--- | :--- |
| \\(E = mc^2\\) | \\(\\alpha\\) |
`;
      const { container } = render(<StructuredContentRenderer fallbackText={fallback} />);
      const katexElements = container.querySelectorAll('.katex');
      expect(katexElements.length).toBeGreaterThanOrEqual(2);
    });

    it('16. renders GATE 2025 AE Q6 in fallback mode with full grid fidelity', () => {
      const q6Text = `Column-I has statements made by Shanthala; and, Column-II has responses given by Kanishk.

| Column-I | Column-II |
| :--- | :--- |
| P. This house is in a mess. | 1. Alright, I won't bring it up during our conversations. |
| Q. I am not happy with the marks given to me. | 2. Well, you can easily look it up. |
| R. Politics is a subject I avoid talking about. | 3. No problem, let me clear it up for you. |
| S. I don't know what this word means. | 4. Don't worry, I will take it up with your teacher. |

Identify the option that has the correct match between Column-I and Column-II.`;

      const { container } = render(<StructuredContentRenderer fallbackText={q6Text} />);
      expect(container.textContent).toContain('Column-I has statements made by Shanthala');
      const table = container.querySelector('table');
      expect(table).not.toBeNull();
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(4);
      expect(container.textContent).toContain('Identify the option that has the correct match');
    });

    it('17. renders GATE 2024 DA Q16 in fallback mode with full grid fidelity', () => {
      const q16Text = `Match the items in Column 1 with the items in Column 2 in the following table:

| Column 1 | Column 2 |
| :--- | :--- |
| (p) First In First Out | (i) Stacks |
| (q) Lookup Operation | (ii) Queues |
| (r) Last In First Out | (iii) Hash Tables |`;

      const { container } = render(<StructuredContentRenderer fallbackText={q16Text} />);
      expect(container.textContent).toContain('Match the items in Column 1');
      const table = container.querySelector('table');
      expect(table).not.toBeNull();
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
      expect(rows[0].textContent).toContain('(p) First In First Out');
      expect(rows[0].textContent).toContain('(i) Stacks');
    });

    it('18. OptionContentRenderer resolves clean IMAGE_ONLY mode when fallbackText is only option label or digits', () => {
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q26_opt_a.png"
          fallbackText="Option (A)"
          ocrText="28"
        />
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      // ocrText should be quarantined in .sr-only
      const srOnly = container.querySelector('.sr-only');
      expect(srOnly).not.toBeNull();
      expect(srOnly?.textContent).toBe('28');
      // Verify no visible text block beneath image
      expect(container.querySelector('p')).toBeNull();
    });

    it('19. OptionContentRenderer renders zero duplicate visible text beneath visual option in IMAGE_ONLY mode', () => {
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q27_opt_a.png"
          displayMode="IMAGE_ONLY"
          ocrText="REASONING"
        />
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      const srOnly = container.querySelector('.sr-only');
      expect(srOnly).not.toBeNull();
      expect(srOnly?.textContent).toBe('REASONING');
      expect(container.querySelector('p')).toBeNull();
    });
  });

  describe('Adversarial Challenge: OptionContentRenderer Synthetic Inputs & Display Modes', () => {
    it('20. pure image + empty text: renders image and 0 visible text', () => {
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q30_opt_a.png"
          fallbackText=""
        />
      );
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(container.querySelector('p')).toBeNull();
      expect(container.querySelector('.sr-only')).toBeNull();
      expect(container.textContent).toBe('');
    });

    it('21. pure image + number string ("28"): suppresses visible number, quarantines OCR to .sr-only', () => {
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q26_opt_b.png"
          fallbackText="28"
          ocrText="28"
        />
      );
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      // No visible text outside screen-reader
      const srOnly = container.querySelector('.sr-only');
      expect(srOnly).not.toBeNull();
      expect(srOnly?.textContent).toBe('28');
      expect(container.querySelector('p')).toBeNull();

      // Verify strictly 0 visible text by stripping sr-only
      const clone = container.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.sr-only').forEach((el) => el.remove());
      expect(clone.textContent?.trim()).toBe('');
    });

    it('22. pure image + label ("(A)"): suppresses visible label, resolves clean IMAGE_ONLY', () => {
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q26_opt_a.png"
          fallbackText="(A)"
          ocrText="(A)"
        />
      );
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      const srOnly = container.querySelector('.sr-only');
      expect(srOnly).not.toBeNull();
      expect(srOnly?.textContent).toBe('(A)');
      expect(container.querySelector('p')).toBeNull();
    });

    it('23. pure image + full paragraph text with explicit displayMode="IMAGE_ONLY": suppresses all paragraph text', () => {
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/gate/2025/cs-1/q5_opt_c.png"
          fallbackText="This is a full descriptive paragraph text that should not be visible when IMAGE_ONLY is specified."
          displayMode="IMAGE_ONLY"
          ocrText="Figure C"
        />
      );
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      const srOnly = container.querySelector('.sr-only');
      expect(srOnly?.textContent).toBe('Figure C');
      // No visible paragraph text
      expect(container.textContent).not.toContain('This is a full descriptive paragraph text');
    });

    it('24. pure image + math formula text with explicit displayMode="IMAGE_ONLY": suppresses math formula in visible DOM', () => {
      const { container } = render(
        <OptionContentRenderer
          image="/exam-assets/gate/2025/cs-1/q5_opt_d.png"
          fallbackText="\\int_0^1 x^2 dx = \\frac{1}{3}"
          displayMode="IMAGE_ONLY"
          ocrText="Integral Formula"
        />
      );
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      const katexSpan = container.querySelector('.katex');
      expect(katexSpan).toBeNull();
      expect(container.textContent).not.toContain('dx');
    });

    it('25. plain text number option without image (e.g. "28"): MUST render number, NOT "Option content missing"', () => {
      const { container } = render(
        <OptionContentRenderer
          fallbackText="28"
        />
      );
      expect(container.textContent).toContain('28');
      expect(container.textContent).not.toContain('Option content missing');
    });
  });
});


