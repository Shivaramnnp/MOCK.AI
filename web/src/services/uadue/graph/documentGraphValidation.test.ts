/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Test Suite: DocumentGraph Validation Suite (Phase 2B)
 *
 * Covers scenarios A through O, adversarial cases, failure isolation,
 * reading order DAG construction, ambiguity preservation, and zero semantic inference.
 */

import { describe, it, expect } from 'vitest';
import { DocumentGraphBuilder } from './documentGraphBuilder';
import { ForensicSnapshot } from '../contracts/forensicSnapshot';
import { GraphValidator } from './graphValidator';
import { GraphSerializer } from './graphSerializer';

function createMockSnapshot(overrides?: Partial<ForensicSnapshot>): ForensicSnapshot {
  return {
    snapshotId: 'snap_test_001',
    sourceDocumentId: 'doc_test_001',
    sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    acquisitionMetadata: {
      sourceUri: 'file:///tmp/mock.pdf',
      acquiredAt: Date.now(),
      fileSizeBytes: 1024,
      mimeType: 'application/pdf',
      contentHash: 'mock_content_hash',
    },
    sourceFormat: 'PDF',
    adapterProvenance: {
      adapterId: 'PdfNativeSourceAdapter',
      adapterVersion: '2.0.0',
      parserEngine: 'PDF.js',
      parserVersion: '4.10.38',
      schemaVersion: '2.0',
      processingConfigHash: 'cfg_hash',
    },
    pageGeometries: [
      {
        pageIndex: 0,
        pageNumber: 1,
        dimensions: { width: 600, height: 800, unit: 'pt' },
        mediaBox: { x0: 0, y0: 0, x1: 600, y1: 800 },
        cropBox: { x0: 0, y0: 0, x1: 600, y1: 800 },
        rotationDeg: 0,
      },
    ],
    sourceObjects: [],
    contentStreams: [],
    fonts: [],
    glyphRuns: [],
    rasterXObjects: [],
    vectorPaths: [],
    clippingStates: [],
    annotations: [],
    coordinateSystems: ['VIEWPORT_PT_TOP_LEFT'],
    isSealed: true,
    sealedHash: 'mock_sealed_hash',
    sealedAt: Date.now(),
    ...overrides,
  };
}

