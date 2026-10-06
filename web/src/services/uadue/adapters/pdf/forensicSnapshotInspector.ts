/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Engineering Diagnostic Tool: Forensic Snapshot Inspector (Phase 2A)
 *
 * Developer-only tool to inspect physical evidence on any given page:
 * "For page X, what physically exists?"
 *
 * Provides structured summaries of page geometry, glyphs, text spans,
 * images, vectors, transforms, clipping, drawing order, and source references.
 */

import { ForensicSnapshot } from '../../contracts/forensicSnapshot';

export interface PageForensicInspectionReport {
  snapshotId: string;
  sourceDocumentId: string;
  pageNumber: number;
  geometry: {
    dimensions: { width: number; height: number; unit: string };
    mediaBox: { x0: number; y0: number; x1: number; y1: number };
    cropBox: { x0: number; y0: number; x1: number; y1: number };
    rotationDeg: number;
  };
  physicalInventory: {
    glyphCount: number;
    textSpanCount: number;
    rasterImageCount: number;
    vectorPathCount: number;
    fontCount: number;
    clippingStateCount: number;
    annotationCount: number;
  };
  textStreams: {
    rawConcatenatedText: string;
    decodedUnicodeText: string;
    distinctFontsUsed: string[];
  };
  drawSequence: {
    drawingOrderIndex: number;
    objectType: string;
    summary: string;
    bbox?: { x0: number; y0: number; x1: number; y1: number };
  }[];
  sourceReferenceIds: string[];
}

export interface ForensicSnapshotSummaryReport {
  snapshotId: string;
  sourceDocumentId: string;
  sourceSha256: string;
  sourceFormat: string;
  totalPages: number;
  isSealed: boolean;
  sealedHash: string;
  sealedAt: number;
  totalGlyphs: number;
  totalImages: number;
  totalVectors: number;
  totalFonts: number;
  pages: {
    pageNumber: number;
    glyphCount: number;
    imageCount: number;
    vectorCount: number;
  }[];
}

export class ForensicSnapshotInspector {
  /**
   * Generates a deep diagnostic report for a specific physical page.
   */
  static inspectPage(snapshot: ForensicSnapshot, pageNumber: number): PageForensicInspectionReport {
    const pageGeom = snapshot.pageGeometries.find((p) => p.pageNumber === pageNumber) || {
      pageIndex: pageNumber - 1,
      pageNumber,
      dimensions: { width: 0, height: 0, unit: 'pt' as const },
      mediaBox: { x0: 0, y0: 0, x1: 0, y1: 0 },
      cropBox: { x0: 0, y0: 0, x1: 0, y1: 0 },
      rotationDeg: 0 as const,
    };

    const glyphs = snapshot.glyphRuns.filter((g) => g.pageNumber === pageNumber);
    const images = snapshot.rasterXObjects.filter((img) => img.pageNumber === pageNumber);
    const vectors = snapshot.vectorPaths.filter((v) => (v.geometry as any)?.pageNumber === pageNumber || true);
    const clips = snapshot.clippingStates.filter((c) => c.pageNumber === pageNumber);
    const annotations = snapshot.annotations.filter((a) => a.pageNumber === pageNumber);

    const distinctFonts = Array.from(new Set(glyphs.map((g) => g.fontId)));
    const decodedText = glyphs.map((g) => g.decodedUnicode).join('');

    // Compile chronological draw sequence
    const drawSequence: {
      drawingOrderIndex: number;
      objectType: string;
      summary: string;
      bbox?: { x0: number; y0: number; x1: number; y1: number };
    }[] = [];

    for (const g of glyphs) {
      drawSequence.push({
        drawingOrderIndex: g.operatorIndex,
        objectType: 'GLYPH_RUN',
        summary: `Text: "${g.decodedUnicode.slice(0, 30)}" (Font: ${g.fontId}, Size: ${g.fontSizePt}pt)`,
        bbox: g.geometry.bbox,
      });
    }

    for (const img of images) {
      drawSequence.push({
        drawingOrderIndex: img.drawingOrderIndex,
        objectType: 'RASTER_XOBJECT',
        summary: `Image: ${img.xObjectId} (${img.widthPx}x${img.heightPx} px, ${img.colorSpace})`,
        bbox: img.geometry.bbox,
      });
    }

    for (const v of vectors) {
      drawSequence.push({
        drawingOrderIndex: (v as any).drawingOrderIndex || 0,
        objectType: 'VECTOR_PATH',
        summary: `Path: ${v.operations.length} ops (Width: ${v.lineWidthPt}pt, Decorative: ${v.isDecorative})`,
        bbox: v.geometry.bbox,
      });
    }

    drawSequence.sort((a, b) => a.drawingOrderIndex - b.drawingOrderIndex);

    const sourceReferenceIds = [
      ...glyphs.map((g) => `ref_p${pageNumber}_glyph_${g.glyphRunId}`),
      ...images.map((img) => `ref_p${pageNumber}_img_${img.xObjectId}`),
      ...vectors.map((v) => `ref_p${pageNumber}_vec_${v.pathId}`),
    ];

    return {
      snapshotId: snapshot.snapshotId,
      sourceDocumentId: snapshot.sourceDocumentId,
      pageNumber,
      geometry: {
        dimensions: pageGeom.dimensions,
        mediaBox: pageGeom.mediaBox,
        cropBox: pageGeom.cropBox,
        rotationDeg: pageGeom.rotationDeg,
      },
      physicalInventory: {
        glyphCount: glyphs.length,
        textSpanCount: glyphs.length,
        rasterImageCount: images.length,
        vectorPathCount: vectors.length,
        fontCount: distinctFonts.length,
        clippingStateCount: clips.length,
        annotationCount: annotations.length,
      },
      textStreams: {
        rawConcatenatedText: decodedText,
        decodedUnicodeText: decodedText,
        distinctFontsUsed: distinctFonts,
      },
      drawSequence,
      sourceReferenceIds,
    };
  }

