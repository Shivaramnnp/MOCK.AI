/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Reading Order DAG Engine (Phase 2B)
 *
 * Constructs a Directed Acyclic Graph (DAG) of reading order flow.
 * Preserves parallel columns, side-by-side text/image blocks, nested containment,
 * and records explicit ambiguity regions where reading order cannot be strictly proven.
 *
 * Inviolable Principle:
 * Never flatten immediately into an arbitrary linear sequence.
 * Represent parallel reading paths and ambiguity explicitly in the graph.
 */

import {
  DocumentGraphNode,
  DocumentColumnZone,
  ReadingOrderDAG,
  ReadingOrderEdge,
} from '../contracts/documentGraph';
import { ColumnDetectionResult } from './columnDetector';

export interface ReadingOrderConfig {
  sideBySideYOverlapRatio: number; // default: 0.60
  algorithmVersion: string; // default: 'reading_order_dag_v2b'
}

export const DEFAULT_READING_ORDER_CONFIG: ReadingOrderConfig = {
  sideBySideYOverlapRatio: 0.6,
  algorithmVersion: 'reading_order_dag_v2b_2026',
};

export class ReadingOrderEngine {
  private config: ReadingOrderConfig;

  constructor(config?: Partial<ReadingOrderConfig>) {
    this.config = { ...DEFAULT_READING_ORDER_CONFIG, ...config };
  }

  /**
   * Constructs reading order DAG across all pages of nodes.
   */
  public buildReadingOrderDAG(
    nodes: Map<string, DocumentGraphNode>,
    layoutResults: Map<number, ColumnDetectionResult>
  ): { dag: ReadingOrderDAG; readingFlow: string[] } {
    const edges: ReadingOrderEdge[] = [];
    const ambiguousRegions: ReadingOrderDAG['ambiguousRegions'] = [];

    // Group nodes by page
    const pageNodesMap = new Map<number, DocumentGraphNode[]>();
    for (const [, node] of nodes) {
      if (!pageNodesMap.has(node.pageNumber)) {
        pageNodesMap.set(node.pageNumber, []);
      }
      pageNodesMap.get(node.pageNumber)!.push(node);
    }

    const sortedPages = Array.from(pageNodesMap.keys()).sort((a, b) => a - b);
    let previousPageTerminalIds: string[] = [];
    const allRoots: string[] = [];
    const allTerminals: string[] = [];

    for (const pageNum of sortedPages) {
      const pageNodes = pageNodesMap.get(pageNum)!;
      const layout = layoutResults.get(pageNum);

      const pageResult = this.buildPageDAG(pageNum, pageNodes, layout);
      for (const e of pageResult.edges) edges.push(e);
      for (const ar of pageResult.ambiguousRegions) ambiguousRegions.push(ar);

      if (sortedPages[0] === pageNum) {
        for (const r of pageResult.rootIds) allRoots.push(r);
      }
      if (sortedPages[sortedPages.length - 1] === pageNum) {
        for (const t of pageResult.terminalIds) allTerminals.push(t);
      }

      // Connect across page boundaries
      if (previousPageTerminalIds.length > 0 && pageResult.rootIds.length > 0) {
        for (const prevId of previousPageTerminalIds) {
          for (const nextId of pageResult.rootIds) {
            edges.push({
              fromNodeId: prevId,
              toNodeId: nextId,
              orderType: 'PAGE_CONTINUATION',
              confidence: 0.85,
              isAmbiguous: false,
            });
          }
        }
      }

      previousPageTerminalIds = pageResult.terminalIds;
    }

    // Compute topological sort and linearization
    const topologicalOrder = this.computeTopologicalSort(nodes, edges);

    return {
      dag: {
        rootNodeIds: allRoots.length > 0 ? allRoots : topologicalOrder.slice(0, 1),
        terminalNodeIds: allTerminals.length > 0 ? allTerminals : topologicalOrder.slice(-1),
        edges,
        topologicalOrder,
        ambiguousRegions,
      },
      readingFlow: topologicalOrder,
    };
  }

