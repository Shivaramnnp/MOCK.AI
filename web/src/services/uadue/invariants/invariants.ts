/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Invariant Validation Engine & Fatal Veto Rules
 *
 * Implements deterministic assertions for assessment truth.
 * Non-negotiable principles:
 * 1. Zero-guessing: Hallucinated answers or coercing to Option A is forbidden.
 * 2. Multi-dimensional confidence vector decomposition across 9 orthogonal metrics.
 * 3. Fatal veto rules: An isolated fatal error overrides any arithmetic confidence average.
 * 4. Structural anomalies cleanly route to the 1% Review Queue for human oversight.
 */

import { CanonicalQuestionIR } from '../contracts/canonicalQuestionIR';
import {
  InvariantValidationReport,
  CertificationVerdict,
  ForensicConfidenceVector,
  createDefaultConfidenceVector,
} from '../contracts/certification';

/**
 * Checks for unescaped LaTeX math delimiters ($) and balanced LaTeX parentheses / brackets.
 */
export function checkMathInvariants(text: string): InvariantValidationReport[] {
  const reports: InvariantValidationReport[] = [];
  if (!text) return reports;

  // 1. Single dollar count check (unescaped)
  let singleDollarCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) {
      if (text[i + 1] === '$') {
        i++; // skip double dollar
      } else {
        singleDollarCount++;
      }
    }
  }

  if (singleDollarCount % 2 !== 0) {
    reports.push({
      invariantName: 'UNCLOSED_INLINE_MATH',
      category: 'MATH',
      passed: false,
      message: 'Found odd number of unescaped "$" delimiters (unclosed inline LaTeX math).',
      severity: 'REVIEW_REQUIRED',
    });
  } else {
    reports.push({
      invariantName: 'UNCLOSED_INLINE_MATH',
      category: 'MATH',
      passed: true,
      severity: 'REVIEW_REQUIRED',
    });
  }

  // 2. Bracket pairs: \( vs \) and \[ vs \]
  const openParen = (text.match(/\\\(/g) || []).length;
  const closeParen = (text.match(/\\\)/g) || []).length;
  if (openParen !== closeParen) {
    reports.push({
      invariantName: 'UNBALANCED_LATEX_PARENS',
      category: 'MATH',
      passed: false,
      message: `Unbalanced LaTeX math parentheses: ${openParen} '\\(' vs ${closeParen} '\\)'.`,
      severity: 'REVIEW_REQUIRED',
    });
  }

  const openBracket = (text.match(/\\\[/g) || []).length;
  const closeBracket = (text.match(/\\\]/g) || []).length;
  if (openBracket !== closeBracket) {
    reports.push({
      invariantName: 'UNBALANCED_LATEX_BRACKETS',
      category: 'MATH',
      passed: false,
      message: `Unbalanced LaTeX math brackets: ${openBracket} '\\[' vs ${closeBracket} '\\]'.`,
      severity: 'REVIEW_REQUIRED',
    });
  }

  // 3. Raw ASCII control character check (\x08 \x0c)
  if (/[\x08\x0c]/.test(text)) {
    reports.push({
      invariantName: 'CORRUPTED_ESCAPE_BYTE',
      category: 'MATH',
      passed: false,
      message: 'Detected raw ASCII control character from unescaped LaTeX backslash in JSON.',
      severity: 'REVIEW_REQUIRED',
    });
  }

  return reports;
}

/**
 * Checks for stem leakage / option stem entanglement:
 * Detects if a subsequent question stem or numbering pattern was accidentally absorbed into an option.
 */
export function checkStemLeakageInvariants(q: CanonicalQuestionIR): InvariantValidationReport[] {
  const reports: InvariantValidationReport[] = [];
  const NEXT_QUESTION_PATTERN = /(?:Q(?:uestion)?\.?\s*\d+[:.)\s]|\b\d{1,3}\.\s+[A-Z]|\bQuestion\s+ID\s*:\s*\d+)/i;

  for (const opt of q.options) {
    const text = opt.text || '';
    const hasNextQMatch = NEXT_QUESTION_PATTERN.test(text);

    if (hasNextQMatch && text.length > 40) {
      reports.push({
        invariantName: 'STEM_LEAKAGE_DETECTED',
        category: 'OPTIONS',
        passed: false,
        message: `Option "${opt.key}" contains embedded question header pattern: "${text.slice(0, 60)}...". Potential question boundary corruption.`,
        severity: 'REVIEW_REQUIRED',
      });
    }
  }

  if (reports.length === 0) {
    reports.push({
      invariantName: 'STEM_LEAKAGE_FREE',
      category: 'OPTIONS',
      passed: true,
      severity: 'REVIEW_REQUIRED',
    });
  }

  return reports;
}

/**
 * Validates option integrity:
 * - Dynamic option count (not fixed to 4)
 * - Unique option keys (FATAL if duplicate)
 * - At least 2 options for MCQ/MSQ (REVIEW_REQUIRED if incomplete)
 */
