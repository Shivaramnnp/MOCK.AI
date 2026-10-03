import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError, IngestionErrorCode } from '../../../types/ingestionErrors';
import { processImage } from '../image/imageEngine';

export interface ImageInput {
  base64Data: string;
  mimeType: string;
  fileName?: string;
}

/**
 * Pre-processes image base64 if running in browser with DOM (resizes down to max 2048px).
 * Backward-compatible helper.
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

    const res = await processImage(
      {
        base64Data: input.base64Data,
        mimeType: input.mimeType || 'image/jpeg',
        fileName,
        sourceType: 'Image',
      },
      {
        requestedCount: options?.requestedCount || 6,
        onProgress: options?.onProgress,
      }
    );

    if (!res.success || res.questions.length === 0) {
      const errCode: IngestionErrorCode =
        res.error?.code === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'EXTRACTION_FAILED';

      throw createIngestionError(
        errCode,
        res.error?.message || 'Unable to extract questions from this image.',
        `Image ingestion failed with code ${res.error?.code}: ${res.error?.message}`,
        false,
        'IMAGE_INGESTION'
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

      // If the image quality analyzer marked it as REVIEW_REQUIRED, preserve that status
      if (res.quality.isBlurry || res.quality.qualityRating === 'UNUSABLE') {
        q.verificationStatus = 'REVIEW_REQUIRED';
        q.verificationReasons = [
          res.quality.userMessage || 'Image quality is insufficient to reliably extract this question.',
        ];
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

    return {
      success: res.questions.length > 0,
      sourceType: 'Image',
      sourceTitle: `${fileName} - Mock Exam`,
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
