import React from 'react';
import { ContentBlock, ContentBlockType, DisplayMode } from '../types';
import { LatexRenderer } from './LatexRenderer';
import { ExamAsset } from './ExamAsset';

interface StructuredContentRendererProps {
  blocks?: ContentBlock[];
  fallbackText?: string;
  className?: string;
  onZoomImage?: (url: string) => void;
  questionNumber?: number;
  isOption?: boolean;
}

export type TableAlignment = 'left' | 'center' | 'right';

export interface MarkdownTableBlock {
  type: 'table';
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
}

export interface MarkdownTextBlock {
  type: 'text';
  content: string;
}

export type ParsedMarkdownBlock = MarkdownTextBlock | MarkdownTableBlock;

/**
 * Splits a markdown table row into individual cells while respecting math delimiters
 * and escaped pipes (\|).
 */
export function splitTableRow(line: string): string[] {
  let clean = line.trim();
  if (clean.startsWith('|')) clean = clean.slice(1);
  if (clean.endsWith('|')) clean = clean.slice(0, -1);

  const cells: string[] = [];
  let current = '';
  let inParenMath = false;
  let inInlineMath = false;
  let inBracketMath = false;
  let inDoubleDollar = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const prev = i > 0 ? clean[i - 1] : '';
    const next = i + 1 < clean.length ? clean[i + 1] : '';

    if (ch === '\\' && next === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '$' && next === '$' && prev !== '\\') {
      inDoubleDollar = !inDoubleDollar;
      current += '$$';
      i++;
      continue;
    }
    if (ch === '$' && prev !== '\\' && !inDoubleDollar) {
      inInlineMath = !inInlineMath;
      current += '$';
      continue;
    }
    if (ch === '\\' && next === '(') {
      inParenMath = true;
      current += '\\(';
      i++;
      continue;
    }
    if (ch === '\\' && next === ')') {
      inParenMath = false;
      current += '\\)';
      i++;
      continue;
    }
    if (ch === '\\' && next === '[') {
      inBracketMath = true;
      current += '\\[';
      i++;
      continue;
    }
    if (ch === '\\' && next === ']') {
      inBracketMath = false;
      current += '\\]';
      i++;
      continue;
    }

    if (ch === '|' && !inInlineMath && !inParenMath && !inBracketMath && !inDoubleDollar) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Checks whether a line conforms to a markdown table delimiter row (e.g. | :--- | :---: | ---: |).
 */
export function isDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-') || !trimmed.includes('|')) return false;
  let inner = trimmed;
  if (inner.startsWith('|')) inner = inner.slice(1);
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  const parts = inner.split('|');
  if (parts.length < 1) return false;
  return parts.every((part) => /^\s*:?-+:?\s*$/.test(part));
}

/**
 * Parses markdown text containing paragraphs and tables into structured blocks.
 */
export function parseMarkdownContent(content: string): ParsedMarkdownBlock[] {
  if (!content) return [];
  const lines = content.split('\n');
  const blocks: ParsedMarkdownBlock[] = [];
  let currentTextLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (i + 1 < lines.length && line.includes('|') && isDelimiterRow(lines[i + 1])) {
      if (currentTextLines.length > 0) {
        const text = currentTextLines.join('\n').trim();
        if (text) blocks.push({ type: 'text', content: text });
        currentTextLines = [];
      }

      const headers = splitTableRow(line);
      const delimiterCells = splitTableRow(lines[i + 1]);
      const alignments: TableAlignment[] = delimiterCells.map((cell) => {
        const t = cell.trim();
        if (t.startsWith(':') && t.endsWith(':')) return 'center';
        if (t.endsWith(':')) return 'right';
        return 'left';
      });

      const rows: string[][] = [];
      i += 2;
      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (!rowLine || !rowLine.includes('|') || isDelimiterRow(rowLine)) {
          break;
        }
        const rowCells = splitTableRow(rowLine);
        rows.push(rowCells);
        i++;
      }

      blocks.push({
        type: 'table',
        headers,
        alignments,
        rows,
      });
      continue;
    }

    currentTextLines.push(line);
    i++;
  }

  if (currentTextLines.length > 0) {
    const text = currentTextLines.join('\n').trim();
    if (text) blocks.push({ type: 'text', content: text });
  }

  return blocks;
}

