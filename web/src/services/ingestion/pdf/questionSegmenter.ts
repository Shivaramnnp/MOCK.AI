import { TextLine, ExtractedAsset, ExtractedTable, QuestionBoundary } from './types';
import { QuestionType } from '../../../types/canonicalQuestion';

// Multi-pattern regex for detecting question numbers
const QUESTION_NUMBER_PATTERNS = [
  /^(?:Q\.?\s*|Question\s+)(\d+)[\s.:\–\-]/i,
  /^[Qq](\d+)[\s.:\–\-]/,
  /^\((\d+)\)[\s.:]/,
  /^\[(\d+)\][\s.:]/,
  /^(\d+)\.\s+/,
  /^(\d+)\)\s+/,
];

// Option identifier regexes
const OPTION_START_REGEX = /^\(([A-Fa-f0-9])\)|\b([A-Fa-f0-9])\.\s+/;

// Section & marks headers
const MARKS_HEADER_REGEX = /Q\.?\s*(\d+)\s*[–\-—]\s*Q\.?\s*(\d+)\s*(?:carry|Carry)\s+([A-Za-z0-9]+)\s+mark/i;
const SECTION_HEADER_PATTERNS = [
  /^(General\s+Aptitude)\b/i,
  /^(Engineering\s+Mathematics)\b/i,
  /^(Section\s+[A-Z0-9]+(?::\s*[^.\n]+)?)/i,
  /^(Part\s+[A-Z0-9]+(?::\s*[^.\n]+)?)/i,
];

/**
 * Segments extracted lines from all pages into distinct, structured question units.
 */
export function segmentQuestions(
  allLinesByPage: Map<number, TextLine[]>,
  assetsByPage: Map<number, ExtractedAsset[]>,
  tablesByPage: Map<number, ExtractedTable[]>
): QuestionBoundary[] {
  const boundaries: QuestionBoundary[] = [];

  let currentSection = 'General';
  let currentMarks = 1;
  let currentNegativeMarks = 0.33;

  // Flatten all lines in page order
  const sortedPages = Array.from(allLinesByPage.keys()).sort((a, b) => a - b);

  let currentQuestion: {
    questionNumber: number;
    startPage: number;
    startY: number;
    endPage: number;
    endY: number;
    stemLines: TextLine[];
    optionLines: Map<string, TextLine[]>;
    currentOptionKey: string | null;
    sectionName: string;
    marks: number;
    negativeMarks: number;
  } | null = null;

  for (const pageNum of sortedPages) {
    const lines = allLinesByPage.get(pageNum) || [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const text = line.text.trim();
      if (!text) continue;

      // 1. Check for Section Header
      for (const pattern of SECTION_HEADER_PATTERNS) {
        const secMatch = text.match(pattern);
        if (secMatch) {
          currentSection = secMatch[1].trim();
          break;
        }
      }

      // 2. Check for Marks Allocation Header
      // e.g. "Q. 1 – Q. 5 Carry ONE mark Each"
      const marksMatch = text.match(MARKS_HEADER_REGEX);
      if (marksMatch) {
        const markWord = marksMatch[3].toLowerCase();
        if (markWord.includes('two') || markWord.includes('2')) {
          currentMarks = 2;
          currentNegativeMarks = 0.67;
        } else {
          currentMarks = 1;
          currentNegativeMarks = 0.33;
        }
        continue; // Skip the metadata line itself
      }

      // 3. Check for New Question Boundary
      let detectedQNum: number | null = null;
      for (const pattern of QUESTION_NUMBER_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > 0 && num <= 200) {
            // Anti-split guard: verify it's not mid-sentence punctuation
            // e.g. "Rule 1. Something" inside question text
            if (currentQuestion && num !== currentQuestion.questionNumber + 1 && num !== currentQuestion.questionNumber) {
              // If number jump is massive or out of order, require higher threshold
              if (Math.abs(num - currentQuestion.questionNumber) > 3) {
                continue;
              }
            }
            detectedQNum = num;
            break;
          }
        }
      }

      if (detectedQNum !== null) {
        // Finalize previous question if one was in progress
        if (currentQuestion) {
          boundaries.push(finalizeQuestionBoundary(currentQuestion, assetsByPage, tablesByPage));
        }

        // Start new question unit
        currentQuestion = {
          questionNumber: detectedQNum,
          startPage: pageNum,
          startY: line.y,
          endPage: pageNum,
          endY: line.y,
          stemLines: [line],
          optionLines: new Map(),
          currentOptionKey: null,
          sectionName: currentSection,
          marks: currentMarks,
          negativeMarks: currentNegativeMarks,
        };
        continue;
      }

      // If we are currently accumulating a question:
      if (currentQuestion) {
        currentQuestion.endPage = pageNum;
        currentQuestion.endY = line.y;

        // Check for Option Label: (A), (B), (C), (D) or A., B., C., D.
        const optMatch = text.match(OPTION_START_REGEX);
        if (optMatch) {
          const optKey = (optMatch[1] || optMatch[2]).toUpperCase();
          currentQuestion.currentOptionKey = optKey;
          if (!currentQuestion.optionLines.has(optKey)) {
            currentQuestion.optionLines.set(optKey, []);
          }
          currentQuestion.optionLines.get(optKey)!.push(line);
        } else if (currentQuestion.currentOptionKey) {
          // Continuation of current option text
          currentQuestion.optionLines.get(currentQuestion.currentOptionKey)!.push(line);
        } else {
          // Continuation of question stem
          currentQuestion.stemLines.push(line);
        }
      }
    }
  }

  // Finalize last active question
  if (currentQuestion) {
    boundaries.push(finalizeQuestionBoundary(currentQuestion, assetsByPage, tablesByPage));
  }

  return boundaries;
}

