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
});
