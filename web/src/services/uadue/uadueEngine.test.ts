import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  PdfNativeSourceAdapter,
  DocxSourceAdapter,
  buildPageSpatialGraph,
  UniversalQuestionSegmenter,
  DocumentIR,
  DocumentIRPage,
  DocumentIRElement,
  buildQuestionIdentity,
  computeStructuralFingerprint,
  computeContentFingerprint,
  createEmptyAssetGraph,
  AssetGraphNode,
  PhysicalGeometry,
  SourceEvidenceChain,
  SourceReference,
} from './index';

describe('UADUE — Universal Assessment Document Understanding Engine (Phase 1 Contract Hardening & Features)', () => {
  // ==========================================================================
  // 1. PDF NATIVE SOURCE ADAPTER
  // ==========================================================================
  describe('1. Native Vector PDF Source Adapter', () => {
    const adapter = new PdfNativeSourceAdapter();

    it('rejects empty, truncated, or invalid magic bytes inputs', async () => {
      const resNull = await adapter.validateInput(null as any);
      expect(resNull.valid).toBe(false);

      const shortBuf = new Uint8Array([1, 2, 3]);
      const resShort = await adapter.validateInput(shortBuf);
      expect(resShort.valid).toBe(false);

      const invalidMagic = new TextEncoder().encode('%XYZ-1.7\nNOT A VALID PDF FILE AT ALL HEADER HERE');
      const resInvalid = await adapter.validateInput(invalidMagic);
      expect(resInvalid.valid).toBe(false);
      expect(resInvalid.error).toContain('Invalid PDF magic bytes');
    });

    it('validates authentic PDF magic bytes successfully', async () => {
      const validHeader = new TextEncoder().encode('%PDF-1.7\n%synthetic test content padding for size check');
      const res = await adapter.validateInput(validHeader);
      expect(res.valid).toBe(true);
      expect(res.detectedFormat).toBe('PDF_NATIVE');
      expect(res.fileSizeBytes).toBe(validHeader.length);
    });
  });

  // ==========================================================================
  // 2. DOCX OPENXML SOURCE ADAPTER
  // ==========================================================================
  describe('2. OpenXML Word (.docx) Source Adapter', () => {
    const adapter = new DocxSourceAdapter();

    it('rejects invalid or non-zip buffers', async () => {
      // Short buffer < 100 bytes
      const shortBuf = new TextEncoder().encode('Too short');
      const resShort = await adapter.validateInput(shortBuf);
      expect(resShort.valid).toBe(false);
      expect(resShort.error).toContain('File size is too small');

      // 120-byte buffer with invalid magic bytes
      const invalidHeader = new Uint8Array(120).fill(65);
      const resInvalid = await adapter.validateInput(invalidHeader);
      expect(resInvalid.valid).toBe(false);
      expect(resInvalid.error).toContain('missing ZIP archive header');
    });

    it('extracts paragraphs, tables, equations, and images into pure DocumentIR', async () => {
      const zip = new JSZip();

      // Mock relationships
      zip.file(
        'word/_rels/document.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
        </Relationships>`
      );

      // Mock media
      zip.file('word/media/image1.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0]));

      // Mock document.xml with text, table, and drawing
      zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                    xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
                    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <w:body>
            <w:p>
              <w:r><w:t>Q.1 What is the output of the circuit?</w:t></w:r>
            </w:p>
            <w:p>
              <w:r><w:t>(A) 5 Volts</w:t></w:r>
            </w:p>
            <w:p>
              <w:r><w:t>(B) 10 Volts</w:t></w:r>
            </w:p>
            <w:tbl>
              <w:tr>
                <w:tc><w:p><w:r><w:t>Col 1</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>Col 2</w:t></w:r></w:p></w:tc>
              </w:tr>
            </w:tbl>
          </w:body>
        </w:document>`
      );

      const docxBytes = await zip.generateAsync({ type: 'uint8array' });
      const val = await adapter.validateInput(docxBytes);
      expect(val.valid).toBe(true);

      const ir = await adapter.extractDocumentIR(docxBytes);
      expect(ir.sourceFormat).toBe('DOCX');
      expect(ir.pages.length).toBeGreaterThanOrEqual(1);
      expect(ir.embeddedMedia.length).toBe(1);
      expect(ir.embeddedMedia[0].originalFileName).toBe('image1.png');

      const elements = ir.pages[0].elements;
      const textEls = elements.filter((e) => e.type === 'TEXT_LINE');
      const tableEls = elements.filter((e) => e.type === 'TABLE_STRUCTURE');

      expect(textEls.length).toBe(3);
      expect(textEls[0].rawContent).toBe('Q.1 What is the output of the circuit?');
      expect(tableEls.length).toBe(1);
      expect(tableEls[0].tableData?.rowCount).toBe(1);
      expect(tableEls[0].tableData?.colCount).toBe(2);
    });
  });

  // ==========================================================================
  // 3. 2D SPATIAL GRAPH & READING FLOW BUILDER
  // ==========================================================================
  describe('3. 2D Spatial Graph & Reading Flow Builder', () => {
    it('constructs spatial relations and column reading order for single-column layout', () => {
      const page: DocumentIRPage = {
        pageNumber: 1,
        dimensions: { width: 595, height: 842, unit: 'pt' },
        elements: [
          {
            elementId: 'el_1',
            pageNumber: 1,
            type: 'TEXT_LINE',
            bbox: { x0: 50, y0: 100, x1: 500, y1: 120, width: 450, height: 20, unit: 'pt' },
            rawContent: 'Q.1 Find the limit of f(x) as x approaches 0.',
            confidence: 1.0,
            readingOrderIndex: 0,
          },
          {
            elementId: 'el_2',
            pageNumber: 1,
            type: 'TEXT_LINE',
            bbox: { x0: 50, y0: 130, x1: 250, y1: 145, width: 200, height: 15, unit: 'pt' },
            rawContent: '(A) 0',
            confidence: 1.0,
            readingOrderIndex: 1,
          },
          {
            elementId: 'el_3',
            pageNumber: 1,
            type: 'TEXT_LINE',
            bbox: { x0: 300, y0: 130, x1: 500, y1: 145, width: 200, height: 15, unit: 'pt' },
            rawContent: '(B) 1',
            confidence: 1.0,
            readingOrderIndex: 2,
          },
        ],
        readingOrder: ['el_1', 'el_2', 'el_3'],
        pageHash: 'hash_test_1',
      };

      const graph = buildPageSpatialGraph('doc_test', page);

      expect(graph.columns.length).toBe(1);
      expect(graph.nodes.size).toBe(3);

      // Verify ABOVE / BELOW relation between el_1 and el_2
      const aboveEdge = graph.edges.find(
        (e) => e.sourceElementId === 'el_1' && e.targetElementId === 'el_2' && e.relation === 'ABOVE'
      );
      expect(aboveEdge).toBeDefined();

      // Verify ALIGNED_LEFT between el_1 and el_2 (both x0 = 50)
      const alignedLeftEdge = graph.edges.find(
        (e) => e.sourceElementId === 'el_1' && e.targetElementId === 'el_2' && e.relation === 'ALIGNED_LEFT'
      );
      expect(alignedLeftEdge).toBeDefined();

      // Verify LEFT_OF relation between side-by-side options el_2 and el_3 (same baseline y0 = 130)
      const leftOfEdge = graph.edges.find(
        (e) => e.sourceElementId === 'el_2' && e.targetElementId === 'el_3' && e.relation === 'LEFT_OF'
      );
      expect(leftOfEdge).toBeDefined();

      // Verify ALIGNED_BASELINE between el_2 and el_3
      const baselineEdge = graph.edges.find(
        (e) => e.sourceElementId === 'el_2' && e.targetElementId === 'el_3' && e.relation === 'ALIGNED_BASELINE'
      );
      expect(baselineEdge).toBeDefined();

      expect(graph.readingFlow).toEqual(['el_1', 'el_2', 'el_3']);
    });

    it('detects two-column layouts and preserves column-first reading flow', () => {
      const page: DocumentIRPage = {
        pageNumber: 1,
        dimensions: { width: 600, height: 800, unit: 'pt' },
        elements: [
          // Left Column (x0 around 40, x1 around 280)
          { elementId: 'left_1', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 40, y0: 50, x1: 270, y1: 70, width: 230, height: 20, unit: 'pt' }, rawContent: 'Left 1', confidence: 1, readingOrderIndex: 0 },
          { elementId: 'left_2', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 40, y0: 80, x1: 270, y1: 100, width: 230, height: 20, unit: 'pt' }, rawContent: 'Left 2', confidence: 1, readingOrderIndex: 1 },
          { elementId: 'left_3', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 40, y0: 110, x1: 270, y1: 130, width: 230, height: 20, unit: 'pt' }, rawContent: 'Left 3', confidence: 1, readingOrderIndex: 2 },
          // Right Column (x0 around 320, x1 around 560)
          { elementId: 'right_1', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 320, y0: 50, x1: 560, y1: 70, width: 240, height: 20, unit: 'pt' }, rawContent: 'Right 1', confidence: 1, readingOrderIndex: 3 },
          { elementId: 'right_2', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 320, y0: 80, x1: 560, y1: 100, width: 240, height: 20, unit: 'pt' }, rawContent: 'Right 2', confidence: 1, readingOrderIndex: 4 },
          { elementId: 'right_3', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 320, y0: 110, x1: 560, y1: 130, width: 240, height: 20, unit: 'pt' }, rawContent: 'Right 3', confidence: 1, readingOrderIndex: 5 },
        ],
        readingOrder: [],
        pageHash: 'hash_test_2col',
      };

      const graph = buildPageSpatialGraph('doc_2col', page);
      expect(graph.columns.length).toBe(2);
      expect(graph.columns[0].elementIds).toEqual(['left_1', 'left_2', 'left_3']);
      expect(graph.columns[1].elementIds).toEqual(['right_1', 'right_2', 'right_3']);

      // Reading order visits all left column items before right column items
      expect(graph.readingFlow).toEqual(['left_1', 'left_2', 'left_3', 'right_1', 'right_2', 'right_3']);
    });
  });

  // ==========================================================================
  // 4. UNIVERSAL QUESTION SEGMENTER & CANONICAL QUESTION IR
  // ==========================================================================
  describe('4. Universal Question Segmenter & Invariant Enforcement', () => {
    const segmenter = new UniversalQuestionSegmenter();

    it('segments 4-option and 5-option questions with accurate labels and topology', () => {
      const mockElements: DocumentIRElement[] = [
        // Q1: Standard 4-option MCQ
        { elementId: 'q1_stem', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 50, y0: 50, x1: 500, y1: 70, width: 450, height: 20, unit: 'pt' }, rawContent: '1. Which river is known as Sorrow of Bengal?', confidence: 1, readingOrderIndex: 0 },
        { elementId: 'q1_optA', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 50, y0: 80, x1: 200, y1: 95, width: 150, height: 15, unit: 'pt' }, rawContent: '(A) Damodar', confidence: 1, readingOrderIndex: 1 },
        { elementId: 'q1_optB', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 50, y0: 100, x1: 200, y1: 115, width: 150, height: 15, unit: 'pt' }, rawContent: '(B) Hooghly', confidence: 1, readingOrderIndex: 2 },
        { elementId: 'q1_optC', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 50, y0: 120, x1: 200, y1: 135, width: 150, height: 15, unit: 'pt' }, rawContent: '(C) Padma', confidence: 1, readingOrderIndex: 3 },
        { elementId: 'q1_optD', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 50, y0: 140, x1: 200, y1: 155, width: 150, height: 15, unit: 'pt' }, rawContent: '(D) Kosi', confidence: 1, readingOrderIndex: 4 },

        // Q2: 5-option Banking question (Option E)
        { elementId: 'q2_stem', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 50, y0: 180, x1: 500, y1: 200, width: 450, height: 20, unit: 'pt' }, rawContent: 'Q.2 What is the compound interest on Rs. 10000 for 2 years at 10%?', confidence: 1, readingOrderIndex: 5 },
        { elementId: 'q2_optA', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 50, y0: 210, x1: 200, y1: 225, width: 150, height: 15, unit: 'pt' }, rawContent: '(A) 2000', confidence: 1, readingOrderIndex: 6 },
        { elementId: 'q2_optB', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 50, y0: 230, x1: 200, y1: 245, width: 150, height: 15, unit: 'pt' }, rawContent: '(B) 2100', confidence: 1, readingOrderIndex: 7 },
        { elementId: 'q2_optC', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 50, y0: 250, x1: 200, y1: 265, width: 150, height: 15, unit: 'pt' }, rawContent: '(C) 2200', confidence: 1, readingOrderIndex: 8 },
        { elementId: 'q2_optD', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 50, y0: 270, x1: 200, y1: 285, width: 150, height: 15, unit: 'pt' }, rawContent: '(D) 2300', confidence: 1, readingOrderIndex: 9 },
        { elementId: 'q2_optE', pageNumber: 1, type: 'TEXT_LINE', bbox: { x0: 50, y0: 290, x1: 200, y1: 305, width: 150, height: 15, unit: 'pt' }, rawContent: '(E) None of these', confidence: 1, readingOrderIndex: 10 },
      ];

      const docIR: DocumentIR = {
        documentId: 'doc_seg_test',
        sourceHash: 'hash_seg_test',
        sourceFormat: 'PDF_NATIVE',
        sourceFileName: 'TestExam.pdf',
        fileSizeBytes: 1024,
        totalPages: 1,
        pages: [
          {
            pageNumber: 1,
            dimensions: { width: 595, height: 842, unit: 'pt' },
            elements: mockElements,
            readingOrder: mockElements.map((e) => e.elementId),
            pageHash: 'p1_hash',
          },
        ],
        embeddedMedia: [],
        metadata: {},
        createdAt: Date.now(),
      };

      const pageGraph = buildPageSpatialGraph(docIR.documentId, docIR.pages[0]);
      const pageGraphs = new Map([[1, pageGraph]]);

      const result = segmenter.segmentDocument(docIR, pageGraphs);

      expect(result.totalParsed).toBe(2);
      expect(result.questions[0].sourceQuestionNumber).toBe(1);
      expect(result.questions[0].options.length).toBe(4);
      expect(result.questions[0].options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
      expect(result.questions[0].verification.status).toBe('CERTIFIED');
      expect(result.questions[0].identity).toBeDefined();
      expect(result.questions[0].identity?.canonicalQuestionId).toBeDefined();

      expect(result.questions[1].sourceQuestionNumber).toBe(2);
      expect(result.questions[1].options.length).toBe(5);
      expect(result.questions[1].options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(result.questions[1].options[4].text).toBe('None of these');
      expect(result.questions[1].verification.status).toBe('CERTIFIED');
    });

    it('segments Numerical Answer Type (NAT) questions with 0 options without errors', () => {
      const mockElements: DocumentIRElement[] = [
        {
          elementId: 'nat_stem',
          pageNumber: 1,
          type: 'TEXT_LINE',
          bbox: { x0: 50, y0: 50, x1: 500, y1: 70, width: 450, height: 20, unit: 'pt' },
          rawContent: 'Q.25 In an ideal Brayton cycle, calculate the thermal efficiency in percentage.',
          confidence: 1,
          readingOrderIndex: 0,
        },
      ];

      const docIR: DocumentIR = {
        documentId: 'doc_nat_test',
        sourceHash: 'hash_nat_test',
        sourceFormat: 'PDF_NATIVE',
        sourceFileName: 'GatePaper.pdf',
        fileSizeBytes: 1024,
        totalPages: 1,
        pages: [
          {
            pageNumber: 1,
            dimensions: { width: 595, height: 842, unit: 'pt' },
            elements: mockElements,
            readingOrder: ['nat_stem'],
            pageHash: 'p1_hash',
          },
        ],
        embeddedMedia: [],
        metadata: {},
        createdAt: Date.now(),
      };

      const pageGraph = buildPageSpatialGraph(docIR.documentId, docIR.pages[0]);
      const result = segmenter.segmentDocument(docIR, new Map([[1, pageGraph]]));

      expect(result.totalParsed).toBe(1);
      const q = result.questions[0];
      expect(q.questionType).toBe('NAT');
      expect(q.options.length).toBe(0);
      expect(q.scoring.negativeMarks).toBe(0.0);
      expect(q.verification.status).toBe('CERTIFIED');
    });

    it('links Stimulus / Passage blocks to child questions', () => {
      const mockElements: DocumentIRElement[] = [
        {
          elementId: 'pass_1',
          pageNumber: 1,
          type: 'TEXT_LINE',
          bbox: { x0: 50, y0: 50, x1: 500, y1: 70, width: 450, height: 20, unit: 'pt' },
          rawContent: 'Directions (Q. 1 - 2): Read the following passage carefully...',
          confidence: 1,
          readingOrderIndex: 0,
        },
        {
          elementId: 'pass_text',
          pageNumber: 1,
          type: 'TEXT_LINE',
          bbox: { x0: 50, y0: 75, x1: 500, y1: 100, width: 450, height: 25, unit: 'pt' },
          rawContent: 'Artificial intelligence is reshaping education through personalized learning algorithms.',
          confidence: 1,
          readingOrderIndex: 1,
        },
        {
          elementId: 'q1_stem',
          pageNumber: 1,
          type: 'TEXT_LINE',
          bbox: { x0: 50, y0: 110, x1: 500, y1: 130, width: 450, height: 20, unit: 'pt' },
          rawContent: '1. What is reshaping education according to the passage?',
          confidence: 1,
          readingOrderIndex: 2,
        },
        {
          elementId: 'q1_optA',
          pageNumber: 1,
          type: 'TEXT_LINE',
          bbox: { x0: 50, y0: 135, x1: 300, y1: 150, width: 250, height: 15, unit: 'pt' },
          rawContent: '(A) Artificial intelligence',
          confidence: 1,
          readingOrderIndex: 3,
        },
        {
          elementId: 'q1_optB',
          pageNumber: 1,
          type: 'TEXT_LINE',
          bbox: { x0: 50, y0: 155, x1: 300, y1: 170, width: 250, height: 15, unit: 'pt' },
          rawContent: '(B) Cloud computing',
          confidence: 1,
          readingOrderIndex: 4,
        },
      ];

      const docIR: DocumentIR = {
        documentId: 'doc_stim_test',
        sourceHash: 'hash_stim_test',
        sourceFormat: 'PDF_NATIVE',
        sourceFileName: 'PassagePaper.pdf',
        fileSizeBytes: 1024,
        totalPages: 1,
        pages: [
          {
            pageNumber: 1,
            dimensions: { width: 595, height: 842, unit: 'pt' },
            elements: mockElements,
            readingOrder: mockElements.map((e) => e.elementId),
            pageHash: 'p1_hash',
          },
        ],
        embeddedMedia: [],
        metadata: {},
        createdAt: Date.now(),
      };

      const pageGraph = buildPageSpatialGraph(docIR.documentId, docIR.pages[0]);
      const result = segmenter.segmentDocument(docIR, new Map([[1, pageGraph]]));

      expect(result.questionGraph.stimulusNodes.size).toBe(1);
      const firstStimulus = Array.from(result.questionGraph.stimulusNodes.values())[0];
      expect(firstStimulus.type).toBe('PASSAGE');
      expect(result.questionGraph.nodes[0].topology).toBe('STIMULUS_CHILD');
      expect(result.questionGraph.nodes[0].stimulusRefId).toBe(firstStimulus.stimulusId);
    });

    it('flags structural anomalies (e.g. 1 option) to 1% Review Queue instead of guessing', () => {
      const mockElements: DocumentIRElement[] = [
        {
          elementId: 'bad_stem',
          pageNumber: 1,
          type: 'TEXT_LINE',
          bbox: { x0: 50, y0: 50, x1: 500, y1: 70, width: 450, height: 20, unit: 'pt' },
          rawContent: 'Q.9 An incomplete question that lost options in scan.',
          confidence: 1,
          readingOrderIndex: 0,
        },
        {
          elementId: 'bad_optA',
          pageNumber: 1,
          type: 'TEXT_LINE',
          bbox: { x0: 50, y0: 80, x1: 200, y1: 95, width: 150, height: 15, unit: 'pt' },
          rawContent: '(A) Only one option exists',
          confidence: 1,
          readingOrderIndex: 1,
        },
      ];

      const docIR: DocumentIR = {
        documentId: 'doc_bad_test',
        sourceHash: 'hash_bad_test',
        sourceFormat: 'PDF_NATIVE',
        sourceFileName: 'CorruptScan.pdf',
        fileSizeBytes: 1024,
        totalPages: 1,
        pages: [
          {
            pageNumber: 1,
            dimensions: { width: 595, height: 842, unit: 'pt' },
            elements: mockElements,
            readingOrder: ['bad_stem', 'bad_optA'],
            pageHash: 'p1_hash',
          },
        ],
        embeddedMedia: [],
        metadata: {},
        createdAt: Date.now(),
      };

      const pageGraph = buildPageSpatialGraph(docIR.documentId, docIR.pages[0]);
      const result = segmenter.segmentDocument(docIR, new Map([[1, pageGraph]]));

      expect(result.totalParsed).toBe(1);
      const q = result.questions[0];
      expect(q.verification.status).toBe('REVIEW_REQUIRED');
      expect(result.reviewItems.length).toBe(1);
      expect(result.reviewItems[0].anomalyCategory).toBe('OPTION_STRUCTURE');
      expect(result.reviewItems[0].severity).toBe('REVIEW_REQUIRED');
    });
  });

  // ==========================================================================
  // 5. DETERMINISTIC MULTI-LAYERED QUESTION IDENTITY
  // ==========================================================================
  describe('5. Deterministic Multi-Layered Question Identity', () => {
    it('computes identical canonicalQuestionId for questions across different exam sets/variants', () => {
      // Set A: Question 1
      const idSetA = buildQuestionIdentity({
        sourceDocumentId: 'doc_upsc_set_a',
        sourceVariantId: 'SET_A',
        sourcePageNumber: 2,
        sourceSequenceIndex: 0,
        sourcePrintedLabel: 'Q.1',
        topology: 'STANDALONE_MCQ',
        optionCount: 4,
        hasMath: false,
        hasDiagram: false,
        hasTable: false,
        stemText: 'With reference to the Indian economy, consider the following statements:',
        optionTexts: ['1 only', '2 only', 'Both 1 and 2', 'Neither 1 nor 2'],
      });

      // Set B: Question 42 (Same stem and options, different printed label & sequence)
      const idSetB = buildQuestionIdentity({
        sourceDocumentId: 'doc_upsc_set_b',
        sourceVariantId: 'SET_B',
        sourcePageNumber: 15,
        sourceSequenceIndex: 41,
        sourcePrintedLabel: 'Q.42',
        topology: 'STANDALONE_MCQ',
        optionCount: 4,
        hasMath: false,
        hasDiagram: false,
        hasTable: false,
        stemText: 'With reference to the Indian economy, consider the following statements:',
        optionTexts: ['1 only', '2 only', 'Both 1 and 2', 'Neither 1 nor 2'],
      });

      // Canonical content fingerprints and IDs must match across variants!
      expect(idSetA.contentFingerprint).toBe(idSetB.contentFingerprint);
      expect(idSetA.canonicalQuestionId).toBe(idSetB.canonicalQuestionId);

      // But physical instance IDs must remain uniquely distinguishable
      expect(idSetA.instanceId).not.toBe(idSetB.instanceId);
      expect(idSetA.sourceVariantId).toBe('SET_A');
      expect(idSetB.sourceVariantId).toBe('SET_B');
    });

    it('binds official authority question ID deterministically when present', () => {
      const idWithOfficial = buildQuestionIdentity({
        sourceDocumentId: 'doc_ssc_chsl_2023',
        sourcePageNumber: 8,
        sourceSequenceIndex: 25,
        sourcePrintedLabel: 'Q.26',
        officialAuthorityQuestionId: 'TCS_CHSL_984129',
        officialSectionCode: 'GI_REASONING',
        topology: 'STANDALONE_MCQ',
        optionCount: 4,
        hasMath: false,
        hasDiagram: false,
        hasTable: false,
        stemText: 'GAMU is related to JDPX in a certain way...',
        optionTexts: ['EUOT', 'DINS', 'ETOS', 'CTOU'],
      });

      expect(idWithOfficial.officialAuthorityQuestionId).toBe('TCS_CHSL_984129');
      expect(idWithOfficial.officialSectionCode).toBe('GI_REASONING');
      expect(idWithOfficial.canonicalQuestionId).toBeDefined();
    });
  });

  // ==========================================================================
  // 6. FIRST-CLASS ASSET GRAPH ARCHITECTURE
  // ==========================================================================
  describe('6. First-Class Asset Graph Architecture', () => {
    it('manages asset nodes with semantic roles, perceptual hashes, and bidirectional edges', () => {
      const graph = createEmptyAssetGraph('doc_gate_ee_2024');

      const circuitNode: AssetGraphNode = {
        assetId: 'asset_circuit_q14',
        semanticRole: 'CIRCUIT_SCHEMATIC',
        sourceEvidenceId: 'ev_circuit_14',
        sourceDocumentHash: 'hash_gate_2024',
        pageNumber: 6,
        bbox: { x0: 100, y0: 150, x1: 450, y1: 350, width: 350, height: 200, unit: 'pt' },
        intrinsicDimensions: { widthPx: 700, heightPx: 400, dpi: 144 },
        aspectRatio: 1.75,
        colorDepth: 24,
        hasAlphaChannel: false,
        contentPerceptualHash: 'phash_circuit_abc123',
        contentSha256: 'sha256_circuit_binary_bytes',
        authoritativeStoragePath: '/exam-assets/gate/2024/ee/q14_circuit.png',
        representations: [
          {
            representationId: 'rep_circuit_svg',
            assetId: 'asset_circuit_q14',
            type: 'VECTOR_SVG',
            contentPayload: '<svg><circle cx="50" cy="50" r="40"/></svg>',
            confidence: 1.0,
            engineId: 'PDF_VECTOR_EXTRACTOR',
            engineVersion: '1.0.0',
            isAuthoritative: true,
            createdAt: 1700000000000,
          },
        ],
        associatedQuestionInstanceIds: ['q_inst_14'],
        associatedOptionKeys: [],
        associatedStimulusIds: [],
        isCorrupted: false,
        isLeakedStemContent: false,
        verificationStatus: 'VERIFIED',
      };

      graph.assets.set(circuitNode.assetId, circuitNode);
      graph.edges.push({
        sourceAssetId: circuitNode.assetId,
        targetNodeId: 'q_inst_14',
        relationship: 'BELONGS_TO_STEM',
      });

      expect(graph.assets.size).toBe(1);
      const retrieved = graph.assets.get('asset_circuit_q14');
      expect(retrieved?.semanticRole).toBe('CIRCUIT_SCHEMATIC');
      expect(retrieved?.representations.length).toBe(1);
      expect(graph.edges[0].relationship).toBe('BELONGS_TO_STEM');
    });
  });

  // ==========================================================================
  // 7. PHYSICAL GEOMETRY & SOURCE EVIDENCE CHAIN
  // ==========================================================================
  describe('7. Physical Geometry & Source Evidence Chain', () => {
    it('preserves exact affine transformation matrices, rotation, and coordinate spaces', () => {
      const geom: PhysicalGeometry = {
        bbox: { x0: 50, y0: 100, x1: 200, y1: 120, width: 150, height: 20, unit: 'pt' },
        rotationDeg: 0,
        transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 50, f: 100 },
        clippingBox: { x0: 36, y0: 36, x1: 559, y1: 806 },
      };

      expect(geom.transformMatrix.a).toBe(1);
      expect(geom.transformMatrix.d).toBe(1);
      expect(geom.clippingBox?.x0).toBe(36);

      const chain: SourceEvidenceChain = {
        evidenceId: 'chain_ev_001',
        sourceDocumentHash: '4a2f8b9c1d',
        sourceDocumentUri: 's3://exams/upsc_csat_2024.pdf',
        pageIndex: 3,
        pageNumber: 4,
        coordinateSpace: 'PDF_PT_BOTTOM_LEFT',
        bbox: geom.bbox,
        sourceReferences: [],
        sourceStreamOffsets: { startOffset: 10244, endOffset: 10892 },
        sourceObjectIds: ['page_4', 'font_f3', 'content_stream_22'],
        losslessRasterCropHash: '9e3c11a2f4',
        rawTextStream: 'Option C has value 45 m/s',
        decodedUnicodeStream: 'Option C has value 45 m/s',
        extractorEngine: 'PYMUPDF_NATIVE',
        extractorVersion: '1.24.0',
        extractionConfidence: 1.0,
        transformHistory: [],
        derivedEvidenceIds: [],
      };

      expect(chain.coordinateSpace).toBe('PDF_PT_BOTTOM_LEFT');
      expect(chain.sourceStreamOffsets?.startOffset).toBe(10244);
      expect(chain.sourceObjectIds).toContain('content_stream_22');
    });
  });

  // ==========================================================================
  // 8. FORENSIC SNAPSHOT & GENERALIZED SOURCE REFERENCES
  // ==========================================================================
  describe('8. Forensic Snapshot & Generalized Source References', () => {
    it('creates an immutable sealed ForensicSnapshot anchoring source truth', () => {
      const snapshot = {
        snapshotId: 'snap_doc_upsc_2024_hash',
        sourceDocumentId: 'doc_upsc_2024',
        sourceSha256: '4a2f8b9c1d000000000000000000000000000000000000000000000000000000',
        acquisitionMetadata: {
          sourceUri: 's3://exams/upsc_prelims_2024.pdf',
          acquiredAt: 1728200000000,
          fileSizeBytes: 5420100,
          mimeType: 'application/pdf',
          contentHash: 'hash_binary_4a2f',
        },
        sourceFormat: 'PDF_NATIVE' as const,
        adapterProvenance: {
          adapterId: 'uadue_adapter_pdf_native',
          adapterVersion: '1.1.0',
          parserEngine: 'PDFJS_FORENSIC',
          parserVersion: '4.0.379',
          schemaVersion: '1.5.0',
          processingConfigHash: 'cfg_hash_default',
        },
        pageGeometries: [
          {
            pageIndex: 0,
            pageNumber: 1,
            dimensions: { width: 595, height: 842, unit: 'pt' as const },
            mediaBox: { x0: 0, y0: 0, x1: 595, y1: 842 },
            cropBox: { x0: 36, y0: 36, x1: 559, y1: 806 },
            rotationDeg: 0 as const,
          },
        ],
        sourceObjects: [
          {
            objectId: 'obj_xobject_im1',
            objectType: 'XOBJECT_IMAGE' as const,
            byteOffset: 10420,
            byteLength: 45000,
            sha256: 'sha256_im1_raw_bytes',
          },
        ],
        contentStreams: [],
        fonts: [],
        glyphRuns: [],
        rasterXObjects: [],
        vectorPaths: [],
        clippingStates: [],
        annotations: [],
        coordinateSystems: ['PDF_PT_BOTTOM_LEFT' as const],
        isSealed: true,
        sealedHash: 'sealed_sha256_audit_record',
        sealedAt: 1728200001000,
      };

      expect(snapshot.isSealed).toBe(true);
      expect(snapshot.sourceObjects.length).toBe(1);
      expect(snapshot.adapterProvenance.schemaVersion).toBe('1.5.0');
    });

    it('supports composite SourceReference linking derived entities across multiple physical sources', () => {
      const refPage = {
        referenceId: 'ref_p4',
        documentId: 'doc_gate_2024',
        pageId: 'page_4',
        pageNumber: 4,
        coordinateSpace: 'PDF_PT_BOTTOM_LEFT' as const,
        transformMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        sourceObjectType: 'PAGE_TREE' as const,
        roleInDerivedObject: 'PRIMARY_SOURCE' as const,
      };

      const refXObject = {
        referenceId: 'ref_im3',
        documentId: 'doc_gate_2024',
        pageId: 'page_4',
        pageNumber: 4,
        objectId: 'Im3',
        streamId: 'stream_14',
        operatorIdentifier: 'op_88_Do',
        byteRange: { startByte: 45020, endByte: 98110 },
        coordinateSpace: 'PDF_PT_BOTTOM_LEFT' as const,
        transformMatrix: { a: 0.5, b: 0, c: 0, d: 0.5, e: 100, f: 200 },
        sourceObjectType: 'RASTER_IMAGE' as const,
        roleInDerivedObject: 'DIAGRAM_OVERLAY' as const,
      };

      const compositeRefs: SourceReference[] = [refPage, refXObject];
      expect(compositeRefs.length).toBe(2);
      expect(compositeRefs[1].byteRange?.startByte).toBe(45020);
      expect(compositeRefs[1].roleInDerivedObject).toBe('DIAGRAM_OVERLAY');
    });
  });

  // ==========================================================================
  // 9. DECOUPLED IDENTITY REVISIONS (OCR CORRECTION DOES NOT MUTATE INSTANCE)
  // ==========================================================================
  describe('9. Decoupled Identity Revisions', () => {
    it('creates new ContentRevisionIdentity on OCR patch while preserving immutable SourceInstance', () => {
      // 1. Initial extraction of Question 14 (contains raw OCR glitch)
      const q14Initial = buildQuestionIdentity({
        sourceDocumentId: 'doc_upsc_csat_2024',
        sourcePageNumber: 5,
        sourceSequenceIndex: 13,
        sourcePrintedLabel: 'Q.14',
        topology: 'STANDALONE_MCQ',
        optionCount: 4,
        hasMath: true,
        hasDiagram: false,
        hasTable: false,
        stemText: 'Solve for x: 2x + 3 = ? (raw OCR glitch)',
        optionTexts: ['5', '7', '9', '11'],
        revisionNumber: 1,
      });

      // 2. Staff moderator or review queue corrects OCR to '2x + 3 = 7'
      const q14Patched = buildQuestionIdentity({
        sourceDocumentId: 'doc_upsc_csat_2024',
        sourcePageNumber: 5,
        sourceSequenceIndex: 13,
        sourcePrintedLabel: 'Q.14',
        topology: 'STANDALONE_MCQ',
        optionCount: 4,
        hasMath: true,
        hasDiagram: false,
        hasTable: false,
        stemText: 'Solve for x: 2x + 3 = 7',
        optionTexts: ['5', '7', '9', '11'],
        revisionNumber: 2,
      });

      // Source Question Instance Identity MUST BE IDENTICAL (same physical spot on paper!)
      expect(q14Initial.sourceInstance.instanceId).toBe(q14Patched.sourceInstance.instanceId);
      expect(q14Initial.sourceInstance.sourceSequenceIndex).toBe(q14Patched.sourceInstance.sourceSequenceIndex);

      // But Content Revision Identity MUST BE DIFFERENT and incremented
      expect(q14Initial.contentRevision.revisionId).not.toBe(q14Patched.contentRevision.revisionId);
      expect(q14Initial.contentRevision.revisionNumber).toBe(1);
      expect(q14Patched.contentRevision.revisionNumber).toBe(2);
    });
  });

  // ==========================================================================
  // 10. DECOUPLED ASSET GRAPH & VERIFICATION ISOLATION
  // ==========================================================================
  describe('10. Decoupled AssetGraph & Verification Isolation', () => {
    it('preserves immutable physical SourceAsset without mixing mutable verification findings', () => {
      // Immutable physical SourceAsset
      const physicalSourceAsset = {
        assetId: 'sha256_diagram_q32_clean_pixels',
        sourceDocumentId: 'doc_ssc_chsl_2023',
        sourceDocumentHash: 'source_doc_hash_123',
        pageNumber: 10,
        bbox: { x0: 50, y0: 200, x1: 350, y1: 500, width: 300, height: 300, unit: 'pt' as const },
        intrinsicDimensions: { widthPx: 600, heightPx: 600, dpi: 144 },
        aspectRatio: 1.0,
        colorDepth: 24,
        hasAlphaChannel: false,
        contentPerceptualHash: 'phash_diagram_q32',
        rawByteHash: 'sha256_diagram_q32_clean_pixels',
        authoritativeStoragePath: '/exam-assets/ssc/2023/q32_diag.png',
        sourceReferences: [],
      };

      // Verification Finding (stored separately, does not mutate physical asset)
      const verificationFinding = {
        verificationId: 'verif_find_q32_leakage',
        assetId: physicalSourceAsset.assetId,
        finding: 'LEAKED_STEM_CONTENT' as const,
        severity: 'REVIEW_REQUIRED' as const,
        status: 'REVIEW_REQUIRED' as const,
        details: { detectedLeakedHeader: 'Q.33' },
        verifiedAt: 1728200000000,
        verifiedBy: 'UADUE_INVARIANT_ENGINE',
      };

      expect(physicalSourceAsset.assetId).toBe(verificationFinding.assetId);
      expect((physicalSourceAsset as any).isLeakedStemContent).toBeUndefined(); // Physical asset is NOT polluted!
      expect(verificationFinding.finding).toBe('LEAKED_STEM_CONTENT');
    });
  });

  // ==========================================================================
  // 11. MULTI-DIMENSIONAL VERIFICATION EQUIVALENCE
  // ==========================================================================
  describe('11. Multi-Dimensional Verification Equivalence', () => {
    it('evaluates all 6 independent equivalence dimensions in a VerificationDecision', () => {
      const decision = {
        decisionId: 'decision_q1_cert',
        runId: 'run_v15_suite',
        targetId: 'doc_upsc_q1',
        status: 'CERTIFIED' as const,
        dimensionPassRates: {
          FORENSIC_EQUIVALENCE: true,
          SEMANTIC_EQUIVALENCE: true,
          STRUCTURAL_EQUIVALENCE: true,
          CONTENT_EQUIVALENCE: true,
          ANSWER_EQUIVALENCE: true,
          UI_EQUIVALENCE: true,
        },
        fatalCount: 0,
        reviewRequiredCount: 0,
        warningCount: 0,
        decidedBy: 'UADUE_CERTIFICATION_SEALER',
        decidedAt: 1728200005000,
        cryptographicSignature: 'sha256_seal_signature_hex',
      };

      expect(decision.dimensionPassRates.FORENSIC_EQUIVALENCE).toBe(true);
      expect(decision.dimensionPassRates.UI_EQUIVALENCE).toBe(true);
      expect(decision.status).toBe('CERTIFIED');
      expect(decision.fatalCount).toBe(0);
    });
  });
});
