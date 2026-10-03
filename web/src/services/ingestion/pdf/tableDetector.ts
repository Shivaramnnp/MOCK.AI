import { TextLine, ExtractedTable, BoundingBox } from './types';
import { CanonicalContentBlock } from '../../../types/canonicalQuestion';

const MATCHING_HEADER_REGEX = /(Column\s*[-–—]?\s*(?:I\b|1\b|A\b)|List\s*[-–—]?\s*(?:I\b|1\b|A\b)|Group\s*[-–—]?\s*(?:I\b|1\b|A\b))/i;
const MATCHING_HEADER_II_REGEX = /(Column\s*[-–—]?\s*(?:II\b|2\b|B\b)|List\s*[-–—]?\s*(?:II\b|2\b|B\b)|Group\s*[-–—]?\s*(?:II\b|2\b|B\b))/i;

function isMatchingHeaderCandidate(line: TextLine): boolean {
  const trimmed = line.text.trim();
  // Question stems like "Q. 6 Column - I has statements..." are question prompts, not table headers
  if (/^Q\.?\s*\d+/i.test(trimmed) || /^\d+[\.\)]/.test(trimmed)) {
    return false;
  }
  if (/\b(?:has|contains|contain|given|following|match|select|identify|below)\b/i.test(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Detects structured tables (such as Column-I / Column-II matching questions or data grids)
 * from geometric text lines, preserving rows and columns.
 */
export function detectTables(
  lines: TextLine[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number
): { tables: ExtractedTable[]; remainingLines: TextLine[] } {
  const tables: ExtractedTable[] = [];
  const consumedLineIndices = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (consumedLineIndices.has(i)) continue;

    const line = lines[i];

    // 1. Detect Matching Tables (Column-I / Column-II or List-I / List-II)
    if (isMatchingHeaderCandidate(line)) {
      const hasCol1 = MATCHING_HEADER_REGEX.test(line.text);
      const hasCol2 = MATCHING_HEADER_II_REGEX.test(line.text);

      // Case A: Both headers on the same line
      // e.g. "Column - I    Column - II"
      if (hasCol1 && hasCol2) {
        const col1Match = line.text.match(MATCHING_HEADER_REGEX)!;
        const col2Match = line.text.match(MATCHING_HEADER_II_REGEX)!;

        const headers = [col1Match[0].trim(), col2Match[0].trim()];
        const { table, consumed } = extractMatchingRows(lines, i, headers, pageNumber, pageWidth, pageHeight);
        if (table && table.rows.length > 0) {
          tables.push(table);
          consumed.forEach((idx) => consumedLineIndices.add(idx));
          continue;
        }
      }

      // Case B: Split headers (e.g. spans with Column-I on left, Column-II on right)
      if (line.spans.length >= 2) {
        const leftSpan = line.spans.find((s) => MATCHING_HEADER_REGEX.test(s.str));
        const rightSpan = line.spans.find((s) => MATCHING_HEADER_II_REGEX.test(s.str));

        if (leftSpan && rightSpan && leftSpan.x < rightSpan.x) {
          const headers = [leftSpan.str.trim(), rightSpan.str.trim()];
          const { table, consumed } = extractMatchingRows(lines, i, headers, pageNumber, pageWidth, pageHeight);
          if (table && table.rows.length > 0) {
            tables.push(table);
            consumed.forEach((idx) => consumedLineIndices.add(idx));
            continue;
          }
        }
      }
    }

    // 2. Detect Generic Multi-Column Data Grids (e.g. Loan Table with 3+ aligned columns)
    if (isPotentialGridHeader(line)) {
      const { table, consumed } = extractDataGrid(lines, i, pageNumber, pageWidth, pageHeight);
      if (table && table.rows.length >= 2) {
        tables.push(table);
        consumed.forEach((idx) => consumedLineIndices.add(idx));
        continue;
      }
    }
  }

  const remainingLines = lines.filter((_, idx) => !consumedLineIndices.has(idx));
  return { tables, remainingLines };
}

/**
 * Extracts rows belonging to a Column-I / Column-II matching question.
 * Recognizes item bullets such as P, Q, R, S and 1, 2, 3, 4.
 */
function extractMatchingRows(
  lines: TextLine[],
  headerLineIndex: number,
  headers: string[],
  pageNumber: number,
  pageWidth: number,
  pageHeight: number
): { table: ExtractedTable | null; consumed: Set<number> } {
  const consumed = new Set<number>();
  consumed.add(headerLineIndex);

  const rows: string[][] = [];
  const headerLine = lines[headerLineIndex];
  let minY = headerLine.y;
  let maxY = headerLine.y;

  // Expected markers for Column 1 (P, Q, R, S or A, B, C, D) and Column 2 (1, 2, 3, 4 or i, ii, iii, iv)
  let rowCol1 = '';
  let rowCol2 = '';

  let midX = pageWidth * 0.48;
  const col1Span = headerLine.spans.find((s) => MATCHING_HEADER_REGEX.test(s.str));
  const col2Span = headerLine.spans.find((s) => MATCHING_HEADER_II_REGEX.test(s.str));
  if (col1Span && col2Span && col2Span.x > col1Span.x) {
    midX = (col1Span.x + col1Span.width + col2Span.x) / 2;
  }

  for (let j = headerLineIndex + 1; j < lines.length; j++) {
    const curLine = lines[j];
    const text = curLine.text;

    // Check if we hit the end of the table (e.g. question prompt or options start)
    if (
      text.toLowerCase().includes('identify the option') ||
      text.toLowerCase().includes('which of the following') ||
      text.toLowerCase().includes('match the') ||
      text.startsWith('(A)') ||
      text.startsWith('(1)') ||
      /^Q\.?\s*\d+/i.test(curLine.text) ||
      /^Question\s*\d+/i.test(curLine.text)
    ) {
      break;
    }

    minY = Math.min(minY, curLine.y);
    maxY = Math.max(maxY, curLine.y);
    consumed.add(j);

    // Split line into left and right spans using midX
    const leftText = curLine.spans
      .filter((s) => s.x + s.width / 2 < midX)
      .map((s) => s.str)
      .join(' ')
      .trim();

    const rightText = curLine.spans
      .filter((s) => s.x + s.width / 2 >= midX)
      .map((s) => s.str)
      .join(' ')
      .trim();

    // Check if new row starts (P., Q., R., S. on left or 1., 2., 3. on right)
    const isNewRow = /^[P-S|A-D][\.\)]/i.test(leftText) || /^[1-4][\.\)]/.test(rightText);

    if (isNewRow) {
      if (rowCol1 || rowCol2) {
        rows.push([rowCol1.trim(), rowCol2.trim()]);
      }
      rowCol1 = leftText;
      rowCol2 = rightText;
    } else {
      // Continuation of previous row cells
      if (leftText) rowCol1 += (rowCol1 ? ' ' : '') + leftText;
      if (rightText) rowCol2 += (rowCol2 ? ' ' : '') + rightText;
    }
  }

  if (rowCol1 || rowCol2) {
    rows.push([rowCol1.trim(), rowCol2.trim()]);
  }

  if (rows.length === 0) {
    return { table: null, consumed: new Set() };
  }

  const boundingBox: BoundingBox = {
    x: 50,
    y: minY,
    width: pageWidth - 100,
    height: Math.max(20, maxY - minY + 20),
    pageWidth,
    pageHeight,
  };

  return {
    table: {
      headers,
      rows,
      alignments: ['left', 'left'],
      boundingBox,
      pageNumber,
    },
    consumed,
  };
}

