import {
  CanonicalQuestion,
  CanonicalContentBlock,
  VerificationStatus,
  CanonicalConfidence,
} from '../../types/canonicalQuestion';

export type QualityGateSeverity = 'FATAL' | 'REVIEW_REQUIRED' | 'WARNING' | 'INFO';

export interface QualityIssue {
  code: string;
  field: string;
  message: string;
  severity: QualityGateSeverity;
}

export interface QualityGateEvaluation {
  isValid: boolean;
  canPublish: boolean;
  status: VerificationStatus;
  reasons: string[];
  issues: QualityIssue[];
  confidence: CanonicalConfidence;
}

/**
 * Checks for unclosed LaTeX delimiters and malformed math syntax.
 */
export function checkMathSyntax(text: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!text) return issues;

  // 1. Check dollar signs ($) - count unescaped single dollars
  let singleDollarCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) {
      if (text[i + 1] === '$') {
        i++; // skip $$
      } else {
        singleDollarCount++;
      }
    }
  }
  if (singleDollarCount % 2 !== 0) {
    issues.push({
      code: 'UNCLOSED_INLINE_MATH',
      field: 'math',
      message: 'Found odd number of unescaped "$" delimiters (unclosed inline LaTeX math).',
      severity: 'REVIEW_REQUIRED',
    });
  }

  // 2. Check LaTeX bracket delimiters \( vs \) and \[ vs \]
  const openParenMath = (text.match(/\\\(/g) || []).length;
  const closeParenMath = (text.match(/\\\)/g) || []).length;
  if (openParenMath !== closeParenMath) {
    issues.push({
      code: 'UNBALANCED_PAREN_MATH',
      field: 'math',
      message: `Unbalanced LaTeX math parentheses: ${openParenMath} '\\(' vs ${closeParenMath} '\\)'.`,
      severity: 'REVIEW_REQUIRED',
    });
  }

  const openBracketMath = (text.match(/\\\[/g) || []).length;
  const closeBracketMath = (text.match(/\\\]/g) || []).length;
  if (openBracketMath !== closeBracketMath) {
    issues.push({
      code: 'UNBALANCED_BRACKET_MATH',
      field: 'math',
      message: `Unbalanced LaTeX math brackets: ${openBracketMath} '\\[' vs ${closeBracketMath} '\\]'.`,
      severity: 'REVIEW_REQUIRED',
    });
  }

  // 3. Check for unescaped control sequence corruptions like \b, \f, \t at start of words
  if (/[\x08\x0c]/.test(text)) {
    issues.push({
      code: 'CORRUPTED_ESCAPE_BYTE',
      field: 'text',
      message: 'Detected raw ASCII control character (e.g. \\b or \\f byte) from unescaped LaTeX backslash in JSON.',
      severity: 'REVIEW_REQUIRED',
    });
  }

  return issues;
}

/**
 * Validates a structured ContentBlock for internal integrity.
 */
export function validateContentBlock(block: CanonicalContentBlock, index: number): QualityIssue[] {
  const issues: QualityIssue[] = [];

  if (block.type === 'table') {
    const hasHeaders = Array.isArray(block.headers) && block.headers.length > 0;
    const hasRows = Array.isArray(block.rows) && block.rows.length > 0;
    if (!hasHeaders && !hasRows) {
      issues.push({
        code: 'EMPTY_TABLE_BLOCK',
        field: `contentBlocks[${index}]`,
        message: 'Table block has neither headers nor rows.',
        severity: 'REVIEW_REQUIRED',
      });
    } else if (hasHeaders && hasRows) {
      const headerLen = block.headers!.length;
      for (let r = 0; r < block.rows!.length; r++) {
        const row = block.rows![r];
        if (row.length !== headerLen) {
          issues.push({
            code: 'TABLE_COLUMN_MISMATCH',
            field: `contentBlocks[${index}].rows[${r}]`,
            message: `Table row ${r + 1} has ${row.length} columns, expected ${headerLen} matching header columns.`,
            severity: 'WARNING',
          });
        }
      }
    }
  }

  if (block.type === 'diagram' || block.type === 'image' || block.type === 'graph' || block.type === 'chart') {
    if (!block.assetUrl && !block.assetId) {
      issues.push({
        code: 'MISSING_ASSET_REFERENCE',
        field: `contentBlocks[${index}]`,
        message: `${block.type} block is missing both assetUrl and assetId references.`,
        severity: 'REVIEW_REQUIRED',
      });
    }
  }

  if (block.content) {
    issues.push(...checkMathSyntax(block.content));
  }
  if (block.latex) {
    issues.push(...checkMathSyntax(block.latex));
  }

  if (block.blocks && block.blocks.length > 0) {
    block.blocks.forEach((subBlock, subIdx) => {
      issues.push(...validateContentBlock(subBlock, subIdx));
    });
  }

  return issues;
}

/**
 * Evaluates a single CanonicalQuestion against all non-negotiable quality rules.
 * Does NOT coerce missing answers to Option A.
 * Does NOT fabricate verification scores or verification status.
 */
