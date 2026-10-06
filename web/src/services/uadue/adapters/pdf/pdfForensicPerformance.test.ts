/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Test Suite: Forensic Adapter Performance & Throughput Benchmarks (Phase 2A)
 */

import { describe, it, expect } from 'vitest';
import { PdfNativeSourceAdapter } from '../PdfNativeSourceAdapter';
import { GoldenPdfCorpus } from './goldenPdfCorpus';

describe('PdfNativeSourceAdapter — Performance & Benchmarks (Phase 2A)', () => {
  const adapter = new PdfNativeSourceAdapter();

  it('measures extraction throughput across multi-page document', async () => {
    const fixture = GoldenPdfCorpus.createGc12MultiPage();
    const startTime = performance.now();

    const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);
    const durationMs = performance.now() - startTime;

    expect(snapshot.isSealed).toBe(true);
    expect(snapshot.pageGeometries.length).toBe(5);

    const pagesPerSecond = (5 / (durationMs / 1000));
    // Concurrency-safe limit under full parallel worker load
    expect(pagesPerSecond).toBeGreaterThan(1.5);
    expect(durationMs).toBeLessThan(5000); // Strict safety limit: < 5s for 5 pages
  });

  it('verifies compact forensic snapshot serialization footprint', async () => {
    const fixture = GoldenPdfCorpus.createGc01NativeText();
    const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

    const serializedJson = JSON.stringify(snapshot);
    const sizeBytes = new TextEncoder().encode(serializedJson).length;

    // Single page native document should serialize into a reasonable footprint (< 100 KB)
    expect(sizeBytes).toBeLessThan(100 * 1024);
    expect(sizeBytes).toBeGreaterThan(500); // Non-empty evidence payload
  });

  it('verifies linear memory/size scaling across 1-page vs 5-page documents', async () => {
    const singlePage = GoldenPdfCorpus.createGc01NativeText();
    const multiPage = GoldenPdfCorpus.createGc12MultiPage();

    const snap1 = await adapter.extractForensicSnapshot(singlePage.pdfBytes);
    const snap5 = await adapter.extractForensicSnapshot(multiPage.pdfBytes);

    const size1 = JSON.stringify(snap1).length;
    const size5 = JSON.stringify(snap5).length;

    // 5 pages should not blow up exponentially (< 10x single page size)
    expect(size5).toBeLessThan(size1 * 10);
  });
});