/**
 * Finalizes question boundary, assigns associated assets/tables, and deduces QuestionType.
 */
function finalizeQuestionBoundary(
  q: {
    questionNumber: number;
    startPage: number;
    startY: number;
    endPage: number;
    endY: number;
    stemLines: TextLine[];
    optionLines: Map<string, TextLine[]>;
    sectionName: string;
    marks: number;
    negativeMarks: number;
  },
  assetsByPage: Map<number, ExtractedAsset[]>,
  tablesByPage: Map<number, ExtractedTable[]>
): QuestionBoundary {
  const associatedAssets: ExtractedAsset[] = [];
  const associatedTables: ExtractedTable[] = [];

  // Match assets on pages between startPage and endPage
  for (let p = q.startPage; p <= q.endPage; p++) {
    const pageAssets = assetsByPage.get(p) || [];
    for (const asset of pageAssets) {
      if (asset.ownership === 'WATERMARK' || asset.ownership === 'HEADER' || asset.ownership === 'FOOTER') {
        continue;
      }
      // If single-page question, verify vertical bounding box overlap
      if (q.startPage === q.endPage) {
        const topBound = Math.max(q.startY, q.endY) + 20;
        const bottomBound = Math.min(q.startY, q.endY) - 20;
        if (asset.boundingBox.y <= topBound && asset.boundingBox.y >= bottomBound) {
          associatedAssets.push(asset);
        }
      } else {
        associatedAssets.push(asset);
      }
    }

    const pageTables = tablesByPage.get(p) || [];
    for (const table of pageTables) {
      if (q.startPage === q.endPage) {
        const topBound = Math.max(q.startY, q.endY) + 20;
        const bottomBound = Math.min(q.startY, q.endY) - 20;
        if (table.boundingBox.y <= topBound && table.boundingBox.y >= bottomBound) {
          associatedTables.push(table);
        }
      } else {
        associatedTables.push(table);
      }
    }
  }

  // Determine QuestionType:
  // - If options exist: MCQ or MSQ
  // - If no options: NAT (Numerical Answer Type)
  let questionType: QuestionType = 'MCQ';
  const stemText = q.stemLines.map((l) => l.text).join(' ');

  if (q.optionLines.size === 0) {
    questionType = 'NAT';
  } else {
    // Check MSQ phrasing (e.g. "one or more than one", "which of the following statement(s) is/are correct")
    if (
      stemText.includes('is/are correct') ||
      stemText.includes('one or more than one') ||
      stemText.includes('select all that apply')
    ) {
      questionType = 'MSQ';
    } else {
      questionType = 'MCQ';
    }
  }

  // Calculate confidence score
  let confidence = 0.95;
  if (q.stemLines.length === 0) confidence -= 0.3;
  if (questionType === 'MCQ' && q.optionLines.size < 2) confidence -= 0.25;

  const boundary: QuestionBoundary = {
    questionNumber: q.questionNumber,
    startPage: q.startPage,
    endPage: q.endPage,
    startY: q.startY,
    endY: q.endY,
    rawStemLines: q.stemLines,
    rawOptionLines: q.optionLines,
    associatedAssets,
    associatedTables,
    sectionName: q.sectionName,
    marks: q.marks,
    negativeMarks: questionType === 'NAT' || questionType === 'MSQ' ? 0 : q.negativeMarks,
    confidence,
    questionType,
  };

  return refineAssetOwnership(boundary);
}

/**
 * Refines asset ownership using PDF.js coordinates (descending Y, ascending X, x >= 78 pt indentation).
 * Classifies option assets as OPTION_A..D and stem assets as QUESTION.
 */