  /**
   * Constructs reading order DAG for a single page.
   */
  private buildPageDAG(
    pageNumber: number,
    nodes: DocumentGraphNode[],
    layout?: ColumnDetectionResult
  ): {
    edges: ReadingOrderEdge[];
    rootIds: string[];
    terminalIds: string[];
    ambiguousRegions: ReadingOrderDAG['ambiguousRegions'];
  } {
    const edges: ReadingOrderEdge[] = [];
    const ambiguousRegions: ReadingOrderDAG['ambiguousRegions'] = [];

    if (nodes.length === 0) {
      return { edges, rootIds: [], terminalIds: [], ambiguousRegions };
    }

    if (nodes.length === 1) {
      return { edges, rootIds: [nodes[0].nodeId], terminalIds: [nodes[0].nodeId], ambiguousRegions };
    }

    // If multi-column layout
    const columns = layout?.columns || [
      { columnIndex: 0, pageNumber, bounds: { minX: 0, maxX: 1000, minY: 0, maxY: 1000 }, elementIds: nodes.map((n) => n.nodeId) },
    ];

    const columnSequences: { colIndex: number; nodeIds: string[] }[] = [];

    for (const col of columns) {
      const colNodeIds = new Set(col.elementIds);
      const colNodes = nodes.filter((n) => colNodeIds.has(n.nodeId));

      if (colNodes.length === 0) continue;

      const colDag = this.buildColumnDAG(pageNumber, col.columnIndex, colNodes);
      for (const e of colDag.edges) edges.push(e);
      for (const ar of colDag.ambiguousRegions) ambiguousRegions.push(ar);

      columnSequences.push({
        colIndex: col.columnIndex,
        nodeIds: colDag.sortedSequence,
      });
    }

    // Connect across columns (Column 0 -> Column 1, Column 1 -> Column 2...)
    columnSequences.sort((a, b) => a.colIndex - b.colIndex);

    for (let c = 0; c < columnSequences.length - 1; c++) {
      const currentTail = columnSequences[c].nodeIds.slice(-1)[0];
      const nextHead = columnSequences[c + 1].nodeIds[0];

      if (currentTail && nextHead) {
        edges.push({
          fromNodeId: currentTail,
          toNodeId: nextHead,
          orderType: 'PARALLEL_COLUMN',
          confidence: 0.90,
          isAmbiguous: false,
        });
      }
    }

    const rootIds = columnSequences.length > 0 && columnSequences[0].nodeIds.length > 0 ? [columnSequences[0].nodeIds[0]] : [];
    const terminalIds =
      columnSequences.length > 0 && columnSequences.slice(-1)[0].nodeIds.length > 0
        ? [columnSequences.slice(-1)[0].nodeIds.slice(-1)[0]]
        : [];

    return { edges, rootIds, terminalIds, ambiguousRegions };
  }

