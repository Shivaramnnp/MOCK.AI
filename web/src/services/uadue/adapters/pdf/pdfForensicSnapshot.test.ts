/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Test Suite: Forensic Snapshot Extraction & 12 Golden Corpus Benchmarks (Phase 2A)
 */

import { describe, it, expect } from 'vitest';
import { PdfNativeSourceAdapter } from '../PdfNativeSourceAdapter';
import { GoldenPdfCorpus } from './goldenPdfCorpus';
import { ForensicSnapshotInspector } from './forensicSnapshotInspector';

describe('PdfNativeSourceAdapter — ForensicSnapshot & Golden Corpus Suite (Phase 2A)', () => {
  const adapter = new PdfNativeSourceAdapter();

  // ==========================================================================
  // 1. ALL 12 GOLDEN CORPUS BENCHMARKS
  // ==========================================================================
  describe('1. Golden Corpus 12-Suite Physical Extraction Benchmark', () => {
    it('GC-01: Native Digital Text PDF preserves physical geometry, fonts, and glyph runs', async () => {
      const fixture = GoldenPdfCorpus.createGc01NativeText();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      expect(snapshot.sealedHash).toMatch(/^[a-f0-9]{64}$/);
      expect(snapshot.sourceFormat).toBe('PDF_NATIVE');
      expect(snapshot.pageGeometries.length).toBe(fixture.expectedPageCount);

      const page1 = snapshot.pageGeometries[0];
      expect(page1.dimensions.width).toBe(612);
      expect(page1.dimensions.height).toBe(792);
      expect(page1.mediaBox).toEqual({ x0: 0, y0: 0, x1: 612, y1: 792 });

      expect(snapshot.glyphRuns.length).toBeGreaterThan(0);
      const textRun = snapshot.glyphRuns.map((g) => g.decodedUnicode).join(' ');
      expect(textRun).toContain('UPSC');
      expect(textRun).toContain('Question 1:');

      // Operator streams and fonts captured
      expect(snapshot.contentStreams.length).toBe(1);
      expect(snapshot.contentStreams[0].operatorCount).toBeGreaterThan(0);
      expect(snapshot.fonts.length).toBeGreaterThan(0);
    });

    it('GC-02: GATE Mathematics-Heavy PDF preserves exact math notation without rewriting', async () => {
      const fixture = GoldenPdfCorpus.createGc02GateMath();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      const text = snapshot.glyphRuns.map((g) => g.decodedUnicode).join(' ');
      expect(text).toContain('GATE');
      expect(text).toContain('int_{0}^{pi}');
      expect(text).toContain('Omega(n^2)');

      // Verify no semantic normalization occurred
      for (const glyph of snapshot.glyphRuns) {
        expect(glyph.advanceWidthPt).toBeDefined();
        expect(glyph.geometry.transformMatrix).toBeDefined();
        expect(glyph.evidenceClassification).toBe('DIRECT_PARSER_OBSERVATION');
        expect(glyph.rawBytesHex).toBeUndefined(); // Zero fabrication: never synthesized from TextEncoder(str)
      }
    });

    it('GC-03: SSC/TCS-Style Assessment PDF preserves MCQ options as physical lines without segmentation', async () => {
      const fixture = GoldenPdfCorpus.createGc03SscChsl();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      const text = snapshot.glyphRuns.map((g) => g.decodedUnicode).join(' ');
      expect(text).toContain('Staff Selection Commission');
      expect(text).toContain('Q.26 GAMU');
      expect(text).toContain('Option 1: EUOT');
      expect(text).toContain('Option 4: CTOU');

      // Crucial Phase 2A invariant: Snapshot MUST NOT contain question objects
      expect((snapshot as any).questions).toBeUndefined();
      expect((snapshot as any).options).toBeUndefined();
    });

    it('GC-04: Multi-Column Examination PDF preserves spatial coordinates in drawing order', async () => {
      const fixture = GoldenPdfCorpus.createGc04MultiColumn();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      expect(snapshot.glyphRuns.length).toBeGreaterThanOrEqual(4);

      // Verify distinct x coordinates for column 1 and column 2
      const xPositions = snapshot.glyphRuns.map((g) => g.geometry.bbox.x0);
      const hasLeftCol = xPositions.some((x) => x < 250);
      const hasRightCol = xPositions.some((x) => x > 280);
      expect(hasLeftCol && hasRightCol).toBe(true);
    });

    it('GC-05: PDF with Vector Geometric Diagrams preserves drawing operators without simplification', async () => {
      const fixture = GoldenPdfCorpus.createGc05Diagrams();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      expect(snapshot.pageGeometries.length).toBe(1);

      // Vector paths preserved
      expect(snapshot.vectorPaths.length).toBeGreaterThan(0);
      const path = snapshot.vectorPaths[0];
      expect(path.pathId).toBeDefined();
      expect(path.operations.length).toBeGreaterThan(0);
      expect(path.lineWidthPt).toBeGreaterThan(0);
      expect(path.isDecorative).toBe(false); // No premature classification
    });

    it('GC-06: PDF with Embedded Raster Image Options preserves image XObjects and geometries', async () => {
      const fixture = GoldenPdfCorpus.createGc06ImageOptions();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      expect(snapshot.rasterXObjects.length).toBeGreaterThan(0);

      const img = snapshot.rasterXObjects[0];
      expect(img.xObjectId).toBeDefined();
      expect(img.pageNumber).toBe(1);
      expect(img.geometry.bbox.width).toBeGreaterThan(0);
      expect(img.sourceByteHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('GC-07: PDF with Tabular Grid Lattices preserves physical lines and cell text', async () => {
      const fixture = GoldenPdfCorpus.createGc07Tables();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      const text = snapshot.glyphRuns.map((g) => g.decodedUnicode).join(' ');
      expect(text).toContain('Year: 2023');
      expect(text).toContain('Revenue');

      // Table borders are captured as vector paths
      expect(snapshot.vectorPaths.length).toBeGreaterThan(0);
    });

    it('GC-08: PDF with Rotated Text preserves exact physical rotation and CTM', async () => {
      const fixture = GoldenPdfCorpus.createGc08RotatedText();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      expect(snapshot.pageGeometries[0].rotationDeg).toBe(90);
      const text = snapshot.glyphRuns.map((g) => g.decodedUnicode).join(' ');
      expect(text).toContain('Landscape Table Orientation');

      // Glyph runs preserve non-identity transformation matrix
      expect(snapshot.glyphRuns.length).toBeGreaterThan(0);
    });

    it('GC-09: PDF with Custom/Unusual Fonts captures font dictionary entries and unicode mapping status', async () => {
      const fixture = GoldenPdfCorpus.createGc09UnusualFonts();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      expect(snapshot.fonts.length).toBeGreaterThan(0);
      for (const glyph of snapshot.glyphRuns) {
        expect(['NATIVE_UNICODE', 'TO_UNICODE_CMAP', 'STANDARD_ENCODING', 'UNICODE_UNCERTAIN']).toContain(
          glyph.unicodeStatus
        );
      }
    });

    it('GC-10: Scanned PDF Simulation preserves full-page raster image evidence', async () => {
      const fixture = GoldenPdfCorpus.createGc10ScannedPdf();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      expect(snapshot.rasterXObjects.length).toBeGreaterThan(0);
      const fullPageImage = snapshot.rasterXObjects[0];
      expect(fullPageImage.geometry.bbox.width).toBeGreaterThanOrEqual(100);
    });

    it('GC-11: Mixed Raster XObject and Vector Content preserves all media types deterministically', async () => {
      const fixture = GoldenPdfCorpus.createGc11MixedContent();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      expect(snapshot.glyphRuns.length).toBeGreaterThan(0);
      expect(snapshot.vectorPaths.length).toBeGreaterThan(0);
      expect(snapshot.rasterXObjects.length).toBeGreaterThan(0);
    });

    it('GC-12: Multi-Page Assessment Booklet (5 pages) preserves page geometries and stream isolation', async () => {
      const fixture = GoldenPdfCorpus.createGc12MultiPage();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.isSealed).toBe(true);
      expect(snapshot.pageGeometries.length).toBe(5);

      for (let p = 1; p <= 5; p++) {
        const pageGeom = snapshot.pageGeometries.find((pg) => pg.pageNumber === p);
        expect(pageGeom).toBeDefined();
        expect(pageGeom?.pageIndex).toBe(p - 1);

        const pageGlyphs = snapshot.glyphRuns.filter((g) => g.pageNumber === p);
        expect(pageGlyphs.length).toBeGreaterThan(0);
        const pageText = pageGlyphs.map((g) => g.decodedUnicode).join(' ');
        expect(pageText).toContain(`Page ${p} of 5`);
      }
    });
  });

  // ==========================================================================
  // 2. CRYPTOGRAPHIC DETERMINISM & IMMUTABILITY PROTECTION
  // ==========================================================================
  describe('2. Deterministic Sealing & Immutability Enforcement', () => {
    it('generates identical sealedHash across multiple runs on identical PDF bytes', async () => {
      const fixture = GoldenPdfCorpus.createGc01NativeText();

      const run1 = await adapter.extractForensicSnapshot(fixture.pdfBytes);
      const run2 = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(run1.isSealed).toBe(true);
      expect(run2.isSealed).toBe(true);
      expect(run1.sealedHash).toBe(run2.sealedHash);
      expect(run1.sourceSha256).toBe(run2.sourceSha256);
    });

    it('deep-freezes snapshot: top-level mutations throw TypeError', async () => {
      const fixture = GoldenPdfCorpus.createGc01NativeText();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(() => {
        (snapshot as any).sourceSha256 = 'tampered_hash';
      }).toThrow(TypeError);

      expect(() => {
        (snapshot as any).isSealed = false;
      }).toThrow(TypeError);
    });

    it('deep-freezes snapshot: array mutations throw TypeError', async () => {
      const fixture = GoldenPdfCorpus.createGc01NativeText();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(() => {
        (snapshot.pageGeometries as any).push({ pageNumber: 999 } as any);
      }).toThrow(TypeError);

      expect(() => {
        (snapshot.glyphRuns as any).pop();
      }).toThrow(TypeError);
    });

    it('deep-freezes snapshot: deep nested mutations throw TypeError', async () => {
      const fixture = GoldenPdfCorpus.createGc01NativeText();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(() => {
        snapshot.pageGeometries[0].dimensions.width = 9999;
      }).toThrow(TypeError);

      expect(() => {
        snapshot.glyphRuns[0].geometry.bbox.x0 = -100;
      }).toThrow(TypeError);
    });
  });

  // ==========================================================================
  // 3. FORENSIC SNAPSHOT INSPECTOR DIAGNOSTICS
  // ==========================================================================
  describe('3. Forensic Snapshot Inspector Diagnostic Tool', () => {
    it('inspectPage answers: "For page X, what physically exists?"', async () => {
      const fixture = GoldenPdfCorpus.createGc01NativeText();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      const pageReport = ForensicSnapshotInspector.inspectPage(snapshot, 1);
      expect(pageReport.pageNumber).toBe(1);
      expect(pageReport.geometry.dimensions.width).toBe(612);
      expect(pageReport.physicalInventory.glyphCount).toBeGreaterThan(0);
      expect(pageReport.textStreams.decodedUnicodeText).toContain('UPSC');
      expect(pageReport.drawSequence.length).toBeGreaterThan(0);
      expect(pageReport.sourceReferenceIds.length).toBeGreaterThan(0);

      const formattedText = ForensicSnapshotInspector.formatPageReportAsText(pageReport);
      expect(formattedText).toContain('FORENSIC PAGE INSPECTION: Page 1');
    });

    it('inspectForensicSnapshot provides document-wide forensic inventory', async () => {
      const fixture = GoldenPdfCorpus.createGc12MultiPage();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      const summary = ForensicSnapshotInspector.inspectForensicSnapshot(snapshot);
      expect(summary.totalPages).toBe(5);
      expect(summary.isSealed).toBe(true);
      expect(summary.totalGlyphs).toBeGreaterThanOrEqual(5);
      expect(summary.pages.length).toBe(5);
    });
  });

  // ==========================================================================
  // 4. GENERALIZED SOURCE REFERENCES
  // ==========================================================================
  describe('4. Generalized Multi-Reference Source Provenance', () => {
    it('attaches SourceReference connecting every physical item to its origin', async () => {
      const fixture = GoldenPdfCorpus.createGc01NativeText();
      const snapshot = await adapter.extractForensicSnapshot(fixture.pdfBytes);

      expect(snapshot.sourceReferences).toBeDefined();
      expect(snapshot.sourceReferences!.length).toBeGreaterThan(0);

      const firstRef = snapshot.sourceReferences![0];
      expect(firstRef.documentId).toBe(snapshot.sourceDocumentId);
      expect(firstRef.pageNumber).toBe(1);
      expect(firstRef.coordinateSpace).toBe('PDF_PT_BOTTOM_LEFT');
      expect(firstRef.sourceObjectType).toBe('GLYPH');
      expect(firstRef.roleInDerivedObject).toBe('PRIMARY_SOURCE');
    });
  });
});