/**
 * Checks if a line resembles a tabular data header with multiple aligned columns.
 */
function isPotentialGridHeader(line: TextLine): boolean {
  const trimmed = line.text.trim();
  // Never treat option lines, question markers, or instructions as table grid headers
  if (/^\([A-Da-d0-9]\)/.test(trimmed) || /^[A-Da-d]\./.test(trimmed)) return false;
  if (/^Q\.?\s*\d+/i.test(trimmed) || /^Question\s*\d+/i.test(trimmed)) return false;
  if (/^(?:Identify|Which|Consider|Select|Where|Given|Note)\b/i.test(trimmed)) return false;

  if (line.spans.length < 2) return false;

  // Spans should have distinct horizontal gaps (not just regular single spaces between words)
  let hasGaps = false;
  for (let s = 1; s < line.spans.length; s++) {
    const gap = line.spans[s].x - (line.spans[s - 1].x + line.spans[s - 1].width);
    if (gap > 20) {
      hasGaps = true;
      break;
    }
  }

  return hasGaps && line.maxX - line.minX > 150;
}

/**
 * Extracts a data grid table by clustering column positions.
 */
function extractDataGrid(
  lines: TextLine[],
  headerLineIndex: number,
  pageNumber: number,
  pageWidth: number,
  pageHeight: number
): { table: ExtractedTable | null; consumed: Set<number> } {
  const headerLine = lines[headerLineIndex];
  const colCenters = headerLine.spans.map((s) => s.x + s.width / 2);
  const headers = headerLine.spans.map((s) => s.str.trim()).filter(Boolean);

  if (headers.length < 2) return { table: null, consumed: new Set() };

  const consumed = new Set<number>();
  consumed.add(headerLineIndex);
  const rows: string[][] = [];

  for (let j = headerLineIndex + 1; j < lines.length; j++) {
    const curLine = lines[j];
    if (curLine.text.startsWith('Q.') || curLine.text.startsWith('SELECT ') || curLine.text.startsWith('(A)')) {
      break;
    }

    if (curLine.spans.length >= 2) {
      consumed.add(j);
      const rowCells: string[] = new Array(headers.length).fill('');
      for (const span of curLine.spans) {
        const spanCenter = span.x + span.width / 2;
        // Find closest column
        let closestCol = 0;
        let minDist = Infinity;
        colCenters.forEach((center, colIdx) => {
          const dist = Math.abs(spanCenter - center);
          if (dist < minDist) {
            minDist = dist;
            closestCol = colIdx;
          }
        });
        rowCells[closestCol] = (rowCells[closestCol] ? rowCells[closestCol] + ' ' : '') + span.str.trim();
      }
      rows.push(rowCells);
    } else {
      break;
    }
  }

  if (rows.length < 2) return { table: null, consumed: new Set() };

  return {
    table: {
      headers,
      rows,
      alignments: headers.map(() => 'left'),
      boundingBox: {
        x: headerLine.minX,
        y: lines[headerLineIndex + rows.length]?.y || headerLine.y,
        width: headerLine.maxX - headerLine.minX,
        height: rows.length * 15,
        pageWidth,
        pageHeight,
      },
      pageNumber,
    },
    consumed,
  };
}

/**
 * Converts an ExtractedTable to a CanonicalContentBlock.
 */
export function tableToContentBlock(table: ExtractedTable): CanonicalContentBlock {
  return {
    type: 'table',
    headers: table.headers,
    alignments: table.alignments || table.headers.map(() => 'left'),
    rows: table.rows,
    confidence: 'VERIFIED',
    caption: table.caption,
  };
}