  /**
   * Generates a high-level summary of the entire sealed snapshot.
   */
  static inspectForensicSnapshot(snapshot: ForensicSnapshot): ForensicSnapshotSummaryReport {
    const pagesSummary = snapshot.pageGeometries.map((pg) => {
      const gCount = snapshot.glyphRuns.filter((g) => g.pageNumber === pg.pageNumber).length;
      const iCount = snapshot.rasterXObjects.filter((i) => i.pageNumber === pg.pageNumber).length;
      const vCount = snapshot.vectorPaths.filter((v) => (v.geometry as any)?.pageNumber === pg.pageNumber).length;
      return {
        pageNumber: pg.pageNumber,
        glyphCount: gCount,
        imageCount: iCount,
        vectorCount: vCount,
      };
    });

    return {
      snapshotId: snapshot.snapshotId,
      sourceDocumentId: snapshot.sourceDocumentId,
      sourceSha256: snapshot.sourceSha256,
      sourceFormat: snapshot.sourceFormat,
      totalPages: snapshot.pageGeometries.length,
      isSealed: snapshot.isSealed,
      sealedHash: snapshot.sealedHash,
      sealedAt: snapshot.sealedAt,
      totalGlyphs: snapshot.glyphRuns.length,
      totalImages: snapshot.rasterXObjects.length,
      totalVectors: snapshot.vectorPaths.length,
      totalFonts: snapshot.fonts.length,
      pages: pagesSummary,
    };
  }

  /**
   * Formats a page diagnostic report as human-readable engineering text.
   */
  static formatPageReportAsText(report: PageForensicInspectionReport): string {
    const lines: string[] = [
      `=== FORENSIC PAGE INSPECTION: Page ${report.pageNumber} ===`,
      `Document ID: ${report.sourceDocumentId}`,
      `Snapshot ID: ${report.snapshotId}`,
      `Dimensions: ${report.geometry.dimensions.width} x ${report.geometry.dimensions.height} ${report.geometry.dimensions.unit}`,
      `MediaBox: [${report.geometry.mediaBox.x0}, ${report.geometry.mediaBox.y0}, ${report.geometry.mediaBox.x1}, ${report.geometry.mediaBox.y1}]`,
      `CropBox:  [${report.geometry.cropBox.x0}, ${report.geometry.cropBox.y0}, ${report.geometry.cropBox.x1}, ${report.geometry.cropBox.y1}]`,
      `Rotation: ${report.geometry.rotationDeg} deg`,
      `Inventory: Glyphs: ${report.physicalInventory.glyphCount} | Images: ${report.physicalInventory.rasterImageCount} | Vectors: ${report.physicalInventory.vectorPathCount} | Fonts: ${report.physicalInventory.fontCount}`,
      `Distinct Fonts: ${report.textStreams.distinctFontsUsed.join(', ') || 'None'}`,
      `Text Sample (first 100 chars): "${report.textStreams.decodedUnicodeText.slice(0, 100).replace(/\n/g, ' ')}"`,
      `Drawing Order Execution Sequence (${report.drawSequence.length} operations):`,
    ];

    for (const op of report.drawSequence.slice(0, 20)) {
      lines.push(`  [Op #${op.drawingOrderIndex}] ${op.objectType.padEnd(16)} | ${op.summary}`);
    }
    if (report.drawSequence.length > 20) {
      lines.push(`  ... and ${report.drawSequence.length - 20} more drawing operations.`);
    }

    return lines.join('\n');
  }
}
