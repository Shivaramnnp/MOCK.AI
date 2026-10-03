import { PdfPageClassification, TextLine, ExtractedAsset, ExtractedTable } from './types';

export interface PageClassificationMetrics {
  charCount: number;
  wordCount: number;
  imageCount: number;
  imageAreaRatio: number; // 0.0 - 1.0 (portion of page covered by images)
  mathSymbolCount: number;
  tableCount: number;
  pageWidth: number;
  pageHeight: number;
}

const MATH_SYMBOLS_REGEX = /[∑∏∫∬∭∮√∛∜≤≥≠≈≡±×÷∈∉⊂⊆∪∩∧∨¬⇒⇔∀∃∂∇∆θσωμπλαβγδεζηλξφψ]/;
const GREEK_LATEX_TOKENS = /\b(alpha|beta|gamma|delta|sigma|theta|omega|lambda|mu|tau|phi|psi|nabla)\b/i;

/**
 * Computes metrics and classifies a PDF page into an optimal extraction category.
 * Prevents unnecessary OCR when native text exists.
 */
export function classifyPage(
  lines: TextLine[],
  assets: ExtractedAsset[],
  tables: ExtractedTable[],
  pageWidth: number,
  pageHeight: number
): { classification: PdfPageClassification; metrics: PageClassificationMetrics } {
  let charCount = 0;
  let wordCount = 0;
  let mathSymbolCount = 0;

  for (const line of lines) {
    charCount += line.text.length;
    wordCount += line.text.split(/\s+/).filter(Boolean).length;

    for (const char of line.text) {
      if (MATH_SYMBOLS_REGEX.test(char)) {
        mathSymbolCount++;
      }
    }
    if (GREEK_LATEX_TOKENS.test(line.text)) {
      mathSymbolCount += 2;
    }

    // Check for superscript/subscript offset spans within the line
    if (line.spans && line.spans.length > 1) {
      const baseFontSize = line.fontSize;
      for (const span of line.spans) {
        if (span.fontSize < baseFontSize * 0.88 && Math.abs(span.y - line.y) > 1.5) {
          mathSymbolCount++;
        }
      }
    }
  }

  // Calculate genuine diagram image area (filtering out full-page watermarks)
  let genuineImageArea = 0;
  let genuineImageCount = 0;
  const pageArea = Math.max(1, pageWidth * pageHeight);

  for (const asset of assets) {
    if (asset.ownership === 'WATERMARK' || asset.ownership === 'HEADER' || asset.ownership === 'FOOTER') {
      continue;
    }
    genuineImageCount++;
    const assetArea = asset.width * asset.height;
    genuineImageArea += assetArea;
  }

  const imageAreaRatio = Math.min(1.0, genuineImageArea / pageArea);
  const tableCount = tables.length;

  const metrics: PageClassificationMetrics = {
    charCount,
    wordCount,
    imageCount: genuineImageCount,
    imageAreaRatio,
    mathSymbolCount,
    tableCount,
    pageWidth,
    pageHeight,
  };

  // 1. SCANNED_IMAGE: Almost zero text (< 50 chars) and high image presence
  if (charCount < 50 && (genuineImageCount > 0 || imageAreaRatio > 0.3)) {
    return { classification: 'SCANNED_IMAGE', metrics };
  }

  // 2. TABLE_HEAVY: Contains detected multi-column structured tables
  if (tableCount > 0 || (charCount > 100 && lines.some((l) => l.text.toLowerCase().includes('column-i') || l.text.toLowerCase().includes('column - i')))) {
    return { classification: 'TABLE_HEAVY', metrics };
  }

  // 3. FORMULA_HEAVY: Substantial formula density
  if (mathSymbolCount >= 4 || (charCount > 0 && mathSymbolCount / Math.max(1, wordCount) > 0.08)) {
    return { classification: 'FORMULA_HEAVY', metrics };
  }

  // 4. IMAGE_HEAVY: Diagrams or graphs occupy > 35% of page
  if (imageAreaRatio > 0.35 || genuineImageCount >= 4) {
    return { classification: 'IMAGE_HEAVY', metrics };
  }

  // 5. MIXED: Has text AND diagrams
  if (genuineImageCount > 0 && charCount > 100) {
    return { classification: 'MIXED', metrics };
  }

  // 6. TEXT_NATIVE: Default native digital text
  return { classification: 'TEXT_NATIVE', metrics };
}
