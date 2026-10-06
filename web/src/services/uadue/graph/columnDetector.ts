/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Multi-Column & Layout Region Detector (Phase 2B)
 *
 * Purely geometry-driven column and layout region detection.
 * Operates without exam names, question numbers, templates, or exam-specific regexes.
 * Supports single-column, symmetric two-column, asymmetric columns, and multi-column layouts,
 * with explicit recording of competing physical layout hypotheses for ambiguous pages.
 */

import { BoundingBox2D } from '../contracts/evidence';
import {
  DocumentGraphNode,
  DocumentColumnZone,
  SpatialRegion,
  SpatialRegionHypothesis,
} from '../contracts/documentGraph';

export interface ColumnDetectorConfig {
  minGutterWidthPt: number; // default: 12.0 pt
  maxHeaderZoneHeightPt: number; // default: 120.0 pt
  maxFooterZoneHeightPt: number; // default: 80.0 pt
  minElementsPerColumn: number; // default: 3
  maxSpanningElementRatio: number; // default: 0.25
  spanningWidthRatio: number; // default: 0.65 (element covering > 65% of page width is considered spanning)
  algorithmVersion: string; // default: 'col_det_v2b_2026'
}

export const DEFAULT_COLUMN_CONFIG: ColumnDetectorConfig = {
  minGutterWidthPt: 12.0,
  maxHeaderZoneHeightPt: 120.0,
  maxFooterZoneHeightPt: 80.0,
  minElementsPerColumn: 3,
  maxSpanningElementRatio: 0.25,
  spanningWidthRatio: 0.65,
  algorithmVersion: 'col_det_v2b_2026',
};

export interface ColumnDetectionResult {
  pageNumber: number;
  columns: DocumentColumnZone[];
  spatialRegions: SpatialRegion[];
  nodeToColumnMap: Map<string, number>;
  nodeToRegionMap: Map<string, string>;
  layoutHypotheses: SpatialRegionHypothesis[];
}

export class ColumnDetector {
  private config: ColumnDetectorConfig;

  constructor(config?: Partial<ColumnDetectorConfig>) {
    this.config = { ...DEFAULT_COLUMN_CONFIG, ...config };
  }

