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
});