/**
 * TextRenderer: Renders formatted academic text preserving paragraphs, line breaks,
 * inline math formulas, semantic tags (<u> for primary keys, <b>, <code>), and markdown tables.
 */
export const TextRenderer: React.FC<{ content: string; className?: string; isOption?: boolean }> = ({
  content,
  className = '',
  isOption = false,
}) => {
  if (!content) return null;

  const blocks = parseMarkdownContent(content);

  return (
    <div className={`${isOption ? 'space-y-1.5 text-left' : 'space-y-3'} ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === 'table') {
          return (
            <TableRenderer
              key={idx}
              headers={block.headers}
              rows={block.rows}
              alignments={block.alignments}
              isOption={isOption}
            />
          );
        }

        const paragraphs = block.content.split(/\n\s*\n/);
        return (
          <React.Fragment key={idx}>
            {paragraphs.map((p, pIdx) => (
              <div key={pIdx} className="leading-relaxed text-left">
                <LatexRenderer content={p.trim()} />
              </div>
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/**
 * MathRenderer: Renders display-mode or inline mathematical formulas via KaTeX.
 */
export const MathRenderer: React.FC<{
  latex: string;
  displayMode?: boolean;
  className?: string;
  isOption?: boolean;
}> = ({ latex, displayMode = true, className = '', isOption = false }) => {
  if (!latex) return null;
  let cleanLatex = latex.trim();
  cleanLatex = cleanLatex.replace(/^(\$\$|\\\[|\\\()/, '').replace(/(\$\$|\\\]|\\\))$/, '').trim();
  const wrapped = displayMode ? `$$\n${cleanLatex}\n$$` : `\\(${cleanLatex}\\)`;

  return (
    <div
      className={`overflow-x-auto ${
        isOption
          ? 'text-left w-full my-0.5 py-0 katex-left'
          : displayMode
          ? 'text-center bg-surface-elev1/40 dark:bg-darkSurface-elev2/30 px-4 py-2.5 rounded-xl border border-surface-border/50 dark:border-darkSurface-border/40 my-2 py-1'
          : 'text-left my-2 py-1'
      } ${className}`}
    >
      <LatexRenderer content={wrapped} />
    </div>
  );
};

/**
 * Checks whether an expression represents genuine database relational algebra.
 */
export function isRelationalAlgebraExpression(text: string): boolean {
  if (!text) return false;
  // Natural join, theta join, or outer join symbols
  if (text.includes('\\bowtie') || text.includes('▷◁') || text.includes('⋈')) {
    return true;
  }
  // Explicit projection or selection over a named relation, e.g. \pi_{...}(Relation) or \sigma_{...}(Relation)
  if (/[πσρ]\s*[_\{][^)]+\)\s*($|÷)/.test(text)) {
    return true;
  }
  if (/\\(?:pi|sigma|rho)_\{[^}]+\}\s*\([A-Z]/.test(text)) {
    return true;
  }
  return false;
}

/**
 * RelationalAlgebraRenderer: Renders structured relational algebra expressions
 * with projections (π), selections (σ), joins (⋈), attributes, and predicates.
 */
export const RelationalAlgebraRenderer: React.FC<{
  latex?: string;
  expression?: string;
  className?: string;
  isOption?: boolean;
}> = ({ latex, expression, className = '', isOption = false }) => {
  const expr = latex || expression || '';
  if (!expr) return null;

  // If the expression is not genuine relational algebra, gracefully render as clean math
  if (!isRelationalAlgebraExpression(expr)) {
    return <MathRenderer latex={expr} displayMode={true} className={className} isOption={isOption} />;
  }

  let cleanExpr = expr.trim();
  cleanExpr = cleanExpr.replace(/^(\$\$|\\\[|\\\()/, '').replace(/(\$\$|\\\]|\\\))$/, '').trim();
  const wrapped = `$$\n${cleanExpr}\n$$`;

  if (isOption) {
    return (
      <div className={`my-0.5 py-0 text-left overflow-x-auto katex-left ${className}`}>
        <LatexRenderer content={wrapped} />
      </div>
    );
  }

  return (
    <div
      className={`my-3 p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 text-center overflow-x-auto shadow-2xs ${className}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1.5 flex items-center justify-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        Relational Algebra Expression
      </div>
      <div className="text-base sm:text-lg font-serif">
        <LatexRenderer content={wrapped} />
      </div>
    </div>
  );
};

/**
 * CodeRenderer: Renders structured source code or pseudocode with monospace font,
 * line preservation, indentation, and language tagging.
 */
export const CodeRenderer: React.FC<{
  code: string;
  language?: string;
  className?: string;
  isOption?: boolean;
}> = ({ code, language = 'text', className = '', isOption = false }) => {
  if (!code) return null;

  // Clean fences if already present
  const cleanCode = code.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');

  return (
    <div
      className={`${isOption ? 'my-1' : 'my-3'} rounded-xl border border-surface-border dark:border-darkSurface-border bg-slate-900 text-slate-100 overflow-hidden shadow-sm text-left ${className}`}
    >
      {language && language !== 'text' && (
        <div className="px-4 py-1.5 bg-slate-800/80 border-b border-slate-700/60 text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
          <span>{language}</span>
        </div>
      )}
      <pre className="p-4 overflow-x-auto font-mono text-xs sm:text-sm leading-relaxed whitespace-pre text-left">
        <code>{cleanCode}</code>
      </pre>
    </div>
  );
};

/**
 * TableRenderer: Renders structured tabular data with headers and rows.
 */
export const TableRenderer: React.FC<{
  headers?: string[];
  rows?: string[][];
  alignments?: ('left' | 'center' | 'right')[];
  caption?: string;
  className?: string;
  isOption?: boolean;
}> = ({ headers = [], rows = [], alignments = [], caption, className = '', isOption = false }) => {
  if (!headers.length && !rows.length) return null;

  const getAlignClass = (index: number) => {
    const align = alignments[index];
    if (align === 'center') return 'text-center';
    if (align === 'right') return 'text-right';
    return 'text-left';
  };

  return (
    <div className={`${isOption ? 'my-1' : 'my-3'} overflow-x-auto rounded-xl border border-surface-border dark:border-darkSurface-border text-left ${className}`}>
      {caption && (
        <div className="px-4 py-2 bg-surface-elev1 dark:bg-darkSurface-elev2 text-xs font-bold text-surface-muted border-b border-surface-border dark:border-darkSurface-border text-left">
          {caption}
        </div>
      )}
      <table className="w-full text-left text-xs sm:text-sm border-collapse">
        {headers.length > 0 && (
          <thead className="bg-surface-elev2 dark:bg-darkSurface-elev2 border-b border-surface-border dark:border-darkSurface-border">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className={`px-4 py-2.5 font-bold text-surface-text dark:text-darkSurface-text ${getAlignClass(i)}`}>
                  <LatexRenderer content={h} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-surface-border dark:divide-darkSurface-border">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-surface-elev1/50 dark:hover:bg-darkSurface-elev2/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className={`px-4 py-2.5 text-surface-text dark:text-darkSurface-text ${getAlignClass(ci)}`}>
                  <LatexRenderer content={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * ImageRenderer: Renders visual diagrams and figures.
 */
export const ImageRenderer: React.FC<{
  assetUrl?: string;
  caption?: string;
  onZoom?: (url: string) => void;
  className?: string;
  alt?: string;
  isOption?: boolean;
  allowZoom?: boolean;
}> = ({ assetUrl, caption, onZoom, className = '', alt, isOption = false, allowZoom }) => {
  if (!assetUrl) return null;

  return (
    <figure className={`${isOption ? 'my-1 text-left' : 'my-3 text-center'} ${className}`}>
      <ExamAsset
        url={assetUrl}
        alt={alt || caption || 'Question Figure'}
        variant={isOption ? 'option' : 'diagram'}
        onZoom={onZoom}
        allowZoom={allowZoom}
      />
      {caption && (
        <figcaption className="mt-1.5 text-xs text-surface-muted italic text-left">
          {caption}
        </figcaption>
      )}
    </figure>
  );
};

/**
 * MixedContentRenderer: Renders a heterogeneous list of content blocks in sequence.
 */
export const MixedContentRenderer: React.FC<{
  blocks: ContentBlock[];
  onZoomImage?: (url: string) => void;
  className?: string;
  questionNumber?: number;
  isOption?: boolean;
}> = ({ blocks, onZoomImage, className = '', questionNumber, isOption = false }) => {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className={`${isOption ? 'space-y-1.5 text-left w-full' : 'space-y-3.5'} ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'text':
            return <TextRenderer key={idx} content={block.content || ''} isOption={isOption} />;
          case 'math':
            return <MathRenderer key={idx} latex={block.latex || block.content || ''} displayMode={true} isOption={isOption} />;
          case 'relational_algebra':
            return (
              <RelationalAlgebraRenderer
                key={idx}
                latex={block.latex}
                expression={block.content}
                isOption={isOption}
              />
            );
          case 'code':
          case 'pseudocode':
            return (
              <CodeRenderer
                key={idx}
                code={block.content || ''}
                language={block.language || (block.type === 'pseudocode' ? 'pseudocode' : 'text')}
                isOption={isOption}
              />
            );
          case 'table':
            return (
              <TableRenderer
                key={idx}
                headers={block.headers}
                rows={block.rows}
                alignments={(block as any).alignments}
                caption={block.caption}
                isOption={isOption}
              />
            );
          case 'image':
          case 'diagram':
          case 'graph':
          case 'figure':
            return (
              <ImageRenderer
                key={idx}
                assetUrl={block.assetUrl}
                caption={block.caption}
                onZoom={onZoomImage}
                alt={block.caption || (questionNumber ? `Figure 1 for question ${questionNumber}` : 'Question Figure')}
                isOption={isOption}
              />
            );
          case 'inline_math':
            return (
              <span key={idx} className="inline-block mr-1 text-left">
                <LatexRenderer content={`\\(${block.latex || block.content || ''}\\)`} />
              </span>
            );
          case 'equation':
          case 'matrix':
            return <MathRenderer key={idx} latex={block.latex || block.content || ''} displayMode={true} isOption={isOption} />;
          case 'mixed':
            return (
              <MixedContentRenderer
                key={idx}
                blocks={block.blocks || []}
                onZoomImage={onZoomImage}
                questionNumber={questionNumber}
                isOption={isOption}
              />
            );
          default:
            return <TextRenderer key={idx} content={block.content || ''} isOption={isOption} />;
        }
      })}
    </div>
  );
};

/**
 * Main StructuredContentRenderer:
 * Renders structured content blocks if present; otherwise seamlessly falls back to LatexRenderer.
 */
export const StructuredContentRenderer: React.FC<StructuredContentRendererProps> = ({
  blocks,
  fallbackText = '',
  className = '',
  onZoomImage,
  questionNumber,
  isOption = false,
}) => {
  const optionClass = isOption ? 'option-content text-left w-full' : '';
  const combinedClass = `${optionClass} ${className}`.trim();

  if (blocks && blocks.length > 0) {
    return (
      <MixedContentRenderer
        blocks={blocks}
        onZoomImage={onZoomImage}
        className={combinedClass}
        questionNumber={questionNumber}
        isOption={isOption}
      />
    );
  }

  if (fallbackText && fallbackText.trim().length > 0) {
    return <TextRenderer content={fallbackText} className={combinedClass} isOption={isOption} />;
  }

  return null;
};

/**
 * Helper to determine if a string only contains an option label or index.
 */
function isOptionLabelOrNumber(text: string | null | undefined): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  // Matches "Option (A)", "Option A", "(A)", "(1)", "A", "1", "1.", "A.", "[A]", "[1]", "(a)", "(d)"
  if (/^(option\s*)?(\([a-d1-4]\)|\[[a-d1-4]\]|[a-d1-4]\.?)$/i.test(trimmed)) {
    return true;
  }
  // Pure digits e.g. "28" or "25" (OCR-ed option index or number choice)
  if (/^\d{1,4}\.?$/.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * OptionContentRenderer: Dedicated shared renderer for exam question options.
 * Ensures consistent left-alignment across all option content types (text, math, images, code, tables),
 * and strictly enforces presentation policy:
 * - IMAGE_ONLY / IMAGE_WITH_ACCESSIBILITY_TEXT: Renders source visual asset without OCR text duplication.
 *   Exposes OCR text strictly as screen-reader accessibility (<span className="sr-only">).
 * - TEXT_ONLY: Renders text / structured content blocks.
 * - TEXT_AND_IMAGE: Renders both only when genuine dual content exists.
 */
export const OptionContentRenderer: React.FC<{
  blocks?: ContentBlock[];
  fallbackText?: string;
  image?: string | null;
  imageAlt?: string;
  ocrText?: string;
  displayMode?: DisplayMode;
  onZoomImage?: (url: string) => void;
  className?: string;
}> = ({
  blocks,
  fallbackText,
  image,
  imageAlt,
  ocrText,
  displayMode,
  onZoomImage,
  className = '',
}) => {
  const hasValidFallback = Boolean(
    fallbackText && fallbackText.trim().length > 0 && (!image || !isOptionLabelOrNumber(fallbackText))
  );
  const hasText = Boolean((blocks && blocks.length > 0) || hasValidFallback);

  const effectiveMode: DisplayMode =
    displayMode ||
    (image && !hasText ? 'IMAGE_ONLY' : image && hasText ? 'TEXT_AND_IMAGE' : image ? 'IMAGE_ONLY' : 'TEXT_ONLY');

  if (effectiveMode === 'IMAGE_ONLY' || effectiveMode === 'IMAGE_WITH_ACCESSIBILITY_TEXT') {
    return (
      <div className={`option-content w-full min-w-0 text-left space-y-1.5 ${className}`}>
        {image ? (
          <>
            <ExamAsset
              url={image}
              alt={imageAlt || 'Option figure'}
              variant="option"
              fallbackText={ocrText || fallbackText}
              onZoom={onZoomImage}
            />
            {ocrText && <span className="sr-only">{ocrText}</span>}
          </>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400 italic">Option content missing</span>
        )}
      </div>
    );
  }

  if (effectiveMode === 'TEXT_ONLY') {
    return (
      <div className={`option-content w-full min-w-0 text-left space-y-1.5 ${className}`}>
        {hasText ? (
          <StructuredContentRenderer
            blocks={blocks}
            fallbackText={fallbackText}
            isOption={true}
            onZoomImage={onZoomImage}
          />
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400 italic">Option content missing</span>
        )}
      </div>
    );
  }

  // TEXT_AND_IMAGE: Genuine dual representation
  return (
    <div className={`option-content w-full min-w-0 text-left space-y-1.5 ${className}`}>
      {image && (
        <ExamAsset
          url={image}
          alt={imageAlt || 'Option figure'}
          variant="option"
          fallbackText={ocrText || fallbackText}
          onZoom={onZoomImage}
        />
      )}
      {hasText && (
        <StructuredContentRenderer
          blocks={blocks}
          fallbackText={fallbackText}
          isOption={true}
          onZoomImage={onZoomImage}
        />
      )}
      {ocrText && !hasText && <span className="sr-only">{ocrText}</span>}
      {!image && !hasText && (
        <span className="text-xs text-amber-600 dark:text-amber-400 italic">Option content missing</span>
      )}
    </div>
  );
};