describe('DocumentGraph Validation Suite (Phase 2B)', () => {
  const builder = new DocumentGraphBuilder();

  // ==========================================================================
  // Scenario A: Single-Column Page
  // ==========================================================================
  it('Scenario A: constructs single-column graph with sequential top-to-bottom reading order', async () => {
    const snapshot = createMockSnapshot({
      glyphRuns: [
        {
          glyphRunId: 'g1',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Paragraph 1',
          advanceWidthPt: 200,
          geometry: {
            bbox: { x0: 50, y0: 50, x1: 250, y1: 70, width: 200, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        {
          glyphRunId: 'g2',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 1,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Paragraph 2',
          advanceWidthPt: 200,
          geometry: {
            bbox: { x0: 50, y0: 90, x1: 250, y1: 110, width: 200, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        {
          glyphRunId: 'g3',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 2,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Paragraph 3',
          advanceWidthPt: 200,
          geometry: {
            bbox: { x0: 50, y0: 130, x1: 250, y1: 150, width: 200, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);

    expect(graph.columns.length).toBe(1);
    expect(graph.columns[0].columnIndex).toBe(0);
    expect(graph.nodes.size).toBe(3);

    // Reading flow must be sequential: g1 -> g2 -> g3
    expect(graph.readingFlow).toEqual(['node_p1_text_0', 'node_p1_text_1', 'node_p1_text_2']);

    // Check above/below edges
    const aboveEdge = graph.edges.find(
      (e) => e.sourceNodeId === 'node_p1_text_0' && e.targetNodeId === 'node_p1_text_1' && e.relation === 'ABOVE'
    );
    expect(aboveEdge).toBeDefined();

    // Check alignment
    const alignEdge = graph.edges.find(
      (e) => e.sourceNodeId === 'node_p1_text_0' && e.targetNodeId === 'node_p1_text_1' && e.relation === 'ALIGNED_X'
    );
    expect(alignEdge).toBeDefined();
  });

  // ==========================================================================
  // Scenario B: Two-Column Symmetric Page
  // ==========================================================================
  it('Scenario B: detects symmetric two-column layout with vertical gutter', async () => {
    const glyphRuns: any[] = [];

    // Left Column elements: x in [50, 250]
    for (let i = 0; i < 4; i++) {
      glyphRuns.push({
        glyphRunId: `left_${i}`,
        pageNumber: 1,
        streamId: 's1',
        operatorIndex: i,
        fontId: 'F1',
        fontSizePt: 10,
        decodedUnicode: `Left Col line ${i}`,
        advanceWidthPt: 180,
        geometry: {
          bbox: { x0: 50, y0: 100 + i * 30, x1: 230, y1: 120 + i * 30, width: 180, height: 20, unit: 'pt' },
          rotationDeg: 0,
          transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        },
        renderMode: 0,
      });
    }

    // Right Column elements: x in [350, 550] (gutter is [230, 350], width 120pt)
    for (let i = 0; i < 4; i++) {
      glyphRuns.push({
        glyphRunId: `right_${i}`,
        pageNumber: 1,
        streamId: 's1',
        operatorIndex: i + 4,
        fontId: 'F1',
        fontSizePt: 10,
        decodedUnicode: `Right Col line ${i}`,
        advanceWidthPt: 180,
        geometry: {
          bbox: { x0: 350, y0: 100 + i * 30, x1: 530, y1: 120 + i * 30, width: 180, height: 20, unit: 'pt' },
          rotationDeg: 0,
          transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        },
        renderMode: 0,
      });
    }

    const snapshot = createMockSnapshot({ glyphRuns });
    const graph = await builder.buildGraph(snapshot);

    expect(graph.columns.length).toBe(2);
    expect(graph.columns[0].columnIndex).toBe(0);
    expect(graph.columns[1].columnIndex).toBe(1);

    // Left column elements come before right column elements in DAG order
    const left0Idx = graph.readingFlow.indexOf('node_p1_text_0');
    const right0Idx = graph.readingFlow.indexOf('node_p1_text_4');
    expect(left0Idx).toBeLessThan(right0Idx);
  });

  // ==========================================================================
  // Scenario C: Asymmetric Columns
  // ==========================================================================
  it('Scenario C: identifies asymmetric columns without crashing', async () => {
    const glyphRuns: any[] = [];
    // Wide column (70%): x in [40, 380]
    for (let i = 0; i < 4; i++) {
      glyphRuns.push({
        glyphRunId: `main_${i}`,
        pageNumber: 1,
        streamId: 's1',
        operatorIndex: i,
        fontId: 'F1',
        fontSizePt: 10,
        decodedUnicode: `Main body line ${i}`,
        advanceWidthPt: 340,
        geometry: {
          bbox: { x0: 40, y0: 100 + i * 25, x1: 380, y1: 120 + i * 25, width: 340, height: 20, unit: 'pt' },
          rotationDeg: 0,
          transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        },
        renderMode: 0,
      });
    }
    // Narrow sidebar (30%): x in [420, 560]
    for (let i = 0; i < 4; i++) {
      glyphRuns.push({
        glyphRunId: `side_${i}`,
        pageNumber: 1,
        streamId: 's1',
        operatorIndex: i + 4,
        fontId: 'F1',
        fontSizePt: 9,
        decodedUnicode: `Sidebar ${i}`,
        advanceWidthPt: 140,
        geometry: {
          bbox: { x0: 420, y0: 100 + i * 25, x1: 560, y1: 120 + i * 25, width: 140, height: 20, unit: 'pt' },
          rotationDeg: 0,
          transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        },
        renderMode: 0,
      });
    }

    const snapshot = createMockSnapshot({ glyphRuns });
    const graph = await builder.buildGraph(snapshot);

    expect(graph.columns.length).toBe(2);
    expect(graph.columns[0].bounds.maxX).toBeLessThanOrEqual(420);
  });

  // ==========================================================================
  // Scenario D & K: Side-by-Side Image and Text with Reading Order Ambiguity
  // ==========================================================================
  it('Scenario D & K: preserves side-by-side branch and ambiguity in DAG', async () => {
    const snapshot = createMockSnapshot({
      glyphRuns: [
        {
          glyphRunId: 'text_top',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Introduction header',
          advanceWidthPt: 400,
          geometry: {
            bbox: { x0: 50, y0: 50, x1: 450, y1: 70, width: 400, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        {
          glyphRunId: 'text_left',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 1,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: 'Description text next to diagram',
          advanceWidthPt: 200,
          geometry: {
            bbox: { x0: 50, y0: 100, x1: 250, y1: 180, width: 200, height: 80, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        {
          glyphRunId: 'text_bottom',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 2,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Concluding text below both',
          advanceWidthPt: 400,
          geometry: {
            bbox: { x0: 50, y0: 220, x1: 450, y1: 240, width: 400, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
      rasterXObjects: [
        {
          xObjectId: 'Im1_diagram',
          pageNumber: 1,
          geometry: {
            bbox: { x0: 280, y0: 100, x1: 480, y1: 180, width: 200, height: 80, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          drawingOrderIndex: 3,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);

    expect(graph.nodes.size).toBe(4); // 3 text + 1 image

    // Ambiguity must be preserved in ambiguousRegions
    expect(graph.readingOrderDAG.ambiguousRegions.length).toBeGreaterThan(0);
    const ambig = graph.readingOrderDAG.ambiguousRegions[0];
    expect(ambig.candidateSequences.length).toBe(2);

    // Side by side edge must exist
    const sideBySideEdge = graph.readingOrderDAG.edges.find((e) => e.orderType === 'SIDE_BY_SIDE');
    expect(sideBySideEdge).toBeDefined();
    expect(sideBySideEdge?.isAmbiguous).toBe(true);
  });

  // ==========================================================================
  // Scenario E: Nested Regions & Containment
  // ==========================================================================
  it('Scenario E: computes CONTAINS and INSIDE relations for nested objects', async () => {
    const snapshot = createMockSnapshot({
      vectorPaths: [
        {
          pathId: 'box_outer',
          operations: [],
          lineWidthPt: 1,
          geometry: {
            bbox: { x0: 50, y0: 50, x1: 300, y1: 200, width: 250, height: 150, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          isDecorative: false,
        },
      ],
      glyphRuns: [
        {
          glyphRunId: 'inner_text',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: 'Text inside vector card box',
          advanceWidthPt: 150,
          geometry: {
            bbox: { x0: 70, y0: 70, x1: 220, y1: 90, width: 150, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);

    const containsEdge = graph.edges.find((e) => e.relation === 'CONTAINS');
    expect(containsEdge).toBeDefined();
    expect(containsEdge?.sourceNodeId).toBe('node_p1_path_0');
    expect(containsEdge?.targetNodeId).toBe('node_p1_text_0');

    const insideEdge = graph.edges.find((e) => e.relation === 'INSIDE');
    expect(insideEdge).toBeDefined();
    expect(insideEdge?.sourceNodeId).toBe('node_p1_text_0');
    expect(insideEdge?.targetNodeId).toBe('node_p1_path_0');
  });

  // ==========================================================================
  // Scenario F & G: Overlapping and Touching Objects
  // ==========================================================================
  it('Scenario F & G: distinguishes OVERLAPS from TOUCHES', async () => {
    const snapshot = createMockSnapshot({
      glyphRuns: [
        // Box A: [50, 50, 100, 100]
        {
          glyphRunId: 'boxA',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: 'A',
          advanceWidthPt: 50,
          geometry: {
            bbox: { x0: 50, y0: 50, x1: 100, y1: 100, width: 50, height: 50, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        // Box B: [80, 80, 130, 130] (Overlaps A by [80..100, 80..100])
        {
          glyphRunId: 'boxB',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 1,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: 'B',
          advanceWidthPt: 50,
          geometry: {
            bbox: { x0: 80, y0: 80, x1: 130, y1: 130, width: 50, height: 50, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        // Box C: [100.5, 50, 150, 100] (Touches A at x=100 within 0.5pt)
        {
          glyphRunId: 'boxC',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 2,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: 'C',
          advanceWidthPt: 50,
          geometry: {
            bbox: { x0: 100.5, y0: 50, x1: 150, y1: 100, width: 49.5, height: 50, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);

    const overlapEdge = graph.edges.find(
      (e) => e.sourceNodeId === 'node_p1_text_0' && e.targetNodeId === 'node_p1_text_1' && e.relation === 'OVERLAPS'
    );
    expect(overlapEdge).toBeDefined();

    const touchEdge = graph.edges.find(
      (e) => e.sourceNodeId === 'node_p1_text_0' && e.targetNodeId === 'node_p1_text_2' && e.relation === 'TOUCHES'
    );
    expect(touchEdge).toBeDefined();
  });

  // ==========================================================================
  // Scenario H & I: Dense Vector Page and Many Images
  // ==========================================================================
  it('Scenario H & I: processes dense vector and image pages with zero dropped evidence', async () => {
    const vectorPaths: any[] = [];
    for (let i = 0; i < 30; i++) {
      vectorPaths.push({
        pathId: `path_${i}`,
        operations: [],
        lineWidthPt: 0.5,
        geometry: {
          bbox: { x0: 50, y0: 100 + i * 15, x1: 500, y1: 101 + i * 15, width: 450, height: 1, unit: 'pt' },
          rotationDeg: 0,
          transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        },
        isDecorative: false,
      });
    }

    const rasterXObjects: any[] = [];
    for (let i = 0; i < 10; i++) {
      rasterXObjects.push({
        xObjectId: `icon_${i}`,
        pageNumber: 1,
        geometry: {
          bbox: { x0: 60 + i * 40, y0: 50, x1: 90 + i * 40, y1: 80, width: 30, height: 30, unit: 'pt' },
          rotationDeg: 0,
          transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        },
        drawingOrderIndex: i,
      });
    }

    const snapshot = createMockSnapshot({ vectorPaths, rasterXObjects });
    const graph = await builder.buildGraph(snapshot);

    expect(graph.nodes.size).toBe(40);
    const validation = GraphValidator.validate(graph, snapshot);
    expect(validation.isValid).toBe(true);
  });

  // ==========================================================================
  // Scenario J: Cross-Page Physical Continuation
  // ==========================================================================
  it('Scenario J: identifies CONTINUES_PHYSICALLY across page boundaries (never SAME_QUESTION)', async () => {
    const snapshot = createMockSnapshot({
      pageGeometries: [
        {
          pageIndex: 0,
          pageNumber: 1,
          dimensions: { width: 600, height: 800, unit: 'pt' },
          mediaBox: { x0: 0, y0: 0, x1: 600, y1: 800 },
          cropBox: { x0: 0, y0: 0, x1: 600, y1: 800 },
          rotationDeg: 0,
        },
        {
          pageIndex: 1,
          pageNumber: 2,
          dimensions: { width: 600, height: 800, unit: 'pt' },
          mediaBox: { x0: 0, y0: 0, x1: 600, y1: 800 },
          cropBox: { x0: 0, y0: 0, x1: 600, y1: 800 },
          rotationDeg: 0,
        },
      ],
      glyphRuns: [
        // Page 1 bottom element: y1 = 760 (bottom margin gap = 800 - 760 = 40pt)
        {
          glyphRunId: 'p1_bottom',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: 'Statement beginning at bottom of page 1...',
          advanceWidthPt: 300,
          geometry: {
            bbox: { x0: 50, y0: 740, x1: 350, y1: 760, width: 300, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        // Page 2 top element: y0 = 40 (top margin gap = 40pt)
        {
          glyphRunId: 'p2_top',
          pageNumber: 2,
          streamId: 's2',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: '...and continuing on top of page 2 without break.',
          advanceWidthPt: 300,
          geometry: {
            bbox: { x0: 50, y0: 40, x1: 350, y1: 60, width: 300, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);

    expect(graph.crossPageContinuations.length).toBe(1);
    const cont = graph.crossPageContinuations[0];
    expect(cont.relation).toBe('CONTINUES_PHYSICALLY');
    expect((cont as any).sameQuestion).toBeUndefined();
    expect(cont.compatibilityScore).toBeGreaterThanOrEqual(0.7);
  });

  // ==========================================================================
  // Scenario L: Failure Isolation for Malformed Geometry
  // ==========================================================================
  it('Scenario L: isolates malformed geometry without crashing or silently dropping nodes', async () => {
    const snapshot = createMockSnapshot({
      glyphRuns: [
        {
          glyphRunId: 'corrupt_glyph',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: 'Corrupt',
          advanceWidthPt: 50,
          geometry: {
            bbox: { x0: NaN, y0: Infinity, x1: 100, y1: 100, width: NaN, height: NaN, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        {
          glyphRunId: 'valid_glyph',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 1,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: 'Valid',
          advanceWidthPt: 50,
          geometry: {
            bbox: { x0: 50, y0: 50, x1: 100, y1: 70, width: 50, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);

    expect(graph.nodes.size).toBe(2); // Both nodes must exist!
    expect(graph.degradedNodes.length).toBe(1);
    expect(graph.degradedNodes[0].flags).toContain('INVALID_GEOMETRY');
  });

  // ==========================================================================
  // Scenario M: ObjStm-Derived Geometry
  // ==========================================================================
  it('Scenario M: marks ObjStm-derived nodes as UNRESOLVED without synthesizing fake bytes', async () => {
    const snapshot = createMockSnapshot({
      rasterXObjects: [
        {
          xObjectId: 'Im_objstm',
          pageNumber: 1,
          encodedStreamSha256: undefined, // Unresolved in ObjStm
          geometry: {
            bbox: { x0: 50, y0: 50, x1: 150, y1: 150, width: 100, height: 100, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          drawingOrderIndex: 0,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);
    const node = graph.nodes.get('node_p1_img_0');
    expect(node).toBeDefined();
    expect(node?.sourceEvidence.resolutionStatus).toBe('UNRESOLVED');
  });

  // ==========================================================================
  // Determinism & Invariant Enforcement
  // ==========================================================================
  it('DETERMINISM: produces identical bitwise sealedHash across repeated runs', async () => {
    const snapshot = createMockSnapshot({
      glyphRuns: [
        {
          glyphRunId: 'g1',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Line 1',
          advanceWidthPt: 100,
          geometry: {
            bbox: { x0: 50, y0: 50, x1: 150, y1: 70, width: 100, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
    });

    const graph1 = await builder.buildGraph(snapshot);
    const graph2 = await builder.buildGraph(snapshot);

    expect(graph1.sealedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(graph1.sealedHash).toBe(graph2.sealedHash);
  });

  // ==========================================================================
  // Adversarial: Zero Question Semantics
  // ==========================================================================
  it('ADVERSARIAL: GraphValidator strictly throws on illegal question semantic fields', async () => {
    const snapshot = createMockSnapshot({
      glyphRuns: [
        {
          glyphRunId: 'g1',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Line 1',
          advanceWidthPt: 100,
          geometry: {
            bbox: { x0: 50, y0: 50, x1: 150, y1: 70, width: 100, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);

    // Adversarially inject a forbidden question semantic field
    (graph.nodes.get('node_p1_text_0') as any).questionId = 'Q1_TEST';

    const result = GraphValidator.validate(graph);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('ILLEGAL_SEMANTIC_FIELD'))).toBe(true);
  });

  // ==========================================================================
  // Adversarial: Deep Recursive Semantic Purity Scan
  // ==========================================================================
  it('ADVERSARIAL: deep recursive scan detects forbidden semantic keys nested inside sub-objects', async () => {
    const snapshot = createMockSnapshot({
      glyphRuns: [
        {
          glyphRunId: 'g1',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Prompt line',
          advanceWidthPt: 100,
          geometry: {
            bbox: { x0: 50, y0: 50, x1: 150, y1: 70, width: 100, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);

    // Adversarially inject a forbidden key deep inside style
    (graph.nodes.get('node_p1_text_0')!.style as any).answerKey = 'B';

    const result = GraphValidator.validate(graph);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('ILLEGAL_SEMANTIC_FIELD') && e.includes('answerKey'))).toBe(true);
  });

  // ==========================================================================
  // Invalid Geometry Safety: Zero Manufactured Edges
  // ==========================================================================
  it('SAFETY: invalid geometry nodes are retained in nodes/degradedNodes but excluded from spatial indexing and edge generation', async () => {
    const snapshot = createMockSnapshot({
      glyphRuns: [
        {
          glyphRunId: 'g_corrupt',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Corrupt Coords',
          advanceWidthPt: 100,
          geometry: {
            bbox: { x0: Number.NaN, y0: Number.NaN, x1: Number.NaN, y1: Number.NaN, width: Number.NaN, height: Number.NaN, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        {
          glyphRunId: 'g_valid_1',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 1,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Valid Text 1',
          advanceWidthPt: 100,
          geometry: {
            bbox: { x0: 50, y0: 50, x1: 150, y1: 70, width: 100, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        {
          glyphRunId: 'g_valid_2',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 2,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Valid Text 2',
          advanceWidthPt: 100,
          geometry: {
            bbox: { x0: 50, y0: 80, x1: 150, y1: 100, width: 100, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);

    // 1. Evidence preservation: all 3 nodes must exist in graph.nodes
    expect(graph.nodes.size).toBe(3);
    const corruptNode = graph.nodes.get('node_p1_text_0');
    expect(corruptNode).toBeDefined();
    expect(corruptNode?.degradationFlags).toContain('INVALID_GEOMETRY');

    // 2. Degraded node record exists
    expect(graph.degradedNodes.length).toBe(1);
    expect(graph.degradedNodes[0].nodeId).toBe('node_p1_text_0');

    // 3. ZERO edges must reference the corrupt node (no manufactured edges!)
    const corruptEdges = graph.edges.filter(
      (e) => e.sourceNodeId === 'node_p1_text_0' || e.targetNodeId === 'node_p1_text_0'
    );
    expect(corruptEdges.length).toBe(0);

    // 4. Valid nodes still relate to each other
    expect(graph.edges.length).toBeGreaterThan(0);

    // 5. Invariant validator detects contamination if an edge were illegally attached
    graph.edges.push({
      edgeId: 'illegal_edge',
      sourceNodeId: 'node_p1_text_0',
      targetNodeId: 'node_p1_text_1',
      sourceElementId: 'node_p1_text_0',
      targetElementId: 'node_p1_text_1',
      relation: 'ABOVE',
      distancePt: 10,
      weight: 1.0,
      decisionBasis: 'illegal test',
      confidence: 1.0,
    });
    const result = GraphValidator.validate(graph);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('INVALID_GEOMETRY_EDGE_CONTAMINATION'))).toBe(true);
  });

  // ==========================================================================
  // Evidence Preservation: Exact Accounting Invariant
  // ==========================================================================
  it('PRESERVATION: GraphValidator detects silent drops when actual nodes mismatch snapshot items', async () => {
    const snapshot = createMockSnapshot({
      glyphRuns: [
        {
          glyphRunId: 'g1',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 12,
          decodedUnicode: 'Line 1',
          advanceWidthPt: 100,
          geometry: {
            bbox: { x0: 50, y0: 50, x1: 150, y1: 70, width: 100, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);
    expect(graph.nodes.size).toBe(1);

    // Silently delete node
    graph.nodes.clear();

    const result = GraphValidator.validate(graph, snapshot);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('EVIDENCE_ACCOUNTING_MISMATCH'))).toBe(true);
  });

  // ==========================================================================
  // Layout: 3-Column Geometry Detection
  // ==========================================================================
  it('LAYOUT: accurately identifies 3-column physical layout with gutters', async () => {
    const snapshot = createMockSnapshot({
      glyphRuns: [
        // Column 0: x in [50, 150]
        {
          glyphRunId: 'g_col0',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 0,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: 'Col 0 Text',
          advanceWidthPt: 100,
          geometry: {
            bbox: { x0: 50, y0: 100, x1: 150, y1: 120, width: 100, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        // Column 1: x in [220, 320] (Gutter from 150 to 220 = 70pt)
        {
          glyphRunId: 'g_col1',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 1,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: 'Col 1 Text',
          advanceWidthPt: 100,
          geometry: {
            bbox: { x0: 220, y0: 100, x1: 320, y1: 120, width: 100, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
        // Column 2: x in [390, 490] (Gutter from 320 to 390 = 70pt)
        {
          glyphRunId: 'g_col2',
          pageNumber: 1,
          streamId: 's1',
          operatorIndex: 2,
          fontId: 'F1',
          fontSizePt: 10,
          decodedUnicode: 'Col 2 Text',
          advanceWidthPt: 100,
          geometry: {
            bbox: { x0: 390, y0: 100, x1: 490, y1: 120, width: 100, height: 20, unit: 'pt' },
            rotationDeg: 0,
            transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          },
          renderMode: 0,
        },
      ],
    });

    const graph = await builder.buildGraph(snapshot);
    expect(graph.columns.length).toBe(3);
    expect(graph.columns[0].bounds.minX).toBe(0);
    expect(graph.columns[0].bounds.maxX).toBeCloseTo(152, -1);
    expect(graph.columns[1].bounds.minX).toBeCloseTo(220, -1);
    expect(graph.columns[1].bounds.maxX).toBeCloseTo(322, -1);
    expect(graph.columns[2].bounds.minX).toBeCloseTo(390, -1);
    expect(graph.columns[2].bounds.maxX).toBe(600);
  });
});