export function checkOptionInvariants(q: CanonicalQuestionIR): InvariantValidationReport[] {
  const reports: InvariantValidationReport[] = [];

  if (q.questionType === 'MCQ' || q.questionType === 'MSQ') {
    if (q.options.length < 2 && !q.answer?.isMta) {
      reports.push({
        invariantName: 'SUFFICIENT_OPTION_COUNT',
        category: 'OPTIONS',
        passed: false,
        message: `MCQ/MSQ must have at least 2 options, found ${q.options.length}.`,
        severity: 'REVIEW_REQUIRED',
      });
    } else {
      reports.push({
        invariantName: 'SUFFICIENT_OPTION_COUNT',
        category: 'OPTIONS',
        passed: true,
        severity: 'REVIEW_REQUIRED',
      });
    }

    // Check key uniqueness (FATAL VETO)
    const keys = q.options.map((o) => o.key.trim().toUpperCase());
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      reports.push({
        invariantName: 'UNIQUE_OPTION_KEYS',
        category: 'OPTIONS',
        passed: false,
        message: `Duplicate option keys found: ${keys.join(', ')}.`,
        severity: 'FATAL',
      });
    } else {
      reports.push({
        invariantName: 'UNIQUE_OPTION_KEYS',
        category: 'OPTIONS',
        passed: true,
        severity: 'FATAL',
      });
    }
  } else if (q.questionType === 'NAT' || q.questionType === 'DESCRIPTIVE') {
    reports.push({
      invariantName: 'OPTIONLESS_VALIDITY',
      category: 'OPTIONS',
      passed: true,
      severity: 'REVIEW_REQUIRED',
    });
  }

  return reports;
}

/**
 * Validates scoring rules:
 * - Marks must be > 0
 * - Negative marks must be >= 0
 */
export function checkScoringInvariants(q: CanonicalQuestionIR): InvariantValidationReport[] {
  const reports: InvariantValidationReport[] = [];

  if (q.scoring.marks <= 0) {
    reports.push({
      invariantName: 'POSITIVE_MARKS',
      category: 'SCORING',
      passed: false,
      message: `Question marks must be strictly positive, got ${q.scoring.marks}.`,
      severity: 'WARNING',
    });
  } else {
    reports.push({
      invariantName: 'POSITIVE_MARKS',
      category: 'SCORING',
      passed: true,
      severity: 'WARNING',
    });
  }

  if (q.scoring.negativeMarks < 0) {
    reports.push({
      invariantName: 'NON_NEGATIVE_PENALTY',
      category: 'SCORING',
      passed: false,
      message: `Negative penalty cannot be negative, got ${q.scoring.negativeMarks}.`,
      severity: 'WARNING',
    });
  } else {
    reports.push({
      invariantName: 'NON_NEGATIVE_PENALTY',
      category: 'SCORING',
      passed: true,
      severity: 'WARNING',
    });
  }

  return reports;
}

/**
 * Validates answer key invariants:
 * - ZERO Option-A coercion!
 * - NAT numeric ranges must have min <= max
 */
export function checkAnswerInvariants(q: CanonicalQuestionIR): InvariantValidationReport[] {
  const reports: InvariantValidationReport[] = [];

  if (!q.answer) {
    return reports;
  }

  if (q.answer.isMta) {
    reports.push({
      invariantName: 'OFFICIAL_MTA_EXEMPTION',
      category: 'ANSWER_KEY',
      passed: true,
      severity: 'REVIEW_REQUIRED',
    });
    return reports;
  }

  if (q.questionType === 'MCQ') {
    const hasValidKey = q.answer.correctKeys && q.answer.correctKeys.length === 1;
    const keyMatches = hasValidKey && q.options.some((o) => o.key.toUpperCase() === q.answer?.correctKeys?.[0]?.toUpperCase());

    if (!keyMatches) {
      reports.push({
        invariantName: 'VALID_MCQ_ANSWER_TARGET',
        category: 'ANSWER_KEY',
        passed: false,
        message: `MCQ answer key "${q.answer.correctKeys?.join(',')}" does not match any valid option in [${q.options.map((o) => o.key).join(', ')}]. Zero Option-A coercion permitted.`,
        severity: 'REVIEW_REQUIRED',
      });
    } else {
      reports.push({
        invariantName: 'VALID_MCQ_ANSWER_TARGET',
        category: 'ANSWER_KEY',
        passed: true,
        severity: 'REVIEW_REQUIRED',
      });
    }
  } else if (q.questionType === 'NAT') {
    const hasRange =
      q.answer.numericRange &&
      typeof q.answer.numericRange.min === 'number' &&
      typeof q.answer.numericRange.max === 'number';

    if (hasRange) {
      if (q.answer.numericRange!.min > q.answer.numericRange!.max) {
        reports.push({
          invariantName: 'VALID_NAT_NUMERIC_RANGE',
          category: 'ANSWER_KEY',
          passed: false,
          message: `Inverted NAT range: min (${q.answer.numericRange!.min}) > max (${q.answer.numericRange!.max}).`,
          severity: 'REVIEW_REQUIRED',
        });
        return reports;
      }
    }

    const hasValue = typeof q.answer.numericValue === 'number' && !isNaN(q.answer.numericValue);
    const validRange = hasRange && q.answer.numericRange!.min <= q.answer.numericRange!.max;

    if (!hasValue && !validRange) {
      reports.push({
        invariantName: 'VALID_NAT_NUMERIC_RANGE',
        category: 'ANSWER_KEY',
        passed: false,
        message: 'NAT question lacks a valid numeric value or inclusive range [min, max].',
        severity: 'REVIEW_REQUIRED',
      });
    } else {
      reports.push({
        invariantName: 'VALID_NAT_NUMERIC_RANGE',
        category: 'ANSWER_KEY',
        passed: true,
        severity: 'REVIEW_REQUIRED',
      });
    }
  }

  return reports;
}

