/**
 * UADUE — Universal Assessment Document Understanding Engine
 * DocumentGraph Invariants Validator (Phase 2B)
 *
 * Strictly enforces all Phase 2B architectural invariants:
 * 1. ZERO Question Semantics (no questions, stems, options, answers, keys).
 * 2. Reading order DAG Acyclicity (no directed cycles).
 * 3. Evidence Preservation (every physical element in snapshot is accounted for).
 * 4. Provenance Integrity (all nodes have DERIVED_PHYSICAL_OBSERVATION and snapshot provenance).
 * 5. Failure Isolation (degraded elements are explicitly marked, never dropped silently).
 */

import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import { ForensicSnapshot } from '../contracts/forensicSnapshot';

export interface GraphValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  nodeCount: number;
  edgeCount: number;
  degradedCount: number;
  isAcyclicDAG: boolean;
}

export class GraphValidator {
  /**
   * Validates a DocumentGraph against architectural invariants.
   */
  public static validate(graph: DocumentGraph, sourceSnapshot?: ForensicSnapshot): GraphValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Invariant: ZERO Question Semantics (Deep Recursive Scan)
    const forbiddenKeys = new Set([
      'questionId',
      'question_id',
      'questionNumber',
      'isStem',
      'stem',
      'stemText',
      'isOption',
      'optionLabel',
      'optionKey',
      'options',
      'answerKey',
      'answer_key',
      'correctAnswer',
      'canonicalQuestions',
      'questionGraph',
      'mcq',
      'msq',
      'nat',
      'marks',
      'negativeMarks',
      'score',
      'explanation',
      'solution',
    ]);

    GraphValidator.recursiveSemanticKeyScan(graph, 'graph', forbiddenKeys, errors);

    for (const [nodeId, node] of graph.nodes) {
      // Check evidence classification
      if (node.evidenceClassification !== 'DERIVED_PHYSICAL_OBSERVATION') {
        errors.push(`INVALID_CLASSIFICATION: Node ${nodeId} classification must be DERIVED_PHYSICAL_OBSERVATION`);
      }

      // Check provenance
      if (!node.sourceEvidence?.sourceSnapshotId || !node.sourceEvidence?.sourceDocumentId) {
        errors.push(`MISSING_PROVENANCE: Node ${nodeId} is missing source snapshot or document ID`);
      }
    }

    // 2. Invariant: Reading Order DAG Acyclicity
    const isAcyclic = GraphValidator.checkDAGAcyclicity(graph);
    if (!isAcyclic) {
      errors.push('DAG_CYCLE_DETECTED: Reading order DAG contains directed cycles');
    }

    // 3. Invariant: Evidence Preservation & Strict Accounting
    if (sourceSnapshot) {
      const snapshotGlyphCount = sourceSnapshot.glyphRuns.length;
      const snapshotImageCount = sourceSnapshot.rasterXObjects.length;
      const snapshotPathCount = sourceSnapshot.vectorPaths.length;
      const expectedTotal = snapshotGlyphCount + snapshotImageCount + snapshotPathCount;
      const actualTotal = graph.nodes.size;

      if (actualTotal !== expectedTotal) {
        errors.push(
          `EVIDENCE_ACCOUNTING_MISMATCH: Graph has ${actualTotal} nodes but snapshot has ${expectedTotal} physical items (silent drop or duplication detected)`
        );
      }
    }

    // 4. Invariant: Failure Isolation & Invalid Geometry Safety
    const invalidNodeIds = new Set(
      graph.degradedNodes
        .filter((d) => d.flags.some((f) => f.includes('INVALID') || f.includes('CORRUPT')))
        .map((d) => d.nodeId)
    );

    for (const edge of graph.edges) {
      if (invalidNodeIds.has(edge.sourceNodeId) || invalidNodeIds.has(edge.targetNodeId)) {
        errors.push(
          `INVALID_GEOMETRY_EDGE_CONTAMINATION: Edge ${edge.edgeId} (${edge.relation}) illegally connects to degraded invalid-geometry node (${edge.sourceNodeId} -> ${edge.targetNodeId})`
        );
      }
    }

    for (const degraded of graph.degradedNodes) {
      const node = graph.nodes.get(degraded.nodeId);
      if (!node) {
        warnings.push(`ORPHANED_DEGRADED_RECORD: Node ${degraded.nodeId} in degradedNodes does not exist in graph`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,
      degradedCount: graph.degradedNodes.length,
      isAcyclicDAG: isAcyclic,
    };
  }

  /**
   * Checks whether the reading order graph is strictly acyclic using DFS.
   */
  private static checkDAGAcyclicity(graph: DocumentGraph): boolean {
    const adj = new Map<string, string[]>();
    for (const [id] of graph.nodes) {
      adj.set(id, []);
    }

    for (const edge of graph.readingOrderDAG.edges) {
      if (adj.has(edge.fromNodeId)) {
        adj.get(edge.fromNodeId)!.push(edge.toNodeId);
      }
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const hasCycleDFS = (u: string): boolean => {
      visited.add(u);
      recStack.add(u);

      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        if (!visited.has(v)) {
          if (hasCycleDFS(v)) return true;
        } else if (recStack.has(v)) {
          return true; // Cycle found
        }
      }

      recStack.delete(u);
      return false;
    };

    for (const [id] of graph.nodes) {
      if (!visited.has(id)) {
        if (hasCycleDFS(id)) return false;
      }
    }

    return true;
  }

  /**
   * Deep recursive scan of graph structure to guarantee ZERO forbidden question semantic keys.
   */
  private static recursiveSemanticKeyScan(
    obj: unknown,
    currentPath: string,
    forbiddenKeys: Set<string>,
    errors: string[],
    visited = new WeakSet<object>()
  ): void {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return;
    }

    if (visited.has(obj)) {
      return;
    }
    visited.add(obj);

    if (obj instanceof Map) {
      for (const [key, value] of obj.entries()) {
        if (typeof key === 'string' && forbiddenKeys.has(key)) {
          errors.push(`ILLEGAL_SEMANTIC_FIELD: Map key at ${currentPath}.${key} is a forbidden semantic key`);
        }
        GraphValidator.recursiveSemanticKeyScan(value, `${currentPath}.${String(key)}`, forbiddenKeys, errors, visited);
      }
      return;
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        GraphValidator.recursiveSemanticKeyScan(obj[i], `${currentPath}[${i}]`, forbiddenKeys, errors, visited);
      }
      return;
    }

    const record = obj as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (forbiddenKeys.has(key)) {
        errors.push(`ILLEGAL_SEMANTIC_FIELD: Key '${key}' at ${currentPath}.${key} is a forbidden semantic key`);
      }
      GraphValidator.recursiveSemanticKeyScan(record[key], `${currentPath}.${key}`, forbiddenKeys, errors, visited);
    }
  }
}
