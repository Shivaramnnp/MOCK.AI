import React, { useMemo } from 'react';
import katex from 'katex';

interface LatexRendererProps {
  content: string;
  className?: string;
}

export const LatexRenderer: React.FC<LatexRendererProps> = ({ content, className = '' }) => {
  const renderedHtml = useMemo(() => {
    if (!content) return '';

    // 1. Block math: $$...$$
    let result = content.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
      } catch {
        return `$$${math}$$`;
      }
    });

    // 2. Block math: \[...\] or \\[...\\]
    result = result.replace(/\\{1,2}\[([\s\S]+?)\\{1,2}\]/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
      } catch {
        return `\\[${math}\\]`;
      }
    });

    // 3. Inline math: \(...\) or \\(...\\)
    result = result.replace(/\\{1,2}\(([\s\S]+?)\\{1,2}\)/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
      } catch {
        return `\\(${math}\\)`;
      }
    });

    // 4. Inline math: $...$
    result = result.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
      } catch {
        return `$${math}$`;
      }
    });

    return result;
  }, [content]);

  return (
    <span
      className={`inline-block break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
};
