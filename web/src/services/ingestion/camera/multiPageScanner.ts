/**
 * Multi-Page Camera Scanner Manager & Batch Processor
 * Mock.AI Production Ingestion Engine - Prompt 7/10
 *
 * Capabilities:
 * - Multi-page page queue (Page 1, Page 2, Page 3...)
 * - Retake, delete, and reorder pages with contiguous 1-indexed numbering
 * - Aggregates multi-page scans into a unified practice test
 * - Reuses Prompt 6 Image Ingestion Pipeline (processImage)
 * - Preserves page ordering and attaches page provenance to every question
 */

import { CanonicalAsset, CanonicalQuestion } from '../../../types/canonicalQuestion';
import { processImage } from '../image/imageEngine';
import {
  CameraBatchResult,
  CameraProcessOptions,
  PageScanSummary,
  Quad,
  ScannedPage,
} from './types';

export class MultiPageSessionManager {
  private pages: ScannedPage[] = [];

  constructor(initialPages: ScannedPage[] = []) {
    this.pages = [...initialPages];
    this.reindexPages();
  }

  getPages(): ScannedPage[] {
    return [...this.pages];
  }

  getPage(index: number): ScannedPage | undefined {
    return this.pages[index];
  }

  getPageCount(): number {
    return this.pages.length;
  }

