/**
 * Versioned JSON Schema & Security Validator
 * Mock.AI Production Ingestion Engine - Prompt 10/10
 *
 * Enforces strict, zero-corruption validation for `mockai.question-set/v1`.
 * Prevents prototype pollution, XSS, option tampering, and silent defaults.
 */

import {
  JsonQuestionSetDocument,
  VersionedQuestionV1,
  JsonValidationError,
  JsonImportOptions,
} from './types';
import { checkMathSyntax, validateContentBlock } from '../qualityGate';

const DANGEROUS_PROTO_KEYS = ['__proto__', 'constructor', 'prototype'];
const DANGEROUS_URI_PATTERNS = [/^\s*javascript:/i, /^\s*data:text\/html/i, /^\s*vbscript:/i];

export interface ValidationSummary {
  isValid: boolean;
  errors: JsonValidationError[];
  warnings: JsonValidationError[];
  assetMissingCount: number;
}

export class JsonSchemaValidator {
  /**
   * Sanitizes untrusted object to strip prototype pollution vectors and unsafe URIs.
   */
  sanitizePayload<T>(input: T): T {
    if (input === null || typeof input !== 'object') {
      if (typeof input === 'string') {
        // Strip script tags
        let clean = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        // Defend against javascript: in links
        for (const pattern of DANGEROUS_URI_PATTERNS) {
          if (pattern.test(clean)) {
            clean = '#blocked-unsafe-uri';
            break;
          }
        }
        return clean as unknown as T;
      }
      return input;
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.sanitizePayload(item)) as unknown as T;
    }

    const output: Record<string, any> = {};
    for (const key of Object.keys(input)) {
      if (DANGEROUS_PROTO_KEYS.includes(key)) {
        continue; // Drop prototype pollution keys
      }
      output[key] = this.sanitizePayload((input as any)[key]);
    }

