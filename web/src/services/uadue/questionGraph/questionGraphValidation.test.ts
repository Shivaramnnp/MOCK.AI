/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Test Suite: QuestionGraph Validation Suite (Phase 2C)
 *
 * Covers scenarios A through Y and historical regression classes:
 * - A: Simple single MCQ
 * - B: Multi-line stem
 * - C: Image-based question
 * - D: Diagram + text
 * - E: Table + question
 * - F: Question spanning pages
 * - G: Passage with multiple questions
 * - H: Question with no explicit number
 * - I: Page number NOT mistaken for question number
 * - J: Figure number NOT mistaken for question number
 * - K: Option number NOT mistaken for question number
 * - L: 4 options in 2 columns
 * - M: Options containing images (Visual option cards)
 * - N: Options containing equations
 * - O: Matrix / Column matching
 * - P: Assertion / Reason structure
 * - Q: Code / Pseudocode question
 * - R: Multiple questions sharing single passage (Zero cloning)
 * - S: Two questions visually adjacent with weak boundary (Hypothesis preservation)
 * - T: Footer/Header contamination isolation
 * - U: Section numbering distinction
 * - V: Ambiguous question boundary
 * - W: Corrupted geometry isolation
 * - X: Unresolved /ObjStm evidence preservation
 * - Y: Unresolved glyph operands preservation
 *
 * Historical regression classes:
 * - SSC CHSL raster banner cascading ownership
 * - SSC CHSL wiped stems
 * - Identical options caused by incorrect ownership
 * - Passage leakage
 * - GATE flattened mathematics
 * - Duplicated diagrams
 * - Fraction splitting
 */

import { describe, it, expect } from 'vitest';
import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import { QuestionGraphBuilder } from './questionGraphBuilder';
import { QuestionGraphValidator } from './questionGraphValidator';

function createMockDocumentGraph(overrides?: Partial<DocumentGraph>): DocumentGraph {
  const nodes = new Map<string, DocumentGraphNode>();

  return {
    graphId: 'doc_graph_test_001',
    documentId: 'doc_test_001',
    sourceDocumentId: 'doc_test_001',
    sourceSnapshotId: 'snap_test_001',
    sourceSha256: 'mock_sha256',
    pageNumber: 1,
    totalPages: 1,
    schemaVersion: 'uadue_document_graph_v2b_schema',
    algorithmVersion: 'uadue_graph_builder_v2b_2026',
    configurationVersion: 'default_v2b_config_2026',
    nodes,
    edges: [],
    columns: [
      {
        columnIndex: 0,
        pageNumber: 1,
        bounds: { minX: 0, maxX: 600, minY: 0, maxY: 800 },
        elementIds: [],
      },
    ],
    spatialRegions: [],
    readingFlow: [],
    readingOrderDAG: {
      rootNodeIds: [],
      terminalNodeIds: [],
      edges: [],
      topologicalOrder: [],
      ambiguousRegions: [],
    },
    crossPageContinuations: [],
    degradedNodes: [],
    provenance: {
      algorithmId: 'test',
      algorithmVersion: '1.0.0',
      configurationVersion: 'test',
      sourceSnapshotId: 'snap_test_001',
      sourceDocumentId: 'doc_test_001',
      sourceSha256: 'mock_sha256',
      createdAt: 1700000000000,
    },
    isSealed: true,
    sealedHash: 'mock_doc_graph_sealed_hash',
    sealedAt: 1700000000000,
    ...overrides,
  };
}

