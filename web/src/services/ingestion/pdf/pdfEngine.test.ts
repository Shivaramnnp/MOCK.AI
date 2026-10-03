import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validatePdfBinary } from './pdfValidator';
import { computePdfHash, checkDuplicate, cacheIngestedPdf } from './pdfHasher';
import { detectTables, tableToContentBlock } from './tableDetector';
import { reconstructLineMath, wrapFormulaExpressions } from './mathReconstructor';
import { segmentQuestions } from './questionSegmenter';
import { segmentOptions } from './optionSegmenter';
import { buildQuestionContentBlocks } from './contentBlockBuilder';
import { classifyPage } from './pageClassifier';
import { ingestPdfDocument } from './pdfIngestionEngine';
import { TextLine, ExtractedAsset } from './types';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';

describe('PDF Ingestion Engine — Unit & Forensic Pipeline Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. PDF Validation & Security (pdfValidator)', () => {
    it('rejects empty file (0 bytes)', () => {
      const res = validatePdfBinary(new Uint8Array(0), 'empty.pdf');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('is empty');
    });

    it('rejects files without %PDF- magic bytes', () => {
      const text = 'This is an ordinary text file without PDF magic bytes.';
      const bytes = new TextEncoder().encode(text);
      const res = validatePdfBinary(bytes, 'fake.pdf');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('magic header');
    });

    it('accepts valid PDF header and extracts version', () => {
      const pdfHeader = '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF';
      const bytes = new TextEncoder().encode(pdfHeader);
      const res = validatePdfBinary(bytes, 'valid.pdf');
      expect(res.valid).toBe(true);
      expect(res.pdfVersion).toBe('1.7');
    });

    it('detects encrypted / password-protected PDF and warns user', () => {
      const encryptedPdf = '%PDF-1.5\n/Encrypt 12 0 R\n<< /Filter /Standard >>\n%%EOF';
      const bytes = new TextEncoder().encode(encryptedPdf);
      const res = validatePdfBinary(bytes, 'protected.pdf');
      expect(res.valid).toBe(false);
      expect(res.isEncrypted).toBe(true);
      expect(res.error).toContain('password-protected');
    });

    it('detects embedded malicious launch or javascript actions', () => {
      const payload = '%PDF-1.6\n/Launch <</F (cmd.exe)>>\n/JavaScript (alert(1))\n%%EOF';
      const bytes = new TextEncoder().encode(payload);
      const res = validatePdfBinary(bytes, 'test.pdf');
      expect(res.valid).toBe(true);
      expect(res.warnings).toBeDefined();
      expect(res.warnings?.some((w) => w.includes('/Launch'))).toBe(true);
      expect(res.warnings?.some((w) => w.includes('/JavaScript'))).toBe(true);
    });
  });

  describe('2. Hashing & Provenance Deduplication (pdfHasher)', () => {
    it('computes deterministic SHA-256 hash', async () => {
      const bytes = new TextEncoder().encode('%PDF-1.4\nTest Content\n%%EOF');
      const hash1 = await computePdfHash(bytes);
      const hash2 = await computePdfHash(bytes);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBeGreaterThan(16);
    });

    it('identifies exact duplicate and returns cached canonical questions', async () => {
      const bytes = new TextEncoder().encode('%PDF-1.4\nDuplicate test paper\n%%EOF');
      const hash = await computePdfHash(bytes);

      const mockQuestion: CanonicalQuestion = {
        questionId: 'q_cached_1',
        sourceId: hash,
        sourceType: 'PDF',
        questionNumber: 1,
        questionText: 'What is the speed of light?',
        contentBlocks: [{ type: 'text', content: 'What is the speed of light?' }],
        questionType: 'MCQ',
        options: [
          { id: 'A', text: '3 x 10^8 m/s' },
          { id: 'B', text: '3 x 10^6 m/s' },
        ],
        answer: { questionType: 'MCQ', correctOptionId: 'A' },
        scoring: { marks: 1, negativeMarks: 0.33 },
        provenance: { sourceType: 'PDF', sourceFile: 'physics.pdf' },
        assets: [],
        explanation: 'Standard constant.',
        verificationStatus: 'VERIFIED',
        verificationReasons: [],
        confidence: { extraction: 1, structure: 1, answer: 1, asset: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      cacheIngestedPdf(
        {
          documentId: 'doc_123',
          fileName: 'physics.pdf',
          fileSizeBytes: bytes.length,
          contentHashSha256: hash,
          pageCount: 1,
          uploadedAt: Date.now(),
        },
        [mockQuestion]
      );

      // Same file, exact name
      const exactCheck = checkDuplicate(hash, 'physics.pdf');
      expect(exactCheck.isDuplicate).toBe(true);
      expect(exactCheck.duplicateType).toBe('EXACT');
      expect(exactCheck.cachedQuestions?.length).toBe(1);

      // Same file, renamed
      const renamedCheck = checkDuplicate(hash, 'renamed_physics.pdf');
      expect(renamedCheck.isDuplicate).toBe(true);
      expect(renamedCheck.duplicateType).toBe('RENAMED');
    });
  });

  describe('3. Table Detection & Anti-Flattening (tableDetector)', () => {
    it('detects Column-I / Column-II matching table and constructs structured grid', () => {
      const lines: TextLine[] = [
        {
          y: 700,
          height: 12,
          fontSize: 12,
          text: 'Q. 6 Column - I has statements and Column - II has responses.',
          spans: [{ str: 'Q. 6 Column - I has statements and Column - II has responses.', x: 50, y: 700, width: 350, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }],
          pageNumber: 1,
          minX: 50,
          maxX: 400,
        },
        {
          y: 650,
          height: 12,
          fontSize: 12,
          text: 'Column - I Column - II',
          spans: [
            { str: 'Column - I', x: 100, y: 650, width: 80, height: 12, fontSize: 12, fontName: 'std', hasEOL: false, pageNumber: 1 },
            { str: 'Column - II', x: 300, y: 650, width: 80, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 },
          ],
          pageNumber: 1,
          minX: 100,
          maxX: 380,
        },
        {
          y: 600,
          height: 12,
          fontSize: 12,
          text: 'P. This house is in a mess. 1. Alright, I will clean it up.',
          spans: [
            { str: 'P. This house is in a mess.', x: 100, y: 600, width: 140, height: 12, fontSize: 12, fontName: 'std', hasEOL: false, pageNumber: 1 },
            { str: '1. Alright, I will clean it up.', x: 300, y: 600, width: 160, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 },
          ],
          pageNumber: 1,
          minX: 100,
          maxX: 460,
        },
        {
          y: 550,
          height: 12,
          fontSize: 12,
          text: 'Q. I am not happy. 2. Well, cheer up.',
          spans: [
            { str: 'Q. I am not happy.', x: 100, y: 550, width: 100, height: 12, fontSize: 12, fontName: 'std', hasEOL: false, pageNumber: 1 },
            { str: '2. Well, cheer up.', x: 300, y: 550, width: 110, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 },
          ],
          pageNumber: 1,
          minX: 100,
          maxX: 410,
        },
        {
          y: 500,
          height: 12,
          fontSize: 12,
          text: 'Identify the option that has the correct match.',
          spans: [{ str: 'Identify the option that has the correct match.', x: 50, y: 500, width: 250, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }],
          pageNumber: 1,
          minX: 50,
          maxX: 300,
        },
      ];

      const { tables, remainingLines } = detectTables(lines, 1, 600, 800);
      expect(tables.length).toBe(1);
      const table = tables[0];
      expect(table.headers).toEqual(['Column - I', 'Column - II']);
      expect(table.rows.length).toBe(2);
      expect(table.rows[0][0]).toContain('P. This house is in a mess.');
      expect(table.rows[0][1]).toContain('1. Alright, I will clean it up.');

      const block = tableToContentBlock(table);
      expect(block.type).toBe('table');
      expect(block.headers).toEqual(['Column - I', 'Column - II']);

      // Remaining lines should still have the question prompt and option matcher
      expect(remainingLines.some((l) => l.text.includes('Identify the option'))).toBe(true);
    });
  });

  describe('4. Mathematical Reconstruction (mathReconstructor)', () => {
    it('reconstructs superscripts and subscripts using coordinate baselines', () => {
      const lineWithSuperscript: TextLine = {
        y: 500,
        height: 12,
        fontSize: 12,
        text: '3 x 2 = 27',
        spans: [
          { str: '3', x: 50, y: 500, width: 10, height: 12, fontSize: 12, fontName: 'std', hasEOL: false, pageNumber: 1 },
          { str: 'x', x: 60, y: 500, width: 8, height: 12, fontSize: 12, fontName: 'std', hasEOL: false, pageNumber: 1 },
          { str: '2', x: 68, y: 504, width: 6, height: 8, fontSize: 8, fontName: 'std', hasEOL: false, pageNumber: 1 }, // Superscript!
          { str: '=', x: 80, y: 500, width: 10, height: 12, fontSize: 12, fontName: 'std', hasEOL: false, pageNumber: 1 },
          { str: '27', x: 95, y: 500, width: 15, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 },
        ],
        pageNumber: 1,
        minX: 50,
        maxX: 110,
      };

      const result = reconstructLineMath(lineWithSuperscript);
      expect(result).toContain('^{2}');
    });

    it('maps Unicode math symbols to standard LaTeX', () => {
      const lineWithSymbols: TextLine = {
        y: 400,
        height: 12,
        fontSize: 12,
        text: 'U ≤ 4 and x ∈ R',
        spans: [
          { str: 'U ≤ 4 and x ∈ R', x: 50, y: 400, width: 100, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 },
        ],
        pageNumber: 1,
        minX: 50,
        maxX: 150,
      };

      const result = reconstructLineMath(lineWithSymbols);
      expect(result).toContain('\\le');
      expect(result).toContain('\\in');
    });

    it('preserves spaces in English sentences and never collapses words inside math delimiters', () => {
      const sentence = 'The variance of the normal distribution is equal to 1.';
      const enriched = wrapFormulaExpressions(sentence);
      // Spaces must remain completely intact!
      expect(enriched).toBe('The variance of the normal distribution is equal to 1.');
      expect(enriched).not.toContain('Thevarianceof');
    });
  });

  describe('5. Question Segmentation (questionSegmenter)', () => {
    it('segments sequential questions and marks allocations', () => {
      const allLines = new Map<number, TextLine[]>();
      allLines.set(1, [
        {
          y: 750,
          height: 12,
          fontSize: 12,
          text: 'General Aptitude',
          spans: [{ str: 'General Aptitude', x: 50, y: 750, width: 100, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }],
          pageNumber: 1,
          minX: 50,
          maxX: 150,
        },
        {
          y: 720,
          height: 12,
          fontSize: 12,
          text: 'Q. 1 – Q. 5 Carry ONE mark Each',
          spans: [{ str: 'Q. 1 – Q. 5 Carry ONE mark Each', x: 50, y: 720, width: 200, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }],
          pageNumber: 1,
          minX: 50,
          maxX: 250,
        },
        {
          y: 680,
          height: 12,
          fontSize: 12,
          text: 'Q. 1 Courage : Bravery :: Yearning : __________',
          spans: [{ str: 'Q. 1 Courage : Bravery :: Yearning : __________', x: 50, y: 680, width: 250, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }],
          pageNumber: 1,
          minX: 50,
          maxX: 300,
        },
        {
          y: 650,
          height: 12,
          fontSize: 12,
          text: '(A) Longing',
          spans: [{ str: '(A) Longing', x: 50, y: 650, width: 80, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }],
          pageNumber: 1,
          minX: 50,
          maxX: 130,
        },
        {
          y: 630,
          height: 12,
          fontSize: 12,
          text: '(B) Yelling',
          spans: [{ str: '(B) Yelling', x: 50, y: 630, width: 80, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }],
          pageNumber: 1,
          minX: 50,
          maxX: 130,
        },
        {
          y: 580,
          height: 12,
          fontSize: 12,
          text: 'Q. 2 The number of solutions is (Answer in integer)',
          spans: [{ str: 'Q. 2 The number of solutions is (Answer in integer)', x: 50, y: 580, width: 300, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }],
          pageNumber: 1,
          minX: 50,
          maxX: 350,
        },
      ]);

      const boundaries = segmentQuestions(allLines, new Map(), new Map());
      expect(boundaries.length).toBe(2);

      // Q1: MCQ with 1 mark
      expect(boundaries[0].questionNumber).toBe(1);
      expect(boundaries[0].questionType).toBe('MCQ');
      expect(boundaries[0].marks).toBe(1);
      expect(boundaries[0].rawOptionLines.size).toBe(2);

      // Q2: NAT (no options, answer in integer)
      expect(boundaries[1].questionNumber).toBe(2);
      expect(boundaries[1].questionType).toBe('NAT');
      expect(boundaries[1].rawOptionLines.size).toBe(0);
    });
  });

  describe('6. Dynamic Option Segmentation (optionSegmenter)', () => {
    it('preserves genuine option count without fake padding or truncation', () => {
      const rawOptions = new Map<string, TextLine[]>();
      rawOptions.set('A', [
        { y: 100, height: 12, fontSize: 12, text: '(A) First option', spans: [{ str: '(A) First option', x: 50, y: 100, width: 80, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }], pageNumber: 1, minX: 50, maxX: 130 },
      ]);
      rawOptions.set('B', [
        { y: 80, height: 12, fontSize: 12, text: '(B) Second option', spans: [{ str: '(B) Second option', x: 50, y: 80, width: 80, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }], pageNumber: 1, minX: 50, maxX: 130 },
      ]);
      rawOptions.set('C', [
        { y: 60, height: 12, fontSize: 12, text: '(C) Third option', spans: [{ str: '(C) Third option', x: 50, y: 60, width: 80, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }], pageNumber: 1, minX: 50, maxX: 130 },
      ]);
      rawOptions.set('D', [
        { y: 40, height: 12, fontSize: 12, text: '(D) Fourth option', spans: [{ str: '(D) Fourth option', x: 50, y: 40, width: 80, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }], pageNumber: 1, minX: 50, maxX: 130 },
      ]);
      rawOptions.set('E', [
        { y: 20, height: 12, fontSize: 12, text: '(E) Fifth option', spans: [{ str: '(E) Fifth option', x: 50, y: 20, width: 80, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }], pageNumber: 1, minX: 50, maxX: 130 },
      ]);

      const options = segmentOptions(rawOptions, []);
      // Must have exactly 5 options, not truncated to 4!
      expect(options.length).toBe(5);
      expect(options[4].id).toBe('E');
      expect(options[4].text).toBe('Fifth option');
    });
  });

  describe('7. Asset Ownership & Watermark Filtering (assetExtractor)', () => {
    it('classifies full-page watermark as WATERMARK and excludes it from question diagrams', () => {
      const mockAssets: ExtractedAsset[] = [
        {
          assetId: 'wm_1',
          sourcePage: 1,
          boundingBox: { x: 0, y: 0, width: 600, height: 800, pageWidth: 600, pageHeight: 800 },
          mimeType: 'image/png',
          width: 2000,
          height: 2000,
          hash: 'wm_hash',
          ownership: 'WATERMARK',
          contentType: 'image',
        },
        {
          assetId: 'diag_q3',
          sourcePage: 1,
          boundingBox: { x: 200, y: 450, width: 150, height: 120, pageWidth: 600, pageHeight: 800 },
          mimeType: 'image/png',
          width: 300,
          height: 240,
          hash: 'diag_hash',
          ownership: 'QUESTION',
          contentType: 'diagram',
          dataUrl: 'data:image/png;base64,sample',
        },
      ];

      // Build question content blocks with these assets
      const stemLines: TextLine[] = [
        {
          y: 550,
          height: 12,
          fontSize: 12,
          text: 'Q. 3 A digital image is shown in the figure.',
          spans: [{ str: 'Q. 3 A digital image is shown in the figure.', x: 50, y: 550, width: 250, height: 12, fontSize: 12, fontName: 'std', hasEOL: true, pageNumber: 1 }],
          pageNumber: 1,
          minX: 50,
          maxX: 300,
        },
      ];

      const { contentBlocks } = buildQuestionContentBlocks(stemLines, [], mockAssets);
      // The watermark must NOT be in content blocks!
      expect(contentBlocks.some((b) => b.assetId === 'wm_1')).toBe(false);
      // The authentic question diagram must be preserved!
      const diagramBlock = contentBlocks.find((b) => b.assetId === 'diag_q3');
      expect(diagramBlock).toBeDefined();
      expect(diagramBlock?.type).toBe('image');
    });
  });

  describe('8. Page Classification (pageClassifier)', () => {
    it('classifies high-character digital text page as TEXT_NATIVE', () => {
      const lines: TextLine[] = Array.from({ length: 25 }, (_, i) => ({
        y: 700 - i * 20,
        height: 12,
        fontSize: 12,
        text: 'This is standard textual content from competitive exam study materials.',
        spans: [],
        pageNumber: 1,
        minX: 50,
        maxX: 400,
      }));

      const { classification } = classifyPage(lines, [], [], 600, 800);
      expect(classification).toBe('TEXT_NATIVE');
    });

    it('classifies pages with Column-I / Column-II matching as TABLE_HEAVY', () => {
      const lines: TextLine[] = [
        {
          y: 700,
          height: 12,
          fontSize: 12,
          text: 'Q. 6 Match Column-I with Column-II.',
          spans: [],
          pageNumber: 1,
          minX: 50,
          maxX: 300,
        },
      ];

      const { classification } = classifyPage(lines, [], [{ headers: ['Column - I', 'Column - II'], rows: [['A', '1']], boundingBox: { x: 50, y: 500, width: 400, height: 100 }, pageNumber: 1 }], 600, 800);
      expect(classification).toBe('TABLE_HEAVY');
    });
  });
});
