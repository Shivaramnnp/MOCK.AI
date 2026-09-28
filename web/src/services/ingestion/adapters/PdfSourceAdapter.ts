import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { aiProviderService } from '../../ai/aiProviderService';
import { parseCanonicalQuestionsJson } from '../../ai/adapters/adapterHelpers';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';

export interface PdfInput {
  base64Data: string;
  fileName: string;
  byteSize?: number;
}

export class PdfSourceAdapter implements SourceAdapter<PdfInput> {
  readonly sourceType = 'PDF';

  async validateInput(input: PdfInput): Promise<{ valid: boolean; error?: string }> {
    if (!input || !input.base64Data) {
      return { valid: false, error: 'PDF data is required.' };
    }
    const clean = input.base64Data.includes(',') ? input.base64Data.split(',')[1] : input.base64Data;
    if (clean.length < 100) {
      return { valid: false, error: 'PDF payload is empty or invalid.' };
    }
    // Check 20MB payload limit (base64 size ~ 28MB)
    if (clean.length > 28 * 1024 * 1024) {
      return {
        valid: false,
        error: 'PDF file is larger than 20MB. Please split the document into smaller chapters before uploading.',
      };
    }
    return { valid: true };
  }

  async process(input: PdfInput, options?: IngestionOptions): Promise<IngestionResult> {
    const fileName = input.fileName || 'Uploaded Exam Document.pdf';
    const cleanBase64 = input.base64Data.includes(',') ? input.base64Data.split(',')[1] : input.base64Data;

    const active = aiProviderService.getActiveAdapter();
    if (!active) {
      throw createIngestionError(
        'AI_PROVIDER_ERROR',
        'No AI provider is configured to parse PDF documents. Please configure a provider in Settings.',
        'Active adapter is missing',
        false,
        'PROVIDER_SELECTION'
      );
    }

    if (!active.adapter.extractFromBase64File) {
      throw createIngestionError(
        'UNSUPPORTED_FORMAT',
        `Current AI provider (${active.connection.name}) does not support PDF vision/document extraction. Please switch to Google Gemini in Settings.`,
        'Active adapter lacks extractFromBase64File method',
        false,
        'CAPABILITY_CHECK'
      );
    }

    let rawQuestions: any[] = [];
    try {
      rawQuestions = await active.adapter.extractFromBase64File(
        cleanBase64,
        'application/pdf',
        fileName,
        active.connection
      );
    } catch (err: any) {
      throw createIngestionError(
        'EXTRACTION_FAILED',
        `PDF extraction failed on ${fileName}: ${err.message || 'Processing error'}`,
        err.stack || String(err),
        true,
        'PDF_INFERENCE'
      );
    }

    if (!rawQuestions || rawQuestions.length === 0) {
      throw createIngestionError(
        'EXTRACTION_FAILED',
        `No exam questions could be extracted from ${fileName}. The PDF may be scanned at low resolution or be encrypted.`,
        'Model returned 0 questions from PDF',
        false,
        'EMPTY_PDF_EXTRACTION'
      );
    }

    const jsonStr = JSON.stringify({ questions: rawQuestions });
    const questions = parseCanonicalQuestionsJson(jsonStr, {
      sourceType: 'PDF',
      sourceFile: fileName,
    });

    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    questions.forEach((q, index) => {
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
      success: questions.length > 0,
      sourceType: 'PDF',
      sourceTitle: `${fileName.replace(/\.pdf$/i, '')} - Exam`,
      questions,
      legacyQuestions: questions.map(toLegacyQuestion),
      qualityReport: {
        total: questions.length,
        verified: verifiedCount,
        partial: partialCount,
        reviewRequired: reviewCount,
        failed: failedCount,
        evaluations,
      },
    };
  }
}
