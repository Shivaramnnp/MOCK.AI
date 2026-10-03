/**
 * Camera Document Scanner Type Definitions
 * Mock.AI Production Ingestion Engine - Prompt 7/10
 */

import { CanonicalAsset, CanonicalQuestion } from '../../../types/canonicalQuestion';
import { ImageQualityAssessment } from '../image/types';

export interface Point {
  x: number;
  y: number;
}

/**
 * Ordered 4-point quadrilateral:
 * [0]: Top-Left
 * [1]: Top-Right
 * [2]: Bottom-Right
 * [3]: Bottom-Left
 */
export type Quad = [Point, Point, Point, Point];

export type CameraGuidance =
  | 'SEARCHING'
  | 'DOCUMENT_DETECTED'
  | 'MOVE_CLOSER'
  | 'MOVE_FARTHER'
  | 'HOLD_STEADY'
  | 'TOO_DARK'
  | 'TOO_BLURRY'
  | 'READY_TO_CAPTURE';

export interface CameraFrameAnalysis {
  detectedQuad: Quad | null;
  hasDocument: boolean;
  quadAreaRatio: number;
  brightness: number; // 0 - 255
  blurScore: number; // Higher is sharper
  isDark: boolean;
  isBlurry: boolean;
  isStable: boolean;
  stabilityScore: number; // 0 - 100
  guidance: CameraGuidance;
  guidanceMessage: string;
  isReadyForAutoCapture: boolean;
}

export interface ScannedPage {
  id: string;
  pageNumber: number;
  base64Data: string; // Cropped & perspective-corrected image data URL
  rawBase64Data?: string; // Original full viewfinder image data URL
  detectedQuad?: Quad;
  timestamp: number;
  width: number;
  height: number;
  quality?: Partial<ImageQualityAssessment>;
}

export interface CameraProcessOptions {
  onProgress?: (progress: {
    stage: string;
    message: string;
    percentage: number;
    currentPage?: number;
    totalPages?: number;
  }) => void;
  maxDimension?: number;
  mockVisionUnits?: any[];
  mockQualityAssessment?: any;
}

export interface PageScanSummary {
  pageNumber: number;
  questionCount: number;
  qualityRating: string;
  isBlurry: boolean;
}

export interface CameraBatchResult {
  success: boolean;
  totalPages: number;
  questions: CanonicalQuestion[];
  assets: CanonicalAsset[];
  groundingFidelityScore: number;
  pageSummaries: PageScanSummary[];
  latencyMs: number;
  warnings: string[];
}
