/**
 * Authoritative Test Helpers for BoundingBox2D and DocumentGraph Fixtures
 *
 * Implements strict compliance with the BoundingBox2D, DocumentGraphNode,
 * and DocumentColumnZone contracts for unit and regression testing.
 */

import { BoundingBox2D } from '../contracts/evidence';
import { DocumentGraphNode, DocumentColumnZone } from '../contracts/documentGraph';

export function createMockBbox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  unit: 'pt' | 'px' | 'mm' = 'pt',
  pageWidth?: number,
  pageHeight?: number
): BoundingBox2D {
  return {
    x0,
    y0,
    x1,
    y1,
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
    unit,
    ...(pageWidth !== undefined ? { pageWidth } : {}),
    ...(pageHeight !== undefined ? { pageHeight } : {}),
  };
}

export function createMockDocGraphNode(
  nodeId: string,
  nodeType: DocumentGraphNode['nodeType'],
  pageNumber: number,
  bbox: BoundingBox2D,
  textContent?: string,
  overrides?: Partial<DocumentGraphNode>
): DocumentGraphNode {
  return {
    nodeId,
    elementId: nodeId,
    pageNumber,
    nodeType,
    bbox,
    geometry: {
      bbox,
      rotationDeg: 0,
      transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    },
    textContent,
    evidenceClassification: 'DERIVED_PHYSICAL_OBSERVATION',
    sourceEvidence: {
      sourceSnapshotId: 'mock_snap',
      sourceDocumentId: 'mock_doc',
      sourceObjectId: nodeId,
      resolutionStatus: 'EXACT_SOURCE_BYTE',
    },
    provenance: {
      algorithmId: 'mock_builder',
      algorithmVersion: '1.0.0',
      sourceSnapshotId: 'mock_snap',
      sourceDocumentId: 'mock_doc',
      resolutionStatus: 'EXACT_SOURCE_BYTE',
      createdAt: 1700000000000,
    },
    ...overrides,
  };
}

export function createMockColumnZone(
  columnIndex: number,
  pageNumber: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  elementIds: string[]
): DocumentColumnZone {
  return {
    columnIndex,
    pageNumber,
    bounds,
    elementIds,
  };
}
