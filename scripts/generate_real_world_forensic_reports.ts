/**
 * UADUE Phase 2A — Real-World Examination Forensic Report Generator
 * Generates comprehensive machine-readable and human-readable forensic reports
 * for authentic public examination papers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PdfNativeSourceAdapter, computeSha256 } from '../web/src/services/uadue/adapters/PdfNativeSourceAdapter';
import { PdfSourceScanner } from '../web/src/services/uadue/adapters/pdf/pdfSourceScanner';
import { ForensicSnapshotInspector } from '../web/src/services/uadue/adapters/pdf/forensicSnapshotInspector';

const REAL_EXAMS = [
  {
    id: 'UPSC_CSE_PRELIMS_2023_GS1',
    authority: 'UPSC',
    title: 'UPSC Civil Services Prelims 2023 General Studies Paper 1',
    filename: 'UPSC_CSE_Prelims_2023_GS_Paper_1.pdf',
    provenance: 'https://www.upsc.gov.in/sites/default/files/QP_CS_Pre_Exam_2023_280523.pdf',
    samplePages: 3,
  },
  {
    id: 'SSC_CHSL_2023_TIER1_02AUG_S2',
    authority: 'SSC',
    title: 'SSC CHSL 2023 Tier 1 02 Aug Shift 2 Response Sheet',
    filename: 'SSC_CHSL_2023_Tier1_02Aug_Shift2.pdf',
    provenance: 'Official TCS iON Candidate Assessment Response Sheet',
    samplePages: 3,
  },
  {
    id: 'GATE_2024_CSIT_SET1',
    authority: 'GATE_IIT',
    title: 'GATE 2024 Computer Science and Information Technology Set 1',
    filename: 'GATE_2024_CS_1_Question_Paper.pdf',
    provenance: 'Official IISc Bengaluru Question Paper Portal',
    samplePages: 3,
  },
  {
    id: 'JEE_ADVANCED_2023_PAPER1',
    authority: 'NTA_JEE',
    title: 'JEE Advanced 2023 Paper 1',
    filename: 'JEE_Advanced_2023_Paper_1.pdf',
    provenance: 'https://jeeadv.ac.in/past_qps/2023_1_English.pdf',
    samplePages: 3,
  },
];

async function run() {
  const realExamsDir = path.resolve(__dirname, '../web/src/data/real_exams');
  const reports: any[] = [];

  const adapter = new PdfNativeSourceAdapter();

  for (const exam of REAL_EXAMS) {
    console.log(`Processing: ${exam.id} ...`);
    const filePath = path.join(realExamsDir, exam.filename);
    const rawBuffer = fs.readFileSync(filePath);
    const sourceBytes = new Uint8Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);

    const shaBefore = await computeSha256(sourceBytes);

    // 1. Binary Scan
    const scanResult = await PdfSourceScanner.scan(sourceBytes);

    // 2. Adapter Forensic Snapshot
    const snapshot = await adapter.extractForensicSnapshot(sourceBytes, { maxPages: exam.samplePages });

    const shaAfter = await computeSha256(sourceBytes);
    const isBufferImmutable = shaBefore === shaAfter;

    // 3. Inspect Snapshot
    const docInventory = ForensicSnapshotInspector.inspectForensicSnapshot(snapshot);
    const page1Inspect = ForensicSnapshotInspector.inspectPage(snapshot, 1);

    // Object types
    const objTypeCounts: Record<string, number> = {};
    for (const [, obj] of scanResult.objects) {
      const t = obj.type || (obj.hasStream ? 'Stream' : 'Dictionary/Other');
      objTypeCounts[t] = (objTypeCounts[t] || 0) + 1;
    }

    const hasObjStm = Array.from(scanResult.objects.values()).some((o) => o.type === 'ObjStm');

    reports.push({
      documentId: exam.id,
      authority: exam.authority,
      title: exam.title,
      provenance: exam.provenance,
      filename: exam.filename,
      fileSizeBytes: sourceBytes.length,
      sha256: shaBefore,
      isBufferImmutable,
      pdfVersion: scanResult.header.version,
      totalPagesInDocument: snapshot.pageGeometries.length,
      samplePagesEvaluated: exam.samplePages,
      sealedHash: snapshot.sealedHash,
      xrefAnalysis: {
        hasTraditionalXref: scanResult.hasTraditionalXref,
        hasXrefStream: scanResult.hasXrefStream,
        hasCompressedObjectStreams: hasObjStm,
        startXrefOffset: scanResult.startXrefOffset,
        objStmStatus: hasObjStm ? 'OBJECT_STREAM_UNRESOLVED' : 'NONE',
      },
      sourceObjectInventory: {
        totalTopLevelObjectsIndexed: scanResult.objects.size,
        objectTypeBreakdown: objTypeCounts,
      },
      forensicSnapshotInventory: {
        pageGeometriesCount: snapshot.pageGeometries.length,
        contentStreamsCount: snapshot.contentStreams.length,
        fontsCount: snapshot.fonts.length,
        rasterXObjectsCount: snapshot.rasterXObjects.length,
        vectorPathsCount: snapshot.vectorPaths.length,
        glyphRunsCount: snapshot.glyphRuns.length,
        annotationsCount: snapshot.annotations.length,
        clippingStatesCount: snapshot.clippingStates.length,
      },
      glyphEvidenceFidelity: {
        totalGlyphRuns: snapshot.glyphRuns.length,
        classification: 'DIRECT_PARSER_OBSERVATION',
        rawBytesHexStatus: 'UNDEFINED (Zero fabrication)',
        unicodeStatusCounts: snapshot.glyphRuns.reduce((acc: any, g) => {
          acc[g.unicodeStatus] = (acc[g.unicodeStatus] || 0) + 1;
          return acc;
        }, {}),
      },
      rasterXObjectFidelity: {
        totalSampleImages: snapshot.rasterXObjects.length,
        imagesSample: snapshot.rasterXObjects.slice(0, 3).map((img) => ({
          xObjectId: img.xObjectId,
          pdfObjectNumber: img.pdfObjectNumber,
          widthPx: img.widthPx,
          heightPx: img.heightPx,
          colorSpace: img.colorSpace,
          bitsPerComponent: img.bitsPerComponent,
          encodedStreamSha256: img.encodedStreamSha256,
          sourceByteHash: img.sourceByteHash,
        })),
      },
      fontFidelity: {
        totalFonts: snapshot.fonts.length,
        fontsSample: snapshot.fonts.slice(0, 5).map((f) => ({
          fontId: f.fontId,
          baseFont: f.baseFont,
          subtype: f.subtype,
          encoding: f.encoding,
          hasToUnicodeCMap: f.hasToUnicodeCMap,
          isEmbedded: f.isEmbedded,
        })),
      },
      page1PhysicalInspection: page1Inspect,
    });
  }

  const outPath = path.resolve(__dirname, '../docs/real_world_forensic_audit_report.json');
  fs.writeFileSync(outPath, JSON.stringify(reports, null, 2), 'utf8');
  console.log(`Successfully generated forensic report at: ${outPath}`);
}

run().catch((err) => {
  console.error('Error generating report:', err);
  process.exit(1);
});
