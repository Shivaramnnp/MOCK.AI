import { TextSpan, TextLine } from './types';

const SYMBOL_TO_LATEX: Record<string, string> = {
  '×': '\\times',
  '÷': '\\div',
  '≤': '\\le',
  '≥': '\\ge',
  '≠': '\\ne',
  '≈': '\\approx',
  '≡': '\\equiv',
  '±': '\\pm',
  '∈': '\\in',
  '∉': '\\notin',
  '⊂': '\\subset',
  '⊆': '\\subseteq',
  '∪': '\\cup',
  '∩': '\\cap',
  '∧': '\\land',
  '∨': '\\lor',
  '¬': '\\neg',
  '⇒': '\\implies',
  '⇔': '\\iff',
  '∀': '\\forall',
  '∃': '\\exists',
  '∂': '\\partial',
  '∇': '\\nabla',
  '∆': '\\Delta',
  '∑': '\\sum',
  '∏': '\\prod',
  '∫': '\\int',
  '√': '\\sqrt',
  '∞': '\\infty',
  'α': '\\alpha',
  'β': '\\beta',
  'γ': '\\gamma',
  'δ': '\\delta',
  'ε': '\\epsilon',
  'θ': '\\theta',
  'λ': '\\lambda',
  'μ': '\\mu',
  'π': '\\pi',
  'σ': '\\sigma',
  'τ': '\\tau',
  'φ': '\\phi',
  'ω': '\\omega',
  'Ω': '\\Omega',
  'Σ': '\\Sigma',
  'Λ': '\\Lambda',
  'Γ': '\\Gamma',
};

/**
 * Reconstructs mathematical expressions from geometric spans, preserving
 * superscripts, subscripts, fractions, and symbols into clean LaTeX.
 */
export function reconstructLineMath(line: TextLine): string {
  const spans = line.spans;
  if (!spans || spans.length === 0) return line.text;

  // Base font size for the line
  const baseFontSize = line.fontSize;
  let reconstructed = '';

  for (let i = 0; i < spans.length; i++) {
    const cur = spans[i];
    let token = cur.str;

    // 1. Replace individual Unicode math symbols
    for (const [sym, latex] of Object.entries(SYMBOL_TO_LATEX)) {
      if (token.includes(sym)) {
        token = token.split(sym).join(` ${latex} `);
      }
    }

    // 2. Detect Superscript vs Subscript based on vertical delta and smaller font size
    const isSmallerFont = cur.fontSize < baseFontSize * 0.88;
    const yDelta = cur.y - line.y;

    if (isSmallerFont) {
      if (yDelta > 1.5) {
        // Superscript (higher Y)
        const cleanExp = token.trim();
        if (/^[0-9a-zA-Z\+\-]+$/.test(cleanExp)) {
          token = `^{${cleanExp}}`;
        }
      } else if (yDelta < -1.5) {
        // Subscript (lower Y)
        const cleanSub = token.trim();
        if (/^[0-9a-zA-Z\+\-]+$/.test(cleanSub)) {
          token = `_{${cleanSub}}`;
        }
      }
    }

    if (i > 0) {
      const prev = spans[i - 1];
      const gap = cur.x - (prev.x + prev.width);
      if (gap > cur.fontSize * 0.25 && !reconstructed.endsWith(' ') && !token.startsWith(' ') && !token.startsWith('^') && !token.startsWith('_')) {
        reconstructed += ' ';
      }
    }

    reconstructed += token;
  }

  // 3. Normalize fractions like "1 / 4" or "3 / 4" into \frac{1}{4}
  reconstructed = reconstructed.replace(/([0-9a-zA-Z\(\)]+)\s*\/\s*([0-9a-zA-Z\(\)]+)/g, (match, num, den) => {
    // Only convert if it looks like a clean fraction (not a URL or path)
    if (!match.includes('http') && !match.includes('/') && num.length <= 5 && den.length <= 5) {
      return `\\frac{${num}}{${den}}`;
    }
    return match;
  });

  return reconstructed.trim();
}

/**
 * Enriches question text or option string with standard KaTeX mathematical spans.
 * Prevents collapsing spaces by never wrapping entire English sentences in \(...\).
 */
export function wrapFormulaExpressions(text: string): string {
  if (!text) return '';

  // Preserve existing $...$ and $$...$$
  if (text.includes('$') || text.includes('\\(')) {
    return text;
  }

  // Match isolated mathematical expressions (e.g. "x^2 + y^2 = 1", "\sigma_{xx} = C_1 y", "O(n^2)")
  // and wrap only the formula in $...$
  return text.replace(
    /\b([a-zA-Z]\s*[\^=+\-*/<>≤≥≠∈]\s*[^,;.\n]+|\\[a-zA-Z]+(?:_{[^}]+}|\^{[^}]+}|(?:\s*[0-9a-zA-Z\^_+=\-*/])+))\b/g,
    (match) => {
      const trimmed = match.trim();
      // Ensure it is not a common English word
      if (trimmed.length > 2 && /[\\^_{}=<>]/.test(trimmed)) {
        return `$${trimmed}$`;
      }
      return match;
    }
  );
}
