import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError, IngestionErrorCode } from '../../../types/ingestionErrors';
import { isSafePublicUrl, validateWebUrl } from '../web/urlSecurity';
import { extractCleanArticleText } from '../web/htmlParser';
import { processWebUrl } from '../web/webEngine';

export { isSafePublicUrl } from '../web/urlSecurity';
export { extractCleanArticleText } from '../web/htmlParser';

export interface WebUrlInput {
  url: string;
}

export class WebUrlSourceAdapter implements SourceAdapter<WebUrlInput> {
  readonly sourceType = 'WebUrl';

  async validateInput(input: WebUrlInput): Promise<{ valid: boolean; error?: string }> {
    if (!input || !input.url) {
      return { valid: false, error: 'Web URL is required.' };
    }
    const check = validateWebUrl(input.url);
    if (!check.safe) {
      return { valid: false, error: check.reason || 'Prohibited URL address.' };
    }
    return { valid: true };
  }

  async process(input: WebUrlInput, options?: IngestionOptions): Promise<IngestionResult> {
    const res = await processWebUrl(input, {
      requestedCount: options?.requestedCount || 6,
      difficulty: options?.difficulty,
      onProgress: options?.onProgress,
    });

    if (!res.success || res.questions.length === 0) {
      const errCode = res.error?.code || 'SOURCE_UNAVAILABLE';
      let mappedCode: IngestionErrorCode = 'EXTRACTION_FAILED';

      if (errCode === 'SSRF_BLOCKED' || errCode === 'REDIRECT_SSRF_BLOCKED') {
        mappedCode = 'SSRF_BLOCKED';
      } else if (errCode === 'ACCESS_DENIED' || errCode === 'SOURCE_UNAVAILABLE' || errCode === 'RATE_LIMITED') {
        mappedCode = 'SOURCE_UNAVAILABLE';
      }

      throw createIngestionError(
        mappedCode,
        res.error?.message || `Failed to extract knowledge from ${input.url}`,
        `Web Ingestion failed with code ${errCode}: ${res.error?.message}`,
        false,
        'WEB_INGESTION'
      );
    }

    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    res.questions.forEach((q, index) => {
      q.questionNumber = index + 1;
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
      success: res.questions.length > 0,
      sourceType: 'WebUrl',
      sourceTitle: `${res.title} - Mock Exam`,
      questions: res.questions,
      legacyQuestions: res.questions.map(toLegacyQuestion),
      qualityReport: {
        total: res.questions.length,
        verified: verifiedCount,
        partial: partialCount,
        reviewRequired: reviewCount,
        failed: failedCount,
        evaluations,
      },
    };
  }
}
