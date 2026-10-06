/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Test Suite: Historical Mock.AI Failure Regression Suite (Phase 2C)
 *
 * Mandatory regression validation for all 12 known historical Mock.AI failure classes:
 *
 * A. SSC CHSL Historical Failure Classes:
 * 1. REG-SSC-01: Raster banner cascading ownership
 * 2. REG-SSC-02: Wiped question stems
 * 3. REG-SSC-03: Identical options allocation across adjacent questions
 * 4. REG-SSC-04: Shared passage / stimulus leakage into question stems
 * 5. REG-SSC-05: Answer-key / question identity shift
 * 6. REG-SSC-06: TCS candidate-order / response status block confusion
 *
 * B. GATE Historical Failure Classes:
 * 7. REG-GATE-01: Flattened mathematics
 * 8. REG-GATE-02: Duplicated option images
 * 9. REG-GATE-03: Flattened Column-I / Column-II matching grids
 * 10. REG-GATE-04: Diagram-label leakage into stem text
 * 11. REG-GATE-05: Duplicate diagrams across questions
 * 12. REG-GATE-06: Fraction splitting (numerator and denominator divorced)
 */

import { describe, it, expect } from 'vitest';
import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import { QuestionGraphBuilder } from './questionGraphBuilder';
import { QuestionGraphValidator } from './questionGraphValidator';

