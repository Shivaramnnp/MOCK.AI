/**
 * UADUE — Universal Assessment Document Understanding Engine
 * DocumentGraph Builder (Phase 2B)
 *
 * Master Coordinator for Phase 2B:
 * ForensicSnapshot → Physical Evidence Objects → Spatial Index → DocumentGraph
 *
 * Coordinates:
 * 1. Physical Evidence Extraction (Glyph runs, Raster images, Vector paths)
 * 2. Failure Isolation (Graceful handling of corrupt geometry with zero silent drops)
 * 3. 2D Spatial Indexing
 * 4. Geometry-driven Column & Layout Region Detection
 * 5. Deterministic Geometric Relations Computation
 * 6. Reading Order DAG Construction with Branch & Ambiguity Preservation
 * 7. Cross-Page Physical Continuation Detection
 * 8. Canonical Serialization and Cryptographic Sealing
 */

import { ForensicSnapshot } from '../contracts/forensicSnapshot';
import {
  DocumentGraph,
  DocumentGraphNode,
  DocumentGraphEdge,
  DocumentColumnZone,
  SpatialRegion,
  DegradedNodeRecord,
  GraphProvenanceRecord,
} from '../contracts/documentGraph';
import { Spatial2DIndex } from './spatialIndex';
import { GeometricRelationsEvaluator, GeometricRelationConfig, DEFAULT_GEOMETRIC_CONFIG } from './geometricRelations';
import { ColumnDetector, ColumnDetectorConfig, ColumnDetectionResult, DEFAULT_COLUMN_CONFIG } from './columnDetector';
import { ReadingOrderEngine, ReadingOrderConfig, DEFAULT_READING_ORDER_CONFIG } from './readingOrderEngine';
import { CrossPageContinuationDetector, CrossPageContinuationConfig, DEFAULT_CROSS_PAGE_CONFIG } from './crossPageContinuation';
import { GraphSerializer } from './graphSerializer';
import { GraphValidator } from './graphValidator';

export interface DocumentGraphBuilderConfig {
  geometricConfig: GeometricRelationConfig;
  columnConfig: ColumnDetectorConfig;
  readingOrderConfig: ReadingOrderConfig;
  continuationConfig: CrossPageContinuationConfig;
  schemaVersion: string;
  algorithmVersion: string;
  configurationVersion: string;
}

export const DEFAULT_GRAPH_BUILDER_CONFIG: DocumentGraphBuilderConfig = {
  geometricConfig: DEFAULT_GEOMETRIC_CONFIG,
  columnConfig: DEFAULT_COLUMN_CONFIG,
  readingOrderConfig: DEFAULT_READING_ORDER_CONFIG,
  continuationConfig: DEFAULT_CROSS_PAGE_CONFIG,
  schemaVersion: 'uadue_document_graph_v2b_schema',
  algorithmVersion: 'uadue_graph_builder_v2b_2026',
  configurationVersion: 'default_v2b_config_2026',
};

export class DocumentGraphBuilder {
  private config: DocumentGraphBuilderConfig;
  private relationsEvaluator: GeometricRelationsEvaluator;
  private columnDetector: ColumnDetector;
  private readingOrderEngine: ReadingOrderEngine;
  private continuationDetector: CrossPageContinuationDetector;

  constructor(config?: Partial<DocumentGraphBuilderConfig>) {
    this.config = {
      geometricConfig: { ...DEFAULT_GEOMETRIC_CONFIG, ...config?.geometricConfig },
      columnConfig: { ...DEFAULT_COLUMN_CONFIG, ...config?.columnConfig },
      readingOrderConfig: { ...DEFAULT_READING_ORDER_CONFIG, ...config?.readingOrderConfig },
      continuationConfig: { ...DEFAULT_CROSS_PAGE_CONFIG, ...config?.continuationConfig },
      schemaVersion: config?.schemaVersion ?? DEFAULT_GRAPH_BUILDER_CONFIG.schemaVersion,
      algorithmVersion: config?.algorithmVersion ?? DEFAULT_GRAPH_BUILDER_CONFIG.algorithmVersion,
      configurationVersion: config?.configurationVersion ?? DEFAULT_GRAPH_BUILDER_CONFIG.configurationVersion,
    };

    this.relationsEvaluator = new GeometricRelationsEvaluator(this.config.geometricConfig);
    this.columnDetector = new ColumnDetector(this.config.columnConfig);
    this.readingOrderEngine = new ReadingOrderEngine(this.config.readingOrderConfig);
    this.continuationDetector = new CrossPageContinuationDetector(this.config.continuationConfig);
  }

