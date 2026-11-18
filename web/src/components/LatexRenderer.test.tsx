// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LatexRenderer } from './LatexRenderer';

describe('LatexRenderer', () => {
  it('should render plain text unchanged', () => {
    const { container } = render(<LatexRenderer content="What is Newton's second law?" />);
    expect(container.textContent).toContain("What is Newton's second law?");
  });

  it('should render inline LaTeX formulas into KaTeX html elements', () => {
    const { container } = render(<LatexRenderer content="Kinetic energy is $E = \\frac{1}{2}mv^2$ in physics." />);
    const katexElement = container.querySelector('.katex');
    expect(katexElement).not.toBeNull();
  });

  it('should render block LaTeX formulas into display KaTeX elements', () => {
    const { container } = render(<LatexRenderer content="$$H = \\frac{v_0^2}{2g}$$" />);
    const katexDisplay = container.querySelector('.katex-display');
    expect(katexDisplay).not.toBeNull();
  });

  it('should NOT render duplicate MathML elements when rendering fractions (Regression Screenshot A & D)', () => {
    const { container } = render(<LatexRenderer content="Rs. $\\frac{4,84,000}{23}$" />);
    // Verify pure HTML output mode: no redundant .katex-mathml node causing double text
    const mathmlElement = container.querySelector('.katex-mathml');
    expect(mathmlElement).toBeNull();

    // Verify text does not duplicate
    const text = container.textContent || '';
    expect(text).toContain('4,84,000');
    expect(text).not.toContain('4,84,000 / 23 234,84,000');
  });

  it('should correctly render negative slopes and fractions (Regression Screenshot C)', () => {
    const { container } = render(<LatexRenderer content="Slope is $-\\frac{3}{4}$." />);
    const katexElement = container.querySelector('.katex');
    expect(katexElement).not.toBeNull();
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('4');
  });

  it('should correctly render complex radicals and pi expressions (Regression Screenshot E)', () => {
    const { container } = render(<LatexRenderer content="$\\frac{154\\sqrt{77}\\pi}{3}$" />);
    const katexElement = container.querySelector('.katex');
    expect(katexElement).not.toBeNull();
    expect(container.querySelector('.katex-mathml')).toBeNull();
  });

  it('should correctly render \\(...\\) inline math (Q59 and Q62 regressions)', () => {
    const { container: c1 } = render(<LatexRenderer content={'\\(75\\text{ cm}^2\\)'} />);
    expect(c1.querySelector('.katex')).not.toBeNull();
    expect(c1.textContent).toContain('75');
    expect(c1.textContent).toContain('cm');
    expect(c1.textContent).not.toContain('\\(');

    const { container: c2 } = render(<LatexRenderer content={'\\(1728\\text{ cm}^3\\)'} />);
    expect(c2.querySelector('.katex')).not.toBeNull();
    expect(c2.textContent).toContain('1728');
    expect(c2.textContent).not.toContain('\\(');

    const { container: c3 } = render(
      <LatexRenderer content="If, \(a + b = 18\) and \(a^2 + b^2 = 200\), then find \((a^3 + b^3)\)." />
    );
    expect(c3.querySelectorAll('.katex').length).toBe(3);
    expect(c3.textContent).not.toContain('\\(');
  });

  it('should correctly render \\[...\\] block math', () => {
    const { container } = render(<LatexRenderer content={'View: \\[\\int x dx\\]'} />);
    expect(container.querySelector('.katex-display')).not.toBeNull();
    expect(container.textContent).not.toContain('\\[');
  });

  it('should sanitize unsafe HTML and prevent XSS injection (SEC-004)', () => {
    const maliciousPayload = '<script>alert("xss")</script><img src="x" onerror="alert(1)"> $x = 5$';
    const { container } = render(<LatexRenderer content={maliciousPayload} />);

    // Script and img elements must NOT exist in the DOM
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();

    // KaTeX math should still render
    expect(container.querySelector('.katex')).not.toBeNull();

    // Malicious text is safely escaped as text content
    expect(container.textContent).toContain('<script>');
  });

  it('should auto-detect and render naked unbracketed LaTeX commands (DATA-004)', () => {
    const { container } = render(
      <LatexRenderer content="Time = 40 minutes = \frac{40}{60} hour, where \pi \approx 3.14 and radius = \sqrt{49}" />
    );

    // KaTeX elements should be rendered for \frac, \pi, \approx, \sqrt
    const katexNodes = container.querySelectorAll('.katex');
    expect(katexNodes.length).toBeGreaterThanOrEqual(4);
    expect(container.textContent).not.toContain('\\frac');
    expect(container.textContent).not.toContain('\\sqrt');
  });

  it('should correctly render GATE 2025 DA Q11 expectation fraction in both naked and standard delimited format', () => {
    // Naked fraction
    const { container: c1 } = render(<LatexRenderer content="\\frac{E[X]}{E[Y]}" />);
    expect(c1.querySelector('.katex')).not.toBeNull();
    expect(c1.textContent).not.toContain('\\frac');

    // Standard inline delimited
    const { container: c2 } = render(<LatexRenderer content="\\(\\frac{E[X]}{E[Y]}\\)" />);
    expect(c2.querySelector('.katex')).not.toBeNull();
    expect(c2.textContent).not.toContain('\\frac');
    expect(c2.textContent).not.toContain('\\(');
  });

  // --- GATE 2023 Mathematical Fidelity Regression Suite ---

  it('P0-AUDIT-DEFECT-1: should never display raw \\displaystyle in red when rendering fractions or on error fallback', () => {
    const { container } = render(
      <LatexRenderer content="\\(\\frac{d^2 y}{dx^2} + 4x\\frac{dy}{dx} + 2y = 0\\)" />
    );
    expect(container.textContent).not.toContain('\\displaystyle');
    expect(container.textContent).not.toContain('\\frac');
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('P0-AUDIT-DEFECT-2: should never leak KATEX_TOKEN placeholders on nested subscript math like k_{\\(\\theta\\)}', () => {
    const { container } = render(
      <LatexRenderer content="idealized by assuming a torsional spring of equivalent stiffness k_{\\(\\theta\\)} as shown" />
    );
    const text = container.textContent || '';
    expect(text).not.toContain('KATEX_TOKEN');
    expect(text).not.toContain('___KATEX_TOKEN');
    expect(text).not.toContain('{{__KATEX_TOKEN');
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('P0-AUDIT-DEFECT-3: should render differential equations without repeating or duplicating mathematical terms', () => {
    const { container } = render(
      <LatexRenderer content="Consider the differential equation \\(\\frac{d^{2}y}{dx^{2}}\\) + 4x \\(\\frac{dy}{dx}\\) + 2y = 0 for x >= 1" />
    );
    const text = container.textContent || '';
    // Count occurrences of 'for x >= 1' or '4x'
    const matches = (text.match(/4x/g) || []).length;
    expect(matches).toBe(1);
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
  });

  it('P0-AUDIT-DEFECT-4: should normalize Symbol font infinity and MathType bracket pieces without crashing or rendering red errors', () => {
    const { container } = render(
      <LatexRenderer content="M_3 = M_\\infty \\left( \\frac{\\gamma - 1}{2} \\right)" />
    );
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container.querySelector('.katex')).not.toBeNull();

    // Even if Symbol font private use area glyphs (e.g. \uf0a5, \uf0e6) appear in legacy content:
    const { container: cLegacy } = render(
      <LatexRenderer content={'M 3 = M \uF0A5 \uF0E6 \uF0E7 \uF0E8 \\gamma 2 - 1 \uF0F6 \uF0F7 \uF0F8'} />
    );
    expect(cLegacy.textContent).not.toContain('\uF0A5');
    expect(cLegacy.querySelector('.katex-error')).toBeNull();
  });

  it('P0-AUDIT-DEFECT-5: should fix corrupted scientific notation 10^{-} * 3 and render clean powers of 10', () => {
    const { container } = render(
      <LatexRenderer content="\\(( 7, - 6.5 10^{-} \uF0B4 3 )\\)" />
    );
    const text = container.textContent || '';
    expect(text).not.toContain('10^{-}');
    expect(text).not.toContain('\uF0B4');
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('should render derivatives, subscripts, superscripts, and Greek letters with 100% fidelity', () => {
    const { container } = render(
      <LatexRenderer content="Rate \\(\\frac{dT}{dh}\\) with altitude h, \\sigma^2, \\lambda_1, and \\alpha + \\beta" />
    );
    expect(container.textContent).not.toContain('\\frac');
    expect(container.textContent).not.toContain('\\sigma');
    expect(container.textContent).not.toContain('\\lambda');
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(4);
  });

  it('P0-AUDIT-DEFECT-6: should normalize Symbol font degree, prime, R, oplus, angle, and combining overlines', () => {
    const { container } = render(
      <LatexRenderer content={'At 25\uF0B0 C with V\uF0A2 \\in \uF0C2 and \\(X\u0305_1 \\oplus Y\u0305_2\\) at \uF0D0 30\uF0B0'} />
    );
    const text = container.textContent || '';
    expect(text).not.toContain('\uF0B0');
    expect(text).not.toContain('\uF0A2');
    expect(text).not.toContain('\uF0C2');
    expect(text).not.toContain('\uF0D0');
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  it('P0-AUDIT-DEFECT-7 (GATE 2023 CS Q48): should normalize CMEX10 font binomial delimiters and strip non-printing control characters', () => {
    // Test legacy extracted option with \x0f and \x10 control characters
    const corruptedInput = '\x0f n 2k \x10 (n -2k)! \x10';
    const { container } = render(<LatexRenderer content={corruptedInput} />);
    const text = container.textContent || '';
    expect(text).not.toContain('\x0f');
    expect(text).not.toContain('\x10');
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container.querySelector('.katex')).not.toBeNull();

    // Verify canonical binomial expression rendering
    const { container: canonical } = render(<LatexRenderer content="\\(2 \\binom{n}{2k} (n -2k)! (k!)^{2}\\)" />);
    expect(canonical.querySelector('.katex-error')).toBeNull();
    expect(canonical.querySelector('.katex')).not.toBeNull();
  });

  it('P0-AUDIT-DEFECT-8 (GATE 2023 IN Q61): should gracefully render fractions with escaped braces or complex denominators', () => {
    // Malformed unclosed fraction: \frac{230}{\sqrt{2}\})
    const malformed = 'load impedance is \\(\\frac{230}{\\sqrt{2}\\}) + 𝑗 \\(\\frac{230}{\\sqrt{2}\\}) Ω';
    const { container: c1 } = render(<LatexRenderer content={malformed} />);
    expect(c1.querySelector('.katex-error')).toBeNull();
    expect(c1.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);

    // Canonical re-extracted fraction: \frac{230}{\sqrt{2}}
    const canonical = 'load impedance is \\(\\frac{230}{\\sqrt{2}}\\) + 𝑗 \\(\\frac{230}{\\sqrt{2}}\\) Ω';
    const { container: c2 } = render(<LatexRenderer content={canonical} />);
    expect(c2.querySelector('.katex-error')).toBeNull();
    expect(c2.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
  });

  it('P0-AUDIT-DEFECT-9 (GATE 2023 PH Q57): should normalize combining circumflex accents and vector arrows into authentic KaTeX math', () => {
    // Option C with combining accents \u0302 and \u20d7
    const optC = '\\vec{ \\nabla } \\times \\vec{𝑉} = 4\\hat{𝑧}, where \\hat{𝑧} is a unit vector perpendicular to the (𝑟, 𝜃) plane';
    const { container } = render(<LatexRenderer content={optC} />);
    expect(container.querySelector('.katex-error')).toBeNull();
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3);
    const text = container.textContent || '';
    expect(text).toContain('unit vector perpendicular to the');
    expect(text).not.toContain('KATEX_TOKEN');

    // Unicode combining characters in raw notation
    const rawUnicode = '∇\u20D7 × V\u20D7 = 4z\u0302, where z\u0302 is a unit vector';
    const { container: cRaw } = render(<LatexRenderer content={rawUnicode} />);
    expect(cRaw.querySelector('.katex-error')).toBeNull();
    expect(cRaw.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3);
  });

  describe('Semantic Inline Underline & Formatting Preservation', () => {
    it('safely preserves <u> tags for single words and multi-word phrases', () => {
      const singleWord = 'The skunk had a <u>conspicuous</u> spinal stripe.';
      const { container: c1 } = render(<LatexRenderer content={singleWord} />);
      const u1 = c1.querySelector('u');
      expect(u1).not.toBeNull();
      expect(u1!.textContent).toBe('conspicuous');
      expect(c1.innerHTML).toContain('<u>conspicuous</u>');

      const multiWord = 'It is a general belief that the female ostrich <u>guard the nest at night</u>.';
      const { container: c2 } = render(<LatexRenderer content={multiWord} />);
      const u2 = c2.querySelector('u');
      expect(u2).not.toBeNull();
      expect(u2!.textContent).toBe('guard the nest at night');
      expect(c2.innerHTML).toContain('<u>guard the nest at night</u>');
    });

    it('renders <u> formatting cleanly alongside mathematical expressions and special characters', () => {
      const mixed = 'Select the value of <u>x</u> when $\\sqrt{x} = 4$.';
      const { container } = render(<LatexRenderer content={mixed} />);
      const u = container.querySelector('u');
      expect(u).not.toBeNull();
      expect(u!.textContent).toBe('x');
      expect(container.querySelector('.katex')).not.toBeNull();
    });

    it('renders GATE 2025 DA Q53 naked \\left\\{...\\right\\} wrapping pmatrix vectors without literal delimiters', () => {
      const q53 =
        'Class-1:\n\n\\left\\{ \\begin{pmatrix} 2 \\\\ 0 \\end{pmatrix}, \\begin{pmatrix} 0 \\\\ 2 \\end{pmatrix}, \\begin{pmatrix} 2 \\\\ 2 \\end{pmatrix} \\right\\}, Class-2:\n\n\\left\\{ \\begin{pmatrix} 0 \\\\ 0 \\end{pmatrix} \\right\\}';
      const { container } = render(<LatexRenderer content={q53} />);
      expect(container.querySelectorAll('.katex-display').length).toBe(2);
      expect(container.textContent).not.toContain('\\left');
      expect(container.textContent).not.toContain('\\right');
      expect(container.textContent).not.toContain('\\begin{pmatrix}');
      expect(container.textContent).toContain('Class-1:');
      expect(container.textContent).toContain('Class-2:');
    });
  });
});