    return output as T;
  }

  /**
   * Validates the document-level envelope.
   */
  validateDocumentEnvelope(doc: any): { valid: boolean; errors: JsonValidationError[] } {
    const errors: JsonValidationError[] = [];

    if (!doc || typeof doc !== 'object') {
      errors.push({
        recordIndex: -1,
        field: 'root',
        code: 'INVALID_DOCUMENT_STRUCTURE',
        message: 'JSON payload must be a root-level JSON object.',
        severity: 'FATAL',
      });
      return { valid: false, errors };
    }

    if (!doc.$schema && !doc.version) {
      errors.push({
        recordIndex: -1,
        field: '$schema',
        code: 'MISSING_SCHEMA_DECLARATION',
        message: 'Document missing required "$schema" or "version" field.',
        severity: 'FATAL',
      });
    }

    if (!Array.isArray(doc.questions)) {
      errors.push({
        recordIndex: -1,
        field: 'questions',
        code: 'MISSING_QUESTIONS_ARRAY',
        message: 'Document must contain a "questions" array.',
        severity: 'FATAL',
      });
    } else if (doc.questions.length === 0) {
      errors.push({
        recordIndex: -1,
        field: 'questions',
        code: 'EMPTY_QUESTIONS_ARRAY',
        message: 'Document "questions" array contains 0 questions.',
        severity: 'FATAL',
      });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates a single question record with strict, no-silent-corruption rules.
   */
  validateQuestionRecord(
    q: VersionedQuestionV1,
    recordIndex: number,
    options?: JsonImportOptions
  ): { errors: JsonValidationError[]; warnings: JsonValidationError[]; assetMissing: boolean } {
    const errors: JsonValidationError[] = [];
    const warnings: JsonValidationError[] = [];
    let assetMissing = false;

    const pushError = (field: string, code: string, message: string) => {
      errors.push({ recordIndex, questionId: q.questionId, field, code, message, severity: 'FATAL' });
    };

    const pushWarning = (field: string, code: string, message: string) => {
      warnings.push({ recordIndex, questionId: q.questionId, field, code, message, severity: 'WARNING' });
    };

    // 1. Question ID & Number
    if (!q.questionId || typeof q.questionId !== 'string' || !q.questionId.trim()) {
      pushError('questionId', 'MISSING_QUESTION_ID', 'Question requires a unique string "questionId".');
    }
    if (typeof q.questionNumber !== 'number' || q.questionNumber <= 0) {
      pushError('questionNumber', 'INVALID_QUESTION_NUMBER', 'questionNumber must be a positive integer.');
    }

    // 2. Question Text & LaTeX Math
    const stem = (q.questionText || '').trim();
    if (!stem) {
      pushError('questionText', 'EMPTY_QUESTION_TEXT', 'questionText is required and cannot be empty.');
    } else {
      const mathIssues = checkMathSyntax(stem);
      if (mathIssues.length > 0) {
        pushWarning('questionText', 'MATH_SYNTAX_WARNING', mathIssues[0].message);
      }
    }

    // 3. Question Type
    const validTypes = ['MCQ', 'MSQ', 'NAT', 'TRUE_FALSE', 'DESCRIPTIVE'];
    if (!q.questionType || !validTypes.includes(q.questionType)) {
      pushError(
        'questionType',
        'INVALID_QUESTION_TYPE',
        `Unsupported questionType: "${q.questionType}". Must be one of: ${validTypes.join(', ')}.`
      );
      return { errors, warnings, assetMissing };
    }

    // 4. Options Validation (NO SILENT PADDING, NO TRUNCATION)
    const opts = q.options || [];
    switch (q.questionType) {
      case 'MCQ': {
        if (opts.length < 2) {
          pushError('options', 'INSUFFICIENT_OPTIONS', `MCQ requires at least 2 options, found ${opts.length}.`);
        }
        break;
      }
      case 'MSQ': {
        if (opts.length < 2) {
          pushError('options', 'INSUFFICIENT_OPTIONS', `MSQ requires at least 2 options, found ${opts.length}.`);
        }
        break;
      }
      case 'TRUE_FALSE': {
        if (opts.length !== 2) {
          pushError('options', 'INVALID_TRUE_FALSE_OPTIONS', `TRUE_FALSE requires exactly 2 options, found ${opts.length}.`);
        }
        break;
      }
      case 'NAT':
      case 'DESCRIPTIVE': {
        // Options optional
        break;
      }
    }

    // Validate options content
    if (opts.length > 0) {
      opts.forEach((opt, oIdx) => {
        if (!opt.id || typeof opt.id !== 'string') {
          pushError(`options[${oIdx}].id`, 'INVALID_OPTION_ID', `Option at index ${oIdx} is missing a string "id".`);
        }
        if (!opt.text?.trim() && !opt.imageUrl && (!opt.contentBlocks || opt.contentBlocks.length === 0)) {
          pushError(`options[${oIdx}].text`, 'EMPTY_OPTION_TEXT', `Option ${opt.id || oIdx + 1} cannot be blank.`);
        }
      });
    }

    // 5. Answer Validation (CRITICAL: NEVER default invalid index to 0!)
    const answer = q.answer;
    if (!answer) {
      pushError('answer', 'MISSING_ANSWER', 'Answer specification is missing.');
    } else {
      switch (q.questionType) {
        case 'MCQ': {
          const hasIndex = typeof answer.correctOptionIndex === 'number';
          const hasId = !!answer.correctOptionId;

          if (!hasIndex && !hasId) {
            pushError('answer', 'MISSING_CORRECT_ANSWER', 'MCQ requires a designated correct option index or ID.');
          } else {
            if (hasIndex && (answer.correctOptionIndex! < 0 || answer.correctOptionIndex! >= opts.length)) {
              // FATAL ERROR: Do NOT silently reset to 0!
              pushError(
                'answer.correctOptionIndex',
                'OUT_OF_BOUNDS_ANSWER_INDEX',
                `correctOptionIndex ${answer.correctOptionIndex} is out of bounds for ${opts.length} options. (Will not default to 0).`
              );
            }
            if (hasId && !opts.some((o) => o.id === answer.correctOptionId)) {
              pushError(
                'answer.correctOptionId',
                'INVALID_CORRECT_OPTION_ID',
                `correctOptionId "${answer.correctOptionId}" does not match any existing option ID.`
              );
            }
          }
          break;
        }

        case 'MSQ': {
          const idsCount = answer.correctOptionIds?.length || 0;
          const indicesCount = answer.correctOptionIndices?.length || 0;
          const boolCount = opts.filter((o) => o.isCorrect).length;

          if (idsCount === 0 && indicesCount === 0 && boolCount === 0) {
            pushError('answer', 'MISSING_MSQ_ANSWERS', 'MSQ question requires at least one correct answer.');
          }
          break;
        }

        case 'NAT': {
          const hasValue = typeof answer.natValue === 'number' && !isNaN(answer.natValue);
          const hasRange =
            answer.natRange &&
            typeof answer.natRange.min === 'number' &&
            typeof answer.natRange.max === 'number' &&
            !isNaN(answer.natRange.min) &&
            !isNaN(answer.natRange.max);

          if (!hasValue && !hasRange) {
            pushError('answer', 'INVALID_NAT_ANSWER', 'NAT requires a numeric value or valid numeric range.');
          } else if (hasRange && answer.natRange!.min > answer.natRange!.max) {
            pushError(
              'answer.natRange',
              'INVERTED_NAT_RANGE',
              `NAT range min (${answer.natRange!.min}) cannot be greater than max (${answer.natRange!.max}).`
            );
          }
          break;
        }

        case 'TRUE_FALSE': {
          const hasCorrect =
            (typeof answer.correctOptionIndex === 'number' && answer.correctOptionIndex >= 0) ||
            !!answer.correctOptionId ||
            opts.some((o) => o.isCorrect);

          if (!hasCorrect) {
            pushError('answer', 'MISSING_TRUE_FALSE_KEY', 'TRUE_FALSE question requires a correct choice.');
          }
          break;
        }
      }
    }

    // 6. Scoring Rules Validation
    const scoring = q.scoring;
    if (!scoring) {
      pushError('scoring', 'MISSING_SCORING', 'Question is missing "scoring" configuration.');
    } else {
      if (typeof scoring.marks !== 'number' || scoring.marks <= 0) {
        pushError('scoring.marks', 'INVALID_MARKS', 'Marks must be a positive number > 0.');
      }
      if (typeof scoring.negativeMarks === 'number' && scoring.negativeMarks < 0) {
        pushError('scoring.negativeMarks', 'INVALID_NEGATIVE_MARKS', 'Negative marks cannot be less than 0.');
      }
    }

    // 7. Content Blocks Validation
    if (Array.isArray(q.contentBlocks)) {
      q.contentBlocks.forEach((block, bIdx) => {
        const issues = validateContentBlock(block, bIdx);
        for (const issue of issues) {
          if (issue.severity === 'FATAL') {
            pushError(`contentBlocks[${bIdx}]`, issue.code, issue.message);
          } else if (issue.severity === 'REVIEW_REQUIRED') {
            pushWarning(`contentBlocks[${bIdx}]`, issue.code, issue.message);
          }
        }
      });
    }

    // 8. Asset Reference Validation
    const assets = q.assets || [];
    const availableAssets = options?.availableAssetIds;

    for (let aIdx = 0; aIdx < assets.length; aIdx++) {
      const asset = assets[aIdx];
      if (availableAssets && asset.assetId && !availableAssets.has(asset.assetId)) {
        assetMissing = true;
        if (options?.assetMode === 'STRICT') {
          pushError(`assets[${aIdx}]`, 'ASSET_MISSING', `Referenced asset "${asset.assetId}" does not exist.`);
        } else {
          pushWarning(`assets[${aIdx}]`, 'ASSET_MISSING', `Referenced asset "${asset.assetId}" is missing.`);
        }
      }
    }

    // 9. Verification Status Rule: NEVER import as VERIFIED without real verification
    if (q.verificationStatus === 'VERIFIED') {
      q.verificationStatus = 'UNVERIFIED';
      pushWarning(
        'verificationStatus',
        'UNVERIFIED_STATUS_ENFORCED',
        'Imported questions cannot be marked VERIFIED without official quality gate verification.'
      );
    }

    return { errors, warnings, assetMissing };
  }
}

export const jsonSchemaValidator = new JsonSchemaValidator();