  /**
   * Constructs reading order DAG inside a single column zone.
   * Handles side-by-side elements (e.g. diagram next to text) as branching paths.
   */
  private buildColumnDAG(
    pageNumber: number,
    colIndex: number,
    nodes: DocumentGraphNode[]
  ): {
    edges: ReadingOrderEdge[];
    sortedSequence: string[];
    ambiguousRegions: ReadingOrderDAG['ambiguousRegions'];
  } {
    const edges: ReadingOrderEdge[] = [];
    const ambiguousRegions: ReadingOrderDAG['ambiguousRegions'] = [];

    // Group nodes into horizontal reading bands
    // Nodes with significant vertical overlap are in the same band
    const bands: DocumentGraphNode[][] = [];

    // Sort initially by top Y coordinate, then by X
    const sorted = [...nodes].sort((a, b) => {
      const dy = a.bbox.y0 - b.bbox.y0;
      if (Math.abs(dy) > 3.0) return dy;
      return a.bbox.x0 - b.bbox.x0;
    });

    for (const node of sorted) {
      let placed = false;
      for (const band of bands) {
        const rep = band[0];
        const vOverlap = Math.max(0, Math.min(rep.bbox.y1, node.bbox.y1) - Math.max(rep.bbox.y0, node.bbox.y0));
        const minHeight = Math.min(rep.bbox.height, node.bbox.height);

        if (minHeight > 0 && vOverlap / minHeight >= this.config.sideBySideYOverlapRatio) {
          band.push(node);
          placed = true;
          break;
        }
      }
      if (!placed) {
        bands.push([node]);
      }
    }

    // Sort elements in each band by X coordinate
    for (const band of bands) {
      band.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    }

    const sortedSequence: string[] = [];
    let previousBandTails: string[] = [];

    for (let bIdx = 0; bIdx < bands.length; bIdx++) {
      const band = bands[bIdx];

      if (band.length === 1) {
        // Single element band: strictly sequential
        const node = band[0];
        sortedSequence.push(node.nodeId);

        for (const prevId of previousBandTails) {
          edges.push({
            fromNodeId: prevId,
            toNodeId: node.nodeId,
            orderType: 'SEQUENTIAL',
            confidence: 0.95,
            isAmbiguous: false,
          });
        }
        previousBandTails = [node.nodeId];
      } else {
        // Multi-element band (Side-by-side elements, e.g. text + diagram)
        const bandIds = band.map((n) => n.nodeId);
        sortedSequence.push(...bandIds);

        // Branching from previous band to ALL elements in side-by-side band:
        // P -> A, P -> B
        for (const prevId of previousBandTails) {
          for (const currId of bandIds) {
            edges.push({
              fromNodeId: prevId,
              toNodeId: currId,
              orderType: 'SIDE_BY_SIDE',
              confidence: 0.80,
              isAmbiguous: true,
              ambiguityReason: `Side-by-side parallel items in Band ${bIdx} (Column ${colIndex})`,
            });
          }
        }

        // Record explicit ambiguity region
        ambiguousRegions.push({
          regionId: `ambig_p${pageNumber}_c${colIndex}_b${bIdx}`,
          candidateSequences: [bandIds, [...bandIds].reverse()],
          reason: `Parallel elements side-by-side without vertical ordering delimiter`,
        });

        // Current band tails are all elements in the band (reconverging at next band)
        previousBandTails = bandIds;
      }
    }

    return { edges, sortedSequence, ambiguousRegions };
  }

  /**
   * Deterministic Topological Sort over the DAG (Kahn's Algorithm with cycle protection).
   */
  private computeTopologicalSort(
    nodes: Map<string, DocumentGraphNode>,
    edges: ReadingOrderEdge[]
  ): string[] {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const [id] of nodes) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }

    for (const e of edges) {
      if (inDegree.has(e.toNodeId) && adj.has(e.fromNodeId)) {
        inDegree.set(e.toNodeId, inDegree.get(e.toNodeId)! + 1);
        adj.get(e.fromNodeId)!.push(e.toNodeId);
      }
    }

    // Queue of nodes with 0 in-degree, sorted deterministically by (page, y, x, id)
    const comparator = (idA: string, idB: string): number => {
      const a = nodes.get(idA);
      const b = nodes.get(idB);
      if (!a || !b) return idA.localeCompare(idB);

      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      const dy = a.bbox.y0 - b.bbox.y0;
      if (Math.abs(dy) > 1.0) return dy;
      const dx = a.bbox.x0 - b.bbox.x0;
      if (Math.abs(dx) > 1.0) return dx;
      return a.nodeId.localeCompare(b.nodeId);
    };

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }
    queue.sort(comparator);

    const result: string[] = [];

    while (queue.length > 0) {
      const u = queue.shift()!;
      result.push(u);

      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        const newDeg = inDegree.get(v)! - 1;
        inDegree.set(v, newDeg);
        if (newDeg === 0) {
          queue.push(v);
          queue.sort(comparator);
        }
      }
    }

    // If cycle detected (some nodes not reached), append remaining nodes deterministically
    if (result.length < nodes.size) {
      const remaining: string[] = [];
      for (const [id] of nodes) {
        if (!result.includes(id)) remaining.push(id);
      }
      remaining.sort(comparator);
      result.push(...remaining);
    }

    return result;
  }
}
