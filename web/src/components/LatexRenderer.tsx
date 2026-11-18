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
    if (content.trim() === '|') return '1';

    // Tokens to store rendered KaTeX HTML placeholders
    const mathTokens: string[] = [];
    const createToken = (html: string) => {
      const idx = mathTokens.length;
      mathTokens.push(html);
      return `___KATEX_TOKEN_${idx}___`;
    };

    let processed = content.normalize('NFKD');

    // Pre-normalize Symbol font glyphs, private use area math characters, and MathType brackets
    processed = processed
      .replace(/[\uF0A5]/g, '\\infty ')
      .replace(/[\uF0B4×]/g, '\\times ')
      .replace(/[\uF0B6]/g, '\\partial ')
      .replace(/[\uF0B3]/g, ' \\ge ')
      .replace(/[\uF0B5]/g, ' \\propto ')
      .replace(/[\uF0B7]/g, ' \\cdot ')
      .replace(/[\uF0B8]/g, ' \\div ')
      .replace(/[\uF0B2]/g, ' \\le ')
      .replace(/[\uF03C]/g, '<')
      .replace(/[\uF03E]/g, '>')
      .replace(/[\uF0D1]/g, '\\nabla ')
      .replace(/[\uF0B1]/g, ' \\pm ')
      .replace(/[\uF0B9]/g, ' \\ne ')
      .replace(/[\uF0B0]/g, '^{\\circ}')
      .replace(/[\uF0A2]/g, "'")
      .replace(/[\uF0C2]/g, '\\mathbb{R}')
      .replace(/[\uF0C5]/g, '\\oplus ')
      .replace(/[\uF0D0]/g, '\\angle ')
      .replace(/[\uF0E6\uF0E7\uF0E8]+/g, '(')
      .replace(/[\uF0F6\uF0F7\uF0F8]+/g, ')')
      .replace(/[\uF0E9\uF0EA\uF0EB]+/g, '[')
      .replace(/[\uF0F9\uF0FA\uF0FB]+/g, ']')
      .replace(/[\uF0EE\uF0EC]+/g, '{')
      .replace(/[\uF0FE\uF0FD]+/g, '}')
      .replace(/[\uF0EF\uF0ED\uF0FC]/g, '');

    // Normalize CMEX10 font 2x1 binomial / combination glyphs
    processed = processed.replace(
      /[\x0f\uF8EB]\s*([a-zA-Z0-9\.\-]+)\s+([a-zA-Z0-9\.\-]+)\s*[\x10\uF8F8]/g,
      '\\binom{$1}{$2}'
    );

    // Eliminate non-printing ASCII control characters (preserving tab, newline)
    processed = processed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    // Normalize Unicode combining circumflex (U+0302) to \hat{...} and combining right arrow (U+20D7) to \vec{...}
    processed = processed.replace(
      /([A-Za-z0-9\u0370-\u03FF\u{1D400}-\u{1D7FF}\u2207]|\\nabla|\\theta|\\phi|\\alpha|\\beta|\\gamma|\\omega|\\sigma|\\tau|\\lambda|\\mu|\\nu|\\rho|\\pi)\s*[\u0302̂]/gu,
      '\\hat{$1}'
    );
    processed = processed.replace(
      /([A-Za-z0-9\u0370-\u03FF\u{1D400}-\u{1D7FF}\u2207]|\\nabla|\\theta|\\phi|\\alpha|\\beta|\\gamma|\\omega|\\sigma|\\tau|\\lambda|\\mu|\\nu|\\rho|\\pi)\s*[\u20D7⃗]/gu,
      '\\vec{$1}'
    );
    // Clean any orphaned combining accents
    processed = processed.replace(/[\u0302̂\u20D7⃗]/g, '');

    // Repair malformed closing delimiters like \}) -> }\)
    processed = processed.replace(/\\+\}\)/g, '}\\)');

    // Normalize Unicode combining overline (U+0305) to \overline{...}
    processed = processed.replace(/([A-Za-z0-9])\u0305/g, '\\overline{$1}');
    processed = processed.replace(/([A-Za-z0-9])\s*̅/g, '\\overline{$1}');

    // Unnest accidental nested math delimiters inside subscripts / superscripts
    processed = processed.replace(/([_^])\{[\\/]*\(([\s\S]*?)[\\/]*\)\}/g, '$1{$2}');
    processed = processed.replace(/([_^])\{[\\/]*\[([\s\S]*?)[\\/]*\]\}/g, '$1{$2}');
    processed = processed.replace(/([_^])\{[\\/]*\{([\s\S]*?)[\\/]*\}\}/g, '$1{$2}');

    // Fix broken scientific notation (e.g. 10^{-}  3 or 10^{-} 3 -> \times 10^{-3})
    processed = processed.replace(/10\^?\{\s*[-−–—]\s*\}\s*(?:\\times|[×\uF0B4\*])\s*([0-9]+)/g, '\\times 10^{-$1}');
    processed = processed.replace(/10\^?\{\s*[-−–—]\s*\}\s*([0-9]+)/g, '10^{-$1}');
    processed = processed.replace(/10\s*[-−–—]\s*(?:\\times|[×\uF0B4\*])\s*([0-9]+)/g, '\\times 10^{-$1}');

    // Repair fragmented math exponent notation (e.g. e^{-} (x - 1) 2 -> e^{-(x - 1)^2}, e^{-} x 2 -> e^{-x^2})
    processed = processed.replace(/e\^?\{\s*[-−–—]\s*\}\s*\(\s*([^()]+)\s*\)\s*([0-9]+)/g, 'e^{-($1)^$2}');
    processed = processed.replace(/e\^?\{\s*[-−–—]\s*\}\s*([a-zA-Z0-9]+)\s*([0-9]+)/g, 'e^{-$1^$2}');
    processed = processed.replace(/e\^?\{\s*[-−–—]\s*\}\s*([a-zA-Z0-9]+)/g, 'e^{-$1}');

    // Repair fragmented function notation (e.g. u x ( ,0) -> u(x, 0) or u x (,1) -> u(x, 1))
    processed = processed.replace(/\b([a-zA-Z])\s+([a-zA-Z])\s*\(\s*,\s*([0-9]+)\s*\)/g, '$1($2, $3)');
    processed = processed.replace(/\b([a-zA-Z])\s+([a-zA-Z])\s*\(\s*([0-9]+)\s*,\s*\)/g, '$1($2, $3)');

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
        let cleanMath = math.trim();
        // Fix malformed fraction closing such as \frac{...}{\sqrt{2}\} where the closing brace was escaped
        cleanMath = cleanMath.replace(/\\+(\})$/g, '$1');
        const mathToRender =
          /^[-+]?\\frac\{/.test(cleanMath) && !cleanMath.includes('\n')
            ? `\\displaystyle ${cleanMath}`
            : cleanMath;
        let html = katex.renderToString(mathToRender, {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        if (html.includes('katex-error') && mathToRender !== cleanMath) {
          // Fall back without prepending \displaystyle to prevent red raw \displaystyle rendering
          html = katex.renderToString(cleanMath, {
            displayMode: false,
            throwOnError: false,
            output: 'html',
          });
        }
        return createToken(html);
      } catch {
        return createToken(`\\(${escapeHtml(math)}\\)`);
      }
    });

    // 4. Inline math: $...$ (requires non-whitespace inside delimiters, standard CommonMark/LaTeX math behavior)
    processed = processed.replace(/\$(?!\s)([^\$\n]+?)(?<!\s)\$/g, (_, math) => {
      // Avoid treating non-math code phrases or sentences as math
      if (
        !math.includes('\\') &&
        /\b(?:means|father|mother|brother|sister|son|daughter|husband|wife|uncle|aunt)\b/i.test(math) &&
        math.split(/\s+/).length >= 3
      ) {
        return `$${math}$`;
      }
      try {
        const cleanMath = math.trim();
        const mathToRender =
          /^[-+]?\\frac\{/.test(cleanMath) && !cleanMath.includes('\n')
            ? `\\displaystyle ${cleanMath}`
            : cleanMath;
        let html = katex.renderToString(mathToRender, {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        if (html.includes('katex-error') && mathToRender !== cleanMath) {
          html = katex.renderToString(cleanMath, {
            displayMode: false,
            throwOnError: false,
            output: 'html',
          });
        }
        return createToken(html);
      } catch {
        return createToken(`$${escapeHtml(math)}$`);
      }
    });

    // 4b. Naked \left\{...\right\} / \left[...\right] / \left(...\right) expressions wrapping math environments
    // Fixes cases like GATE 2025 DA Q53: \left\{ \begin{pmatrix} 2 \\ 0 \end{pmatrix}, ... \right\}
    const wrappedEnvRegex =
      /\\left\s*(?:\\\{|\[|\()[\s\S]*?\\begin\{(?:cases|matrix|pmatrix|bmatrix|vmatrix|aligned|array)\}[\s\S]*?\\end\{(?:cases|matrix|pmatrix|bmatrix|vmatrix|aligned|array)\}[\s\S]*?\\right\s*(?:\\\}|\]|\))/g;
    processed = processed.replace(wrappedEnvRegex, (match) => {
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
      /(\\(?:lim|sum|int|iint|iiint|prod|frac|dfrac|tfrac|sqrt|cbrt|mathbb|mathbf|mathit|mathrm|mathcal|vec|hat|bar|tilde|dot|ddot|operatorname|binom)(?:_\{[^\}]+\}|\^\{[^\}]+\}|_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+|\{(?:[^{}]|\{[^{}]*\})*\})+(?:\([^\)]+\))?)/g;
    processed = processed.replace(compoundRegex, (match) => {
      if (match.includes('KATEX_TOKEN')) return match;
      try {
        const cleanMatch = match.trim();
        const mathToRender =
          cleanMatch.startsWith('\\frac{') || cleanMatch.startsWith('\\dfrac{')
            ? `\\displaystyle ${cleanMatch}`
            : cleanMatch;
        let html = katex.renderToString(mathToRender, {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        if (html.includes('katex-error') && mathToRender !== cleanMatch) {
          html = katex.renderToString(cleanMatch, {
            displayMode: false,
            throwOnError: false,
            output: 'html',
          });
        }
        return createToken(html);
      } catch {
        return match;
      }
    });

    // 8. Greek letters with sub/superscripts (e.g. \sigma^2, \sigma_{X}, \mu_Y, \lambda_1, \hbar^2)
    const greekWithIndexRegex =
      /(\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|hbar)(?:\s*(?:_\{[^\}]+\}|\^\{[^\}]+\}|_[a-zA-Z0-9]+|\^[a-zA-Z0-9]+))+)/g;
    processed = processed.replace(greekWithIndexRegex, (match) => {
      if (match.includes('KATEX_TOKEN')) return match;
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
      if (match.includes('KATEX_TOKEN')) return match;
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
      if (match.includes('KATEX_TOKEN')) return match;
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

    // Safely allow semantic inline formatting tags (e.g., <u> for underlined key attributes, <mark> for highlights/replacement targets, <b>, <strong>, <em>, <i>, <code>, <span class="...">)
    processed = processed.replace(
      /&lt;(\/?(?:u|b|strong|em|i|code|mark|span))((?:\s+(?:class|data-[a-z0-9_-]+)=(?:&quot;[^"&<>]*&quot;|&#039;[^'&<>]*&#039;|"[^"<>]*"|'[^'<>]*'))*)\s*(\/?)&gt;/gi,
      (_, tag, attrs, slash) => {
        const cleanAttrs = attrs
          ? attrs.replace(/&quot;/g, '"').replace(/&#039;/g, "'")
          : '';
        return `<${tag}${cleanAttrs}${slash ? ' /' : ''}>`;
      }
    );

    // Restore the KaTeX HTML tokens recursively to handle any nested contexts safely
    let hasToken = true;
    let iterations = 0;
    while (hasToken && iterations < 10) {
      hasToken = false;
      iterations++;
      mathTokens.forEach((html, i) => {
        const token = `___KATEX_TOKEN_${i}___`;
        if (processed.includes(token)) {
          processed = processed.split(token).join(html);
          hasToken = true;
        }
      });
    }
    // Clean any orphaned token artifacts
    processed = processed.replace(/\{\{__KATEX_TOKEN_\d+__\}\}|___KATEX_TOKEN_\d+___/g, '');

    return processed;
  }, [content]);

  return (
    <span
      className={`inline-block break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
};
