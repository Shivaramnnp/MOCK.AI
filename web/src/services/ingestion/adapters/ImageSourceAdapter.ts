import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { CanonicalQuestion, CanonicalAsset } from '../../../types/canonicalQuestion';
import { aiProviderService } from '../../ai/aiProviderService';
import { parseCanonicalQuestionsJson } from '../../ai/adapters/adapterHelpers';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';

export interface ImageInput {
  base64Data: string;
  mimeType: string;
  fileName?: string;
}

/**
 * Pre-processes image base64 if running in browser with DOM (resizes down to max 2048px).
 */
export async function optimizeImageBase64(
  base64: string,
  maxDimension = 2048
): Promise<{ base64: string; mimeType: string }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { base64, mimeType: 'image/jpeg' };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width <= maxDimension && height <= maxDimension) {
        resolve({ base64, mimeType: 'image/jpeg' });
        return;
      }

      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ base64, mimeType: 'image/jpeg' });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const optimized = canvas.toDataURL('image/jpeg', 0.88);
      resolve({ base64: optimized, mimeType: 'image/jpeg' });
    };
    img.onerror = () => {
      resolve({ base64, mimeType: 'image/jpeg' });
    };
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}

export class ImageSourceAdapter implements SourceAdapter<ImageInput> {
  readonly sourceType = 'Image';

  async validateInput(input: ImageInput): Promise<{ valid: boolean; error?: string }> {
    if (!input || !input.base64Data) {
      return { valid: false, error: 'Image base64 data is required.' };
    }
    const clean = input.base64Data.includes(',') ? input.base64Data.split(',')[1] : input.base64Data;
    if (clean.length < 100) {
      return { valid: false, error: 'Image payload is empty or invalid.' };
    }
    return { valid: true };
  }

  async process(input: ImageInput, options?: IngestionOptions): Promise<IngestionResult> {
    const fileName = input.fileName || 'Uploaded Photo';
    const { base64: optimizedBase64, mimeType } = await optimizeImageBase64(input.base64Data);

    const active = aiProviderService.getActiveAdapter();
    if (!active) {
      throw createIngestionError(
        'AI_PROVIDER_ERROR',
        'No AI provider is configured to perform image vision extraction.',
        'Active adapter missing in aiProviderService',
        false,
        'PROVIDER_SELECTION'
      );
    }

    if (!active.adapter.extractFromBase64File) {
      throw createIngestionError(
        'UNSUPPORTED_FORMAT',
        `Current AI provider (${active.connection.name}) does not support visual document extraction. Please switch to Google Gemini in Settings.`,
        'Active adapter lacks extractFromBase64File method',
        false,
        'CAPABILITY_CHECK'
      );
    }

    let rawQuestions: any[] = [];
    try {
      rawQuestions = await active.adapter.extractFromBase64File(
        optimizedBase64,
        mimeType,
        fileName,
        active.connection
      );
    } catch (err: any) {
      throw createIngestionError(
        'OCR_FAILED',
        `Vision extraction failed on ${fileName}: ${err.message || 'Image processing error'}`,
        err.stack || String(err),
        true,
        'VISION_INFERENCE'
      );
    }

    if (!rawQuestions || rawQuestions.length === 0) {
      throw createIngestionError(
        'EXTRACTION_FAILED',
        `No exam questions could be recognized in ${fileName}. Ensure the image is focused and contains readable text.`,
        'Model returned 0 questions from image',
        false,
        'OCR_RESULT_EMPTY'
      );
    }

    // Convert to canonical questions
    const jsonStr = JSON.stringify({ questions: rawQuestions });
    const questions = parseCanonicalQuestionsJson(jsonStr, {
      sourceType: 'Image',
      sourceFile: fileName,
    });

    // CRITICAL: RETAIN THE SOURCE IMAGE AS AN ASSET! DO NOT DISCARD IT!
    const imageAsset: CanonicalAsset = {
      assetId: `asset-${Date.now()}-img`,
      assetType: 'image',
      assetUrl: optimizedBase64,
      mimeType,
      ownership: 'question',
      caption: `Source figure: ${fileName}`,
    };

    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    questions.forEach((q, index) => {
      q.questionNumber = index + 1;

      // Associate the retained image asset if the question references visual data or if diagramUrl is missing
      if (!q.diagramUrl && questions.length === 1) {
        q.diagramUrl = optimizedBase64;
        q.assets.push(imageAsset);
      }

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
      sourceType: 'Image',
      sourceTitle: `${fileName} - Exam`,
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
