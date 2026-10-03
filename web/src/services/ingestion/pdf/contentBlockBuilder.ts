import { TextLine, ExtractedAsset, ExtractedTable } from './types';
import { CanonicalContentBlock } from '../../../types/canonicalQuestion';
import { reconstructLineMath, wrapFormulaExpressions } from './mathReconstructor';
import { tableToContentBlock } from './tableDetector';

const QUESTION_PREFIX_STRIP_REGEX = /^(?:Q\.?\s*|Question\s+)?(?:\d+)[\s.:\–\-]\s*/i;

/**
 * Builds sequential CanonicalContentBlock array for a question stem,
 * preserving layout order (text, diagram, table, code).
 */
export function buildQuestionContentBlocks(
  stemLines: TextLine[],
  tables: ExtractedTable[],
  assets: ExtractedAsset[]
): { contentBlocks: CanonicalContentBlock[]; cleanStemText: string } {
  const contentBlocks: CanonicalContentBlock[] = [];

  // 1. Clean question stem lines and reconstruct math
  const processedLines: string[] = [];
  let isFirst = true;

  for (const line of stemLines) {
    let lineStr = reconstructLineMath(line);
    if (isFirst) {
      lineStr = lineStr.replace(QUESTION_PREFIX_STRIP_REGEX, '');
      isFirst = false;
    }
    if (lineStr.trim()) {
      processedLines.push(lineStr.trim());
    }
  }

  // Detect code blocks (e.g. SQL query or Python snippet)
  const fullStem = processedLines.join('\n');
  const cleanStemText = wrapFormulaExpressions(processedLines.join(' '));

  // Check for SQL or Python code
  const isSql = /SELECT\s+.*FROM\s+/i.test(fullStem);
  const isPython = /def\s+[a-zA-Z_]\w*\(|import\s+[a-zA-Z_]|\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\]/.test(fullStem);

  if (isSql) {
    // Separate prose from SQL code
    const sqlMatch = fullStem.match(/(SELECT[\s\S]*?;)/i);
    if (sqlMatch) {
      const sqlCode = sqlMatch[1].trim();
      const beforeCode = fullStem.substring(0, sqlMatch.index).trim();
      const afterCode = fullStem.substring(sqlMatch.index! + sqlMatch[0].length).trim();

      if (beforeCode) {
        contentBlocks.push({
          type: 'text',
          content: wrapFormulaExpressions(beforeCode),
        });
      }

      // Add tables if present
      for (const table of tables) {
        contentBlocks.push(tableToContentBlock(table));
      }

      contentBlocks.push({
        type: 'code',
        language: 'sql',
        content: sqlCode,
      });

      if (afterCode) {
        contentBlocks.push({
          type: 'text',
          content: wrapFormulaExpressions(afterCode),
        });
      }
    } else {
      contentBlocks.push({
        type: 'text',
        content: cleanStemText,
      });
    }
  } else if (isPython) {
    const pythonMatch = fullStem.match(/((?:def\s+|[A-Za-z_]\w*\s*=\s*\[)[\s\S]*?(?:\n\s*\n|(?=Which one of the following)|$))/i);
    if (pythonMatch) {
      const pyCode = pythonMatch[1].trim();
      const beforeCode = fullStem.substring(0, pythonMatch.index).trim();
      const afterCode = fullStem.substring(pythonMatch.index! + pythonMatch[0].length).trim();

      if (beforeCode) {
        contentBlocks.push({
          type: 'text',
          content: wrapFormulaExpressions(beforeCode),
        });
      }

      contentBlocks.push({
        type: 'code',
        language: 'python',
        content: pyCode,
      });

      if (afterCode) {
        contentBlocks.push({
          type: 'text',
          content: wrapFormulaExpressions(afterCode),
        });
      }
    } else {
      contentBlocks.push({
        type: 'text',
        content: cleanStemText,
      });
    }
  } else {
    // Standard text block
    contentBlocks.push({
      type: 'text',
      content: cleanStemText,
    });

    // Add tables if present
    for (const table of tables) {
      contentBlocks.push(tableToContentBlock(table));
    }
  }

  // 2. Append genuine question diagram assets (strictly disjoint from option figures)
  for (const asset of assets) {
    if (asset.ownership === 'QUESTION' && !asset.assetId.includes('_opt_')) {
      contentBlocks.push({
        type: 'image',
        assetId: asset.assetId,
        assetUrl: asset.dataUrl,
        caption: asset.caption || 'Question diagram',
        confidence: 'VERIFIED',
      });
    }
  }

  return { contentBlocks, cleanStemText };
}