/**
 * Master Invariant Evaluator:
 * Executes all invariant categories, populates the 9-dimensional ForensicConfidenceVector,
 * and enforces non-negotiable Fatal Veto rules.
 */
export function evaluateUadueInvariants(q: CanonicalQuestionIR): CertificationVerdict {
  const mathReports = [
    ...checkMathInvariants(q.prompt.text),
    ...q.options.flatMap((o) => checkMathInvariants(o.text)),
  ];
  const stemLeakageReports = checkStemLeakageInvariants(q);
  const optionReports = checkOptionInvariants(q);
  const scoringReports = checkScoringInvariants(q);
  const answerReports = checkAnswerInvariants(q);

  const allReports: InvariantValidationReport[] = [
    ...mathReports,
    ...stemLeakageReports,
    ...optionReports,
    ...scoringReports,
    ...answerReports,
  ];

  const passed = allReports.filter((r) => r.passed);
  const flagged = allReports.filter((r) => !r.passed);

  // Fatal veto check
  const fatalReport = flagged.find((r) => r.severity === 'FATAL');
  const reviewReport = flagged.find((r) => r.severity === 'REVIEW_REQUIRED');

  // Compute 9-dimensional ForensicConfidenceVector
  const confVector: ForensicConfidenceVector = createDefaultConfidenceVector(1.0);

  // 1. Math confidence
  const mathFailures = mathReports.filter((r) => !r.passed);
  confVector.mathConfidence = mathFailures.length > 0 ? 0.0 : 1.0;

  // 2. Ownership confidence (stem leakage, clean option boundary)
  const ownershipFailures = stemLeakageReports.filter((r) => !r.passed);
  confVector.ownershipConfidence = ownershipFailures.length > 0 ? 0.3 : 1.0;

  // 3. Option / Identity confidence
  const optionFailures = optionReports.filter((r) => !r.passed);
  if (optionFailures.some((r) => r.invariantName === 'UNIQUE_OPTION_KEYS')) {
    confVector.identityConfidence = 0.0;
  }
  if (optionFailures.length > 0) {
    confVector.boundaryConfidence = Math.min(confVector.boundaryConfidence, 0.5);
  }

  // 4. Answer confidence
  const answerFailures = answerReports.filter((r) => !r.passed);
  if (answerFailures.length > 0) {
    confVector.answerConfidence = 0.0;
  }

  // 5. Text confidence (corrupted byte check)
  if (mathReports.some((r) => r.invariantName === 'CORRUPTED_ESCAPE_BYTE' && !r.passed)) {
    confVector.textConfidence = 0.5;
  }

  // UI score
  confVector.uiFidelityScore = (confVector.mathConfidence + confVector.ownershipConfidence + confVector.answerConfidence) / 3;

  let status: 'CERTIFIED' | 'REVIEW_REQUIRED' | 'FAILED' = 'CERTIFIED';
  let confidence = 1.0;
  let fatalVetoTriggered = false;
  let vetoReason: string | undefined = undefined;

  if (fatalReport) {
    status = 'FAILED';
    confidence = 0.0;
    fatalVetoTriggered = true;
    vetoReason = fatalReport.message || fatalReport.invariantName;
  } else if (reviewReport || flagged.length > 0) {
    status = 'REVIEW_REQUIRED';
    confidence = Math.max(0.4, 1.0 - flagged.length * 0.15);
  }

  return {
    status,
    lifecycleState: status === 'CERTIFIED' ? 'CERTIFIED' : status === 'FAILED' ? 'FAILED' : 'REVIEW_REQUIRED',
    confidence,
    confidenceVector: confVector,
    invariantsPassed: passed,
    invariantsFlagged: flagged,
    requiresManualReview: status === 'REVIEW_REQUIRED',
    fatalVetoTriggered,
    vetoReason,
    suggestedAction: status === 'CERTIFIED' ? 'AUTO_PUBLISH' : status === 'FAILED' ? 'REJECT_SOURCE' : 'ENQUEUE_STAFF_REVIEW',
  };
}