export function evaluateQualityGate(
  q: CanonicalQuestion,
  options?: { isGeneratedBatch?: boolean }
): QualityGateEvaluation {
  const issues: QualityIssue[] = [];
  const reasons: string[] = [];

  // 1. Question stem validation
  const cleanStem = (q.questionText || '').trim();
  if (!cleanStem) {
    issues.push({
      code: 'EMPTY_QUESTION_TEXT',
      field: 'questionText',
      message: 'Question stem is completely empty.',
      severity: 'FATAL',
    });
  } else if (cleanStem.length < 5) {
    issues.push({
      code: 'SUSPICIOUSLY_SHORT_STEM',
      field: 'questionText',
      message: `Question stem is suspiciously short (${cleanStem.length} chars).`,
      severity: 'REVIEW_REQUIRED',
    });
  }

  if (/^(Question \d+|Untitled Question|Placeholder|Test Question)$/i.test(cleanStem)) {
    issues.push({
      code: 'PLACEHOLDER_STEM',
      field: 'questionText',
      message: `Question text appears to be a generic placeholder: "${cleanStem}".`,
      severity: 'REVIEW_REQUIRED',
    });
  }

  // Math syntax check in question text
  issues.push(...checkMathSyntax(cleanStem));

  // Content blocks check
  if (Array.isArray(q.contentBlocks)) {
    q.contentBlocks.forEach((block, idx) => {
      issues.push(...validateContentBlock(block, idx));
    });
  }

  // 2. Question type and options validation
  const qType = q.questionType || 'MCQ';
  const optList = q.options || [];

  if (qType === 'MCQ' || qType === 'MSQ' || qType === 'TRUE_FALSE') {
    if (optList.length < 2) {
      issues.push({
        code: 'INSUFFICIENT_OPTIONS',
        field: 'options',
        message: `${qType} question must contain at least 2 options, found ${optList.length}.`,
        severity: 'FATAL',
      });
    }

    // Check for empty or duplicate option texts
    const seenTexts = new Set<string>();
    for (let i = 0; i < optList.length; i++) {
      const opt = optList[i];
      const optText = (opt?.text || '').trim();
      const hasContent = optText.length > 0 || (opt?.contentBlocks && opt.contentBlocks.length > 0) || !!opt?.imageUrl;

      if (!hasContent) {
        issues.push({
          code: 'EMPTY_OPTION_CONTENT',
          field: `options[${i}]`,
          message: `Option ${opt?.id || i + 1} has empty text and no visual content.`,
          severity: 'REVIEW_REQUIRED',
        });
      }

      if (optText.length > 0) {
        issues.push(...checkMathSyntax(optText));
        const normalized = optText.toLowerCase();
        if (seenTexts.has(normalized)) {
          issues.push({
            code: 'DUPLICATE_OPTION_CONTENT',
            field: `options[${i}]`,
            message: `Option ${opt?.id || i + 1} duplicates the text of another option: "${optText}".`,
            severity: 'REVIEW_REQUIRED',
          });
        }
        seenTexts.add(normalized);
      }
    }
  }

  if (qType === 'TRUE_FALSE' && optList.length !== 2) {
    issues.push({
      code: 'INVALID_TRUE_FALSE_COUNT',
      field: 'options',
      message: `TRUE_FALSE question should have exactly 2 options, found ${optList.length}.`,
      severity: 'REVIEW_REQUIRED',
    });
  }

  // 3. Answer validation (ZERO Option-A coercion!)
  const ans = q.answer || { questionType: qType };

  if (ans.isMta) {
    // Marks to all - answer key exempt from standard check
  } else if (qType === 'MCQ') {
    const hasValidIndex =
      typeof ans.correctOptionIndex === 'number' &&
      ans.correctOptionIndex >= 0 &&
      ans.correctOptionIndex < optList.length;

    const hasValidId =
      typeof ans.correctOptionId === 'string' &&
      optList.some((o) => o.id === ans.correctOptionId);

    if (!hasValidIndex && !hasValidId) {
      issues.push({
        code: 'MISSING_OR_INVALID_MCQ_ANSWER',
        field: 'answer',
        message: `MCQ question lacks a valid designated correct answer (index: ${ans.correctOptionIndex}, id: ${ans.correctOptionId}). NEVER silently coerce to Option A.`,
        severity: 'REVIEW_REQUIRED',
      });
    }
  } else if (qType === 'MSQ') {
    const hasIds = Array.isArray(ans.correctOptionIds) && ans.correctOptionIds.length > 0;
    const hasIndices = Array.isArray(ans.correctOptionIndices) && ans.correctOptionIndices.length > 0;
    const hasSets = Array.isArray(ans.correctOptionSets) && ans.correctOptionSets.length > 0;

    if (!hasIds && !hasIndices && !hasSets) {
      issues.push({
        code: 'MISSING_MSQ_ANSWER_SET',
        field: 'answer',
        message: 'MSQ question lacks at least one designated correct option.',
        severity: 'REVIEW_REQUIRED',
      });
    }
  } else if (qType === 'NAT') {
    const hasValue = typeof ans.natValue === 'number' && !isNaN(ans.natValue);
    const hasRange =
      ans.natRange &&
      typeof ans.natRange.min === 'number' &&
      typeof ans.natRange.max === 'number' &&
      ans.natRange.min <= ans.natRange.max;
    const hasRanges =
      Array.isArray(ans.natRanges) &&
      ans.natRanges.length > 0 &&
      ans.natRanges.every((r) => r.min <= r.max);

    if (!hasValue && !hasRange && !hasRanges) {
      issues.push({
        code: 'MISSING_NAT_RANGE',
        field: 'answer',
        message: 'NAT question lacks a valid numeric range or value.',
        severity: 'REVIEW_REQUIRED',
      });
    }
  }

  // 4. Scoring validation
  if (q.scoring) {
    if (typeof q.scoring.marks !== 'number' || q.scoring.marks <= 0) {
      issues.push({
        code: 'INVALID_MARKS',
        field: 'scoring.marks',
        message: `Question marks must be a positive number, got ${q.scoring.marks}.`,
        severity: 'WARNING',
      });
    }
    if (typeof q.scoring.negativeMarks === 'number' && q.scoring.negativeMarks < 0) {
      issues.push({
        code: 'INVALID_NEGATIVE_MARKS',
        field: 'scoring.negativeMarks',
        message: `Negative marks cannot be less than 0, got ${q.scoring.negativeMarks}.`,
        severity: 'WARNING',
      });
    }
  }

  // 5. Assets validation
  if (q.diagramUrl && !q.diagramUrl.startsWith('http') && !q.diagramUrl.startsWith('/')) {
    issues.push({
      code: 'MALFORMED_DIAGRAM_URL',
      field: 'diagramUrl',
      message: `Diagram URL "${q.diagramUrl}" is neither an absolute URL nor a valid web path.`,
      severity: 'REVIEW_REQUIRED',
    });
  }

  // 6. Provenance check for source-based extractions
  const isSourceBased =
    q.sourceType &&
    q.sourceType !== 'Topic' &&
    q.sourceType !== 'Manual';

  if (isSourceBased) {
    const prov = q.provenance;
    const hasSourceHandle =
      prov &&
      (prov.sourceFile ||
        prov.sourceUrl ||
        typeof prov.sourcePage === 'number' ||
        prov.sourceTimestamp ||
        prov.sourceExactText);

    if (!hasSourceHandle) {
      issues.push({
        code: 'MISSING_SOURCE_PROVENANCE',
        field: 'provenance',
        message: `Source-based question from ${q.sourceType} lacks provenance (sourceFile/URL/page/timestamp).`,
        severity: 'REVIEW_REQUIRED',
      });
    }
  }

  // 7. Calculate genuine confidence scores
  const fatalCount = issues.filter((i) => i.severity === 'FATAL').length;
  const reviewCount = issues.filter((i) => i.severity === 'REVIEW_REQUIRED').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;

  let extractionConf = 1.0;
  if (!q.provenance?.sourceExactText && isSourceBased) extractionConf -= 0.15;
  if (cleanStem.length < 20) extractionConf -= 0.2;

  let structureConf = 1.0;
  if (fatalCount > 0) structureConf -= 0.6;
  if (reviewCount > 0) structureConf -= 0.25;
  if (warningCount > 0) structureConf -= 0.1;

  let answerConf = 1.0;
  if (issues.some((i) => i.field === 'answer')) {
    answerConf = 0.0;
  } else if (!q.explanation || q.explanation.trim().length === 0) {
    answerConf -= 0.15;
  }

  let assetConf = 1.0;
  if (issues.some((i) => i.code.includes('ASSET') || i.code.includes('DIAGRAM'))) {
    assetConf = 0.3;
  }

  const confidence: CanonicalConfidence = {
    extraction: Math.max(0, Math.min(1.0, Math.round(extractionConf * 100) / 100)),
    structure: Math.max(0, Math.min(1.0, Math.round(structureConf * 100) / 100)),
    answer: Math.max(0, Math.min(1.0, Math.round(answerConf * 100) / 100)),
    asset: Math.max(0, Math.min(1.0, Math.round(assetConf * 100) / 100)),
  };

  // Determine final status
  let status: VerificationStatus = 'VERIFIED';
  for (const issue of issues) {
    reasons.push(issue.message);
  }

  if (fatalCount > 0) {
    status = 'FAILED';
  } else if (reviewCount > 0) {
    status = 'REVIEW_REQUIRED';
  } else if (warningCount > 0 || answerConf < 0.85 || structureConf < 0.85) {
    status = 'PARTIAL';
  } else {
    status = 'VERIFIED';
  }

  return {
    isValid: fatalCount === 0,
    canPublish: status === 'VERIFIED' || status === 'PARTIAL',
    status,
    reasons,
    issues,
    confidence,
  };
}
