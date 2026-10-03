/**
 * Image Ingestion Engine Types
 * Schemas for Image Quality Analysis, Preprocessing, Vision Layout, Regions, and Canonical Results.
 */

import { CanonicalAsset, CanonicalQuestion } from '../../../types/canonicalQuestion';

export type ImageQualityRating = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'UNUSABLE';

export interface ImageQualityAssessment {
  blurScore: number; // 0.0 (severely blurry) to 1.0 (crystal sharp)
  contrastRatio: number; // 0.0 (flat/washed out) to 1.0 (crisp dynamic range)
  brightnessMean: number; // 0 (pitch black) to 255 (blown out white)
  skewAngleDegrees: number; // -45 to +45 detected tilt
  detectedOrientation: 0 | 90 | 180 | 270;
  isBlurry: boolean;
  isLowContrast: boolean;
  isSeverelyDegraded: boolean;
  qualityRating: ImageQualityRating;
  userMessage?: string;
}

export type ImageRegionType =
  | 'question_stem'
  | 'option_text'
  | 'option_image'
  | 'diagram'
  | 'graph'
  | 'table'
  | 'formula'
  | 'header'
  | 'divider'
  | 'noise';

export interface ImageBoundingBox {
  x: number; // Pixels from left
  y: number; // Pixels from top
  width: number;
  height: number;
  confidence?: number;
}

export interface ExtractedImageRegion {
  id: string;
  type: ImageRegionType;
  boundingBox: ImageBoundingBox;
  text?: string;
  latex?: string;
  croppedBase64?: string;
  confidence: number;
  ownership?: 'question' | 'option_A' | 'option_B' | 'option_C' | 'option_D' | string;
}

export interface DetectedQuestionUnit {
  questionNumber: number;
  label?: string; // e.g. "Q.1", "Question 2"
  bounds: ImageBoundingBox;
  stemText: string;
  stemLatex?: string;
  options: Array<{
    id: string; // 'A', 'B', 'C', 'D'
    text: string;
    latex?: string;
    isCorrect?: boolean;
    imageAsset?: CanonicalAsset;
  }>;
  correctAnswerId?: string;
  explanation?: string;
  topic?: string;
  subtopic?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'COMPETITIVE';
  diagramAssets: CanonicalAsset[];
  tableBlocks: Array<{
    headers: string[];
    rows: string[][];
    caption?: string;
  }>;
  confidence: number;
}

export interface ImageDocumentIR {
  originalImageHash: string;
  mimeType: string;
  originalDimensions: { width: number; height: number };
  processedDimensions: { width: number; height: number };
  quality: ImageQualityAssessment;
  preprocessedBase64: string;
  detectedQuestions: DetectedQuestionUnit[];
  allAssets: CanonicalAsset[];
  isMultiQuestion: boolean;
  isHandwritten: boolean;
}

export interface ImageIngestionOptions {
  requestedCount?: number;
  maxDimension?: number; // Default 2048px
  minQualityThreshold?: number; // Default 0.35 blur score
  mockQualityAssessment?: Partial<ImageQualityAssessment>;
  mockVisionUnits?: DetectedQuestionUnit[];
  onProgress?: (progress: ImageProgress) => void;
}

export interface ImageProgress {
  stage:
    | 'VALIDATING'
    | 'QUALITY_ANALYSIS'
    | 'PREPROCESSING'
    | 'LAYOUT_DETECTION'
    | 'OCR_VISION'
    | 'STRUCTURE_RECONSTRUCTION'
    | 'VALIDATION'
    | 'COMPLETE';
  message: string;
  percentage: number;
}

export interface ImageIngestionResult {
  success: boolean;
  imageHash: string;
  quality: ImageQualityAssessment;
  documentIR?: ImageDocumentIR;
  questions: CanonicalQuestion[];
  assets: CanonicalAsset[];
  groundingFidelityScore: number;
  latencyMs: number;
  cached: boolean;
  error?: {
    code: string;
    message: string;
    userGuidance?: string;
  };
}
