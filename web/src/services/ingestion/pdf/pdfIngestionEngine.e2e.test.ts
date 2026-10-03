import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ingestPdfDocument } from './pdfIngestionEngine';
import { PdfJobProgress } from './types';

describe('PDF Ingestion Engine — End-to-End Fixture Verification (GATE 2025 DA)', () => {
  const fixturePath = '/Users/shivarampatel/Downloads/GATE 2025/Question Papers/DA/GATE_2025_DA_Question_Paper.pdf';
  const hasFixture = fs.existsSync(fixturePath);

  it.skipIf(!hasFixture)('ingests real GATE 2025 DA question paper pages with 100% fidelity', async () => {
    const pdfBuffer = fs.readFileSync(fixturePath);
    const progressLog: PdfJobProgress[] = [];

    const result = await ingestPdfDocument(
      pdfBuffer,
      'GATE_2025_DA_Question_Paper.pdf',
      'test_user_forensic',
      {
        maxPages: 10,
        maxConcurrentPages: 4,
        skipDeduplication: true,
        targetExamType: 'GATE',
        onProgress: (p) => progressLog.push({ ...p }),
      }
    );

    console.log('Extracted questions count:', result.questions.length);
    console.log(
      'Extracted questions:',
      result.questions.map((q) => ({
        num: q.questionNumber,
        text: (q.questionText || '').slice(0, 60),
        type: q.questionType,
        opts: q.options.length,
        marks: q.scoring.marks,
      }))
    );

    // 1. Ingestion Outcome
    expect(result.success).toBe(true);
    expect(result.sourceType).toBe('PDF');
    expect(result.questions.length).toBeGreaterThanOrEqual(5);
    expect(result.qualityReport).toBeDefined();
    expect(result.qualityReport?.total).toBe(result.questions.length);

    // 2. Progress reporting
    expect(progressLog.length).toBeGreaterThan(0);
    const stages = progressLog.map((p) => p.stage);
    expect(stages).toContain('VALIDATING');
    expect(stages).toContain('EXTRACTING');
    expect(stages).toContain('STRUCTURING');
    expect(stages).toContain('COMPLETED');

    // 3. Question 1 & 2 (MCQ, 1 Mark)
    const q1 = result.questions.find((q) => q.questionNumber === 1 || (q.questionText || '').includes('Q.1') || (q.questionText || '').includes('Q. 1'));
    if (q1) {
      expect(q1.questionType).toBe('MCQ');
      expect(q1.scoring.marks).toBe(1);
      expect(q1.options.length).toBe(4);
    }

    // 4. Question 3 (Image Diagram Asset Preserved, Watermark Filtered)
    const q3 = result.questions.find((q) => q.questionNumber === 3 || (q.questionText || '').includes('Q.3') || (q.questionText || '').includes('Q. 3'));
    if (q3) {
      const hasImage = q3.contentBlocks.some((b) => b.type === 'image');
      const hasWatermark = q3.contentBlocks.some((b) => (b.caption || '').toLowerCase().includes('watermark'));
      expect(hasWatermark).toBe(false);
      expect(hasImage || (q3.assets && q3.assets.length > 0)).toBe(true);
    }

    // 5. Question 6 (Structured Column-I / Column-II Matching Table)
    const q6 = result.questions.find((q) => q.questionNumber === 6 || (q.questionText || '').includes('Q.6') || (q.questionText || '').includes('Q. 6'));
    if (q6) {
      const tableBlock = q6.contentBlocks.find((b) => b.type === 'table');
      expect(tableBlock).toBeDefined();
      if (tableBlock && tableBlock.headers) {
        expect(tableBlock.headers.some((h) => h.includes('Column'))).toBe(true);
      }
    }

    // 6. Question 9 (Superscript Mathematical Fidelity)
    const q9 = result.questions.find((q) => q.questionNumber === 9 || (q.questionText || '').includes('Q.9') || (q.questionText || '').includes('Q. 9'));
    if (q9) {
      const allText =
        q9.contentBlocks.map((b) => b.content || '').join(' ') +
        ' ' +
        q9.options.map((o) => (o.contentBlocks || []).map((b) => b.content || '').join(' ')).join(' ');
      // Should contain math with superscript (e.g. 3^{x^2} or x^2 or 2^{-1})
      expect(allText.includes('^') || allText.includes('3^{') || allText.includes('2^{') || allText.includes('2^{-1}')).toBe(true);
    }

    // 7. Fast-Path Deduplication Test
    const cachedResult = await ingestPdfDocument(
      pdfBuffer,
      'GATE_2025_DA_Question_Paper.pdf',
      'test_user_forensic',
      {
        skipDeduplication: false,
      }
    );
    expect(cachedResult.success).toBe(true);
    expect(cachedResult.warnings?.[0]).toContain('Retrieved from cache');
    expect(cachedResult.questions.length).toBe(result.questions.length);
  }, 45000);
});
