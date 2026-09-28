import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { toCanonicalQuestion, toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { extractJsonPayload } from '../../ai/adapters/adapterHelpers';
import { createIngestionError } from '../../../types/ingestionErrors';

export interface JsonInput {
  jsonText: string;
  sourceTitle?: string;
}

export class JsonSourceAdapter implements SourceAdapter<JsonInput> {
  readonly sourceType = 'Json';

  async validateInput(input: JsonInput): Promise<{ valid: boolean; error?: string }> {
    if (!input || !input.jsonText || typeof input.jsonText !== 'string' || !input.jsonText.trim()) {
      return { valid: false, error: 'JSON payload text is required.' };
    }
    try {
      extractJsonPayload(input.jsonText);
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: `Invalid JSON syntax: ${err.message}` };
    }
  }

  async process(input: JsonInput, options?: IngestionOptions): Promise<IngestionResult> {
    let parsed: any;
    try {
      parsed = extractJsonPayload(input.jsonText);
    } catch (err: any) {
      throw createIngestionError(
        'INVALID_FILE',
        `Failed to parse JSON file: ${err.message}`,
        err.stack || String(err),
        false,
        'JSON_PARSE'
      );
    }

    const rawList: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.questions)
      ? parsed.questions
      : [];

    if (rawList.length === 0) {
      throw createIngestionError(
        'EXTRACTION_FAILED',
        'JSON document contains no valid questions or question array.',
        'Array is empty',
        false,
        'JSON_VALIDATION'
      );
    }

    const title = input.sourceTitle || parsed.title || parsed.examName || 'Imported JSON Exam';
    const canonicalQuestions: CanonicalQuestion[] = rawList.map((rawQ, idx) => {
      // If it already is a CanonicalQuestion format
      if (rawQ.questionId && rawQ.contentBlocks && rawQ.answer) {
        return {
          ...rawQ,
          questionNumber: rawQ.questionNumber || idx + 1,
        };
      }

      // Otherwise convert via toCanonicalQuestion
      const migrated = toCanonicalQuestion(rawQ, {
        sourceType: 'Json',
        sourceFile: title,
        jsonPointer: `/questions/${idx}`,
      });
      migrated.questionNumber = rawQ.questionNumber || idx + 1;
      return migrated;
    });

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
