import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';
import { processMultiPageScan } from '../camera/multiPageScanner';
import { ScannedPage } from '../camera/types';

export interface CameraInput {
  base64Data?: string;
  pages?: Array<{
    base64Data: string;
    pageNumber?: number;
    width?: number;
    height?: number;
  }>;
  timestamp?: number;
}

export class CameraSourceAdapter implements SourceAdapter<CameraInput> {
  readonly sourceType = 'Camera';

  async validateInput(input: CameraInput): Promise<{ valid: boolean; error?: string }> {
    if (!input) {
      return { valid: false, error: 'Camera input payload is missing.' };
    }

    if (input.pages && input.pages.length > 0) {
      for (let i = 0; i < input.pages.length; i++) {
        const page = input.pages[i];
        if (!page.base64Data) {
          return { valid: false, error: `Camera page ${i + 1} data is missing.` };
        }
        const clean = page.base64Data.includes(',') ? page.base64Data.split(',')[1] : page.base64Data;
        if (clean.length < 80) {
          return { valid: false, error: `Camera page ${i + 1} payload is corrupted or too small.` };
        }
      }
      return { valid: true };
    }

    if (!input.base64Data) {
      return { valid: false, error: 'Camera snapshot data is missing.' };
    }

    const clean = input.base64Data.includes(',') ? input.base64Data.split(',')[1] : input.base64Data;
    if (clean.length < 80) {
      return { valid: false, error: 'Camera snapshot payload is corrupted or too small.' };
    }

    return { valid: true };
  }

  async process(input: CameraInput, options?: IngestionOptions): Promise<IngestionResult> {
    const pagesToProcess: ScannedPage[] = [];

    if (input.pages && input.pages.length > 0) {
      input.pages.forEach((p, idx) => {
        pagesToProcess.push({
          id: `cam-p${idx + 1}-${Date.now()}`,
          pageNumber: p.pageNumber || idx + 1,
          base64Data: p.base64Data,
          width: p.width || 1280,
          height: p.height || 720,
          timestamp: input.timestamp || Date.now(),
        });
      });
    } else if (input.base64Data) {
      pagesToProcess.push({
        id: `cam-p1-${Date.now()}`,
        pageNumber: 1,
        base64Data: input.base64Data,
        width: 1280,
        height: 720,
        timestamp: input.timestamp || Date.now(),
      });
    } else {
      throw createIngestionError(
        'INVALID_FILE',
        'No camera photos available to process.',
        'Camera input contains neither pages nor base64Data.',
        false,
        'CAMERA_INGESTION'
      );
    }

    const batchResult = await processMultiPageScan(pagesToProcess, {
      onProgress: options?.onProgress,
      maxDimension: 2048,
    });

    if (!batchResult.success || batchResult.questions.length === 0) {
      throw createIngestionError(
        'EXTRACTION_FAILED',
        'Unable to detect any valid exam questions from the scanned camera pages.',
        `Camera scan completed across ${pagesToProcess.length} pages but yielded zero questions.`,
        false,
        'CAMERA_INGESTION'
      );
    }

    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    batchResult.questions.forEach((q, idx) => {
      q.questionNumber = idx + 1;
      q.sourceType = 'Camera';
      q.provenance.sourceType = 'Camera';

      const evalRes = evaluateQualityGate(q);
      evaluations.push(evalRes);

      // Check if any summary flagged blur
      const pageSummary = batchResult.pageSummaries.find(
        (ps) => ps.pageNumber === q.provenance.sourcePage
      );
      if (pageSummary?.isBlurry) {
        q.verificationStatus = 'REVIEW_REQUIRED';
        q.verificationReasons = ['Document page had blur; verify extracted symbols.'];
        reviewCount++;
      } else {
        q.verificationStatus = evalRes.status;
        q.verificationReasons = evalRes.reasons;
        q.confidence = evalRes.confidence;

        if (evalRes.status === 'VERIFIED') verifiedCount++;
        else if (evalRes.status === 'PARTIAL') partialCount++;
        else if (evalRes.status === 'REVIEW_REQUIRED') reviewCount++;
        else if (evalRes.status === 'FAILED') failedCount++;
      }
    });

    const pageCountSuffix =
      pagesToProcess.length > 1 ? ` (${pagesToProcess.length} Pages)` : '';

    return {
      success: true,
      sourceType: 'Camera',
      sourceTitle: `Live Camera Scanned Exam${pageCountSuffix}`,
      questions: batchResult.questions,
      legacyQuestions: batchResult.questions.map(toLegacyQuestion),
      qualityReport: {
        total: batchResult.questions.length,
        verified: verifiedCount,
        partial: partialCount,
        reviewRequired: reviewCount,
        failed: failedCount,
        evaluations,
      },
      warnings: batchResult.warnings,
    };
  }
}
