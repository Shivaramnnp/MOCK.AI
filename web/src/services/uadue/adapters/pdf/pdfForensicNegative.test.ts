/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Test Suite: Forensic Adapter Negative Invariants (Phase 2A)
 *
 * RIGOROUS NEGATIVE TESTS:
 * Proves that the Forensic PDF Reference Adapter behaves as a PURE DECODER.
 * It strictly preserves physical truth and NEVER performs semantic inference,
 * question segmentation, line merging, diagram classification, or lossy normalization.
 */

import { describe, it, expect } from 'vitest';
import { PdfNativeSourceAdapter, determineUnicodeStatus } from '../PdfNativeSourceAdapter';
import { GoldenPdfCorpus } from './goldenPdfCorpus';

describe('PdfNativeSourceAdapter — Forensic Negative Invariants (Phase 2A)', { timeout: 20000 }, () => {
  const adapter = new PdfNativeSourceAdapter();

  it('NEGATIVE: Adapter strictly DOES NOT segment questions or build QuestionGraph', async () => {
    const fixture = GoldenPdfCorpus.createGc03SscChsl();
    const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

    // 1. Snapshot must have NO question/option/answer properties
    expect((snapshot as any).questions).toBeUndefined();
    expect((snapshot as any).questionGraph).toBeUndefined();
    expect((snapshot as any).canonicalQuestions).toBeUndefined();
    expect((snapshot as any).stems).toBeUndefined();
    expect((snapshot as any).options).toBeUndefined();
    expect((snapshot as any).answerKeys).toBeUndefined();

    // 2. Individual glyph runs must NOT be annotated with semantic question IDs
    for (const glyph of snapshot.glyphRuns) {
      expect((glyph as any).questionId).toBeUndefined();
      expect((glyph as any).isStem).toBeUndefined();
      expect((glyph as any).isOption).toBeUndefined();
      expect((glyph as any).optionLabel).toBeUndefined();
    }
  });

  it('NEGATIVE: Adapter strictly DOES NOT merge separate text lines or normalize whitespace', async () => {
    const fixture = GoldenPdfCorpus.createGc03SscChsl();
    const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

    // All options were emitted as separate Tj commands in the PDF stream
    // The adapter must preserve them as distinct physical glyph runs
    const distinctTexts = snapshot.glyphRuns.map((g) => g.decodedUnicode.trim());

    expect(distinctTexts.some((t) => t.includes('Option 1: EUOT'))).toBe(true);
    expect(distinctTexts.some((t) => t.includes('Option 2: DINS'))).toBe(true);
    expect(distinctTexts.some((t) => t.includes('Option 3: ETOS'))).toBe(true);
    expect(distinctTexts.some((t) => t.includes('Option 4: CTOU'))).toBe(true);

    // Ensure Option 1 and Option 2 were NOT concatenated into a single string
    const mergedOption = distinctTexts.find((t) => t.includes('Option 1') && t.includes('Option 2'));
    expect(mergedOption).toBeUndefined();
  });

  it('NEGATIVE: Adapter strictly DOES NOT classify images as diagrams vs options vs watermarks', async () => {
    const fixture = GoldenPdfCorpus.createGc06ImageOptions();
    const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

    expect(snapshot.rasterXObjects.length).toBeGreaterThan(0);

    for (const rx of snapshot.rasterXObjects) {
      // Must NOT have semantic roles attached
      expect((rx as any).semanticRole).toBeUndefined();
      expect((rx as any).isOptionDiagram).toBeUndefined();
      expect((rx as any).isQuestionStem).toBeUndefined();
      expect((rx as any).isWatermark).toBeUndefined();

      // Must be pure physical metadata
      expect(rx.xObjectId).toBeDefined();
      expect(rx.sourceByteHash).toBeDefined();
      expect(rx.geometry).toBeDefined();
      expect(rx.colorSpace).toBeDefined();
    }
  });

  it('NEGATIVE: Adapter strictly DOES NOT strip headers, footers, or candidate information', async () => {
    const fixture = GoldenPdfCorpus.createGc12MultiPage();
    const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

    // Multi-page examination booklet contains running headers/footers
    const allText = snapshot.glyphRuns.map((g) => g.decodedUnicode).join(' ');

    // Page 1 header and Page 5 footer must both be physically preserved without filtering
    expect(allText).toContain('Page 1 of 5: General Instructions');
    expect(allText).toContain('Page 5 of 5: End of Examination');
  });

  it('NEGATIVE: Adapter strictly DOES NOT guess ambiguous or unmapped Unicode glyphs', () => {
    // 1. Standard text maps to NATIVE_UNICODE
    expect(determineUnicodeStatus('UPSC Civil Services 2024')).toBe('NATIVE_UNICODE');

    // 2. Replacement character (\uFFFD) maps to UNICODE_UNCERTAIN without guessing
    expect(determineUnicodeStatus('Unknown symbol: \uFFFD')).toBe('UNICODE_UNCERTAIN');

    // 3. Private Use Area characters (\uE000 - \uF8FF) map to UNICODE_UNCERTAIN
    expect(determineUnicodeStatus('Font glyph: \uE055')).toBe('UNICODE_UNCERTAIN');

    // 4. Unmapped control codes map to UNICODE_UNCERTAIN
    expect(determineUnicodeStatus('Control byte: \u0007')).toBe('UNICODE_UNCERTAIN');
  });

  it('NEGATIVE: Adapter strictly DOES NOT rewrite mathematical formulas into LaTeX or ASCII', async () => {
    const fixture = GoldenPdfCorpus.createGc02GateMath();
    const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

    // No AST or MathML rewrite objects should exist in the forensic snapshot
    expect((snapshot as any).mathAST).toBeUndefined();
    expect((snapshot as any).mathml).toBeUndefined();
    expect((snapshot as any).latexEquations).toBeUndefined();

    // Raw text preserves whatever physical operator stream emitted
    const text = snapshot.glyphRuns.map((g) => g.decodedUnicode).join(' ');
    expect(text).toContain('int_{0}^{pi}');
    expect(text).toContain('Omega(n^2)');
  });
});
