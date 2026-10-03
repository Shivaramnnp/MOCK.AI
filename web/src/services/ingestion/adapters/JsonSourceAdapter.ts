/**
 * Production JSON Source Adapter
 * Mock.AI Production Ingestion Engine - Prompt 10/10
 *
 * Integrates with the versioned JSON streaming engine, supporting mockai.question-set/v1,
 * legacy migrations, strict validation, duplicate detection, and Quality Gate verification.
 */

import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';
import { jsonStreamingImporter, DuplicateHandlingMode } from '../json';

export interface JsonInput {
  jsonText: string;
  sourceTitle?: string;
  duplicateMode?: DuplicateHandlingMode;
}

export class JsonSourceAdapter implements SourceAdapter<JsonInput> {
  readonly sourceType = 'Json';

  async validateInput(input: JsonInput): Promise<{ valid: boolean; error?: string }> {
    if (!input || !input.jsonText || typeof input.jsonText !== 'string' || !input.jsonText.trim()) {
      return { valid: false, error: 'JSON payload text is required.' };
    }
    try {
      JSON.parse(input.jsonText);
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: `Invalid JSON syntax: ${err.message}` };
    }
  }

  async process(input: JsonInput, options?: IngestionOptions): Promise<IngestionResult> {
    const report = await jsonStreamingImporter.importJsonString(input.jsonText, {
      duplicateMode: input.duplicateMode || 'REJECT_DUPLICATES',
      onProgress: options?.onProgress
        ? (p) => options.onProgress?.(p.percent)
        : undefined,
    });

    if (report.failed > 0 && report.imported === 0) {
      const firstError = report.errors[0];
      throw createIngestionError(
        'INVALID_FILE',
        firstError ? `JSON validation failed: ${firstError.message}` : 'JSON import failed.',
        JSON.stringify(report.errors.slice(0, 5)),
        false,
        'JSON_VALIDATION'
      );
    }

    if (report.imported === 0) {
      throw createIngestionError(
        'EXTRACTION_FAILED',
        'JSON document contains no valid questions.',
        'Imported 0 questions',
        false,
        'JSON_EMPTY'
      );
    }

    const title = input.sourceTitle || 'Imported JSON Exam';
    const canonicalQuestions = report.questions;

    // Run quality gate verification on imported questions
    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    canonicalQuestions.forEach((q) => {
      const evalRes = evaluateQualityGate(q);
      evaluations.push(evalRes);

      q.verificationStatus = evalRes.status;
      q.verificationReasons = evalRes.reasons;
      q.confidence = evalRes.confidence;

      if (evalRes.status === 'VERIFIED') verifiedCount++;
      else if (evalRes.status === 'PARTIAL') partialCount++;
      else if (evalRes.status === 'REVIEW_REQUIRED') reviewCount++;
      else if (evalRes.status === 'FAILED') failedCount++;
    });

    return {
      success: canonicalQuestions.length > 0,
      sourceType: 'Json',
      sourceTitle: title,
      questions: canonicalQuestions,
      legacyQuestions: canonicalQuestions.map(toLegacyQuestion),
      qualityReport: {
        total: canonicalQuestions.length,
        verified: verifiedCount,
        partial: partialCount,
        reviewRequired: reviewCount,
        failed: failedCount,
        evaluations,
      },
    };
  }
}
