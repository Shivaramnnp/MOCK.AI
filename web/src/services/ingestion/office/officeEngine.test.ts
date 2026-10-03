import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { validateOfficeBinary, sanitizeXml, sanitizeHyperlink } from './officeSecurity';
import { ommlToLatex } from './ommlToLatex';
import { parseDocxDocument } from './docxParser';
import { parsePptxDocument } from './pptxParser';
import { segmentDocumentQuestions } from './documentQuestionSegmenter';
import { ingestOfficeDocument, computeOfficeHash } from './officeIngestionEngine';
import { DocxAdapter, PptxAdapter } from './documentSourceAdapter';
import { DocumentIR } from './types';

// Helper to create a valid minimal DOCX zip package
async function createMockDocxZip(options?: {
  paragraphs?: string[];
  includeTable?: boolean;
  includeEquation?: boolean;
  includeImage?: boolean;
  hasMacro?: boolean;
}): Promise<Uint8Array> {
  const zip = new JSZip();

  // Content Types
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Default Extension="png" ContentType="image/png"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`
  );

  // Package rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`
  );

  // Word rels
  let docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
  if (options?.includeImage) {
    docRelsXml += `<Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>`;
    // Add dummy 1x1 png image
    const dummyPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    zip.file('word/media/image1.png', dummyPng);
  }
  docRelsXml += `</Relationships>`;
  zip.file('word/_rels/document.xml.rels', docRelsXml);

  // Word document.xml
  let bodyContent = '';

  // Paragraphs
  const paras = options?.paragraphs ?? [
    'Q.1 Which of the following is a supervised learning algorithm?',
    '(A) K-Means Clustering',
    '(B) Linear Regression',
    '(C) Principal Component Analysis',
    '(D) Apriori Algorithm',
  ];

  for (const p of paras) {
    bodyContent += `
      <w:p>
        <w:r>
          <w:t>${p}</w:t>
        </w:r>
      </w:p>`;
  }

  // Equation
  if (options?.includeEquation) {
    bodyContent += `
      <w:p>
        <w:r><w:t>Q.2 Find the value of fraction: </w:t></w:r>
        <m:oMath>
          <m:f>
            <m:num><m:r><m:t>x + 1</m:t></m:r></m:num>
            <m:den><m:r><m:t>x - 1</m:t></m:r></m:den>
          </m:f>
        </m:oMath>
      </w:p>`;
  }

  // Table
  if (options?.includeTable) {
    bodyContent += `
      <w:tbl>
        <w:tr>
          <w:trPr><w:tblHeader/></w:trPr>
          <w:tc><w:p><w:r><w:t>Column - I</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Column - II</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>P. QuickSort</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>1. Divide and Conquer</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Q. Dijkstra</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>2. Greedy</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>`;
  }

  // Image drawing
  if (options?.includeImage) {
    bodyContent += `
      <w:p>
        <w:r>
          <w:drawing>
            <wp:inline>
              <wp:extent cx="1270000" cy="635000"/>
              <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <a:graphicData>
                  <a:blip r:embed="rIdImg1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                </a:graphicData>
              </a:graphic>
            </wp:inline>
          </w:drawing>
        </w:r>
      </w:p>`;
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
                xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
      <w:body>
        ${bodyContent}
      </w:body>
    </w:document>`;

  zip.file('word/document.xml', docXml);

  if (options?.hasMacro) {
    zip.file('word/vbaProject.bin', new Uint8Array([1, 2, 3, 4]));
  }

  return zip.generateAsync({ type: 'uint8array' });
}

// Helper to create a valid minimal PPTX zip package
async function createMockPptxZip(options?: {
  slideCount?: number;
  includeTable?: boolean;
  includeNotes?: boolean;
}): Promise<Uint8Array> {
  const zip = new JSZip();

  // Content Types
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
      <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
    </Types>`
  );

  // Package rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
    </Relationships>`
  );

  // Presentation rels
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdSlide1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
    </Relationships>`
  );

  // Presentation xml
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:sldIdLst>
        <p:sldId id="256" r:id="rIdSlide1"/>
      </p:sldIdLst>
    </p:presentation>`
  );

  // Slide 1 rels
  let slide1Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
  if (options?.includeNotes) {
    slide1Rels += `<Relationship Id="rIdNotes1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>`;
    zip.file(
      'ppt/notesSlides/notesSlide1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld>
          <p:spTree>
            <p:sp>
              <p:txBody>
                <a:p><a:r><a:t>Speaker note: Discuss time complexity and average case performance.</a:t></a:r></a:p>
              </p:txBody>
            </p:sp>
          </p:spTree>
        </p:cSld>
      </p:notes>`
    );
  }
  slide1Rels += `</Relationships>`;
  zip.file('ppt/slides/_rels/slide1.xml.rels', slide1Rels);

  // Slide 1 xml
  let spTreeContent = `
    <p:sp>
      <p:spPr>
        <a:xfrm xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:off x="635000" y="635000"/>
          <a:ext cx="5000000" cy="1000000"/>
        </a:xfrm>
      </p:spPr>
      <p:txBody xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:p><a:r><a:t>Q.1 What is the worst-case complexity of QuickSort?</a:t></a:r></a:p>
        <a:p><a:r><a:t>(A) O(n log n)</a:t></a:r></a:p>
        <a:p><a:r><a:t>(B) O(n^2)</a:t></a:r></a:p>
        <a:p><a:r><a:t>(C) O(n)</a:t></a:r></a:p>
        <a:p><a:r><a:t>(D) O(1)</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>`;

  if (options?.includeTable) {
    spTreeContent += `
      <p:graphicFrame xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:spPr>
          <a:xfrm><a:off x="635000" y="2000000"/><a:ext cx="4000000" cy="2000000"/></a:xfrm>
        </p:spPr>
        <a:graphic>
          <a:graphicData>
            <a:tbl>
              <a:tr h="500000">
                <a:tc><a:txBody><a:p><a:r><a:t>Algorithm</a:t></a:r></a:p></a:txBody></a:tc>
                <a:tc><a:txBody><a:p><a:r><a:t>Worst Case</a:t></a:r></a:p></a:txBody></a:tc>
              </a:tr>
              <a:tr h="500000">
                <a:tc><a:txBody><a:p><a:r><a:t>MergeSort</a:t></a:r></a:p></a:txBody></a:tc>
                <a:tc><a:txBody><a:p><a:r><a:t>O(n log n)</a:t></a:r></a:p></a:txBody></a:tc>
              </a:tr>
            </a:tbl>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>`;
  }

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
           xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld>
        <p:spTree>
          ${spTreeContent}
        </p:spTree>
      </p:cSld>
    </p:sld>`;

  zip.file('ppt/slides/slide1.xml', slideXml);

  return zip.generateAsync({ type: 'uint8array' });
}

