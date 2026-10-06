/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Universal Document Graph (Phase 2B)
 *
 * Captures 2D spatial relationships, bounding-box geometry, containment,
 * multi-column layout zones, Voronoi/Delaunay-style adjacency, reading-order DAGs,
 * and cross-page physical continuation candidates.
 *
 * Inviolable Architectural Principle:
 * DocumentGraph is purely DERIVED PHYSICAL OBSERVATIONS.
 * It strictly preserves physical layout and spatial topology.
 * It contains ZERO semantic question annotations (no stems, options, answers, keys).
 */

import { BoundingBox2D } from './evidence';
import { PhysicalGeometry } from './documentIR';

/**
 * Physical Relations Classification:
 * Exactly 16 physical layout relations defined in Phase 2B:
 * - 15 Intra-Page Geometric Relations
 * - 1 Cross-Page Physical Relation (CONTINUES_PHYSICALLY)
 */
export type IntraPageGeometricRelationType =
  | 'CONTAINS'
  | 'INSIDE'
  | 'OVERLAPS'
  | 'TOUCHES'
  | 'ABOVE'
  | 'BELOW'
  | 'LEFT_OF'
  | 'RIGHT_OF'
  | 'ALIGNED_X'
  | 'ALIGNED_Y'
  | 'NEAR'
  | 'ADJACENT'
  | 'SAME_REGION'
  | 'SAME_ROW'
  | 'SAME_COLUMN';

export type CrossPagePhysicalRelationType = 'CONTINUES_PHYSICALLY';

export type GeometricRelationType =
  | IntraPageGeometricRelationType
  | CrossPagePhysicalRelationType
  // Backwards-compatible aliases
  | 'ALIGNED_LEFT'
  | 'ALIGNED_RIGHT'
  | 'ALIGNED_BASELINE'
  | 'OVERLAPPING'
  | 'CONTINUATION_OF'
  | 'ACROSS_COLUMNS';

export type SpatialRelationType = GeometricRelationType;

export type GraphNodeType =
  | 'TEXT_RUN'
  | 'GLYPH_RUN'
  | 'RASTER_IMAGE'
  | 'VECTOR_PATH'
  | 'VECTOR_GROUP'
  | 'TABLE_REGION'
  | 'CLIPPING_REGION'
  | 'PAGE_REGION';

export interface GeometricEvidenceRecord {
  distancePt: number;
  overlapAreaPt2?: number;
  overlapRatioSource?: number;
  overlapRatioTarget?: number;
  alignmentDeltaPt?: number;
  horizontalGapPt?: number;
  verticalGapPt?: number;
  sharedBoundaryLengthPt?: number;
}

export interface GraphNodeProvenance {
  algorithmId: string;
  algorithmVersion: string;
  sourceSnapshotId: string;
  sourceDocumentId: string;
  sourceObjectId?: string;
  sourceReferenceId?: string;
  resolutionStatus: 'EXACT_SOURCE_BYTE' | 'PARSER_INTERPOLATED' | 'UNRESOLVED';
  createdAt: number;
}

export interface DocumentGraphNode {
  nodeId: string;
  elementId: string; // Compatibility alias for nodeId
  pageNumber: number;
  nodeType: GraphNodeType;
  bbox: BoundingBox2D;
  geometry: PhysicalGeometry;
  textContent?: string; // Decoded Unicode; never modified semantically
  style?: {
    fontSizePt?: number;
    fontId?: string;
    strokeRgba?: string;
    fillRgba?: string;
    lineWidthPt?: number;
  };
  evidenceClassification: 'DERIVED_PHYSICAL_OBSERVATION';
  sourceEvidence: {
    sourceSnapshotId: string;
    sourceDocumentId: string;
    sourceObjectId?: string;
    sourceReferenceId?: string;
    streamId?: string;
    operatorIndex?: number;
    resolutionStatus: 'EXACT_SOURCE_BYTE' | 'PARSER_INTERPOLATED' | 'UNRESOLVED';
  };
  provenance: GraphNodeProvenance;
  degradationFlags?: string[];
}

