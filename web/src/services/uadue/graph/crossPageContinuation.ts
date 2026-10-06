/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Cross-Page Physical Continuation Detector (Phase 2B)
 *
 * Detects physical layout and geometric compatibility for elements spanning page boundaries.
 *
 * Inviolable Architectural Principle:
 * Identifies strictly CONTINUES_PHYSICALLY.
 * NEVER concludes SAME_QUESTION, SAME_STEM, or SAME_OPTION.
 * Question-level semantic linkage is reserved exclusively for QuestionGraph in Phase 3.
 */

import {
  DocumentGraphNode,
  CrossPageContinuationCandidate,
} from '../contracts/documentGraph';

export interface CrossPageContinuationConfig {
  maxBottomMarginGapPt: number; // default: 80.0 pt (bottom-most element is within 80pt of page bottom)
  maxTopMarginGapPt: number; // default: 90.0 pt (top-most element is within 90pt of page top)
  maxFontSizeDeltaPt: number; // default: 1.5 pt
  minHorizontalOverlapRatio: number; // default: 0.50
  algorithmVersion: string; // default: 'cross_page_cont_v2b'
}

export const DEFAULT_CROSS_PAGE_CONFIG: CrossPageContinuationConfig = {
  maxBottomMarginGapPt: 80.0,
  maxTopMarginGapPt: 90.0,
  maxFontSizeDeltaPt: 1.5,
  minHorizontalOverlapRatio: 0.5,
  algorithmVersion: 'cross_page_cont_v2b_2026',
};

export class CrossPageContinuationDetector {
  private config: CrossPageContinuationConfig;

  constructor(config?: Partial<CrossPageContinuationConfig>) {
    this.config = { ...DEFAULT_CROSS_PAGE_CONFIG, ...config };
  }

  /**
   * Evaluates continuation candidates between adjacent pages.
   */
  public evaluateContinuations(
    fromPageNumber: number,
    toPageNumber: number,
    fromPageNodes: DocumentGraphNode[],
    toPageNodes: DocumentGraphNode[],
    fromPageHeight: number,
    toPageHeight: number
  ): CrossPageContinuationCandidate[] {
    const candidates: CrossPageContinuationCandidate[] = [];

    if (fromPageNodes.length === 0 || toPageNodes.length === 0) {
      return candidates;
    }

    // Identify candidate bottom nodes on fromPage (within maxBottomMarginGapPt of page bottom)
    const bottomNodes = fromPageNodes.filter((n) => {
      const bottomGap = fromPageHeight - n.bbox.y1;
      return bottomGap <= this.config.maxBottomMarginGapPt && n.nodeType === 'TEXT_RUN';
    });

    // Identify candidate top nodes on toPage (within maxTopMarginGapPt of page top)
    const topNodes = toPageNodes.filter((n) => {
      const topGap = n.bbox.y0;
      return topGap <= this.config.maxTopMarginGapPt && n.nodeType === 'TEXT_RUN';
    });

    for (const bNode of bottomNodes) {
      for (const tNode of topNodes) {
        const bottomGap = Math.max(0, fromPageHeight - bNode.bbox.y1);
        const topGap = Math.max(0, tNode.bbox.y0);

        // Check horizontal column lane alignment
        const hOverlap = Math.max(0, Math.min(bNode.bbox.x1, tNode.bbox.x1) - Math.max(bNode.bbox.x0, tNode.bbox.x0));
        const minW = Math.min(bNode.bbox.width, tNode.bbox.width);
        const hRatio = minW > 0 ? hOverlap / minW : 0;

        if (hRatio < this.config.minHorizontalOverlapRatio) {
          continue;
        }

        // Check typography match
        const bSize = bNode.style?.fontSizePt ?? 10.0;
        const tSize = tNode.style?.fontSizePt ?? 10.0;
        const fontSizeDelta = Math.abs(bSize - tSize);

        if (fontSizeDelta > this.config.maxFontSizeDeltaPt) {
          continue;
        }

        const bFont = bNode.style?.fontId;
        const tFont = tNode.style?.fontId;
        const fontMatch = bFont !== undefined && tFont !== undefined ? bFont === tFont : true;

        // Compute compatibility score
        const marginScore = Math.max(
          0.1,
          1.0 - (bottomGap / this.config.maxBottomMarginGapPt + topGap / this.config.maxTopMarginGapPt) / 2
        );
        const fontScore = fontMatch ? 1.0 : 0.8;
        const score = Number((marginScore * 0.4 + hRatio * 0.4 + fontScore * 0.2).toFixed(3));

        if (score >= 0.5) {
          const candidateId = `cont_p${fromPageNumber}_${bNode.nodeId}__p${toPageNumber}_${tNode.nodeId}`;
          candidates.push({
            candidateId,
            fromPageNumber,
            toPageNumber,
            fromNodeId: bNode.nodeId,
            toNodeId: tNode.nodeId,
            relation: 'CONTINUES_PHYSICALLY',
            compatibilityScore: score,
            metrics: {
              bottomMarginDeltaPt: bottomGap,
              topMarginDeltaPt: topGap,
              fontSizeDeltaPt: fontSizeDelta,
              fontMatch,
              columnAlignment: true,
            },
            decisionBasis: `Physical continuation candidate: bottom gap ${bottomGap.toFixed(1)} pt, top gap ${topGap.toFixed(1)} pt, column overlap ${(hRatio * 100).toFixed(0)}%, font size delta ${fontSizeDelta.toFixed(2)} pt`,
          });
        }
      }
    }

    // Sort deterministically by compatibility score descending then by candidateId
    candidates.sort((a, b) => {
      const diff = b.compatibilityScore - a.compatibilityScore;
      if (Math.abs(diff) > 1e-4) return diff;
      return a.candidateId.localeCompare(b.candidateId);
    });

    return candidates;
  }
}