  /**
   * Evaluates layout columns and spatial regions for a page of nodes.
   */
  public detectPageLayout(
    pageNumber: number,
    pageWidth: number,
    pageHeight: number,
    nodes: DocumentGraphNode[]
  ): ColumnDetectionResult {
    const nodeToColumnMap = new Map<string, number>();
    const nodeToRegionMap = new Map<string, string>();

    if (nodes.length === 0) {
      const singleCol: DocumentColumnZone = {
        columnIndex: 0,
        pageNumber,
        bounds: { minX: 0, maxX: pageWidth, minY: 0, maxY: pageHeight },
        elementIds: [],
        gutterWidthPt: 0,
        confidence: 1.0,
      };
      return {
        pageNumber,
        columns: [singleCol],
        spatialRegions: [],
        nodeToColumnMap,
        nodeToRegionMap,
        layoutHypotheses: [{ hypothesisId: 'EMPTY_PAGE', description: 'No physical elements', score: 1.0 }],
      };
    }

    // 1. Identify Spanning Header & Footer Nodes
    const headerNodeIds: string[] = [];
    const footerNodeIds: string[] = [];
    const bodyNodes: DocumentGraphNode[] = [];

    const footerThresholdY = pageHeight - this.config.maxFooterZoneHeightPt;

    for (const node of nodes) {
      const isHeaderY = node.bbox.y1 <= this.config.maxHeaderZoneHeightPt;
      const isFooterY = node.bbox.y0 >= footerThresholdY;
      const isWideSpanning = node.bbox.width >= pageWidth * this.config.spanningWidthRatio;

      if (isHeaderY && isWideSpanning) {
        headerNodeIds.push(node.nodeId);
      } else if (isFooterY && isWideSpanning) {
        footerNodeIds.push(node.nodeId);
      } else {
        bodyNodes.push(node);
      }
    }

    // 2. Compute Horizontal Whitespace Gutters Across Body Elements
    const bodyElements = bodyNodes.length >= 4 ? bodyNodes : nodes;
    const gutters = this.findVerticalWhitespaceGutters(bodyElements, pageWidth);

    const layoutHypotheses: SpatialRegionHypothesis[] = [];
    const columns: DocumentColumnZone[] = [];
    const spatialRegions: SpatialRegion[] = [];

    // Filter gutters that have significant elements on both sides
    const validGutters = gutters.filter((g) => {
      const leftCount = bodyElements.filter((n) => n.bbox.x1 <= g.startX + 1.0).length;
      const rightCount = bodyElements.filter((n) => n.bbox.x0 >= g.endX - 1.0).length;
      return leftCount >= 1 && rightCount >= 1;
    });

    if (validGutters.length >= 1) {
      // General N-Column Layout (2-column, 3-column, etc.)
      validGutters.sort((a, b) => a.startX - b.startX);
      const numCols = validGutters.length + 1;
      const colNodes: string[][] = Array.from({ length: numCols }, () => []);
      const spanningBodyNodes: string[] = [];

      for (const node of bodyElements) {
        let assignedCol = -1;
        for (let c = 0; c < numCols; c++) {
          const leftBound = c === 0 ? -Infinity : validGutters[c - 1].endX - 2.0;
          const rightBound = c === numCols - 1 ? Infinity : validGutters[c].startX + 2.0;
          if (node.bbox.x0 >= leftBound && node.bbox.x1 <= rightBound) {
            assignedCol = c;
            break;
          }
        }

        if (assignedCol !== -1) {
          colNodes[assignedCol].push(node.nodeId);
          nodeToColumnMap.set(node.nodeId, assignedCol);
        } else {
          spanningBodyNodes.push(node.nodeId);
          // Assign spanning node to nearest column by center distance
          const midX = (node.bbox.x0 + node.bbox.x1) / 2;
          let nearestCol = 0;
          let minDist = Infinity;
          for (let c = 0; c < numCols; c++) {
            const colMid =
              c === 0
                ? validGutters[0].startX / 2
                : c === numCols - 1
                ? (validGutters[c - 1].endX + pageWidth) / 2
                : (validGutters[c - 1].endX + validGutters[c].startX) / 2;
            const dist = Math.abs(midX - colMid);
            if (dist < minDist) {
              minDist = dist;
              nearestCol = c;
            }
          }
          colNodes[nearestCol].push(node.nodeId);
          nodeToColumnMap.set(node.nodeId, nearestCol);
        }
      }

      const spanningRatio = bodyElements.length > 0 ? spanningBodyNodes.length / bodyElements.length : 0;
      const colScore = Math.max(0.1, 1.0 - spanningRatio * 2.0);
      const singleColScore = Math.min(0.9, 0.2 + spanningRatio);

      const hypothesisType =
        numCols === 2
          ? Math.abs((validGutters[0].startX + validGutters[0].endX) / 2 - pageWidth / 2) <= pageWidth * 0.12
            ? 'TWO_COLUMN_SYMMETRIC'
            : 'TWO_COLUMN_ASYMMETRIC'
          : `${numCols}_COLUMN_LAYOUT`;

      layoutHypotheses.push({
        hypothesisId: hypothesisType,
        description: `${numCols} columns divided by ${validGutters.length} vertical gutter(s)`,
        score: colScore,
      });
      layoutHypotheses.push({
        hypothesisId: 'SINGLE_COLUMN',
        description: `Alternative single-column layout hypothesis (spanning ratio ${(spanningRatio * 100).toFixed(1)}%)`,
        score: singleColScore,
      });

      // Construct Column Zones & Spatial Regions
      for (let c = 0; c < numCols; c++) {
        const minX = c === 0 ? 0 : validGutters[c - 1].endX;
        const maxX = c === numCols - 1 ? pageWidth : validGutters[c].startX;
        const gutterWidth = c < validGutters.length ? validGutters[c].width : validGutters[c - 1]?.width || 0;

        columns.push({
          columnIndex: c,
          pageNumber,
          bounds: { minX, maxX, minY: 0, maxY: pageHeight },
          elementIds: colNodes[c],
          gutterWidthPt: gutterWidth,
          confidence: colScore,
        });

        const regionId = `reg_p${pageNumber}_col${c}`;
        spatialRegions.push({
          regionId,
          pageNumber,
          regionType: 'COLUMN',
          bbox: { x0: minX, y0: 0, x1: maxX, y1: pageHeight, width: maxX - minX, height: pageHeight, unit: 'pt' },
          containedNodeIds: colNodes[c],
          confidence: colScore,
        });

        for (const id of colNodes[c]) {
          nodeToRegionMap.set(id, regionId);
        }
      }
    } else {
      // Single-Column Layout
      const allElementIds = nodes.map((n) => n.nodeId);
      for (const id of allElementIds) {
        nodeToColumnMap.set(id, 0);
        nodeToRegionMap.set(id, `reg_p${pageNumber}_body`);
      }

      columns.push({
        columnIndex: 0,
        pageNumber,
        bounds: { minX: 0, maxX: pageWidth, minY: 0, maxY: pageHeight },
        elementIds: allElementIds,
        gutterWidthPt: 0,
        confidence: 0.95,
      });

      spatialRegions.push({
        regionId: `reg_p${pageNumber}_body`,
        pageNumber,
        regionType: 'BODY_ZONE',
        bbox: { x0: 0, y0: 0, x1: pageWidth, y1: pageHeight, width: pageWidth, height: pageHeight, unit: 'pt' },
        containedNodeIds: allElementIds,
        confidence: 0.95,
      });

      layoutHypotheses.push({
        hypothesisId: 'SINGLE_COLUMN',
        description: 'Single continuous full-page column flow',
        score: 0.95,
      });
    }

    // Add Header and Footer Spatial Regions if detected
    if (headerNodeIds.length > 0) {
      spatialRegions.push({
        regionId: `reg_p${pageNumber}_header`,
        pageNumber,
        regionType: 'HEADER_ZONE',
        bbox: { x0: 0, y0: 0, x1: pageWidth, y1: this.config.maxHeaderZoneHeightPt, width: pageWidth, height: this.config.maxHeaderZoneHeightPt, unit: 'pt' },
        containedNodeIds: headerNodeIds,
        confidence: 0.90,
      });
      for (const id of headerNodeIds) nodeToRegionMap.set(id, `reg_p${pageNumber}_header`);
    }

    if (footerNodeIds.length > 0) {
      spatialRegions.push({
        regionId: `reg_p${pageNumber}_footer`,
        pageNumber,
        regionType: 'FOOTER_ZONE',
        bbox: { x0: 0, y0: footerThresholdY, x1: pageWidth, y1: pageHeight, width: pageWidth, height: pageHeight - footerThresholdY, unit: 'pt' },
        containedNodeIds: footerNodeIds,
        confidence: 0.90,
      });
      for (const id of footerNodeIds) nodeToRegionMap.set(id, `reg_p${pageNumber}_footer`);
    }

    return {
      pageNumber,
      columns,
      spatialRegions,
      nodeToColumnMap,
      nodeToRegionMap,
      layoutHypotheses,
    };
  }

