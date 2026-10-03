import { TextSpan, TextLine } from './types';

export interface LayoutExtractionOptions {
  lineThreshold?: number; // max vertical delta in pt to consider spans on the same line (default 3.5)
  headerMarginRatio?: number; // top margin ratio to exclude headers (default 0.04)
  footerMarginRatio?: number; // bottom margin ratio to exclude footers (default 0.05)
}

/**
 * Extracts and lines up text spans into geometric text lines, preserving
 * reading order, multi-column layouts, and font metadata.
 */
export function extractPageLayout(
  rawItems: any[],
  pageNumber: number,
  viewport: { width: number; height: number },
  options?: LayoutExtractionOptions
): { lines: TextLine[]; headerText: string; footerText: string } {
  const lineThreshold = options?.lineThreshold ?? 3.5;
  const headerCutoff = viewport.height * (1.0 - (options?.headerMarginRatio ?? 0.04));
  const footerCutoff = viewport.height * (options?.footerMarginRatio ?? 0.05);

  const allSpans: TextSpan[] = [];
  const headerSpans: TextSpan[] = [];
  const footerSpans: TextSpan[] = [];

  for (const item of rawItems) {
    if (!item || typeof item.str !== 'string') continue;
    const str = item.str;
    if (!str.trim() && str.length === 0) continue;

    const transform = item.transform || [1, 0, 0, 1, 0, 0];
    const x = transform[4] || 0;
    const y = transform[5] || 0;
    const width = item.width || 0;
    const height = item.height || Math.abs(transform[3]) || 10;
    const fontSize = Math.abs(transform[0]) || Math.abs(transform[3]) || height || 10;
    const fontName = item.fontName || 'standard';

    const span: TextSpan = {
      str,
      x,
      y,
      width,
      height,
      fontSize,
      fontName,
      hasEOL: Boolean(item.hasEOL),
      pageNumber,
    };

    // Header check (near top of page)
    if (y > headerCutoff) {
      headerSpans.push(span);
      continue;
    }

    // Footer check (near bottom of page, e.g. "Organizing Institute: IIT Roorkee Page X of Y")
    if (y < footerCutoff) {
      footerSpans.push(span);
      continue;
    }

    allSpans.push(span);
  }

  // 1. Detect Multi-Column Layout:
  // Check if spans cluster into two distinct horizontal columns with a central vertical gutter
  const midX = viewport.width / 2;
  const gutterWidth = 15; // pt
  const leftColSpans: TextSpan[] = [];
  const rightColSpans: TextSpan[] = [];
  let spansCrossingGutter = 0;

  for (const span of allSpans) {
    const spanRight = span.x + span.width;
    if (spanRight < midX - gutterWidth) {
      leftColSpans.push(span);
    } else if (span.x > midX + gutterWidth) {
      rightColSpans.push(span);
    } else {
      spansCrossingGutter++;
    }
  }

  // Pre-group all spans into lines by vertical threshold
  const preliminaryLines = groupSpansIntoLines(allSpans, lineThreshold, pageNumber);

  // Check if rows are synchronized across the middle (tabular / matching / aligned)
  const synchronizedRows = preliminaryLines.filter((line) => {
    const hasLeft = line.spans.some((s) => s.x + s.width < midX - gutterWidth);
    const hasRight = line.spans.some((s) => s.x > midX + gutterWidth);
    return hasLeft && hasRight;
  }).length;

  const wideLines = preliminaryLines.filter((line) => line.minX < midX - 60 && line.maxX > midX + 60).length;

  // A page is only a 2-column article if it has no synchronized rows, almost no wide lines,
  // and substantial independent left and right content.
  const isTwoColumn =
    synchronizedRows < 2 &&
    wideLines < 2 &&
    leftColSpans.length > 25 &&
    rightColSpans.length > 25 &&
    spansCrossingGutter < (leftColSpans.length + rightColSpans.length) * 0.1;

  let lines: TextLine[] = [];

  if (isTwoColumn) {
    // Process left column lines first (top-to-bottom), then right column lines (top-to-bottom)
    const leftLines = groupSpansIntoLines(leftColSpans, lineThreshold, pageNumber);
    const rightLines = groupSpansIntoLines(rightColSpans, lineThreshold, pageNumber);
    lines = [...leftLines, ...rightLines];
  } else {
    // Single column reading order
    lines = preliminaryLines;
  }

  const headerText = headerSpans
    .sort((a, b) => a.x - b.x)
    .map((s) => s.str)
    .join(' ')
    .trim();

  const footerText = footerSpans
    .sort((a, b) => a.x - b.x)
    .map((s) => s.str)
    .join(' ')
    .trim();

  return { lines, headerText, footerText };
}