describe('Production Office Ingestion Engine (DOCX & PPTX) — Forensic Unit Tests', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('1. Security Validation (officeSecurity)', () => {
    it('rejects empty file (0 bytes)', async () => {
      const res = await validateOfficeBinary(new Uint8Array(0), 'empty.docx');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('0 bytes');
    });

    it('rejects files without PK magic bytes', async () => {
      const corrupt = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      const res = await validateOfficeBinary(corrupt, 'fake.docx');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('missing ZIP PK magic header');
    });

    it('detects embedded VBA macros and reports warning', async () => {
      const macroDocx = await createMockDocxZip({ hasMacro: true });
      const res = await validateOfficeBinary(macroDocx, 'macro_doc.docm');
      expect(res.valid).toBe(true);
      expect(res.hasMacros).toBe(true);
      expect(res.warnings?.[0]).toContain('macros detected');
    });

    it('sanitizes malicious DOCTYPE entity expansions (XXE protection)', () => {
      const dangerousXml = `<?xml version="1.0"?><!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>`;
      const cleanXml = sanitizeXml(dangerousXml);
      expect(cleanXml.includes('<!DOCTYPE')).toBe(false);
      expect(cleanXml.includes('SYSTEM')).toBe(false);
    });

    it('blocks malicious javascript: and file:/// hyperlinks', () => {
      expect(sanitizeHyperlink('javascript:alert(1)')).toBe('#blocked-untrusted-link');
      expect(sanitizeHyperlink('file:///etc/hosts')).toBe('#blocked-untrusted-link');
      expect(sanitizeHyperlink('https://gate2025.iitr.ac.in')).toBe('https://gate2025.iitr.ac.in');
    });
  });

  describe('2. OMML Math Reconstruction (ommlToLatex)', () => {
    it('converts fractions to \\frac{num}{den}', () => {
      const omml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:f>
          <m:num><m:r><m:t>a + b</m:t></m:r></m:num>
          <m:den><m:r><m:t>2</m:t></m:r></m:den>
        </m:f>
      </m:oMath>`;
      const latex = ommlToLatex(omml);
      expect(latex).toBe('$\\frac{a + b}{2}$');
    });

    it('converts superscripts and subscripts', () => {
      const ommlSup = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:sSup>
          <m:e><m:r><m:t>x</m:t></m:r></m:e>
          <m:sup><m:r><m:t>2</m:t></m:r></m:sup>
        </m:sSup>
      </m:oMath>`;
      expect(ommlToLatex(ommlSup)).toBe('${x}^{2}$');

      const ommlSub = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:sSub>
          <m:e><m:r><m:t>a</m:t></m:r></m:e>
          <m:sub><m:r><m:t>1</m:t></m:r></m:sub>
        </m:sSub>
      </m:oMath>`;
      expect(ommlToLatex(ommlSub)).toBe('${a}_{1}$');
    });

    it('converts radicals and square roots', () => {
      const ommlRad = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:rad>
          <m:deg><m:r><m:t>3</m:t></m:r></m:deg>
          <m:e><m:r><m:t>8</m:t></m:r></m:e>
        </m:rad>
      </m:oMath>`;
      expect(ommlToLatex(ommlRad)).toBe('$\\sqrt[3]{8}$');
    });

    it('maps math symbols to standard LaTeX tokens', () => {
      const ommlSymbols = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
        <m:r><m:t>x ≤ 5 and y ± 1</m:t></m:r>
      </m:oMath>`;
      const latex = ommlToLatex(ommlSymbols);
      expect(latex).toContain('\\le');
      expect(latex).toContain('\\pm');
    });
  });

  describe('3. Word DOCX Parsing & Document IR (docxParser)', () => {
    it('extracts paragraphs, headings, tables, equations, and embedded images', async () => {
      const docxBytes = await createMockDocxZip({
        includeTable: true,
        includeEquation: true,
        includeImage: true,
      });

      const ir = await parseDocxDocument(docxBytes, 'Exam_Questions.docx', 'hash_test_123');

      expect(ir.metadata.sourceType).toBe('DOCX');
      expect(ir.units.length).toBe(1);
      const unit = ir.units[0];

      // Paragraphs
      const q1Block = unit.blocks.find((b) => b.text?.includes('supervised learning'));
      expect(q1Block).toBeDefined();

      // Options
      expect(unit.blocks.some((b) => b.text?.includes('(B) Linear Regression'))).toBe(true);

      // Equation
      const eqBlock = unit.blocks.find((b) => b.type === 'equation' || b.equationLatex);
      expect(eqBlock).toBeDefined();
      expect(eqBlock?.equationLatex || eqBlock?.text).toContain('\\frac');

      // Table
      const tblBlock = unit.blocks.find((b) => b.type === 'table');
      expect(tblBlock).toBeDefined();
      expect(tblBlock?.table).toBeDefined();
      expect(tblBlock?.table?.headers).toEqual(['Column - I', 'Column - II']);
      expect(tblBlock?.table?.rows.length).toBe(2);

      // Embedded Image
      expect(ir.embeddedAssets.length).toBe(1);
      expect(ir.embeddedAssets[0].mimeType).toBe('image/png');
      const imgBlock = unit.blocks.find((b) => b.type === 'image');
      expect(imgBlock).toBeDefined();
      expect(imgBlock?.coordinates?.width).toBe(100); // 1,270,000 EMU = 100 pt
      expect(imgBlock?.coordinates?.height).toBe(50); // 635,000 EMU = 50 pt
    });
  });

  describe('4. PowerPoint PPTX Parsing & Spatial Order (pptxParser)', () => {
    it('extracts slides, shape coordinates, tables, and speaker notes', async () => {
      const pptxBytes = await createMockPptxZip({
        includeTable: true,
        includeNotes: true,
      });

      const ir = await parsePptxDocument(pptxBytes, 'Presentation.pptx', 'hash_pptx_123');

      expect(ir.metadata.sourceType).toBe('PPTX');
      expect(ir.units.length).toBe(1);
      const slide1 = ir.units[0];

      expect(slide1.unitType).toBe('slide');
      expect(slide1.unitNumber).toBe(1);

      // Speaker Notes
      expect(slide1.speakerNotes).toContain('Discuss time complexity');

      // Text box with coordinates
      const textBlock = slide1.blocks.find((b) => b.text?.includes('QuickSort'));
      expect(textBlock).toBeDefined();
      expect(textBlock?.coordinates).toBeDefined();
      expect(textBlock?.coordinates?.x).toBe(50); // 635,000 EMU = 50 pt

      // Table
      const tblBlock = slide1.blocks.find((b) => b.type === 'table');
      expect(tblBlock).toBeDefined();
      expect(tblBlock?.table?.rows.length).toBe(2);
      expect(tblBlock?.table?.rows[0]).toEqual(['Algorithm', 'Worst Case']);
      expect(tblBlock?.table?.rows[1]).toEqual(['MergeSort', 'O(n log n)']);
    });
  });

  describe('5. Question Segmentation & Canonical Question Synthesis', () => {
    it('segments DOCX IR into CanonicalQuestions with preserved tables and formulas', async () => {
      const docxBytes = await createMockDocxZip({
        includeTable: true,
        includeEquation: true,
      });

      const ir = await parseDocxDocument(docxBytes, 'Test_Paper.docx', 'hash_seg_test');
      const questions = segmentDocumentQuestions(ir, 'GATE');

      expect(questions.length).toBe(2);

      // Q1: MCQ with 4 options
      const q1 = questions[0];
      expect(q1.questionNumber).toBe(1);
      expect(q1.questionType).toBe('MCQ');
      expect(q1.options.length).toBe(4);
      expect(q1.options[0].id).toBe('A');
      expect(q1.options[1].id).toBe('B');

      // Q2: Contains LaTeX equation and structured table
      const q2 = questions[1];
      expect(q2.questionNumber).toBe(2);
      const hasEquation = q2.contentBlocks.some((b) => b.type === 'equation' || b.content?.includes('\\frac'));
      expect(hasEquation).toBe(true);

      const tableBlock = q2.contentBlocks.find((b) => b.type === 'table');
      expect(tableBlock).toBeDefined();
      expect(tableBlock?.headers).toEqual(['Column - I', 'Column - II']);
      expect(tableBlock?.rows?.length).toBe(2);
    });
  });

  describe('6. Master Office Ingestion Engine End-to-End', () => {
    it('executes complete pipeline on DOCX with 100% fidelity', async () => {
      const docxBytes = await createMockDocxZip({
        includeTable: true,
        includeEquation: true,
        includeImage: true,
      });

      const result = await ingestOfficeDocument(docxBytes, 'GATE_Sample.docx', 'user_123', {
        skipDeduplication: true,
      });

      expect(result.success).toBe(true);
      expect(result.sourceType).toBe('Docx');
      expect(result.questions.length).toBe(2);
      expect(result.qualityReport).toBeDefined();
      expect(result.qualityReport?.total).toBe(2);
      expect(result.qualityReport?.verified).toBeGreaterThanOrEqual(1);

      // Deduplication fast-path
      const cached = await ingestOfficeDocument(docxBytes, 'GATE_Sample.docx', 'user_123', {
        skipDeduplication: false,
      });
      expect(cached.success).toBe(true);
      expect(cached.warnings?.[0]).toContain('Retrieved from cache');
    });

    it('executes complete pipeline on PPTX presentation', async () => {
      const pptxBytes = await createMockPptxZip({
        includeTable: true,
        includeNotes: true,
      });

      const result = await ingestOfficeDocument(pptxBytes, 'GATE_Lectures.pptx', 'user_123', {
        skipDeduplication: true,
      });

      expect(result.success).toBe(true);
      expect(result.sourceType).toBe('Docx');
      expect(result.questions.length).toBeGreaterThanOrEqual(1);
      const q1 = result.questions[0];
      expect(q1.options.length).toBe(4);
      expect(q1.options[1].text).toContain('O(n^2)');
    });
  });

  describe('7. DocumentSourceAdapter & Specializations (DocxAdapter / PptxAdapter)', () => {
    it('DocxAdapter validates and processes docx files strictly', async () => {
      const docxAdapter = new DocxAdapter();
      const docxBytes = await createMockDocxZip();

      const validation = await docxAdapter.validateInput({
        arrayBuffer: docxBytes.buffer,
        fileName: 'sample.docx',
      });
      expect(validation.valid).toBe(true);

      const result = await docxAdapter.process({
        arrayBuffer: docxBytes.buffer,
        fileName: 'sample.docx',
      });
      expect(result.success).toBe(true);
      expect(result.sourceType).toBe('Docx');
    });

    it('PptxAdapter validates and processes pptx files strictly', async () => {
      const pptxAdapter = new PptxAdapter();
      const pptxBytes = await createMockPptxZip();

      const validation = await pptxAdapter.validateInput({
        arrayBuffer: pptxBytes.buffer,
        fileName: 'slides.pptx',
      });
      expect(validation.valid).toBe(true);

      const result = await pptxAdapter.process({
        arrayBuffer: pptxBytes.buffer,
        fileName: 'slides.pptx',
      });
      expect(result.success).toBe(true);
      expect(result.sourceType).toBe('Docx');
    });

    it('rejects cross-type mismatches (e.g. DOCX file given to PptxAdapter)', async () => {
      const pptxAdapter = new PptxAdapter();
      const docxBytes = await createMockDocxZip();

      const validation = await pptxAdapter.validateInput({
        arrayBuffer: docxBytes.buffer,
        fileName: 'renamed_as_pptx.pptx',
      });
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Expected PPTX document, but detected DOCX');
    });
  });
});
