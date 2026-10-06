/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Layout Engine: 2D Spatial Graph & Reading Flow Builder
 *
 * Constructs 2D topological graph, detects column boundaries,
 * computes spatial relations (ABOVE, BELOW, LEFT_OF, ALIGNED_LEFT, etc.),
 * and establishes deterministic reading flow order across single/multi-column layouts.
 */

import { DocumentIRPage, DocumentIRElement } from '../contracts/documentIR';
import { DocumentGraph, DocumentGraphEdge, DocumentColumnZone, SpatialRelationType } from '../contracts/documentGraph';

export interface SpatialGraphBuilderOptions {
  alignmentTolerancePt?: number; // tolerance in points for ALIGNED_LEFT / ALIGNED_RIGHT (default 4.0)
  baselineTolerancePt?: number;  // tolerance for ALIGNED_BASELINE (default 3.0)
  gutterWidthPt?: number;        // minimal gutter width between columns (default 14.0)
  maxNeighborhoodDistancePt?: number; // max distance to connect adjacency edges (default 400.0)
}

/**
 * Builds a 2D spatial graph from a page of Universal DocumentIR elements.
 */
export function buildPageSpatialGraph(
  documentId: string,
  page: DocumentIRPage,
  options?: SpatialGraphBuilderOptions
): DocumentGraph {
  const alignTol = options?.alignmentTolerancePt ?? 4.0;
  const baseTol = options?.baselineTolerancePt ?? 3.0;
  const gutterWidth = options?.gutterWidthPt ?? 14.0;
  const maxAdjacencyDist = options?.maxNeighborhoodDistancePt ?? 400.0;

  const nodes = new Map<string, DocumentIRElement>();
  for (const el of page.elements) {
    nodes.set(el.elementId, el);
  }

  const pageWidth = page.dimensions.width;
  const pageHeight = page.dimensions.height;

  // 1. Column Detection
  const midX = pageWidth / 2;
  const leftColElements: DocumentIRElement[] = [];
  const rightColElements: DocumentIRElement[] = [];
  const spanningElements: DocumentIRElement[] = [];

  for (const el of page.elements) {
    const isLeft = el.bbox.x1 <= midX - gutterWidth / 2;
    const isRight = el.bbox.x0 >= midX + gutterWidth / 2;

    if (isLeft) {
      leftColElements.push(el);
    } else if (isRight) {
      rightColElements.push(el);
    } else {
      spanningElements.push(el);
    }
  }

  // Detect if genuine two-column layout:
  // Requires significant elements in both left and right, and few spanning elements
  const isTwoColumn =
    leftColElements.length >= 3 &&
    rightColElements.length >= 3 &&
    spanningElements.length <= Math.max(2, (leftColElements.length + rightColElements.length) * 0.25);

  const columns: DocumentColumnZone[] = [];

  if (isTwoColumn) {
    columns.push({
      columnIndex: 0,
      pageNumber: page.pageNumber,
      bounds: {
        minX: Math.min(...leftColElements.map((e) => e.bbox.x0), 0),
        maxX: midX - gutterWidth / 2,
        minY: 0,
        maxY: pageHeight,
      },
      elementIds: leftColElements.map((e) => e.elementId),
    });

    columns.push({
      columnIndex: 1,
      pageNumber: page.pageNumber,
      bounds: {
        minX: midX + gutterWidth / 2,
        maxX: Math.max(...rightColElements.map((e) => e.bbox.x1), pageWidth),
        minY: 0,
        maxY: pageHeight,
      },
      elementIds: rightColElements.map((e) => e.elementId),
    });
  } else {
    // Single Column
    columns.push({
      columnIndex: 0,
      pageNumber: page.pageNumber,
      bounds: {
        minX: 0,
        maxX: pageWidth,
        minY: 0,
        maxY: pageHeight,
      },
      elementIds: page.elements.map((e) => e.elementId),
    });
  }

  // 2. Spatial Edges Calculation
  const edges: DocumentGraphEdge[] = [];
  const elements = page.elements;

  for (let i = 0; i < elements.length; i++) {
    const a = elements[i];

    for (let j = 0; j < elements.length; j++) {
      if (i === j) continue;
      const b = elements[j];

      // A. Containment check
      if (
        b.bbox.x0 >= a.bbox.x0 - 1 &&
        b.bbox.x1 <= a.bbox.x1 + 1 &&
        b.bbox.y0 >= a.bbox.y0 - 1 &&
        b.bbox.y1 <= a.bbox.y1 + 1
      ) {
        edges.push({
          sourceElementId: a.elementId,
          targetElementId: b.elementId,
          relation: 'CONTAINS',
          distancePt: 0,
          weight: 1.0,
        });
        edges.push({
          sourceElementId: b.elementId,
          targetElementId: a.elementId,
          relation: 'INSIDE',
          distancePt: 0,
          weight: 1.0,
        });
      }

      // Calculate center distances
      const aCenterX = (a.bbox.x0 + a.bbox.x1) / 2;
      const aCenterY = (a.bbox.y0 + a.bbox.y1) / 2;
      const bCenterX = (b.bbox.x0 + b.bbox.x1) / 2;
      const bCenterY = (b.bbox.y0 + b.bbox.y1) / 2;

      const dx = bCenterX - aCenterX;
      const dy = bCenterY - aCenterY;
      const euclideanDist = Math.sqrt(dx * dx + dy * dy);

      if (euclideanDist > maxAdjacencyDist) continue;

      // B. Alignment Relations
      if (Math.abs(a.bbox.x0 - b.bbox.x0) <= alignTol) {
        edges.push({
          sourceElementId: a.elementId,
          targetElementId: b.elementId,
          relation: 'ALIGNED_LEFT',
          distancePt: Math.abs(a.bbox.x0 - b.bbox.x0),
          weight: 0.95,
        });
      }

      if (Math.abs(a.bbox.x1 - b.bbox.x1) <= alignTol) {
        edges.push({
          sourceElementId: a.elementId,
          targetElementId: b.elementId,
          relation: 'ALIGNED_RIGHT',
          distancePt: Math.abs(a.bbox.x1 - b.bbox.x1),
          weight: 0.95,
        });
      }

      if (Math.abs(a.bbox.y0 - b.bbox.y0) <= baseTol) {
        edges.push({
          sourceElementId: a.elementId,
          targetElementId: b.elementId,
          relation: 'ALIGNED_BASELINE',
          distancePt: Math.abs(a.bbox.y0 - b.bbox.y0),
          weight: 0.95,
        });
      }

      // C. Positional Direct Adjacency (ABOVE / BELOW / LEFT_OF / RIGHT_OF)
      // Check horizontal overlap for vertical relations:
      const horizOverlap = Math.min(a.bbox.x1, b.bbox.x1) - Math.max(a.bbox.x0, b.bbox.x0);
      if (horizOverlap > 0) {
        // b is directly below a
        if (b.bbox.y0 >= a.bbox.y1 - 2 && b.bbox.y0 - a.bbox.y1 <= 60) {
          edges.push({
            sourceElementId: a.elementId,
            targetElementId: b.elementId,
            relation: 'ABOVE',
            distancePt: Math.max(0, b.bbox.y0 - a.bbox.y1),
            weight: 0.9,
          });
          edges.push({
            sourceElementId: b.elementId,
            targetElementId: a.elementId,
            relation: 'BELOW',
            distancePt: Math.max(0, b.bbox.y0 - a.bbox.y1),
            weight: 0.9,
          });
        }
      }

      // Check vertical overlap for horizontal relations (side-by-side):
      const vertOverlap = Math.min(a.bbox.y1, b.bbox.y1) - Math.max(a.bbox.y0, b.bbox.y0);
      if (vertOverlap > 0) {
        // b is directly to the right of a
        if (b.bbox.x0 >= a.bbox.x1 - 2 && b.bbox.x0 - a.bbox.x1 <= 100) {
          edges.push({
            sourceElementId: a.elementId,
            targetElementId: b.elementId,
            relation: 'LEFT_OF',
            distancePt: Math.max(0, b.bbox.x0 - a.bbox.x1),
            weight: 0.9,
          });
          edges.push({
            sourceElementId: b.elementId,
            targetElementId: a.elementId,
            relation: 'RIGHT_OF',
            distancePt: Math.max(0, b.bbox.x0 - a.bbox.x1),
            weight: 0.9,
          });
        }
      }

      // Column relation
      if (isTwoColumn) {
        const aCol = a.bbox.x1 <= midX ? 0 : 1;
        const bCol = b.bbox.x1 <= midX ? 0 : 1;
        if (aCol === bCol) {
          edges.push({
            sourceElementId: a.elementId,
            targetElementId: b.elementId,
            relation: 'SAME_COLUMN',
            distancePt: euclideanDist,
            weight: 0.8,
          });
        }
      }
    }
  }

  // 3. Compute Deterministic Reading Flow
  const readingFlow: string[] = [];

  if (isTwoColumn) {
    // Sort spanning top banners first
    const topSpanning = spanningElements
      .filter((e) => e.bbox.y1 <= pageHeight * 0.3)
      .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

    for (const e of topSpanning) readingFlow.push(e.elementId);

    // Left column top to bottom
    const sortedLeft = leftColElements.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    for (const e of sortedLeft) readingFlow.push(e.elementId);

    // Right column top to bottom
    const sortedRight = rightColElements.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    for (const e of sortedRight) readingFlow.push(e.elementId);

    // Remaining spanning bottom elements
    const bottomSpanning = spanningElements
      .filter((e) => e.bbox.y1 > pageHeight * 0.3)
      .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

    for (const e of bottomSpanning) readingFlow.push(e.elementId);
  } else {
    // Single column: natural geometric reading order (top-to-bottom, lines sorted left-to-right)
    const sorted = [...page.elements].sort((a, b) => {
      // If approximately on same vertical line (within 4pt), sort by horizontal X
      if (Math.abs(a.bbox.y0 - b.bbox.y0) <= 4.0) {
        return a.bbox.x0 - b.bbox.x0;
      }
      return a.bbox.y0 - b.bbox.y0;
    });

    for (const e of sorted) readingFlow.push(e.elementId);
  }

  return {
    documentId,
    pageNumber: page.pageNumber,
    nodes,
    edges,
    columns,
    readingFlow,
  };
}
