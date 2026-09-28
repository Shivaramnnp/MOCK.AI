import React, { useMemo } from 'react';
import katex from 'katex';

interface LatexRendererProps {
  content: string;
  className?: string;
}

/**
 * Escapes unsafe HTML characters to prevent XSS injection.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const LatexRenderer: React.FC<LatexRendererProps> = ({ content, className = '' }) => {
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    // Tokens to store rendered KaTeX HTML placeholders
    const mathTokens: string[] = [];
    const createToken = (html: string) => {
      const idx = mathTokens.length;
      mathTokens.push(html);
      return `___KATEX_TOKEN_${idx}___`;
    };

    let processed = content.normalize('NFKD');

    // Pre-normalize unicode symbols into standard LaTeX before delimiter tokenization
    processed = processed
      .replace(/µ|μ(?=[_^])/g, '\\mu')
      .replace(/µ|μ/g, '\\mu ')
      .replace(/π(?=[_^])/g, '\\pi')
      .replace(/π/g, '\\pi ')
      .replace(/θ(?=[_^])/g, '\\theta')
      .replace(/θ/g, '\\theta ')
      .replace(/φ|ϕ(?=[_^])/g, '\\phi')
      .replace(/φ|ϕ/g, '\\phi ')
      .replace(/α(?=[_^])/g, '\\alpha')
      .replace(/α/g, '\\alpha ')
      .replace(/β(?=[_^])/g, '\\beta')
      .replace(/β/g, '\\beta ')
      .replace(/γ(?=[_^])/g, '\\gamma')
      .replace(/γ/g, '\\gamma ')
      .replace(/δ(?=[_^])/g, '\\delta')
      .replace(/δ/g, '\\delta ')
      .replace(/ε(?=[_^])/g, '\\varepsilon')
      .replace(/ε/g, '\\varepsilon ')
      .replace(/λ(?=[_^])/g, '\\lambda')
      .replace(/λ/g, '\\lambda ')
      .replace(/σ(?=[_^])/g, '\\sigma')
      .replace(/σ/g, '\\sigma ')
      .replace(/τ(?=[_^])/g, '\\tau')
      .replace(/τ/g, '\\tau ')
      .replace(/ω(?=[_^])/g, '\\omega')
      .replace(/ω/g, '\\omega ')
      .replace(/⊤/g, '^\\top ')
      .replace(/′/g, "'")
      .replace(/▷◁/g, ' \\bowtie ')
      .replace(/≤/g, ' \\le ')
      .replace(/≥/g, ' \\ge ')
      .replace(/≠/g, ' \\ne ')
      .replace(/∈/g, ' \\in ')
      .replace(/∉/g, ' \\notin ')
      .replace(/×/g, ' \\times ')
      .replace(/÷/g, ' \\div ')
      .replace(/∞/g, ' \\infty ')
      .replace(/√/g, ' \\sqrt ')
      // Support missing Unicode math characters in KaTeX
      .replace(/∶/g, ':')
      .replace(/⊥/g, '\\perp ')
      .replace(/‖/g, '\\Vert ')
      .replace(/ħ/g, '\\hbar ')
      .replace(/∆/g, '\\Delta ')
      .replace(/⁄/g, '/');

    // Clean up any stray whitespace before subscripts and superscripts introduced after LaTeX commands
    processed = processed.replace(
      /\\(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|hbar)\s+([_^])/g,
      '\\$1$2'
    );

    // 1. Block math: $$...$$
    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
        return createToken(html);
      } catch {
        return createToken(`$$${escapeHtml(math)}$$`);
      }
    });

    // 2. Block math: \[...\] or \\[...\\]
    processed = processed.replace(/\\{1,2}\[([\s\S]+?)\\{1,2}\]/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
        return createToken(html);
      } catch {
        return createToken(`\\[${escapeHtml(math)}\\]`);
      }
    });

    // Unwrap pseudo-math delimiters \(...\) if the content is an English sentence
    // (prevents flattening sentences like "\(V_{g} is equal to the speed... \)" into unspaced math)
    processed = processed.replace(/\\{1,2}\(([\s\S]+?)\\{1,2}\)/g, (fullMatch, math) => {
      if (
        !math.includes('\\text{') &&
        /\b(?:is|of|the|and|in|at|to|for|with|that|when|where|all|other|remain|constant|equal|from|has|have|are|were|was)\b/i.test(
          math
        ) &&
        math.split(/\s+/).length >= 4
      ) {
        return math;
      }
      return fullMatch;
    });

    // 3. Inline math: \(...\) or \\(...\\)
    processed = processed.replace(/\\{1,2}\(([\s\S]+?)\\{1,2}\)/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        return createToken(html);
      } catch {
        return createToken(`\\(${escapeHtml(math)}\\)`);
      }
    });

    // 4. Inline math: $...$
    processed = processed.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
      try {
        const html = katex.renderToString(math.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        return createToken(html);
      } catch {
        return createToken(`$${escapeHtml(math)}$`);
      }
    });

    // 5. Naked math environments: \begin{cases}...\end{cases}, \begin{matrix}...\end{matrix}, etc.
    const envRegex =
      /\\begin\{(?:cases|matrix|pmatrix|bmatrix|vmatrix|aligned|array)\}[\s\S]+?\\end\{(?:cases|matrix|pmatrix|bmatrix|vmatrix|aligned|array)\}/g;
    processed = processed.replace(envRegex, (match) => {
      try {
        const html = katex.renderToString(match.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
        return createToken(html);
      } catch {
        return createToken(`\\[${escapeHtml(match)}\\]`);
      }
    });

    // 6. Pre-normalize common naked syntax in question texts
    // e.g., \sqrt (expr) -> \sqrt{expr}, \sqrt -1 -> \sqrt{-1}, \sqrt 2 -> \sqrt{2}
    processed = processed.replace(/\\sqrt\s*\(([^)]+)\)/g, '\\sqrt{$1}');
    processed = processed.replace(/\\sqrt\s+(-?[0-9a-zA-Z\\]+)/g, '\\sqrt{$1}');
    processed = processed.replace(/\\sqrt\s+([0-9a-zA-Z\^_\{\}\+\-]+)/g, '\\sqrt{$1}');
    // Standalone radical without argument becomes \surd symbol
    processed = processed.replace(/\\sqrt(?![a-zA-Z\{])/g, '\\surd');
    processed = processed.replace(/▷◁/g, ' \\bowtie ');

    // 7. Compound math constructs (limits, integrals, sums, fractions, roots, blackboard bold, operators)
    const compoundRegex =
      /(\\(?:lim|sum|int|iint|iiint|prod|frac|dfrac|tfrac|sqrt|cbrt|mathbb|mathbf|mathit|mathrm|mathcal|vec|hat|bar|tilde|dot|ddot|operatorname)(?:_\{[^\}]+\}|\^\{[^\}]+\}|_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+|\{(?:[^{}]|\{[^{}]*\})*\})+(?:\([^\)]+\))?)/g;
    processed = processed.replace(compoundRegex, (match) => {
      try {
        const html = katex.renderToString(match.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        return createToken(html);
      } catch {
        return match;
      }
    });

    // 8. Greek letters with sub/superscripts (e.g. \sigma^2, \sigma_{X}, \mu_Y, \lambda_1, \hbar^2)
    const greekWithIndexRegex =
      /(\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|hbar)(?:\s*(?:_\{[^\}]+\}|\^\{[^\}]+\}|_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+))+)/g;
    processed = processed.replace(greekWithIndexRegex, (match) => {
      try {
        const html = katex.renderToString(match.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        return createToken(html);
      } catch {
        return match;
      }
    });

    // 9. Isolated sub/superscript variables (e.g. x^T, x_n, w_{new}, b_{old}, A^{3}, A^{2}, C_{1}y)
    const varIndexRegex =
      /(?<![\\_a-zA-Z0-9])([a-zA-Z](?:_\{[^\}]+\}|\^[a-zA-Z0-9]+|\^\{[^\}]+\}|_[a-zA-Z0-9]+)+)(?=(?<=\})|(?![a-zA-Z0-9_]))/g;
    processed = processed.replace(varIndexRegex, (match) => {
      try {
        const html = katex.renderToString(match.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        return createToken(html);
      } catch {
        return match;
      }
    });

    // 10. Standalone mathematical commands & symbols
    const symbolRegex =
      /(\\(?:in|notin|subset|subseteq|supset|supseteq|setminus|emptyset|forall|exists|neg|land|lor|implies|iff|le|ge|leq|geq|ne|neq|approx|sim|equiv|times|div|pm|mp|cdot|circ|degree|angle|infty|to|rightarrow|leftarrow|Rightarrow|Leftarrow|bowtie|Join|partial|nabla|surd|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|perp|bot|Vert|hbar|parallel)(?![a-zA-Z])|\\\|)/g;
    processed = processed.replace(symbolRegex, (match) => {
      try {
        const html = katex.renderToString(match.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        return createToken(html);
      } catch {
        return match;
      }
    });

    // Escape all remaining surrounding non-math text to neutralize any HTML / XSS payloads
    processed = escapeHtml(processed);

    // Safely allow semantic inline formatting tags (e.g., <u> for underlined key attributes, <b>, <code>)
    processed = processed.replace(/&lt;(\/?(?:u|b|strong|em|i|code))&gt;/gi, '<$1>');

    // Restore the KaTeX HTML tokens
    mathTokens.forEach((html, i) => {
      processed = processed.replace(`___KATEX_TOKEN_${i}___`, html);
    });

    return processed;
  }, [content]);

  return (
    <span
      className={`inline-block break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
};
