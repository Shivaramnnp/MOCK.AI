/**
 * Image Ingestion Engine Master Orchestrator
 * Pipeline:
 * IMAGE -> VALIDATION -> DECODE -> ORIENTATION -> QUALITY ANALYSIS
 * -> PREPROCESSING -> LAYOUT DETECTION -> OCR / VISION
 * -> STRUCTURE RECONSTRUCTION -> QUESTION DETECTION -> CONTENT BLOCKS
 * -> VALIDATION -> CANONICAL QUESTIONS
 */

import { CanonicalAsset, CanonicalQuestion } from '../../../types/canonicalQuestion';
import {
  ImageDocumentIR,
  ImageIngestionOptions,
  ImageIngestionResult,
  ImageQualityAssessment,
} from './types';
import { analyzeImageQuality, computeImageHash } from './imageQualityAnalyzer';
import { preprocessImage } from './imagePreprocessor';
import { detectImageLayout } from './imageLayoutDetector';
import { buildCanonicalImageQuestion } from './imageQuestionGenerator';
import { imageIngestionCache } from './imageCache';
import { auditBatchDuplicates } from '../topic/topicDeduplicator';

export interface ProcessImageInput {
  base64Data: string;
  mimeType?: string;
  fileName?: string;
  sourceType?: 'Image' | 'Camera';
}

/**
 * Executes the complete Image Ingestion Pipeline.
 */