export function refineAssetOwnership(q: QuestionBoundary): QuestionBoundary {
  const assets = q.associatedAssets;
  if (!assets || assets.length === 0) {
    return q;
  }

  // Filter out non-content assets (watermarks, headers, footers, decorations)
  const candidateAssets = assets.filter(
    (a) =>
      a.ownership !== 'WATERMARK' &&
      a.ownership !== 'HEADER' &&
      a.ownership !== 'FOOTER' &&
      a.ownership !== 'DOCUMENT_DECORATION'
  );

  if (candidateAssets.length === 0) {
    return q;
  }

  // Determine option top boundary Y if option text lines exist
  let topOptionY: number | null = null;
  if (q.rawOptionLines && q.rawOptionLines.size > 0) {
    const allOptionYs: number[] = [];
    for (const lines of q.rawOptionLines.values()) {
      for (const line of lines) {
        allOptionYs.push(line.y);
      }
    }
    if (allOptionYs.length > 0) {
      topOptionY = Math.max(...allOptionYs);
    }
  }

  // Partition into candidate option assets and stem assets
  const optCandidates: ExtractedAsset[] = [];
  const stemAssets: ExtractedAsset[] = [];

  for (const asset of candidateAssets) {
    const r = asset.boundingBox;
    const isIndented = r.x >= 78;
    const isNarrow = r.width < 150;
    const isBelowStem = topOptionY !== null ? r.y <= topOptionY + 25 : true;

    if (isIndented && isNarrow && isBelowStem) {
      optCandidates.push(asset);
    } else {
      stemAssets.push(asset);
    }
  }

  // Group candidate option assets into rows by descending Y (tolerance 25 pt),
  // and sort within each row by ascending X (left to right)
  optCandidates.sort((a, b) => {
    const yDiff = b.boundingBox.y - a.boundingBox.y;
    if (Math.abs(yDiff) > 25) {
      return yDiff; // descending Y: higher Y on page comes first
    }
    return a.boundingBox.x - b.boundingBox.x; // ascending X: left comes first
  });

  const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

  // Check if option lines exist with explicit keys to match by proximity
  if (q.rawOptionLines && q.rawOptionLines.size > 0 && optCandidates.length !== 4) {
    const usedIndices = new Set<number>();
    const sortedOptionKeys = Array.from(q.rawOptionLines.keys()).sort();

    for (const key of sortedOptionKeys) {
      const lines = q.rawOptionLines.get(key) || [];
      if (lines.length === 0) continue;
      const avgY = lines.reduce((sum, l) => sum + l.y, 0) / lines.length;

      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < optCandidates.length; i++) {
        if (usedIndices.has(i)) continue;
        const dist = Math.abs(optCandidates[i].boundingBox.y - avgY);
        if (dist < bestDist && dist < 80) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1) {
        usedIndices.add(bestIdx);
        optCandidates[bestIdx].ownership = `OPTION_${key.toUpperCase()}` as any;
      }
    }

    // Remaining unassigned candidates
    let labelIdx = 0;
    for (let i = 0; i < optCandidates.length; i++) {
      if (!usedIndices.has(i)) {
        while (
          labelIdx < optionLabels.length &&
          optCandidates.some((c) => c.ownership === `OPTION_${optionLabels[labelIdx]}`)
        ) {
          labelIdx++;
        }
        if (labelIdx < optionLabels.length) {
          optCandidates[i].ownership = `OPTION_${optionLabels[labelIdx]}` as any;
          labelIdx++;
        } else {
          optCandidates[i].ownership = 'QUESTION';
        }
      }
    }
  } else if (optCandidates.length >= 2 && optCandidates.length <= 6) {
    // 2 to 6 option figures strictly mapped in physical reading order
    for (let i = 0; i < optCandidates.length; i++) {
      optCandidates[i].ownership = `OPTION_${optionLabels[i]}` as any;
    }
  } else {
    // If irregular, keep as stem
    for (const c of optCandidates) {
      c.ownership = 'QUESTION';
    }
  }

  // All remaining stem assets get ownership = 'QUESTION'
  for (const s of stemAssets) {
    s.ownership = 'QUESTION';
  }

  // If question was NAT but options were detected, upgrade to MCQ
  const hasOptionAssets = candidateAssets.some((a) => a.ownership.startsWith('OPTION_'));
  if (hasOptionAssets && q.questionType === 'NAT') {
    q.questionType = 'MCQ';
    if (!q.rawOptionLines || q.rawOptionLines.size === 0) {
      q.rawOptionLines = new Map();
      for (const a of candidateAssets) {
        if (a.ownership.startsWith('OPTION_')) {
          const key = a.ownership.replace('OPTION_', '');
          if (!q.rawOptionLines.has(key)) {
            q.rawOptionLines.set(key, []);
          }
        }
      }
    }
  }

  return q;
}