describe('Historical Mock.AI Failure Regression Suite (Phase 2C)', () => {
  const builder = new QuestionGraphBuilder();

  function makeMockDocGraph(nodes: DocumentGraphNode[], edges: any[] = []): DocumentGraph {
    const nodeMap = new Map<string, DocumentGraphNode>();
    for (const n of nodes) nodeMap.set(n.nodeId, n);
    return {
      schemaVersion: 'uadue_document_graph_v2b_schema',
      algorithmVersion: 'uadue_document_graph_builder_v2b_2026',
      configurationVersion: 'default_v2b_config_2026',
      graphId: 'dg_mock_regression',
      sourceDocumentId: 'doc_regression_proof',
      sourceSnapshotId: 'snap_regression_proof',
      sourceSha256: 'a'.repeat(64),
      pageNumber: 1,
      totalPages: 1,
      nodes: nodeMap,
      edges,
      columns: [{ columnId: 'col_1', pageNumber: 1, columnIndex: 0, bbox: { x0: 0, y0: 0, x1: 595, y1: 842 }, elementIds: nodes.map(n => n.nodeId) }],
      spatialRegions: [],
      readingFlow: nodes.map((n) => n.nodeId),
      readingOrderDAG: { rootNodeIds: [nodes[0]?.nodeId || ''], terminalNodeIds: [nodes[nodes.length - 1]?.nodeId || ''], edges: [], topologicalOrder: nodes.map(n => n.nodeId), ambiguousRegions: [] },
      crossPageContinuations: [],
      degradedNodes: [],
      provenance: {
        algorithmId: 'test_builder',
        algorithmVersion: '1.0.0',
        configurationVersion: 'test_config',
        sourceSnapshotId: 'snap_regression_proof',
        sourceDocumentId: 'doc_regression_proof',
        sourceSha256: 'a'.repeat(64),
        createdAt: 1700000000000,
        determinismScope: { identicalSnapshot: true, identicalAlgorithm: true, identicalConfig: true, runtime: 'Node.js', floatPrecision: 'IEEE_754_64BIT' },
      },
      isSealed: true,
      sealedHash: 'b'.repeat(64),
      sealedAt: 1700000000000,
    };
  }

  // ==========================================================================
  // SSC CHSL Historical Regressions (REG-SSC-01 to REG-SSC-06)
  // ==========================================================================

  it('REG-SSC-01: Raster banner cascading ownership - full-page background images are not attached to questions as diagrams', async () => {
    // Reproduction of historical bug where full-page banner/print background was claimed as a diagram by Q1
    const nodes: DocumentGraphNode[] = [
      // Full-page canvas background image emitted by printer driver
      {
        nodeId: 'node_bg_banner',
        nodeType: 'RASTER_IMAGE',
        pageNumber: 1,
        bbox: { x0: 0, y0: 0, x1: 595, y1: 842, pageWidth: 595, pageHeight: 842 },
        textContent: '',
        readingOrderIndex: 0,
        confidence: 0.99,
        sourceEvidence: { sourceObjectId: 'obj_bg_img_0' },
      },
      // Question 1
      {
        nodeId: 'node_q1',
        nodeType: 'TEXT_RUN',
        pageNumber: 1,
        bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 },
        textContent: 'Q.1',
        readingOrderIndex: 1,
        confidence: 0.99,
      },
      {
        nodeId: 'node_q1_stem',
        nodeType: 'TEXT_RUN',
        pageNumber: 1,
        bbox: { x0: 90, y0: 100, x1: 400, y1: 115, pageWidth: 595, pageHeight: 842 },
        textContent: 'Select the correctly spelt word.',
        readingOrderIndex: 2,
        confidence: 0.99,
      },
      {
        nodeId: 'node_q1_opt1',
        nodeType: 'TEXT_RUN',
        pageNumber: 1,
        bbox: { x0: 90, y0: 130, x1: 250, y1: 145, pageWidth: 595, pageHeight: 842 },
        textContent: '1. Business',
        readingOrderIndex: 3,
        confidence: 0.95,
      },
      {
        nodeId: 'node_q1_opt2',
        nodeType: 'TEXT_RUN',
        pageNumber: 1,
        bbox: { x0: 90, y0: 155, x1: 250, y1: 170, pageWidth: 595, pageHeight: 842 },
        textContent: '2. Buisnesc',
        readingOrderIndex: 4,
        confidence: 0.95,
      },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions).toHaveLength(1);
    const q1 = qGraph.questions[0];
    // Must NOT have any diagram candidates attached
    expect(q1.diagramCandidateIds).toHaveLength(0);
    expect(qGraph.diagrams).toHaveLength(0);
  });

  it('REG-SSC-02: Wiped question stems - questions preceding or following option blocks retain non-empty stems', async () => {
    // Historical failure: When options were encountered, stemNodeIds was inadvertently wiped
    const nodes: DocumentGraphNode[] = [
      {
        nodeId: 'node_q1_num',
        nodeType: 'TEXT_RUN',
        pageNumber: 1,
        bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 },
        textContent: 'Q.1',
        readingOrderIndex: 0,
        confidence: 0.99,
      },
      {
        nodeId: 'node_q1_stem_text',
        nodeType: 'TEXT_RUN',
        pageNumber: 1,
        bbox: { x0: 90, y0: 100, x1: 450, y1: 115, pageWidth: 595, pageHeight: 842 },
        textContent: 'Identify the segment in the sentence which contains a grammatical error.',
        readingOrderIndex: 1,
        confidence: 0.99,
      },
      {
        nodeId: 'node_q1_opt1',
        nodeType: 'TEXT_RUN',
        pageNumber: 1,
        bbox: { x0: 90, y0: 130, x1: 300, y1: 145, pageWidth: 595, pageHeight: 842 },
        textContent: '1. in the sentence',
        readingOrderIndex: 2,
        confidence: 0.95,
      },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions).toHaveLength(1);
    const q1 = qGraph.questions[0];
    expect(q1.stemNodeIds.length).toBeGreaterThan(0);
    expect(q1.stemNodeIds).toContain('node_q1_stem_text');
  });

  it('REG-SSC-03: Identical options - options are strictly partitioned to their owning question', async () => {
    // Historical failure: Q1 and Q2 shared or leaked identical option lists
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'node_q1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'node_q1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 300, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'First question stem.', readingOrderIndex: 1, confidence: 0.99 },
      { nodeId: 'node_q1_opt1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 130, x1: 200, y1: 145, pageWidth: 595, pageHeight: 842 }, textContent: '1. Opt A', readingOrderIndex: 2, confidence: 0.95 },
      { nodeId: 'node_q1_opt2', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 150, x1: 200, y1: 165, pageWidth: 595, pageHeight: 842 }, textContent: '2. Opt B', readingOrderIndex: 3, confidence: 0.95 },
      { nodeId: 'node_q2', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 200, x1: 80, y1: 215, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.2', readingOrderIndex: 4, confidence: 0.99 },
      { nodeId: 'node_q2_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 200, x1: 300, y1: 215, pageWidth: 595, pageHeight: 842 }, textContent: 'Second question stem.', readingOrderIndex: 5, confidence: 0.99 },
      { nodeId: 'node_q2_opt1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 230, x1: 200, y1: 245, pageWidth: 595, pageHeight: 842 }, textContent: '1. Opt X', readingOrderIndex: 6, confidence: 0.95 },
      { nodeId: 'node_q2_opt2', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 250, x1: 200, y1: 265, pageWidth: 595, pageHeight: 842 }, textContent: '2. Opt Y', readingOrderIndex: 7, confidence: 0.95 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions).toHaveLength(2);
    const q1Opts = qGraph.questions[0].optionCandidateIds;
    const q2Opts = qGraph.questions[1].optionCandidateIds;

    // Zero overlap between options of Q1 and Q2
    const overlap = q1Opts.filter((id) => q2Opts.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('REG-SSC-04: Passage / stimulus leakage - shared comprehension passage is referenced via stimulusRefIds without cloning', async () => {
    // Historical failure: Reading passage text was absorbed into Question 1's stem
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'node_stim_hdr', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 80, x1: 350, y1: 95, pageWidth: 595, pageHeight: 842 }, textContent: 'Read the passage and answer questions 1 to 2.', readingOrderIndex: 0, confidence: 0.95 },
      { nodeId: 'node_stim_body', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 105, x1: 500, y1: 150, pageWidth: 595, pageHeight: 842 }, textContent: 'Artificial intelligence is transforming science and industry.', readingOrderIndex: 1, confidence: 0.95 },
      { nodeId: 'node_q1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 170, x1: 80, y1: 185, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 2, confidence: 0.99 },
      { nodeId: 'node_q1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 170, x1: 350, y1: 185, pageWidth: 595, pageHeight: 842 }, textContent: 'What is transforming science?', readingOrderIndex: 3, confidence: 0.99 },
      { nodeId: 'node_q2', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 220, x1: 80, y1: 235, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.2', readingOrderIndex: 4, confidence: 0.99 },
      { nodeId: 'node_q2_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 220, x1: 350, y1: 235, pageWidth: 595, pageHeight: 842 }, textContent: 'Which sector is impacted?', readingOrderIndex: 5, confidence: 0.99 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.stimuli).toHaveLength(1);
    const stim = qGraph.stimuli[0];
    expect(stim.supportedQuestionCandidateIds.length).toBeGreaterThanOrEqual(1);

    // Assert zero cloning into question stems
    for (const q of qGraph.questions) {
      expect(q.stemNodeIds).not.toContain('node_stim_body');
      expect(q.stemNodeIds).not.toContain('node_stim_hdr');
    }
  });

  it('REG-SSC-05: Answer-key / question identity shift - zero canonical ID or answer key information appears in QuestionGraph', async () => {
    // Historical failure: Answer key and canonical schema leaked into intermediate representation
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'node_q1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'node_q1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 300, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Capital of India is:', readingOrderIndex: 1, confidence: 0.99 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    // Validate absolute absence of answer-key or canonical attributes
    const q1 = qGraph.questions[0] as any;
    expect(q1.canonicalId).toBeUndefined();
    expect(q1.canonicalQuestionId).toBeUndefined();
    expect(q1.correctAnswer).toBeUndefined();
    expect(q1.answerKey).toBeUndefined();
    expect(q1.markingScheme).toBeUndefined();
  });

  it('REG-SSC-06: TCS response status block isolation - official metadata table is isolated and officialQuestionId is preserved', async () => {
    // Historical failure: TCS metadata block ("Question ID : 63068012345") was swallowed as question body text or question numbers
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'node_q1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'node_q1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 300, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Question stem text.', readingOrderIndex: 1, confidence: 0.99 },
      { nodeId: 'node_q1_opt1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 130, x1: 200, y1: 145, pageWidth: 595, pageHeight: 842 }, textContent: '1. Option 1', readingOrderIndex: 2, confidence: 0.95 },
      // TCS Metadata Box
      { nodeId: 'node_tcs_qid', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 380, y0: 130, x1: 520, y1: 145, pageWidth: 595, pageHeight: 842 }, textContent: 'Question ID : 63068012345', readingOrderIndex: 3, confidence: 0.95 },
      { nodeId: 'node_tcs_status', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 380, y0: 150, x1: 520, y1: 165, pageWidth: 595, pageHeight: 842 }, textContent: 'Status : Answered', readingOrderIndex: 4, confidence: 0.95 },
      { nodeId: 'node_tcs_chosen', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 380, y0: 170, x1: 520, y1: 185, pageWidth: 595, pageHeight: 842 }, textContent: 'Chosen Option : 1', readingOrderIndex: 5, confidence: 0.95 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions).toHaveLength(1);
    const q1 = qGraph.questions[0];
    // Official question ID is preserved
    expect(q1.officialQuestionId).toBe('63068012345');
    // TCS block is NOT classified as a question number
    expect(qGraph.questions.map(q => q.identityCandidate.detectedNumber)).toEqual([1]);
  });

  // ==========================================================================
  // GATE Historical Regressions (REG-GATE-01 to REG-GATE-06)
  // ==========================================================================

  it('REG-GATE-01: Flattened mathematics - math runs retain physical glyph candidate grouping without lossy stringification', async () => {
    // Historical failure: Fractions and integrals collapsed into plain unstructured text
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'node_q1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'node_q1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 250, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Evaluate the expression:', readingOrderIndex: 1, confidence: 0.99 },
      // Math formula glyphs
      { nodeId: 'node_math_num', nodeType: 'GLYPH_RUN', pageNumber: 1, bbox: { x0: 90, y0: 125, x1: 110, y1: 135, pageWidth: 595, pageHeight: 842 }, textContent: 'x^2', readingOrderIndex: 2, confidence: 0.98 },
      { nodeId: 'node_math_bar', nodeType: 'VECTOR_PATH', pageNumber: 1, bbox: { x0: 85, y0: 136, x1: 115, y1: 137, pageWidth: 595, pageHeight: 842 }, textContent: '', readingOrderIndex: 3, confidence: 0.98 },
      { nodeId: 'node_math_den', nodeType: 'GLYPH_RUN', pageNumber: 1, bbox: { x0: 90, y0: 139, x1: 110, y1: 149, pageWidth: 595, pageHeight: 842 }, textContent: 'y^2', readingOrderIndex: 4, confidence: 0.98 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.mathBlocks.length).toBeGreaterThan(0);
    const mBlock = qGraph.mathBlocks[0];
    expect(mBlock.physicalNodeIds).toContain('node_math_num');
    expect(mBlock.physicalNodeIds).toContain('node_math_den');
    expect(mBlock.containsFractionOrMatrix).toBe(true);
  });

  it('REG-GATE-02: Duplicated option images - unique visual option cards are preserved without duplicate hashing', async () => {
    // Historical failure: Option images with similar dimensions were de-duplicated or overwritten
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'node_q1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'node_q1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 300, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Which graph is bipartite?', readingOrderIndex: 1, confidence: 0.99 },
      // Option A Card
      { nodeId: 'node_opt_a_lbl', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 130, x1: 110, y1: 145, pageWidth: 595, pageHeight: 842 }, textContent: '(A)', readingOrderIndex: 2, confidence: 0.95 },
      { nodeId: 'node_opt_a_img', nodeType: 'RASTER_IMAGE', pageNumber: 1, bbox: { x0: 115, y0: 130, x1: 180, y1: 180, pageWidth: 595, pageHeight: 842 }, textContent: '', readingOrderIndex: 3, confidence: 0.99, sourceEvidence: { sourceObjectId: 'img_graph_a' } },
      // Option B Card
      { nodeId: 'node_opt_b_lbl', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 220, y0: 130, x1: 240, y1: 145, pageWidth: 595, pageHeight: 842 }, textContent: '(B)', readingOrderIndex: 4, confidence: 0.95 },
      { nodeId: 'node_opt_b_img', nodeType: 'RASTER_IMAGE', pageNumber: 1, bbox: { x0: 245, y0: 130, x1: 310, y1: 180, pageWidth: 595, pageHeight: 842 }, textContent: '', readingOrderIndex: 5, confidence: 0.99, sourceEvidence: { sourceObjectId: 'img_graph_b' } },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.options).toHaveLength(2);
    const optA = qGraph.options.find(o => o.markerLabel === '(A)');
    const optB = qGraph.options.find(o => o.markerLabel === '(B)');
    expect(optA).toBeDefined();
    expect(optB).toBeDefined();
    expect(optA?.hasVisualAsset).toBe(true);
    expect(optB?.hasVisualAsset).toBe(true);
    expect(optA?.contentNodeIds).toContain('node_opt_a_img');
    expect(optB?.contentNodeIds).toContain('node_opt_b_img');
  });

  it('REG-GATE-03: Flattened Column-I / Column-II - matching grid preserves structured cell geometry', async () => {
    // Historical failure: Column-I / Column-II tables collapsed into unstructured plain text
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'node_q1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'node_q1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 300, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Match Column-I with Column-II:', readingOrderIndex: 1, confidence: 0.99 },
      // Table cells
      { nodeId: 'node_c1_hdr', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 130, x1: 200, y1: 145, pageWidth: 595, pageHeight: 842 }, textContent: 'Column I', readingOrderIndex: 2, confidence: 0.95 },
      { nodeId: 'node_c2_hdr', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 220, y0: 130, x1: 330, y1: 145, pageWidth: 595, pageHeight: 842 }, textContent: 'Column II', readingOrderIndex: 3, confidence: 0.95 },
      { nodeId: 'node_r1_c1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 155, x1: 200, y1: 170, pageWidth: 595, pageHeight: 842 }, textContent: 'P. QuickSort', readingOrderIndex: 4, confidence: 0.95 },
      { nodeId: 'node_r1_c2', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 220, y0: 155, x1: 330, y1: 170, pageWidth: 595, pageHeight: 842 }, textContent: '1. Divide & Conquer', readingOrderIndex: 5, confidence: 0.95 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.tables).toHaveLength(1);
    const tbl = qGraph.tables[0];
    expect(tbl.isColumnIColumnIIMatch).toBe(true);
    expect(tbl.columnCount).toBe(2);
    expect(tbl.rowCount).toBe(2);
  });

  it('REG-GATE-04: Diagram-label leakage - internal diagram labels are not detached into question stem text', async () => {
    // Historical failure: Text labels inside circuit diagrams ("V_in", "5V", "R1") were extracted as question stem text
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'node_q1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'node_q1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 300, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'In the circuit shown below, find the output voltage.', readingOrderIndex: 1, confidence: 0.99 },
      // Diagram raster asset
      { nodeId: 'node_diag_img', nodeType: 'RASTER_IMAGE', pageNumber: 1, bbox: { x0: 100, y0: 130, x1: 250, y1: 230, pageWidth: 595, pageHeight: 842 }, textContent: '', readingOrderIndex: 2, confidence: 0.99 },
      // Embedded label inside diagram
      { nodeId: 'node_diag_lbl', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 120, y0: 140, x1: 150, y1: 155, pageWidth: 595, pageHeight: 842 }, textContent: 'Vin = 5V', readingOrderIndex: 3, confidence: 0.95 },
    ];

    const edges = [
      { sourceNodeId: 'node_diag_img', targetNodeId: 'node_diag_lbl', relation: 'CONTAINS', confidence: 0.95 },
    ];

    const graph = makeMockDocGraph(nodes, edges);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.diagrams).toHaveLength(1);
    const diag = qGraph.diagrams[0];
    expect(diag.labelNodeIds).toContain('node_diag_lbl');

    const q1 = qGraph.questions[0];
    // Diagram internal label must NOT be part of stemNodeIds
    expect(q1.stemNodeIds).not.toContain('node_diag_lbl');
  });

  it('REG-GATE-05: Duplicate diagrams - diagram candidate physical nodes are referenced rather than cloned', async () => {
    // Historical failure: Diagrams referenced in multiple questions had physical assets duplicated in memory
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'node_diag', nodeType: 'RASTER_IMAGE', pageNumber: 1, bbox: { x0: 100, y0: 80, x1: 250, y1: 150, pageWidth: 595, pageHeight: 842 }, textContent: '', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'node_q1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 170, x1: 80, y1: 185, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 1, confidence: 0.99 },
      { nodeId: 'node_q1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 170, x1: 300, y1: 185, pageWidth: 595, pageHeight: 842 }, textContent: 'Refer to figure above. What is node A?', readingOrderIndex: 2, confidence: 0.99 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.diagrams).toHaveLength(1);
    expect(qGraph.diagrams[0].physicalNodeIds).toEqual(['node_diag']);
  });

  it('REG-GATE-06: Fraction splitting - fraction bar, numerator, and denominator remain in unified math candidate', async () => {
    // Historical failure: Fraction numerator and denominator split into distinct questions
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'node_q1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'node_q1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 250, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Calculate limit:', readingOrderIndex: 1, confidence: 0.99 },
      { nodeId: 'node_num', nodeType: 'GLYPH_RUN', pageNumber: 1, bbox: { x0: 90, y0: 120, x1: 110, y1: 130, pageWidth: 595, pageHeight: 842 }, textContent: 'sin(x)', readingOrderIndex: 2, confidence: 0.99 },
      { nodeId: 'node_bar', nodeType: 'VECTOR_PATH', pageNumber: 1, bbox: { x0: 85, y0: 131, x1: 115, y1: 132, pageWidth: 595, pageHeight: 842 }, textContent: '', readingOrderIndex: 3, confidence: 0.99 },
      { nodeId: 'node_den', nodeType: 'GLYPH_RUN', pageNumber: 1, bbox: { x0: 90, y0: 133, x1: 110, y1: 143, pageWidth: 595, pageHeight: 842 }, textContent: 'x', readingOrderIndex: 4, confidence: 0.99 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    // Fraction elements MUST NOT be mistaken as question numbers or split across questions
    expect(qGraph.questions).toHaveLength(1);
    expect(qGraph.mathBlocks).toHaveLength(1);
    const m = qGraph.mathBlocks[0];
    expect(m.physicalNodeIds).toContain('node_num');
    expect(m.physicalNodeIds).toContain('node_den');
  });

  // ==========================================================================
  // Phase 2C Forensic Failure Remediation Regressions (REG-UADUE-01 to REG-UADUE-07)
  // ==========================================================================

  it('REG-UADUE-01: Split question-number tokens ("Q." + "2") unified into distinct question', async () => {
    // GATE 2024 failure mode: "Q." and "2" emitted as separate text runs on the same baseline
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'q1_lbl', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 65, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'q1_num', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 68, y0: 100, x1: 75, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: '1', readingOrderIndex: 1, confidence: 0.99 },
      { nodeId: 'q1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 85, y0: 100, x1: 250, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'First question stem.', readingOrderIndex: 2, confidence: 0.99 },
      { nodeId: 'q1_optA', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 85, y0: 120, x1: 200, y1: 135, pageWidth: 595, pageHeight: 842 }, textContent: '(A) Option 1', readingOrderIndex: 3, confidence: 0.95 },
      { nodeId: 'q2_lbl', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 160, x1: 65, y1: 175, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.', readingOrderIndex: 4, confidence: 0.99 },
      { nodeId: 'q2_num', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 68, y0: 160, x1: 75, y1: 175, pageWidth: 595, pageHeight: 842 }, textContent: '2', readingOrderIndex: 5, confidence: 0.99 },
      { nodeId: 'q2_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 85, y0: 160, x1: 250, y1: 175, pageWidth: 595, pageHeight: 842 }, textContent: 'Second question stem.', readingOrderIndex: 6, confidence: 0.99 },
      { nodeId: 'q2_optA', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 85, y0: 180, x1: 200, y1: 195, pageWidth: 595, pageHeight: 842 }, textContent: '(A) Option 2', readingOrderIndex: 7, confidence: 0.95 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    // Both questions MUST be detected and NOT merged
    expect(qGraph.questions).toHaveLength(2);
    expect(qGraph.questions[0].identityCandidate.detectedNumber).toBe(1);
    expect(qGraph.questions[1].identityCandidate.detectedNumber).toBe(2);
  });

  it('REG-UADUE-02: Multi-statement enumeration protected from options under directive', async () => {
    // UPSC CSE failure mode: Statements "1. ..." and "2. ..." swallowed as options
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'q1_num', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: '1.', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'q1_dir', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 300, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Consider the following statements:', readingOrderIndex: 1, confidence: 0.99 },
      { nodeId: 'q1_s1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 125, x1: 350, y1: 140, pageWidth: 595, pageHeight: 842 }, textContent: '1. Jhelum River passes through Wular Lake.', readingOrderIndex: 2, confidence: 0.95 },
      { nodeId: 'q1_s2', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 145, x1: 350, y1: 160, pageWidth: 595, pageHeight: 842 }, textContent: '2. Krishna River directly feeds Kolleru Lake.', readingOrderIndex: 3, confidence: 0.95 },
      { nodeId: 'q1_sub', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 165, x1: 380, y1: 180, pageWidth: 595, pageHeight: 842 }, textContent: 'How many of the statements given above are correct?', readingOrderIndex: 4, confidence: 0.99 },
      { nodeId: 'q1_oa', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 185, x1: 200, y1: 200, pageWidth: 595, pageHeight: 842 }, textContent: '(a) Only one', readingOrderIndex: 5, confidence: 0.95 },
      { nodeId: 'q1_ob', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 205, x1: 200, y1: 220, pageWidth: 595, pageHeight: 842 }, textContent: '(b) Only two', readingOrderIndex: 6, confidence: 0.95 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions).toHaveLength(1);
    // Only (a) and (b) should be options; statements 1 and 2 must NOT be options
    expect(qGraph.questions[0].optionCandidateIds).toHaveLength(2);
    expect(qGraph.options).toHaveLength(2);
    expect(qGraph.options.map(o => o.markerLabel)).toEqual(['(a)', '(b)']);
  });

  it('REG-UADUE-03: Cross-page Y-coordinate collision prevention', async () => {
    // Failure mode: Diagram on Page 2 with identical y0, y1 was claimed by Q1 on Page 1
    const nodes: DocumentGraphNode[] = [
      // Page 1: Q1
      { nodeId: 'p1_q1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'p1_stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 250, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Page 1 text.', readingOrderIndex: 1, confidence: 0.99 },
      // Page 2: Diagram at identical y-coordinates [100, 200]
      { nodeId: 'p2_diag', nodeType: 'RASTER_IMAGE', pageNumber: 2, bbox: { x0: 90, y0: 100, x1: 250, y1: 200, pageWidth: 595, pageHeight: 842 }, textContent: '', readingOrderIndex: 2, confidence: 0.99 },
    ];

    const graph = makeMockDocGraph(nodes);
    graph.totalPages = 2;
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.questions).toHaveLength(1);
    // Page 2 diagram MUST NOT be attached to Page 1 question
    expect(qGraph.questions[0].diagramCandidateIds).toHaveLength(0);
  });

  it('REG-UADUE-04: Math vector vinculum is NOT a diagram candidate', async () => {
    // GATE failure mode: Horizontal division bar (w=80, h=1.5) classified as diagram
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'q1_num', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'v_bar', nodeType: 'VECTOR_PATH', pageNumber: 1, bbox: { x0: 90, y0: 120, x1: 170, y1: 121.5, pageWidth: 595, pageHeight: 842 }, textContent: '', readingOrderIndex: 1, confidence: 0.99 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.diagrams).toHaveLength(0);
  });

  it('REG-UADUE-05: Full-page border containment does NOT turn page into a diagram', async () => {
    // SSC CHSL failure mode: Outer card frame (w=500, h=700) containing text nodes turned into giant diagram
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'border_box', nodeType: 'VECTOR_PATH', pageNumber: 1, bbox: { x0: 20, y0: 20, x1: 520, y1: 720, pageWidth: 595, pageHeight: 842 }, textContent: '', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 't1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 50, x1: 200, y1: 65, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1 Question text', readingOrderIndex: 1, confidence: 0.99 },
      { nodeId: 't2', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 80, x1: 200, y1: 95, pageWidth: 595, pageHeight: 842 }, textContent: 'Option text A', readingOrderIndex: 2, confidence: 0.99 },
      { nodeId: 't3', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 110, x1: 200, y1: 125, pageWidth: 595, pageHeight: 842 }, textContent: 'Option text B', readingOrderIndex: 3, confidence: 0.99 },
      { nodeId: 't4', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 140, x1: 200, y1: 155, pageWidth: 595, pageHeight: 842 }, textContent: 'Option text C', readingOrderIndex: 4, confidence: 0.99 },
      { nodeId: 't5', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 170, x1: 200, y1: 185, pageWidth: 595, pageHeight: 842 }, textContent: 'Option text D', readingOrderIndex: 5, confidence: 0.99 },
      { nodeId: 't6', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 200, x1: 200, y1: 215, pageWidth: 595, pageHeight: 842 }, textContent: 'Footer note', readingOrderIndex: 6, confidence: 0.99 },
    ];

    const edges = [
      { sourceNodeId: 'border_box', targetNodeId: 't1', relation: 'CONTAINS' as const, confidence: 0.99 },
      { sourceNodeId: 'border_box', targetNodeId: 't2', relation: 'CONTAINS' as const, confidence: 0.99 },
      { sourceNodeId: 'border_box', targetNodeId: 't3', relation: 'CONTAINS' as const, confidence: 0.99 },
      { sourceNodeId: 'border_box', targetNodeId: 't4', relation: 'CONTAINS' as const, confidence: 0.99 },
      { sourceNodeId: 'border_box', targetNodeId: 't5', relation: 'CONTAINS' as const, confidence: 0.99 },
      { sourceNodeId: 'border_box', targetNodeId: 't6', relation: 'CONTAINS' as const, confidence: 0.99 },
    ];

    const graph = makeMockDocGraph(nodes, edges);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.diagrams).toHaveLength(0);
  });

  it('REG-UADUE-06: Ordinary sentence starting with "A " is NOT an option candidate', async () => {
    // Failure mode: Ordinary sentence starting with indefinite article "A" classified as option
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'q1_num', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'sent1', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 400, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'A sudden noise frightened the horse into bolting across the field.', readingOrderIndex: 1, confidence: 0.99 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.options).toHaveLength(0);
  });

  it('REG-UADUE-07: Metadata table "Chosen Option : 1" is NOT an option candidate', async () => {
    // TCS CBT failure mode: Status table "Chosen Option : 1" classified as option
    const nodes: DocumentGraphNode[] = [
      { nodeId: 'q1_num', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 50, y0: 100, x1: 80, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Q.1', readingOrderIndex: 0, confidence: 0.99 },
      { nodeId: 'stem', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 90, y0: 100, x1: 300, y1: 115, pageWidth: 595, pageHeight: 842 }, textContent: 'Question stem text.', readingOrderIndex: 1, confidence: 0.99 },
      { nodeId: 'meta_qid', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 400, y0: 200, x1: 550, y1: 215, pageWidth: 595, pageHeight: 842 }, textContent: 'Question ID : 654321', readingOrderIndex: 2, confidence: 0.99 },
      { nodeId: 'meta_opt', nodeType: 'TEXT_RUN', pageNumber: 1, bbox: { x0: 400, y0: 220, x1: 550, y1: 235, pageWidth: 595, pageHeight: 842 }, textContent: 'Chosen Option : 1', readingOrderIndex: 3, confidence: 0.99 },
    ];

    const graph = makeMockDocGraph(nodes);
    const qGraph = await builder.buildGraph(graph);

    expect(qGraph.options).toHaveLength(0);
  });
});