  /**
   * Builds an immutable, sealed DocumentGraph from a certified ForensicSnapshot.
   */
  public async buildGraph(snapshot: ForensicSnapshot): Promise<DocumentGraph> {
    const nodes = new Map<string, DocumentGraphNode>();
    const degradedNodes: DegradedNodeRecord[] = [];

    // Map sourceReferences by objectId or streamId for fast provenance resolution
    const sourceRefMap = new Map<string, string>();
    if (snapshot.sourceReferences) {
      for (const ref of snapshot.sourceReferences) {
        if (ref.objectId) sourceRefMap.set(ref.objectId, ref.referenceId);
      }
    }

    const buildTimestamp = snapshot.sealedAt || 1700000000000;

    // 1. Extract Glyph Runs -> TEXT_RUN Nodes
    for (let idx = 0; idx < snapshot.glyphRuns.length; idx++) {
      const g = snapshot.glyphRuns[idx];
      const nodeId = `node_p${g.pageNumber}_text_${idx}`;
      const bbox = g.geometry.bbox;

      const isBboxValid =
        Number.isFinite(bbox.x0) &&
        Number.isFinite(bbox.y0) &&
        Number.isFinite(bbox.width) &&
        Number.isFinite(bbox.height);

      if (!isBboxValid) {
        degradedNodes.push({
          nodeId,
          pageNumber: g.pageNumber,
          flags: ['INVALID_GEOMETRY', 'CORRUPT_COORDINATES'],
          reason: `Glyph run ${g.glyphRunId} contains non-finite bounding box`,
        });
      }

      const node: DocumentGraphNode = {
        nodeId,
        elementId: nodeId,
        pageNumber: g.pageNumber,
        nodeType: 'TEXT_RUN',
        bbox: isBboxValid
          ? bbox
          : { x0: 0, y0: 0, x1: 50, y1: 10, width: 50, height: 10, unit: 'pt' },
        geometry: g.geometry,
        textContent: g.decodedUnicode,
        style: {
          fontSizePt: g.fontSizePt,
          fontId: g.fontId,
        },
        evidenceClassification: 'DERIVED_PHYSICAL_OBSERVATION',
        sourceEvidence: {
          sourceSnapshotId: snapshot.snapshotId,
          sourceDocumentId: snapshot.sourceDocumentId,
          sourceObjectId: g.glyphRunId,
          sourceReferenceId: sourceRefMap.get(g.fontId),
          streamId: g.streamId,
          operatorIndex: g.operatorIndex,
          resolutionStatus: 'PARSER_INTERPOLATED',
        },
        provenance: {
          algorithmId: this.config.algorithmVersion,
          algorithmVersion: '2.0.0',
          sourceSnapshotId: snapshot.snapshotId,
          sourceDocumentId: snapshot.sourceDocumentId,
          sourceObjectId: g.glyphRunId,
          resolutionStatus: 'PARSER_INTERPOLATED',
          createdAt: buildTimestamp,
        },
        degradationFlags: isBboxValid ? undefined : ['INVALID_GEOMETRY'],
      };

      nodes.set(nodeId, node);
    }

    // 2. Extract Raster XObjects -> RASTER_IMAGE Nodes
    for (let idx = 0; idx < snapshot.rasterXObjects.length; idx++) {
      const img = snapshot.rasterXObjects[idx];
      const nodeId = `node_p${img.pageNumber}_img_${idx}`;
      const bbox = img.geometry.bbox;

      const isBboxValid =
        Number.isFinite(bbox.x0) &&
        Number.isFinite(bbox.y0) &&
        Number.isFinite(bbox.width) &&
        Number.isFinite(bbox.height);

      if (!isBboxValid) {
        degradedNodes.push({
          nodeId,
          pageNumber: img.pageNumber,
          flags: ['INVALID_IMAGE_GEOMETRY'],
          reason: `Raster image ${img.xObjectId} contains non-finite bounding box`,
        });
      }

      const node: DocumentGraphNode = {
        nodeId,
        elementId: nodeId,
        pageNumber: img.pageNumber,
        nodeType: 'RASTER_IMAGE',
        bbox: isBboxValid
          ? bbox
          : { x0: 0, y0: 0, x1: 100, y1: 100, width: 100, height: 100, unit: 'pt' },
        geometry: img.geometry,
        evidenceClassification: 'DERIVED_PHYSICAL_OBSERVATION',
        sourceEvidence: {
          sourceSnapshotId: snapshot.snapshotId,
          sourceDocumentId: snapshot.sourceDocumentId,
          sourceObjectId: img.xObjectId,
          sourceReferenceId: sourceRefMap.get(img.xObjectId),
          resolutionStatus: img.encodedStreamSha256 ? 'EXACT_SOURCE_BYTE' : 'UNRESOLVED',
        },
        provenance: {
          algorithmId: this.config.algorithmVersion,
          algorithmVersion: '2.0.0',
          sourceSnapshotId: snapshot.snapshotId,
          sourceDocumentId: snapshot.sourceDocumentId,
          sourceObjectId: img.xObjectId,
          resolutionStatus: img.encodedStreamSha256 ? 'EXACT_SOURCE_BYTE' : 'UNRESOLVED',
          createdAt: buildTimestamp,
        },
        degradationFlags: isBboxValid ? undefined : ['INVALID_IMAGE_GEOMETRY'],
      };

      nodes.set(nodeId, node);
    }

    // 3. Extract Vector Paths -> VECTOR_PATH Nodes
    for (let idx = 0; idx < snapshot.vectorPaths.length; idx++) {
      const path = snapshot.vectorPaths[idx];
      const nodeId = `node_p${path.geometry.bbox.pageWidth || 1}_path_${idx}`;
      const bbox = path.geometry.bbox;

      const isBboxValid =
        Number.isFinite(bbox.x0) &&
        Number.isFinite(bbox.y0) &&
        Number.isFinite(bbox.width) &&
        Number.isFinite(bbox.height);

      if (!isBboxValid) {
        degradedNodes.push({
          nodeId,
          pageNumber: 1,
          flags: ['INVALID_GEOMETRY', 'CORRUPT_COORDINATES'],
          reason: `Vector path ${path.pathId} contains non-finite bounding box`,
        });
      }

      const node: DocumentGraphNode = {
        nodeId,
        elementId: nodeId,
        pageNumber: 1, // Vector paths in snapshot retain page info through geometry or index
        nodeType: 'VECTOR_PATH',
        bbox: isBboxValid
          ? bbox
          : { x0: 0, y0: 0, x1: 0, y1: 0, width: 0, height: 0, unit: 'pt' },
        geometry: path.geometry,
        style: {
          lineWidthPt: path.lineWidthPt,
          strokeRgba: path.strokeRgba,
          fillRgba: path.fillRgba,
        },
        evidenceClassification: 'DERIVED_PHYSICAL_OBSERVATION',
        sourceEvidence: {
          sourceSnapshotId: snapshot.snapshotId,
          sourceDocumentId: snapshot.sourceDocumentId,
          sourceObjectId: path.pathId,
          resolutionStatus: 'PARSER_INTERPOLATED',
        },
        provenance: {
          algorithmId: this.config.algorithmVersion,
          algorithmVersion: '2.0.0',
          sourceSnapshotId: snapshot.snapshotId,
          sourceDocumentId: snapshot.sourceDocumentId,
          sourceObjectId: path.pathId,
          resolutionStatus: 'PARSER_INTERPOLATED',
          createdAt: buildTimestamp,
        },
        degradationFlags: isBboxValid ? undefined : ['INVALID_GEOMETRY', 'CORRUPT_COORDINATES'],
      };

      nodes.set(nodeId, node);
    }

    // 4. Per-Page Spatial Indexing & Layout Analysis
    const allEdges: DocumentGraphEdge[] = [];
    const allColumns: DocumentColumnZone[] = [];
    const allSpatialRegions: SpatialRegion[] = [];
    const pageLayoutResults = new Map<number, ColumnDetectionResult>();
    const pageNodesMap = new Map<number, DocumentGraphNode[]>();

    for (const [, node] of nodes) {
      if (!pageNodesMap.has(node.pageNumber)) {
        pageNodesMap.set(node.pageNumber, []);
      }
      pageNodesMap.get(node.pageNumber)!.push(node);
    }

    for (const pageGeom of snapshot.pageGeometries) {
      const pageNum = pageGeom.pageNumber;
      const pageNodes = pageNodesMap.get(pageNum) || [];
      const pageWidth = pageGeom.dimensions.width;
      const pageHeight = pageGeom.dimensions.height;

      // Filter out degraded nodes with invalid geometry so they NEVER participate in layout or spatial indexing
      const validNodes = pageNodes.filter(
        (n) => !n.degradationFlags?.some((f) => f.includes('INVALID') || f.includes('CORRUPT'))
      );

      // Detect Columns and Layout Regions using ONLY valid nodes
      const layoutResult = this.columnDetector.detectPageLayout(pageNum, pageWidth, pageHeight, validNodes);
      pageLayoutResults.set(pageNum, layoutResult);
      allColumns.push(...layoutResult.columns);
      allSpatialRegions.push(...layoutResult.spatialRegions);

      // Build 2D Spatial Index for the page using ONLY valid nodes (NEVER manufacture false edges for invalid nodes)
      const spatialIndex = new Spatial2DIndex();
      for (const node of validNodes) {
        spatialIndex.insert({
          id: node.nodeId,
          bbox: node.bbox,
          pageNumber: node.pageNumber,
        });
      }

      // Compute pairwise relations across spatially near elements using ONLY valid nodes
      for (const sourceNode of validNodes) {
        const neighbors = spatialIndex.queryKNearest(sourceNode.bbox, 12, sourceNode.nodeId, 250);
        for (const { item: targetItem } of neighbors) {
          const targetNode = nodes.get(targetItem.id);
          if (targetNode) {
            const pairEdges = this.relationsEvaluator.evaluatePairRelations(
              sourceNode,
              targetNode,
              layoutResult.nodeToColumnMap,
              layoutResult.nodeToRegionMap
            );
            for (const pe of pairEdges) allEdges.push(pe);
          }
        }
      }

      // Compute Voronoi/Delaunay ADJACENT edges using ONLY valid nodes
      const adjEdges = this.relationsEvaluator.evaluateAdjacency(validNodes, spatialIndex);
      for (const ae of adjEdges) allEdges.push(ae);
    }

    // Deduplicate edges by edgeId
    const uniqueEdgesMap = new Map<string, DocumentGraphEdge>();
    for (const edge of allEdges) {
      if (!uniqueEdgesMap.has(edge.edgeId)) {
        uniqueEdgesMap.set(edge.edgeId, edge);
      }
    }
    const deduplicatedEdges = Array.from(uniqueEdgesMap.values());

    // 5. Build Reading Order DAG
    const { dag: readingOrderDAG, readingFlow } = this.readingOrderEngine.buildReadingOrderDAG(
      nodes,
      pageLayoutResults
    );

    // 6. Evaluate Cross-Page Continuations
    const crossPageContinuations: DocumentGraph['crossPageContinuations'] = [];
    const sortedPageNums = snapshot.pageGeometries.map((p) => p.pageNumber).sort((a, b) => a - b);

    for (let i = 0; i < sortedPageNums.length - 1; i++) {
      const p1 = sortedPageNums[i];
      const p2 = sortedPageNums[i + 1];
      const p1Nodes = pageNodesMap.get(p1) || [];
      const p2Nodes = pageNodesMap.get(p2) || [];
      const p1Height = snapshot.pageGeometries.find((p) => p.pageNumber === p1)?.dimensions.height || 842;
      const p2Height = snapshot.pageGeometries.find((p) => p.pageNumber === p2)?.dimensions.height || 842;

      const conts = this.continuationDetector.evaluateContinuations(p1, p2, p1Nodes, p2Nodes, p1Height, p2Height);
      crossPageContinuations.push(...conts);
    }

    // 7. Assemble DocumentGraph
    const provenance: GraphProvenanceRecord = {
      algorithmId: this.config.algorithmVersion,
      algorithmVersion: '2.0.0',
      configurationVersion: this.config.configurationVersion,
      sourceSnapshotId: snapshot.snapshotId,
      sourceDocumentId: snapshot.sourceDocumentId,
      sourceSha256: snapshot.sourceSha256,
      createdAt: buildTimestamp,
      determinismScope: {
        identicalSnapshot: true,
        identicalAlgorithm: true,
        identicalConfig: true,
        runtime: `Node.js ${process.version} / V8`,
        floatPrecision: 'IEEE_754_64BIT',
      },
    };

    const graphIdHash = snapshot.sealedHash ? snapshot.sealedHash.slice(0, 16) : 'default';
    const graph: DocumentGraph = {
      graphId: `graph_${snapshot.sourceDocumentId}_${graphIdHash}`,
      documentId: snapshot.sourceDocumentId,
      sourceDocumentId: snapshot.sourceDocumentId,
      sourceSnapshotId: snapshot.snapshotId,
      sourceSha256: snapshot.sourceSha256,
      pageNumber: snapshot.pageGeometries.length === 1 ? snapshot.pageGeometries[0].pageNumber : 0,
      totalPages: snapshot.pageGeometries.length,
      schemaVersion: this.config.schemaVersion,
      algorithmVersion: this.config.algorithmVersion,
      configurationVersion: this.config.configurationVersion,
      nodes,
      edges: deduplicatedEdges,
      columns: allColumns,
      spatialRegions: allSpatialRegions,
      layoutRegions: allSpatialRegions,
      readingFlow,
      readingOrderDAG,
      crossPageContinuations,
      degradedNodes,
      provenance,
      isSealed: false,
      sealedHash: '',
      sealedAt: 0,
    };

    // 8. Seal the DocumentGraph deterministically
    await GraphSerializer.sealGraph(graph);

    // 9. Validate All Invariants
    const validation = GraphValidator.validate(graph, snapshot);
    if (!validation.isValid) {
      throw new Error(`GraphInvariantViolation: ${validation.errors.join('; ')}`);
    }

    return graph;
  }
}