  /**
   * Adds a new scanned page to the session.
   */
  addPage(pageData: {
    base64Data: string;
    rawBase64Data?: string;
    detectedQuad?: Quad;
    width: number;
    height: number;
    timestamp?: number;
  }): ScannedPage {
    const pageNumber = this.pages.length + 1;
    const newPage: ScannedPage = {
      id: `cam-page-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      pageNumber,
      base64Data: pageData.base64Data,
      rawBase64Data: pageData.rawBase64Data,
      detectedQuad: pageData.detectedQuad,
      width: pageData.width,
      height: pageData.height,
      timestamp: pageData.timestamp || Date.now(),
    };

    this.pages.push(newPage);
    return newPage;
  }

  /**
   * Replaces an existing page with a newly captured image.
   */
  retakePage(
    pageIndex: number,
    pageData: {
      base64Data: string;
      rawBase64Data?: string;
      detectedQuad?: Quad;
      width: number;
      height: number;
    }
  ): ScannedPage | null {
    if (pageIndex < 0 || pageIndex >= this.pages.length) return null;

    const existing = this.pages[pageIndex];
    const updated: ScannedPage = {
      ...existing,
      base64Data: pageData.base64Data,
      rawBase64Data: pageData.rawBase64Data,
      detectedQuad: pageData.detectedQuad,
      width: pageData.width,
      height: pageData.height,
      timestamp: Date.now(),
    };

    this.pages[pageIndex] = updated;
    return updated;
  }

  /**
   * Deletes a page and re-indexes subsequent pages.
   */
  deletePage(pageIndexOrId: number | string): boolean {
    const index =
      typeof pageIndexOrId === 'number'
        ? pageIndexOrId
        : this.pages.findIndex((p) => p.id === pageIndexOrId);

    if (index < 0 || index >= this.pages.length) return false;

    this.pages.splice(index, 1);
    this.reindexPages();
    return true;
  }

  /**
   * Reorders a page from one index position to another.
   */
  reorderPages(fromIndex: number, toIndex: number): boolean {
    if (
      fromIndex < 0 ||
      fromIndex >= this.pages.length ||
      toIndex < 0 ||
      toIndex >= this.pages.length ||
      fromIndex === toIndex
    ) {
      return false;
    }

    const [moved] = this.pages.splice(fromIndex, 1);
    this.pages.splice(toIndex, 0, moved);
    this.reindexPages();
    return true;
  }

  clear(): void {
    this.pages = [];
  }

  private reindexPages(): void {
    this.pages.forEach((p, idx) => {
      p.pageNumber = idx + 1;
    });
  }
}

/**
 * Aggregates multi-page documents into a single unified practice test.
 * Delegates visual extraction to Prompt 6's imageEngine (processImage).
 */
export async function processMultiPageScan(
  pages: ScannedPage[],
  options: CameraProcessOptions = {}
): Promise<CameraBatchResult> {
  const startTime = performance.now();
  const onProgress = options.onProgress;
  const warnings: string[] = [];

  if (!pages || pages.length === 0) {
    return {
      success: false,
      totalPages: 0,
      questions: [],
      assets: [],
      groundingFidelityScore: 0.0,
      pageSummaries: [],
      latencyMs: Math.round(performance.now() - startTime),
      warnings: ['No pages provided for scanning.'],
    };
  }

  const allQuestions: CanonicalQuestion[] = [];
  const allAssets: CanonicalAsset[] = [];
  const pageSummaries: PageScanSummary[] = [];

  const totalPages = pages.length;

  for (let i = 0; i < totalPages; i++) {
    const page = pages[i];
    const pageNum = page.pageNumber || i + 1;

    onProgress?.({
      stage: 'PROCESSING_PAGE',
      message: `Analyzing scanned page ${pageNum} of ${totalPages}...`,
      percentage: Math.round(((i + 0.1) / totalPages) * 100),
      currentPage: pageNum,
      totalPages,
    });

    const pageResult = await processImage(
      {
        base64Data: page.base64Data,
        mimeType: 'image/jpeg',
        fileName: `Page ${pageNum}`,
        sourceType: 'Camera',
      },
      {
        maxDimension: options.maxDimension,
        mockVisionUnits: options.mockVisionUnits,
        mockQualityAssessment: options.mockQualityAssessment,
      }
    );

    if (pageResult.quality.isBlurry) {
      warnings.push(`Page ${pageNum} has slight motion blur; verify question text.`);
    }
    if (pageResult.quality.isLowContrast) {
      warnings.push(`Page ${pageNum} has low contrast; check for missing symbols.`);
    }

    pageSummaries.push({
      pageNumber: pageNum,
      questionCount: pageResult.questions.length,
      qualityRating: pageResult.quality.qualityRating,
      isBlurry: pageResult.quality.isBlurry,
    });

    // Remap question provenance and ensure sourcePage is accurately assigned
    pageResult.questions.forEach((q, qIdx) => {
      const namespacedId = `cam-p${pageNum}-q${qIdx + 1}`;
      const canonicalQ: CanonicalQuestion = {
        ...q,
        questionId: namespacedId,
        sourceType: 'Camera',
        provenance: {
          ...q.provenance,
          sourceType: 'Camera',
          sourceFile: `Camera Scan (Page ${pageNum})`,
          sourcePage: pageNum,
          extractionTimestamp: page.timestamp || Date.now(),
        },
      };
      allQuestions.push(canonicalQ);
    });

    // Remap assets
    pageResult.assets.forEach((asset) => {
      const namespacedAsset: CanonicalAsset = {
        ...asset,
        assetId: `cam-p${pageNum}-${asset.assetId}`,
      };
      allAssets.push(namespacedAsset);
    });
  }

  // Renumber questions monotonically across all pages (1..N)
  allQuestions.forEach((q, idx) => {
    q.questionNumber = idx + 1;
  });

  const averageFidelity =
    allQuestions.length > 0
      ? allQuestions.reduce((acc, q) => acc + (q.confidence?.extraction || 1), 0) /
        allQuestions.length
      : 0.0;

  onProgress?.({
    stage: 'COMPLETE',
    message: `Completed processing ${totalPages} pages. Generated ${allQuestions.length} questions.`,
    percentage: 100,
  });

  const latencyMs = Math.round(performance.now() - startTime);

  return {
    success: allQuestions.length > 0,
    totalPages,
    questions: allQuestions,
    assets: allAssets,
    groundingFidelityScore: parseFloat(averageFidelity.toFixed(2)),
    pageSummaries,
    latencyMs,
    warnings,
  };
}