export interface DocumentGraphEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceElementId: string; // Compatibility alias
  targetElementId: string; // Compatibility alias
  relation: GeometricRelationType;
  distancePt: number;
  weight: number; // 0.0 - 1.0 confidence in relationship
  geometricEvidence?: GeometricEvidenceRecord;
  decisionBasis: string;
  confidence: number;
  algorithmVersion?: string;
}

export interface DocumentColumnZone {
  columnIndex: number; // 0, 1, 2...
  pageNumber: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  elementIds: string[];
  gutterWidthPt?: number;
  confidence?: number;
}

export type SpatialRegionType =
  | 'COLUMN'
  | 'HEADER_ZONE'
  | 'FOOTER_ZONE'
  | 'BODY_ZONE'
  | 'MARGIN_ZONE'
  | 'SIDEBAR_ZONE'
  | 'TABLE_LATTICE'
  | 'IMAGE_CONTAINER'
  | 'COMPOSITE_BLOCK';

export interface SpatialRegionHypothesis {
  hypothesisId: string;
  description: string;
  score: number;
}

export interface SpatialRegion {
  regionId: string;
  pageNumber: number;
  regionType: SpatialRegionType;
  bbox: BoundingBox2D;
  containedNodeIds: string[];
  confidence: number;
  hypotheses?: SpatialRegionHypothesis[];
}

export type LayoutRegion = SpatialRegion;

export interface ReadingOrderEdge {
  fromNodeId: string;
  toNodeId: string;
  orderType: 'SEQUENTIAL' | 'PARALLEL_COLUMN' | 'SIDE_BY_SIDE' | 'CONTAINMENT_INNER' | 'PAGE_CONTINUATION';
  confidence: number;
  isAmbiguous: boolean;
  ambiguityReason?: string;
}

export interface ReadingOrderDAG {
  rootNodeIds: string[];
  terminalNodeIds: string[];
  edges: ReadingOrderEdge[];
  topologicalOrder: string[]; // Partial topological ordering
  ambiguousRegions: {
    regionId: string;
    candidateSequences: string[][];
    reason: string;
  }[];
}

export interface CrossPageContinuationCandidate {
  candidateId: string;
  fromPageNumber: number;
  toPageNumber: number;
  fromNodeId: string;
  toNodeId: string;
  relation: 'CONTINUES_PHYSICALLY';
  compatibilityScore: number;
  metrics: {
    bottomMarginDeltaPt: number;
    topMarginDeltaPt: number;
    fontSizeDeltaPt: number;
    fontMatch: boolean;
    columnAlignment: boolean;
  };
  decisionBasis: string;
}

export interface DegradedNodeRecord {
  nodeId: string;
  pageNumber: number;
  flags: string[];
  reason: string;
}

export interface GraphProvenanceRecord {
  algorithmId: string;
  algorithmVersion: string;
  configurationVersion: string;
  sourceSnapshotId: string;
  sourceDocumentId: string;
  sourceSha256: string;
  createdAt: number;
  determinismScope?: {
    identicalSnapshot: boolean;
    identicalAlgorithm: boolean;
    identicalConfig: boolean;
    runtime: string;
    floatPrecision: 'IEEE_754_64BIT';
  };
}

export interface DocumentGraph {
  graphId: string;
  documentId: string;
  sourceDocumentId: string;
  sourceSnapshotId: string;
  sourceSha256: string;
  pageNumber: number; // 0 for multi-page composite graph, or 1-indexed page number
  totalPages: number;
  schemaVersion: string;
  algorithmVersion: string;
  configurationVersion: string;
  nodes: Map<string, DocumentGraphNode>;
  edges: DocumentGraphEdge[];
  columns: DocumentColumnZone[];
  spatialRegions: SpatialRegion[];
  layoutRegions?: LayoutRegion[];
  readingFlow: string[]; // Deterministic element sequence following column flow
  readingOrderDAG: ReadingOrderDAG;
  crossPageContinuations: CrossPageContinuationCandidate[];
  degradedNodes: DegradedNodeRecord[];
  provenance: GraphProvenanceRecord;
  isSealed: boolean;
  sealedHash: string;
  sealedAt: number;
}