export async function processImage(
  input: ProcessImageInput | string,
  options: ImageIngestionOptions = {}
): Promise<ImageIngestionResult> {
  const startTime = performance.now();
  const rawBase64 = typeof input === 'string' ? input : input?.base64Data;
  const fileName = typeof input === 'object' ? input?.fileName || 'Uploaded Image' : 'Uploaded Image';
  const sourceType = typeof input === 'object' ? input?.sourceType || 'Image' : 'Image';
  const onProgress = options.onProgress;

  // 1. Validation
  onProgress?.({
    stage: 'VALIDATING',
    message: 'Validating image payload and computing content hash...',
    percentage: 10,
  });

  if (!rawBase64 || typeof rawBase64 !== 'string') {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      success: false,
      imageHash: '',
      quality: {
        blurScore: 0,
        contrastRatio: 0,
        brightnessMean: 0,
        skewAngleDegrees: 0,
        detectedOrientation: 0,
        isBlurry: true,
        isLowContrast: true,
        isSeverelyDegraded: true,
        qualityRating: 'UNUSABLE',
        userMessage: 'Image payload is empty or invalid.',
      },
      questions: [],
      assets: [],
      groundingFidelityScore: 0.0,
      latencyMs,
      cached: false,
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'Image base64 data is empty or missing.',
      },
    };
  }

  const cleanBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
  if (cleanBase64.length < 80) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      success: false,
      imageHash: '',
      quality: {
        blurScore: 0,
        contrastRatio: 0,
        brightnessMean: 0,
        skewAngleDegrees: 0,
        detectedOrientation: 0,
        isBlurry: true,
        isLowContrast: true,
        isSeverelyDegraded: true,
        qualityRating: 'UNUSABLE',
        userMessage: 'Image payload is too small to be a valid image file.',
      },
      questions: [],
      assets: [],
      groundingFidelityScore: 0.0,
      latencyMs,
      cached: false,
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'Image data payload is corrupted or too small.',
      },
    };
  }

  const imageHash = computeImageHash(rawBase64);

  // 2. Cache Lookup
  const cached = imageIngestionCache.get(imageHash);
  if (cached) {
    const latencyMs = Math.round(performance.now() - startTime);
    onProgress?.({
      stage: 'COMPLETE',
      message: 'Retrieved verified visual questions from cache.',
      percentage: 100,
    });

    return {
      success: cached.questions.length > 0,
      imageHash,
      quality: cached.quality,
      questions: cached.questions,
      assets: cached.assets,
      groundingFidelityScore: 1.0,
      latencyMs,
      cached: true,
    };
  }

  // 3. Quality Analysis (Blur, Contrast, Exposure, Orientation)
  onProgress?.({
    stage: 'QUALITY_ANALYSIS',
    message: 'Analyzing image sharpness, contrast, exposure, and orientation...',
    percentage: 25,
  });

  const quality = await analyzeImageQuality(rawBase64, {
    mockAssessment: options.mockQualityAssessment,
  });

  // 4. Preprocessing (Auto-orientation, intelligent resizing, non-destructive contrast)
  onProgress?.({
    stage: 'PREPROCESSING',
    message: 'Applying auto-orientation and dimension optimization...',
    percentage: 40,
  });

  const preprocessed = await preprocessImage(
    rawBase64,
    quality,
    options.maxDimension || 2048
  );

  // 5. Layout & Multi-Question Detection
  onProgress?.({
    stage: 'LAYOUT_DETECTION',
    message: 'Detecting question regions, options, formulas, and diagrams...',
    percentage: 60,
  });

  const layout = await detectImageLayout(
    preprocessed.processedBase64,
    preprocessed.processedDimensions,
    {
      mockVisionUnits: options.mockVisionUnits,
    }
  );

  // 6. Structure Reconstruction & Question Generation
  onProgress?.({
    stage: 'STRUCTURE_RECONSTRUCTION',
    message: `Reconstructing canonical questions across ${layout.questions.length} detected units...`,
    percentage: 80,
  });

  const allQuestions: CanonicalQuestion[] = [];
  const allAssets: CanonicalAsset[] = [...layout.assets];

  for (const unit of layout.questions) {
    const canonicalQ = buildCanonicalImageQuestion({
      unit,
      imageHash,
      quality,
      sourceTitle: fileName,
      sourceType,
    });
    allQuestions.push(canonicalQ);
  }

  // 7. Deduplication Audit
  onProgress?.({
    stage: 'VALIDATION',
    message: 'Running duplicate detection and quality gate audits...',
    percentage: 90,
  });

  const dupAudit = auditBatchDuplicates(allQuestions);
  const duplicateIds = new Set(dupAudit.matches.map((m) => m.questionId));
  const uniqueQuestions = allQuestions.filter((q) => !duplicateIds.has(q.questionId));

  // Re-index monotonically
  uniqueQuestions.forEach((q, idx) => {
    q.questionNumber = idx + 1;
  });

  // Store in Cache
  imageIngestionCache.set(imageHash, quality, uniqueQuestions, allAssets);

  const latencyMs = Math.round(performance.now() - startTime);
  const averageFidelity =
    uniqueQuestions.length > 0
      ? uniqueQuestions.reduce((acc, q) => acc + (q.confidence?.extraction || 1), 0) /
        uniqueQuestions.length
      : 0.0;

  onProgress?.({
    stage: 'COMPLETE',
    message: `Generated ${uniqueQuestions.length} visual questions successfully.`,
    percentage: 100,
  });

  const documentIR: ImageDocumentIR = {
    originalImageHash: imageHash,
    mimeType: typeof input === 'object' ? input.mimeType || 'image/jpeg' : 'image/jpeg',
    originalDimensions: preprocessed.originalDimensions,
    processedDimensions: preprocessed.processedDimensions,
    quality,
    preprocessedBase64: preprocessed.processedBase64,
    detectedQuestions: layout.questions,
    allAssets,
    isMultiQuestion: layout.isMultiQuestion,
    isHandwritten: layout.isHandwritten,
  };

  return {
    success: uniqueQuestions.length > 0,
    imageHash,
    quality,
    documentIR,
    questions: uniqueQuestions,
    assets: allAssets,
    groundingFidelityScore: parseFloat(averageFidelity.toFixed(2)),
    latencyMs,
    cached: false,
    error:
      quality.qualityRating === 'UNUSABLE' || quality.isBlurry
        ? {
            code: 'REVIEW_REQUIRED',
            message: quality.userMessage || 'Image quality is insufficient to reliably extract this question.',
            userGuidance: 'Please retake photo with better lighting and focus.',
          }
        : undefined,
  };
}