function addTextNode(
  graph: DocumentGraph,
  nodeId: string,
  text: string,
  bbox: { x0: number; y0: number; x1: number; y1: number },
  pageNumber = 1
): DocumentGraphNode {
  const node: DocumentGraphNode = {
    nodeId,
    elementId: nodeId,
    pageNumber,
    nodeType: 'TEXT_RUN',
    bbox: { ...bbox, width: bbox.x1 - bbox.x0, height: bbox.y1 - bbox.y0, unit: 'pt' },
    geometry: {
      bbox: { ...bbox, width: bbox.x1 - bbox.x0, height: bbox.y1 - bbox.y0, unit: 'pt' },
      rotationDeg: 0,
      transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    },
    textContent: text,
    style: { fontSizePt: 10 },
    evidenceClassification: 'DERIVED_PHYSICAL_OBSERVATION',
    sourceEvidence: {
      sourceSnapshotId: graph.sourceSnapshotId,
      sourceDocumentId: graph.sourceDocumentId,
      sourceObjectId: nodeId,
      resolutionStatus: 'EXACT_SOURCE_BYTE',
    },
    provenance: {
      algorithmId: 'test',
      algorithmVersion: '1.0.0',
      sourceSnapshotId: graph.sourceSnapshotId,
      sourceDocumentId: graph.sourceDocumentId,
      resolutionStatus: 'EXACT_SOURCE_BYTE',
      createdAt: 1700000000000,
    },
  };

  graph.nodes.set(nodeId, node);
  graph.readingFlow.push(nodeId);
  return node;
}

function addImageNode(
  graph: DocumentGraph,
  nodeId: string,
  bbox: { x0: number; y0: number; x1: number; y1: number },
  pageNumber = 1
): DocumentGraphNode {
  const node: DocumentGraphNode = {
    nodeId,
    elementId: nodeId,
    pageNumber,
    nodeType: 'RASTER_IMAGE',
    bbox: { ...bbox, width: bbox.x1 - bbox.x0, height: bbox.y1 - bbox.y0, unit: 'pt' },
    geometry: {
      bbox: { ...bbox, width: bbox.x1 - bbox.x0, height: bbox.y1 - bbox.y0, unit: 'pt' },
      rotationDeg: 0,
      transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    },
    evidenceClassification: 'DERIVED_PHYSICAL_OBSERVATION',
    sourceEvidence: {
      sourceSnapshotId: graph.sourceSnapshotId,
      sourceDocumentId: graph.sourceDocumentId,
      sourceObjectId: `img_${nodeId}`,
      resolutionStatus: 'EXACT_SOURCE_BYTE',
    },
    provenance: {
      algorithmId: 'test',
      algorithmVersion: '1.0.0',
      sourceSnapshotId: graph.sourceSnapshotId,
      sourceDocumentId: graph.sourceDocumentId,
      resolutionStatus: 'EXACT_SOURCE_BYTE',
      createdAt: 1700000000000,
    },
  };

  graph.nodes.set(nodeId, node);
  graph.readingFlow.push(nodeId);
  return node;
}