/**
 * Groups spans with matching vertical baseline (within threshold) into lines,
 * sorting lines top-to-bottom (descending y), and spans left-to-right (ascending x).
 */
function groupSpansIntoLines(spans: TextSpan[], threshold: number, pageNumber: number): TextLine[] {
  if (spans.length === 0) return [];

  // Sort descending by Y coordinate (PDF origin is bottom-left, so higher Y is higher on page)
  const sorted = [...spans].sort((a, b) => b.y - a.y);
  const lineBuckets: TextSpan[][] = [];

  for (const span of sorted) {
    let placed = false;
    for (const bucket of lineBuckets) {
      const avgY = bucket.reduce((sum, s) => sum + s.y, 0) / bucket.length;
      const deltaY = Math.abs(span.y - avgY);

      // Standard tight threshold (e.g. 3.5 - 4.0 pt)
      if (deltaY <= threshold) {
        bucket.push(span);
        placed = true;
        break;
      }

      // Extended threshold for sub/superscripts, fractions, and question number labels (up to 16pt)
      // provided there is no significant horizontal overlap with existing spans in the bucket
      if (deltaY <= 16.0) {
        const spanLeft = span.x;
        const spanRight = span.x + span.width;
        const overlaps = bucket.some((b) => {
          const bLeft = b.x;
          const bRight = b.x + b.width;
          return Math.max(0, Math.min(spanRight, bRight) - Math.max(spanLeft, bLeft)) > 3.0;
        });

        if (!overlaps) {
          bucket.push(span);
          placed = true;
          break;
        }
      }
    }
    if (!placed) {
      lineBuckets.push([span]);
    }
  }

  const result: TextLine[] = [];

  for (const bucket of lineBuckets) {
    // Sort spans horizontally within line: left to right (ascending X)
    bucket.sort((a, b) => a.x - b.x);

    const avgY = bucket.reduce((sum, s) => sum + s.y, 0) / bucket.length;
    const maxHeight = Math.max(...bucket.map((s) => s.height));
    const avgFontSize = bucket.reduce((sum, s) => sum + s.fontSize, 0) / bucket.length;
    const minX = Math.min(...bucket.map((s) => s.x));
    const lastSpan = bucket[bucket.length - 1];
    const maxX = lastSpan.x + lastSpan.width;

    // Join spans intelligently: if there is horizontal space between spans, add a space
    let lineText = '';
    for (let i = 0; i < bucket.length; i++) {
      const cur = bucket[i];
      if (i > 0) {
        const prev = bucket[i - 1];
        const prevEnd = prev.x + prev.width;
        const gap = cur.x - prevEnd;
        // If gap exceeds ~25% of font size, inject space
        if (gap > cur.fontSize * 0.22 && !lineText.endsWith(' ') && !cur.str.startsWith(' ')) {
          lineText += ' ';
        }
      }
      lineText += cur.str;
    }

    result.push({
      y: avgY,
      height: maxHeight,
      fontSize: avgFontSize,
      spans: bucket,
      text: lineText.trim(),
      pageNumber,
      minX,
      maxX,
    });
  }

  // Re-sort lines strictly top-to-bottom (descending y)
  result.sort((a, b) => b.y - a.y);

  return result;
}
