/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Canonical DocumentGraph Serializer (Phase 2B)
 *
 * Provides bitwise-deterministic, canonical JSON serialization and cryptographic
 * sealing for DocumentGraph instances.
 */

import { DocumentGraph } from '../contracts/documentGraph';
import { computeSha256 } from '../adapters/PdfNativeSourceAdapter';

export class GraphSerializer {
  /**
   * Deterministically serializes a DocumentGraph into a canonical JSON string.
   */
  public static serializeCanonical(graph: DocumentGraph): string {
    // 1. Sort nodes deterministically
    const sortedNodes = Array.from(graph.nodes.values()).sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      const dy = a.bbox.y0 - b.bbox.y0;
      if (Math.abs(dy) > 0.01) return dy;
      const dx = a.bbox.x0 - b.bbox.x0;
      if (Math.abs(dx) > 0.01) return dx;
      return a.nodeId.localeCompare(b.nodeId);
    });

    // 2. Sort edges deterministically
    const sortedEdges = [...graph.edges].sort((a, b) => {
      const srcDiff = a.sourceNodeId.localeCompare(b.sourceNodeId);
      if (srcDiff !== 0) return srcDiff;
      const tgtDiff = a.targetNodeId.localeCompare(b.targetNodeId);
      if (tgtDiff !== 0) return tgtDiff;
      return a.relation.localeCompare(b.relation);
    });

    // 3. Sort columns deterministically
    const sortedColumns = [...graph.columns].sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.columnIndex - b.columnIndex;
    });

    // 4. Sort spatial regions deterministically
    const sortedRegions = [...graph.spatialRegions].sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.regionId.localeCompare(b.regionId);
    });

    // 5. Sort reading order DAG edges
    const sortedDagEdges = [...graph.readingOrderDAG.edges].sort((a, b) => {
      const srcDiff = a.fromNodeId.localeCompare(b.fromNodeId);
      if (srcDiff !== 0) return srcDiff;
      return a.toNodeId.localeCompare(b.toNodeId);
    });

    // 6. Sort cross page continuations
    const sortedContinuations = [...graph.crossPageContinuations].sort((a, b) =>
      a.candidateId.localeCompare(b.candidateId)
    );

    // 7. Canonical representation object
    const canonicalObj = {
      schemaVersion: graph.schemaVersion,
      algorithmVersion: graph.algorithmVersion,
      configurationVersion: graph.configurationVersion,
      graphId: graph.graphId,
      sourceDocumentId: graph.sourceDocumentId,
      sourceSnapshotId: graph.sourceSnapshotId,
      sourceSha256: graph.sourceSha256,
      pageNumber: graph.pageNumber,
      totalPages: graph.totalPages,
      nodes: sortedNodes,
      edges: sortedEdges,
      columns: sortedColumns,
      spatialRegions: sortedRegions,
      readingFlow: graph.readingFlow,
      readingOrderDAG: {
        rootNodeIds: [...graph.readingOrderDAG.rootNodeIds].sort(),
        terminalNodeIds: [...graph.readingOrderDAG.terminalNodeIds].sort(),
        edges: sortedDagEdges,
        topologicalOrder: graph.readingOrderDAG.topologicalOrder,
        ambiguousRegions: graph.readingOrderDAG.ambiguousRegions,
      },
      crossPageContinuations: sortedContinuations,
      degradedNodes: [...graph.degradedNodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
      provenance: graph.provenance,
    };

    return GraphSerializer.deterministicJsonStringify(canonicalObj);
  }

  /**
   * Seals a DocumentGraph by computing its cryptographic SHA-256 fingerprint.
   */
  public static async sealGraph(graph: DocumentGraph): Promise<DocumentGraph> {
    const canonicalJson = GraphSerializer.serializeCanonical(graph);
    const textEncoder = new TextEncoder();
    const bytes = textEncoder.encode(canonicalJson);
    const hash = await computeSha256(bytes);

    graph.isSealed = true;
    graph.sealedHash = hash;
    graph.sealedAt = Date.now();

    return graph;
  }

  /**
   * Recursively stringifies an object with sorted keys for bitwise determinism.
   */
  private static deterministicJsonStringify(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
      if (typeof obj === 'number') {
        // Unquantized IEEE 754 float: normalize NaN or Infinity
        if (!Number.isFinite(obj)) return 'null';
        // Limit string representation jitter by rounding to 8 decimal places if float
        return Number.isInteger(obj) ? obj.toString() : Number(obj.toFixed(8)).toString();
      }
      return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => GraphSerializer.deterministicJsonStringify(item)).join(',') + ']';
    }

    const record = obj as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const pairs = sortedKeys
      .filter((k) => record[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${GraphSerializer.deterministicJsonStringify(record[k])}`);

    return '{' + pairs.join(',') + '}';
  }
}
