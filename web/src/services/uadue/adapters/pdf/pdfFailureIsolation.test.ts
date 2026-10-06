/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Test Suite: PDF Failure Isolation & Error Containment (Phase 2A)
 */

import { describe, it, expect } from 'vitest';
import { PdfNativeSourceAdapter } from '../PdfNativeSourceAdapter';
import { GoldenPdfCorpus } from './goldenPdfCorpus';
import { SecurityBoundaryPolicy, STANDARD_SECURITY_POLICY } from '../../contracts/security';

describe('PdfNativeSourceAdapter — Failure Isolation & Robustness (Phase 2A)', () => {
  const adapter = new PdfNativeSourceAdapter();

  it('rejects corrupt or invalid PDF bytes cleanly with structured error', async () => {
    const corruptBytes = new TextEncoder().encode('%PDF-1.4\nCorrupted binary stream with invalid xref and objects');

    await expect(adapter.extractForensicSnapshot(corruptBytes)).rejects.toThrow();
  });

  it('rejects encrypted PDFs without attempting plaintext recovery', async () => {
    const encryptedPdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n<< /Encrypt <<>> >>\nendobj\nxref\n0 2\ntrailer\n<< /Encrypt 2 0 R >>\nstartxref\n80\n%%EOF');

    await expect(adapter.extractForensicSnapshot(encryptedPdf)).rejects.toThrow(/Encrypt/i);
  });

  it('rejects empty input buffer before PDF.js initialization', async () => {
    await expect(adapter.extractForensicSnapshot(new Uint8Array(0))).rejects.toThrow(/Input is empty/);
  });

  it('preserves adapter reusability: failure does not contaminate subsequent extractions', async () => {
    // 1. First attempt fails
    const badInput = new TextEncoder().encode('Completely invalid garbage data');
    await expect(adapter.extractForensicSnapshot(badInput)).rejects.toThrow();

    // 2. Second attempt with valid PDF must succeed completely
    const validFixture = GoldenPdfCorpus.createGc01NativeText();
    const snapshot = await adapter.extractForensicSnapshot(validFixture.pdfBytes);

    expect(snapshot.isSealed).toBe(true);
    expect(snapshot.pageGeometries.length).toBe(1);
    expect(snapshot.glyphRuns.length).toBeGreaterThan(0);
  });

  it('respects custom security boundary policies', async () => {
    const strictPolicy: SecurityBoundaryPolicy = {
      ...STANDARD_SECURITY_POLICY,
      maxFileSizeBytes: 100, // Very tight limit
    };

    const fixture = GoldenPdfCorpus.createGc01NativeText();
    const validation = await adapter.validateInput(fixture.pdfBytes, strictPolicy);

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('security boundary');
  });
});