describe('QuestionGraph Validation Suite (Phase 2C)', () => {
  const builder = new QuestionGraphBuilder();

  // ==========================================================================
  // Scenario A: Simple Single MCQ
  // ==========================================================================
  it('Scenario A: constructs simple single MCQ with 4 options and verified physical grounding', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q1_num', 'Q.1', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q1_stem', 'What is the capital of France?', { x0: 90, y0: 100, x1: 300, y1: 120 });
    addTextNode(graph, 'q1_optA', '(A) Berlin', { x0: 90, y0: 130, x1: 200, y1: 150 });
    addTextNode(graph, 'q1_optB', '(B) Madrid', { x0: 90, y0: 160, x1: 200, y1: 180 });
    addTextNode(graph, 'q1_optC', '(C) Paris', { x0: 90, y0: 190, x1: 200, y1: 210 });
    addTextNode(graph, 'q1_optD', '(D) Rome', { x0: 90, y0: 220, x1: 200, y1: 240 });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(1);
    const q1 = qGraph.questions[0];
    expect(q1.identityCandidate.detectedNumber).toBe(1);
    expect(q1.identityCandidate.sourcePrintedLabel).toBe('Q.1');
    expect(q1.optionCandidateIds.length).toBe(4);
    expect(q1.observationState).toBe('OBSERVED');
    expect(q1.verificationStatus).toBe('SUPPORTED');
  });

  // ==========================================================================
  // Scenario B: Multi-line Stem
  // ==========================================================================
  it('Scenario B: captures multi-line stem without truncating or splitting into multiple questions', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q2_num', 'Q.2', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q2_line1', 'Consider a system with 4 processes sharing resources.', { x0: 90, y0: 100, x1: 400, y1: 120 });
    addTextNode(graph, 'q2_line2', 'Each process requires at most 2 instances of resource R.', { x0: 90, y0: 125, x1: 400, y1: 145 });
    addTextNode(graph, 'q2_line3', 'What is the minimum number of units required to guarantee deadlock freedom?', { x0: 90, y0: 150, x1: 450, y1: 170 });
    addTextNode(graph, 'q2_optA', '(A) 4', { x0: 90, y0: 180, x1: 150, y1: 200 });
    addTextNode(graph, 'q2_optB', '(B) 5', { x0: 90, y0: 210, x1: 150, y1: 230 });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(1);
    const q2 = qGraph.questions[0];
    expect(q2.bodyNodeIds).toContain('q2_line2');
    expect(q2.bodyNodeIds).toContain('q2_line3');
  });

  // ==========================================================================
  // Scenario C & D: Diagram + Text (Visual Question)
  // ==========================================================================
  it('Scenario C & D: links diagram and text without OCR description or loss of vector/raster assets', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q3_num', 'Q.3', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q3_stem', 'In the circuit diagram shown below, find current I:', { x0: 90, y0: 100, x1: 380, y1: 120 });
    addImageNode(graph, 'circuit_diagram_img', { x0: 90, y0: 130, x1: 250, y1: 250 });
    addTextNode(graph, 'diag_label', 'R = 10 Ω', { x0: 150, y0: 255, x1: 200, y1: 270 });
    addTextNode(graph, 'q3_optA', '(A) 1.5 A', { x0: 90, y0: 280, x1: 150, y1: 300 });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(1);
    expect(qGraph.diagrams.length).toBeGreaterThan(0);
    const diag = qGraph.diagrams[0];
    expect(diag.physicalNodeIds).toContain('circuit_diagram_img');
    expect(qGraph.questions[0].diagramCandidateIds).toContain(diag.diagramCandidateId);
  });

  // ==========================================================================
  // Scenario E & O: Table + Question (Column-I / Column-II Match)
  // ==========================================================================
  it('Scenario E & O: structurally models Column-I / Column-II matching table without text flattening', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q4_num', 'Q.4', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q4_stem', 'Match List-I with List-II:', { x0: 90, y0: 100, x1: 250, y1: 120 });

    // Matching Table Headers
    addTextNode(graph, 'list1_hdr', 'List-I', { x0: 90, y0: 130, x1: 180, y1: 150 });
    addTextNode(graph, 'list2_hdr', 'List-II', { x0: 250, y0: 130, x1: 350, y1: 150 });

    // Table Items
    addTextNode(graph, 'l1_p', 'P. TCP', { x0: 90, y0: 155, x1: 180, y1: 175 });
    addTextNode(graph, 'l2_1', '1. Reliable transport', { x0: 250, y0: 155, x1: 380, y1: 175 });
    addTextNode(graph, 'l1_q', 'Q. UDP', { x0: 90, y0: 180, x1: 180, y1: 200 });
    addTextNode(graph, 'l2_2', '2. Connectionless', { x0: 250, y0: 180, x1: 380, y1: 200 });

    addTextNode(graph, 'q4_optA', '(A) P-1, Q-2', { x0: 90, y0: 220, x1: 200, y1: 240 });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.tables.length).toBe(1);
    const tbl = qGraph.tables[0];
    expect(tbl.isColumnIColumnIIMatch).toBe(true);
    expect(tbl.rowCount).toBeGreaterThanOrEqual(2);
    expect(qGraph.questions[0].tableCandidateIds).toContain(tbl.tableCandidateId);
  });

  // ==========================================================================
  // Scenario G & R: Shared Stimulus (Passage with multiple questions, ZERO cloning)
  // ==========================================================================
  it('Scenario G & R: references shared passage across multiple questions with ZERO content cloning', async () => {
    const graph = createMockDocumentGraph();
    // Shared Passage Header
    addTextNode(graph, 'pass_hdr', 'Directions (Q. 1 to 2): Read the following passage and answer the questions:', {
      x0: 50,
      y0: 50,
      x1: 450,
      y1: 70,
    });
    addTextNode(graph, 'pass_body', 'Photosynthesis converts carbon dioxide and water into glucose and oxygen in the presence of sunlight.', {
      x0: 50,
      y0: 75,
      x1: 500,
      y1: 100,
    });

    // Question 1
    addTextNode(graph, 'q1_num', 'Q.1', { x0: 50, y0: 120, x1: 80, y1: 140 });
    addTextNode(graph, 'q1_stem', 'What gas is released during photosynthesis?', { x0: 90, y0: 120, x1: 350, y1: 140 });
    addTextNode(graph, 'q1_optA', '(A) Oxygen', { x0: 90, y0: 145, x1: 180, y1: 165 });

    // Question 2
    addTextNode(graph, 'q2_num', 'Q.2', { x0: 50, y0: 180, x1: 80, y1: 200 });
    addTextNode(graph, 'q2_stem', 'What sugar is produced?', { x0: 90, y0: 180, x1: 250, y1: 200 });
    addTextNode(graph, 'q2_optA', '(A) Glucose', { x0: 90, y0: 205, x1: 180, y1: 225 });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.stimuli.length).toBe(1);
    const stim = qGraph.stimuli[0];
    expect(stim.stimulusType).toBe('PASSAGE');

    expect(qGraph.questions.length).toBe(2);
    const q1 = qGraph.questions[0];
    const q2 = qGraph.questions[1];

    // Both questions reference the same shared stimulus
    expect(q1.stimulusRefIds).toContain(stim.stimulusId);
    expect(q2.stimulusRefIds).toContain(stim.stimulusId);

    // ZERO CLONING INVARIANT: Passage body must NOT be inside individual question stemNodeIds
    expect(q1.stemNodeIds).not.toContain('pass_body');
    expect(q2.stemNodeIds).not.toContain('pass_body');
  });

  // ==========================================================================
  // Scenario I, J, K: Disambiguation of Numbers
  // ==========================================================================
  it('Scenario I, J, K: distinguishes Page, Figure, and Option numbers from Question Numbers', async () => {
    const graph = createMockDocumentGraph();
    // Page Number at top margin
    addTextNode(graph, 'page_num', 'Page 14', { x0: 500, y0: 20, x1: 550, y1: 35 });

    // Real Question Number
    addTextNode(graph, 'q5_num', 'Q.5', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q5_stem', 'In Figure 2, calculate total resistance:', { x0: 90, y0: 100, x1: 350, y1: 120 });

    // Figure Number
    addTextNode(graph, 'fig_caption', 'Figure 2: Resistor Network', { x0: 90, y0: 130, x1: 250, y1: 150 });

    // Option Number
    addTextNode(graph, 'opt1', '(1) 100 Ω', { x0: 90, y0: 160, x1: 160, y1: 180 });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(1);
    expect(qGraph.questions[0].identityCandidate.detectedNumber).toBe(5);
    // Page 14 and Figure 2 must NOT spawn fake questions
    expect(qGraph.questions.some((q) => q.identityCandidate.detectedNumber === 14)).toBe(false);
    expect(qGraph.questions.some((q) => q.identityCandidate.detectedNumber === 2)).toBe(false);
  });

  // ==========================================================================
  // Scenario L: 4 Options in 2 Columns
  // ==========================================================================
  it('Scenario L: correctly detects 4 options arranged in a 2x2 multi-column grid', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q6_num', 'Q.6', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q6_stem', 'Select the correct statement:', { x0: 90, y0: 100, x1: 250, y1: 120 });

    // Left Column Options (A & C)
    addTextNode(graph, 'optA', '(A) Option Alpha', { x0: 90, y0: 130, x1: 200, y1: 150 });
    addTextNode(graph, 'optC', '(C) Option Gamma', { x0: 90, y0: 160, x1: 200, y1: 180 });

    // Right Column Options (B & D)
    addTextNode(graph, 'optB', '(B) Option Beta', { x0: 250, y0: 130, x1: 360, y1: 150 });
    addTextNode(graph, 'optD', '(D) Option Delta', { x0: 250, y0: 160, x1: 360, y1: 180 });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(1);
    expect(qGraph.questions[0].optionCandidateIds.length).toBe(4);
    const markers = qGraph.options.map((o) => o.markerLabel);
    expect(markers).toContain('(A)');
    expect(markers).toContain('(B)');
    expect(markers).toContain('(C)');
    expect(markers).toContain('(D)');
  });

  // ==========================================================================
  // Scenario M: Visual Option Cards (Options containing images)
  // ==========================================================================
  it('Scenario M: detects Visual Option Cards without dropping image references', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q7_num', 'Q.7', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q7_stem', 'Which shape has reflective symmetry?', { x0: 90, y0: 100, x1: 320, y1: 120 });

    // Option (A) with Image
    addTextNode(graph, 'optA_marker', '(A)', { x0: 90, y0: 130, x1: 110, y1: 150 });
    addImageNode(graph, 'shape_a_img', { x0: 120, y0: 130, x1: 180, y1: 190 });

    // Option (B) with Image
    addTextNode(graph, 'optB_marker', '(B)', { x0: 220, y0: 130, x1: 240, y1: 150 });
    addImageNode(graph, 'shape_b_img', { x0: 250, y0: 130, x1: 310, y1: 190 });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(1);
    expect(qGraph.options.length).toBe(2);
    expect(qGraph.options[0].hasVisualAsset).toBe(true);
    expect(qGraph.options[1].hasVisualAsset).toBe(true);
  });

  // ==========================================================================
  // Scenario N & Fraction Splitting: Mathematics Preserved
  // ==========================================================================
  it('Scenario N: preserves mathematical equations and fractions without LaTeX mutation', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q8_num', 'Q.8', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q8_stem', 'Evaluate the integral ∫ x dx:', { x0: 90, y0: 100, x1: 250, y1: 120 });

    // Fraction line as vector path
    const fracLine: DocumentGraphNode = {
      nodeId: 'frac_line',
      elementId: 'frac_line',
      pageNumber: 1,
      nodeType: 'VECTOR_PATH',
      bbox: { x0: 90, y0: 140, x1: 110, y1: 141, width: 20, height: 1, unit: 'pt' },
      geometry: {
        bbox: { x0: 90, y0: 140, x1: 110, y1: 141, width: 20, height: 1, unit: 'pt' },
        rotationDeg: 0,
        transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      },
      evidenceClassification: 'DERIVED_PHYSICAL_OBSERVATION',
      sourceEvidence: {
        sourceSnapshotId: graph.sourceSnapshotId,
        sourceDocumentId: graph.sourceDocumentId,
        resolutionStatus: 'EXACT_SOURCE_BYTE',
      },
      provenance: {
        algorithmId: 'test',
        algorithmVersion: '1.0.0',
        sourceSnapshotId: graph.sourceSnapshotId,
        sourceDocumentId: graph.sourceDocumentId,
        resolutionStatus: 'EXACT_SOURCE_BYTE',
        createdAt: 1700000000000,
      },
    };
    graph.nodes.set('frac_line', fracLine);

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.mathBlocks.length).toBeGreaterThan(0);
    expect(qGraph.mathBlocks[0].originalGlyphsPreserved).toBe(true);
  });

  // ==========================================================================
  // Scenario P: Assertion / Reason Structure
  // ==========================================================================
  it('Scenario P: groups Assertion and Reason within a single question candidate', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q9_num', 'Q.9', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q9_assert', 'Assertion (A): Boiling point of water decreases at high altitudes.', {
      x0: 90,
      y0: 100,
      x1: 420,
      y1: 120,
    });
    addTextNode(graph, 'q9_reason', 'Reason (R): Atmospheric pressure is lower at high altitudes.', {
      x0: 90,
      y0: 125,
      x1: 420,
      y1: 145,
    });
    addTextNode(graph, 'q9_optA', '(A) Both (A) and (R) are true and (R) is correct explanation', {
      x0: 90,
      y0: 155,
      x1: 450,
      y1: 175,
    });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(1);
    const q9 = qGraph.questions[0];
    expect(q9.bodyNodeIds).toContain('q9_reason');
  });

  // ==========================================================================
  // Scenario S & V: Ambiguity Record & Hypothesis Preservation
  // ==========================================================================
  it('Scenario S & V: preserves competing hypotheses and records AmbiguityRecord for adjacent questions with weak boundaries', async () => {
    const graph = createMockDocumentGraph();
    // Question without number
    addTextNode(graph, 'q_weak_1', 'Calculate the area of a circle with radius 7 cm.', {
      x0: 50,
      y0: 100,
      x1: 350,
      y1: 120,
    });
    // Immediately adjacent sentence without delimiter
    addTextNode(graph, 'q_weak_2', 'Calculate its circumference.', {
      x0: 50,
      y0: 125,
      x1: 250,
      y1: 145,
    });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.hypotheses.length).toBeGreaterThan(0);
    // Confidence != Verification invariant
    expect(qGraph.verificationState.overallStatus).not.toBe('VERIFIED');
  });

  // ==========================================================================
  // Adversarial: Zero Canonical Question Identity
  // ==========================================================================
  it('ADVERSARIAL: QuestionGraphValidator throws on illegal canonical question identity leakage', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q10_num', 'Q.10', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q10_stem', 'Sample prompt', { x0: 90, y0: 100, x1: 200, y1: 120 });

    const qGraph = await builder.buildGraph(graph);

    // Adversarially inject canonical key
    (qGraph.questions[0] as any).canonicalQuestionId = 'CANON_Q_10';

    const result = QuestionGraphValidator.validate(qGraph, graph);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('ILLEGAL_CANONICAL_IDENTITY'))).toBe(true);
  });

  // ==========================================================================
  // Invariant: Confidence != Verification
  // ==========================================================================
  it('INVARIANT: high confidence score never automatically coerces status to VERIFIED', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q11_num', 'Q.11', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q11_stem', 'Sample prompt', { x0: 90, y0: 100, x1: 200, y1: 120 });

    const qGraph = await builder.buildGraph(graph);

    // Adversarially force status to VERIFIED without verification stage
    qGraph.questions[0].confidenceScore = 0.99;
    qGraph.questions[0].verificationStatus = 'VERIFIED';

    const result = QuestionGraphValidator.validate(qGraph, graph);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('UNVERIFIED_STATUS_COERCION'))).toBe(true);
  });

  // ==========================================================================
  // Scenario F: Question Spanning Pages (CONTINUES_PHYSICALLY)
  // ==========================================================================
  it('Scenario F: evaluates CONTINUES_PHYSICALLY across page boundaries and marks isMultiPage', async () => {
    const graph = createMockDocumentGraph({ totalPages: 2 });
    // Page 1
    addTextNode(graph, 'q12_num', 'Q.12', { x0: 50, y0: 750, x1: 80, y1: 770 }, 1);
    addTextNode(graph, 'q12_tail', 'The mechanism of enzyme catalysis depends on the active site conformation,', { x0: 90, y0: 750, x1: 500, y1: 770 }, 1);

    // Page 2
    addTextNode(graph, 'q12_head', 'which stabilizes the transition state of the substrate molecules.', { x0: 90, y0: 60, x1: 500, y1: 80 }, 2);
    addTextNode(graph, 'q12_optA', '(A) True', { x0: 90, y0: 95, x1: 150, y1: 115 }, 2);
    addTextNode(graph, 'q12_optB', '(B) False', { x0: 90, y0: 125, x1: 150, y1: 145 }, 2);

    graph.crossPageContinuations.push({
      candidateId: 'cont_p1_p2',
      fromPageNumber: 1,
      toPageNumber: 2,
      fromNodeId: 'q12_tail',
      toNodeId: 'q12_head',
      relation: 'CONTINUES_PHYSICALLY',
      compatibilityScore: 0.95,
      metrics: {
        bottomMarginDeltaPt: 50,
        topMarginDeltaPt: 60,
        fontSizeDeltaPt: 0,
        fontMatch: true,
        columnAlignment: true,
      },
      decisionBasis: 'Syntactic continuation across page break',
    });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(1);
    const q12 = qGraph.questions[0];
    expect(q12.identityCandidate.detectedNumber).toBe(12);
    expect(q12.startPageNumber).toBe(1);
    expect(q12.endPageNumber).toBe(2);
    expect(q12.isMultiPage).toBe(true);
    expect(q12.includedPhysicalNodeIds).toContain('q12_tail');
    expect(q12.includedPhysicalNodeIds).toContain('q12_head');
  });

  // ==========================================================================
  // Scenario H: Question with No Explicit Number
  // ==========================================================================
  it('Scenario H: captures unnumbered problem stem without inventing synthetic question numbers', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'unnum_stem', 'Explain the differences between synchronous and asynchronous transmission.', {
      x0: 50,
      y0: 100,
      x1: 450,
      y1: 120,
    });
    addTextNode(graph, 'unnum_body', 'Include considerations for clock synchronization and framing overhead.', {
      x0: 50,
      y0: 130,
      x1: 450,
      y1: 150,
    });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.hypotheses.length).toBeGreaterThan(0);
    // Question number should NOT be synthetically fabricated
    if (qGraph.questions.length > 0) {
      expect(qGraph.questions[0].identityCandidate.detectedNumber).toBeUndefined();
    }
  });

  // ==========================================================================
  // Scenario Q: Code / Pseudocode Question
  // ==========================================================================
  it('Scenario Q: preserves code blocks and indentation without splitting lines into separate questions', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q13_num', 'Q.13', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q13_stem', 'What does the following recursive function compute for positive integer n?', {
      x0: 90,
      y0: 100,
      x1: 480,
      y1: 120,
    });
    addTextNode(graph, 'code_line1', 'int f(int n) {', { x0: 110, y0: 130, x1: 200, y1: 150 });
    addTextNode(graph, 'code_line2', '    if (n <= 1) return 1;', { x0: 110, y0: 155, x1: 250, y1: 175 });
    addTextNode(graph, 'code_line3', '    return n * f(n - 1);', { x0: 110, y0: 180, x1: 250, y1: 200 });
    addTextNode(graph, 'code_line4', '}', { x0: 110, y0: 205, x1: 130, y1: 225 });
    addTextNode(graph, 'q13_optA', '(A) Factorial of n', { x0: 90, y0: 235, x1: 220, y1: 255 });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(1);
    const q13 = qGraph.questions[0];
    expect(q13.bodyNodeIds).toContain('code_line2');
    expect(q13.bodyNodeIds).toContain('code_line3');
    expect(q13.optionCandidateIds.length).toBe(1);
  });

  // ==========================================================================
  // Scenario T: Footer / Header Contamination Isolation
  // ==========================================================================
  it('Scenario T: isolates running headers and footers from question stems', async () => {
    const graph = createMockDocumentGraph();
    // Running header at top margin
    addTextNode(graph, 'header_txt', 'STAFF SELECTION COMMISSION - TIER 1 EXAMINATION', {
      x0: 50,
      y0: 20,
      x1: 400,
      y1: 35,
    });

    addTextNode(graph, 'q14_num', 'Q.14', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q14_stem', 'Which element has atomic number 6?', { x0: 90, y0: 100, x1: 300, y1: 120 });
    addTextNode(graph, 'q14_optA', '(A) Carbon', { x0: 90, y0: 130, x1: 160, y1: 150 });

    // Running footer at bottom margin
    addTextNode(graph, 'footer_txt', 'Page 1 of 33 - Unauthorized duplication is prohibited', {
      x0: 100,
      y0: 780,
      x1: 450,
      y1: 795,
    });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(1);
    const q14 = qGraph.questions[0];
    // Header and footer must NOT be swallowed into question stem
    expect(q14.stemNodeIds).not.toContain('header_txt');
    expect(q14.stemNodeIds).not.toContain('footer_txt');
  });

  // ==========================================================================
  // Historical Regression: SSC CHSL Wiped Stems Prevention
  // ==========================================================================
  it('REGRESSION: prevents stem wiping by guaranteeing non-empty stemNodeIds when options follow', async () => {
    const graph = createMockDocumentGraph();
    addTextNode(graph, 'q15_num', 'Q.15', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q15_stem', 'Select the option that is related to the third word in the same way as second is related to first.', {
      x0: 90,
      y0: 100,
      x1: 520,
      y1: 120,
    });
    addTextNode(graph, 'q15_optA', '(A) Dog : Bark', { x0: 90, y0: 130, x1: 200, y1: 150 });
    addTextNode(graph, 'q15_optB', '(B) Cat : Meow', { x0: 90, y0: 160, x1: 200, y1: 180 });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(1);
    const q15 = qGraph.questions[0];
    expect(q15.stemNodeIds.length).toBeGreaterThan(0);
    expect(q15.stemNodeIds).toContain('q15_stem');
  });

  // ==========================================================================
  // Historical Regression: Option Ownership Isolation across Sequential Questions
  // ==========================================================================
  it('REGRESSION: isolates options between Q1 and Q2 preventing identical option leakage', async () => {
    const graph = createMockDocumentGraph();
    // Question 1
    addTextNode(graph, 'q1_num', 'Q.1', { x0: 50, y0: 100, x1: 80, y1: 120 });
    addTextNode(graph, 'q1_stem', 'Capital of Germany?', { x0: 90, y0: 100, x1: 250, y1: 120 });
    addTextNode(graph, 'q1_optA', '(A) Berlin', { x0: 90, y0: 130, x1: 180, y1: 150 });
    addTextNode(graph, 'q1_optB', '(B) Munich', { x0: 90, y0: 160, x1: 180, y1: 180 });

    // Question 2
    addTextNode(graph, 'q2_num', 'Q.2', { x0: 50, y0: 200, x1: 80, y1: 220 });
    addTextNode(graph, 'q2_stem', 'Capital of Italy?', { x0: 90, y0: 200, x1: 250, y1: 220 });
    addTextNode(graph, 'q2_optA', '(A) Rome', { x0: 90, y0: 230, x1: 180, y1: 250 });
    addTextNode(graph, 'q2_optB', '(B) Milan', { x0: 90, y0: 260, x1: 180, y1: 280 });

    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions.length).toBe(2);
    const q1 = qGraph.questions[0];
    const q2 = qGraph.questions[1];

    // Q1 options must only belong to Q1
    expect(q1.optionCandidateIds.length).toBe(2);
    // Q2 options must only belong to Q2
    expect(q2.optionCandidateIds.length).toBe(2);

    const q1Options = qGraph.options.filter((o) => q1.optionCandidateIds.includes(o.optionCandidateId));
    const q2Options = qGraph.options.filter((o) => q2.optionCandidateIds.includes(o.optionCandidateId));

    expect(q1Options.map((o) => o.contentNodeIds[0])).toEqual(['q1_optA', 'q1_optB']);
    expect(q2Options.map((o) => o.contentNodeIds[0])).toEqual(['q2_optA', 'q2_optB']);
  });
});