  /**
   * Finds vertical whitespace gutters spanning the elements on a page.
   */
  private findVerticalWhitespaceGutters(
    elements: DocumentGraphNode[],
    pageWidth: number
  ): { startX: number; endX: number; width: number }[] {
    if (elements.length < 3) return [];

    // Discretize the horizontal axis into 2-pt bins
    const binSize = 2.0;
    const binCount = Math.ceil(pageWidth / binSize);
    const occupancy = new Uint16Array(binCount);

    // Margins (ignore outer 5% of page edges)
    const minBin = Math.floor((pageWidth * 0.05) / binSize);
    const maxBin = Math.floor((pageWidth * 0.95) / binSize);

    for (const el of elements) {
      const b0 = Math.max(0, Math.floor(el.bbox.x0 / binSize));
      const b1 = Math.min(binCount - 1, Math.ceil(el.bbox.x1 / binSize));
      for (let b = b0; b <= b1; b++) {
        occupancy[b]++;
      }
    }

    const gutters: { startX: number; endX: number; width: number }[] = [];
    let currentGutterStart: number | null = null;

    for (let b = minBin; b <= maxBin; b++) {
      if (occupancy[b] === 0) {
        if (currentGutterStart === null) {
          currentGutterStart = b;
        }
      } else {
        if (currentGutterStart !== null) {
          const width = (b - currentGutterStart) * binSize;
          if (width >= this.config.minGutterWidthPt) {
            gutters.push({
              startX: currentGutterStart * binSize,
              endX: b * binSize,
              width,
            });
          }
          currentGutterStart = null;
        }
      }
    }

    return gutters;
  }
}
