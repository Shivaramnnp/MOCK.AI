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

    let processed = content;

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

    // 5. Normalize text arrows to standard Unicode characters for clean DOM text flow
    processed = processed.replace(/\\rightarrow/g, '→').replace(/\\leftarrow/g, '←');

    // 6. Standalone LaTeX commands without explicit math delimiters (e.g. \frac{a}{b}, \sqrt{x}, \pi, \pm, \times)
    const nakedLatexRegex =
      /(\\(?:frac|sqrt|cbrt)\s*\{[^}]+\}\s*(?:\{[^}]+\})?|\\(?:times|div|pm|mp|le|ge|leq|geq|neq|approx|sim|equiv|cdot|circ|degree|angle|pi|alpha|beta|gamma|delta|theta|lambda|mu|sigma|omega|Delta|Sigma|Omega|sum|int|infty)(?![a-zA-Z]))/g;

    processed = processed.replace(nakedLatexRegex, (match) => {
      try {
        const html = katex.renderToString(match.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
        return createToken(html);
      } catch {
        return escapeHtml(match);
      }
    });

    // Escape all remaining surrounding non-math text to neutralize any HTML / XSS payloads
    processed = escapeHtml(processed);

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
