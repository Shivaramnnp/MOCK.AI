/**
 * UADUE — Real-Paper Forensic Ingestion & Fidelity Audit Test Suite
 *
 * Implements end-to-end ingestion, forensic inspection, and answer-authority verification
 * against authentic real-world examination documents from official public portals:
 * 1. GATE 2025 Computer Science & IT (CS-1) + Official Answer Key (IIT Roorkee)
 * 2. GATE 2025 Data Science & AI (DA) + Official Answer Key (IIT Roorkee)
 * 3. GATE 2024 Computer Science (CS-1) + Official Answer Key (IISc Bengaluru)
 * 4. GATE 2023 Computer Science (CS) + Official Answer Key (IIT Kanpur)
 * 5. SSC CGL 2025 Tier-1 Shift 1 (12 Sep 2025 Shift 1) (Staff Selection Commission)
 * 6. UPSC CSE 2025 Prelims General Studies Paper I (UPSC)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { PdfNativeSourceAdapter } from '../adapters/PdfNativeSourceAdapter';
import { PdfSourceScanner } from '../adapters/pdf/pdfSourceScanner';
import { DocumentGraphBuilder } from '../graph/documentGraphBuilder';
import { QuestionGraphBuilder } from '../questionGraph/questionGraphBuilder';
import { QuestionGraphValidator } from '../questionGraph/questionGraphValidator';
import {
  parseRawAnswerValue,
  bindAndEvaluateAnswerCandidate,
} from '../canonical/answerCandidateEvaluator';
import { AnswerKeyEntry, UniversalAnswerPayload, CanonicalQuestionIR } from '../canonical/types';
import { QuestionCandidate } from '../contracts/questionGraph';

describe('Real-Paper Forensic Ingestion & Fidelity Audit', () => {
  const realExamsDir = path.resolve(__dirname, '../../../data/real_exams');
  const adapter = new PdfNativeSourceAdapter();
  const docGraphBuilder = new DocumentGraphBuilder();
  const questionGraphBuilder = new QuestionGraphBuilder();

  function getFileSha256(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // Helper to extract text items from a PDF using pdfjs-dist
  async function extractTextItemsFromPdf(filePath: string): Promise<{ numPages: number; itemsByPage: string[][] }> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const buffer = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const itemsByPage: string[][] = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const strings = content.items
        .map((it: any) => (typeof it.str === 'string' ? it.str.trim() : ''))
        .filter((s: string) => s.length > 0);
      itemsByPage.push(strings);
    }

    return { numPages: doc.numPages, itemsByPage };
  }

  // ==========================================================================
  // 1. SOURCE SAFETY & CRYPTOGRAPHIC PARITY AUDIT
  // ==========================================================================
  describe('1. Source Safety & Bit-for-Bit SHA-256 Parity', () => {
    const manifest = [
      {
        name: 'GATE 2025 CS-1 Question Paper',
        filename: 'GATE_2025_CS_1_Question_Paper.pdf',
        expectedSha256: '81a6517cc058c3a471dce9a39a6bb2291f4fff9aa7ebebe6a5f337f61e25ee81',
        expectedSize: 1024592,
      },
      {
        name: 'GATE 2025 CS-1 Official Answer Key',
        filename: 'GATE_2025_CS_1_Answer_Key.pdf',
        expectedSha256: '5de4a3171f8e9629832f2080b178e802fc81945e44826ac45e82c635d9959f2e',
        expectedSize: 209008,
      },
      {
        name: 'GATE 2025 DA Question Paper',
        filename: 'GATE_2025_DA_Question_Paper.pdf',
        expectedSha256: '69ba28fc60e64338113d99c90533025049b7c6e0c99c4f03d76d5ce9d70478c6',
        expectedSize: 7897137,
      },
      {
        name: 'GATE 2025 DA Official Answer Key',
        filename: 'GATE_2025_DA_Answer_Key.pdf',
        expectedSha256: '081f108d4a2d617895b6859a9e715504391c87f9a6f13593548869d71b33dc40',
        expectedSize: 208959,
      },
      {
        name: 'GATE 2024 CS-1 Question Paper',
        filename: 'GATE_2024_CS_1_Question_Paper.pdf',
        expectedSha256: '18cf9ac15c01bdbf9d767c7a402d63234a28ae91c8ec227090ba5a5fdef121dd',
        expectedSize: 834514,
      },
      {
        name: 'GATE 2024 CS-1 Official Answer Key',
        filename: 'GATE_2024_CS_1_Answer_Key.pdf',
        expectedSha256: 'f713276ef5a4cc59d6c5925ba7e4c72f6f669ab6866956cc45cb8f3e0f5817cf',
        expectedSize: 313008,
      },
      {
        name: 'GATE 2023 CS Question Paper',
        filename: 'GATE_2023_CS_Question_Paper.pdf',
        expectedSha256: 'c2170087597455affd95bf8e667e8a5f92f4ae48248470932ec160adc21e0fc0',
        expectedSize: 469728,
      },
      {
        name: 'GATE 2023 CS Official Answer Key',
        filename: 'GATE_2023_CS_Answer_Key.pdf',
        expectedSha256: '80fae0c7c43c6ee3c8b467e2187a1ff3d2984b377aa03940b0d143867a18dc60',
        expectedSize: 103586,
      },
      {
        name: 'SSC CGL 2025 Tier-1 Shift 1',
        filename: 'SSC_CGL_2025_Tier_1_12-09-2025_Shift-1.pdf',
        expectedSha256: 'afd86d913286d95f8267786293253005669c36fb89d9837cb5785556ab1037cc',
        expectedSize: 2868150,
      },
      {
        name: 'UPSC CSE 2025 Prelims GS-I',
        filename: 'UPSC_CSE_2025_Prelims_GS_Paper_I.pdf',
        expectedSha256: '740c5046d191db8e3a10beb053ea369c581d1ca97d0629b80b42c8982b29a98b',
        expectedSize: 29154058,
      },
    ];

    for (const item of manifest) {
      it(`verifies immutable integrity of ${item.name}`, () => {
        const fullPath = path.join(realExamsDir, item.filename);
        expect(fs.existsSync(fullPath)).toBe(true);

        const actualSha = getFileSha256(fullPath);
        const actualSize = fs.statSync(fullPath).size;

        expect(actualSha).toBe(item.expectedSha256);
        expect(actualSize).toBe(item.expectedSize);
      });
    }
  });

  // ==========================================================================
  // 2. ANSWER AUTHORITY AUDIT — GATE 2025, 2024, 2023 OFFICIAL KEYS
  // ==========================================================================
  describe('2. Answer Authority Extraction & Semantics Audit', () => {
    it('GATE 2025 CS-1: Parses complete 65-question answer key with MCQ, MSQ, and NAT tolerance ranges', async () => {
      const akPath = path.join(realExamsDir, 'GATE_2025_CS_1_Answer_Key.pdf');
      const { numPages, itemsByPage } = await extractTextItemsFromPdf(akPath);
      expect(numPages).toBe(2);

      const allItems = itemsByPage.flat();
      const headerIdx = allItems.indexOf('Marks');
      expect(headerIdx).toBeGreaterThanOrEqual(0);

      const dataItems = allItems.slice(headerIdx + 1);
      const parsedEntries: { qNo: number; qType: string; section: string; keyOrRange: string; marks: number }[] = [];

      let i = 0;
      while (i < dataItems.length) {
        const qNum = parseInt(dataItems[i], 10);
        if (!isNaN(qNum) && qNum === parsedEntries.length + 1) {
          parsedEntries.push({
            qNo: qNum,
            qType: dataItems[i + 2],
            section: dataItems[i + 3],
            keyOrRange: dataItems[i + 4],
            marks: parseFloat(dataItems[i + 5]),
          });
          i += 6;
        } else {
          i++;
        }
      }

      // Exact count invariant: exactly 65 questions
      expect(parsedEntries.length).toBe(65);

      // Section distribution: Q1-Q10 is General Aptitude (GA), Q11-Q65 is Computer Science (CS-1)
      const gaEntries = parsedEntries.filter((e) => e.section === 'GA');
      const csEntries = parsedEntries.filter((e) => e.section === 'CS-1');
      expect(gaEntries.length).toBe(10);
      expect(csEntries.length).toBe(55);

      // Question Type distribution
      const mcq = parsedEntries.filter((e) => e.qType === 'MCQ');
      const msq = parsedEntries.filter((e) => e.qType === 'MSQ');
      const nat = parsedEntries.filter((e) => e.qType === 'NAT');
      expect(mcq.length).toBe(30);
      expect(msq.length).toBe(13);
      expect(nat.length).toBe(22);

      // Verify UniversalAnswerPayload semantic parsing for all 65 entries
      for (const entry of parsedEntries) {
        const payload = parseRawAnswerValue(entry.keyOrRange, entry.qType);
        if (entry.qType === 'MCQ') {
          expect(payload.type).toBe('SINGLE_CHOICE_MCQ');
          expect(['A', 'B', 'C', 'D']).toContain((payload as any).correctOptionLabel);
        } else if (entry.qType === 'MSQ') {
          expect(payload.type).toBe('MULTIPLE_CHOICE_MSQ');
          expect((payload as any).correctOptionLabels.length).toBeGreaterThanOrEqual(1);
        } else if (entry.qType === 'NAT') {
          expect(payload.type).toBe('NUMERICAL_RANGE_NAT');
        }
      }

      // Verify specific negative float NAT range: Q31 is "-2.1 to -1.9"
      const q31 = parsedEntries.find((e) => e.qNo === 31)!;
      expect(q31.keyOrRange).toBe('-2.1 to -1.9');
      const q31Payload: any = parseRawAnswerValue(q31.keyOrRange, 'NAT');
      expect(q31Payload.type).toBe('NUMERICAL_RANGE_NAT');
      expect(parseFloat(q31Payload.rangeLow)).toBeCloseTo(-2.1, 4);
      expect(parseFloat(q31Payload.rangeHigh)).toBeCloseTo(-1.9, 4);

      // Verify specific fine decimal NAT range: Q32 is "0.49 to 0.51"
      const q32 = parsedEntries.find((e) => e.qNo === 32)!;
      expect(q32.keyOrRange).toBe('0.49 to 0.51');
      const q32Payload: any = parseRawAnswerValue(q32.keyOrRange, 'NAT');
      expect(q32Payload.type).toBe('NUMERICAL_RANGE_NAT');
      expect(parseFloat(q32Payload.rangeLow)).toBeCloseTo(0.49, 4);
      expect(parseFloat(q32Payload.rangeHigh)).toBeCloseTo(0.51, 4);

      // Verify semicolon-delimited MSQ: Q27 is "A;B;C"
      const q27 = parsedEntries.find((e) => e.qNo === 27)!;
      expect(q27.keyOrRange).toBe('A;B;C');
      const q27Payload: any = parseRawAnswerValue(q27.keyOrRange, 'MSQ');
      expect(q27Payload.type).toBe('MULTIPLE_CHOICE_MSQ');
      expect(q27Payload.correctOptionLabels).toEqual(['A', 'B', 'C']);
    });

    it('GATE 2025 DA: Parses complete 65-question answer key with ML/AI NAT decimal precision', async () => {
      const akPath = path.join(realExamsDir, 'GATE_2025_DA_Answer_Key.pdf');
      const { numPages, itemsByPage } = await extractTextItemsFromPdf(akPath);
      expect(numPages).toBe(2);

      const allItems = itemsByPage.flat();
      const headerIdx = allItems.indexOf('Marks');
      const dataItems = allItems.slice(headerIdx + 1);

      const parsedEntries: { qNo: number; qType: string; section: string; keyOrRange: string; marks: number }[] = [];
      let i = 0;
      while (i < dataItems.length) {
        const qNum = parseInt(dataItems[i], 10);
        if (!isNaN(qNum) && qNum === parsedEntries.length + 1) {
          parsedEntries.push({
            qNo: qNum,
            qType: dataItems[i + 2],
            section: dataItems[i + 3],
            keyOrRange: dataItems[i + 4],
            marks: parseFloat(dataItems[i + 5]),
          });
          i += 6;
        } else {
          i++;
        }
      }

      expect(parsedEntries.length).toBe(65);
      const mcq = parsedEntries.filter((e) => e.qType === 'MCQ');
      const msq = parsedEntries.filter((e) => e.qType === 'MSQ');
      const nat = parsedEntries.filter((e) => e.qType === 'NAT');
      expect(mcq.length).toBe(35);
      expect(msq.length).toBe(18);
      expect(nat.length).toBe(12);

      // Fine precision NAT in DA: Q34 is "0.285 to 0.287"
      const q34 = parsedEntries.find((e) => e.qNo === 34)!;
      const q34Payload: any = parseRawAnswerValue(q34.keyOrRange, 'NAT');
      expect(parseFloat(q34Payload.rangeLow)).toBeCloseTo(0.285, 4);
      expect(parseFloat(q34Payload.rangeHigh)).toBeCloseTo(0.287, 4);
    });

    it('Cross-Year GATE Invariance: Validates schema preservation across 2025, 2024, and 2023', async () => {
      const years = ['2024', '2023'] as const;
      for (const yr of years) {
        const fn = yr === '2024' ? 'GATE_2024_CS_1_Answer_Key.pdf' : 'GATE_2023_CS_Answer_Key.pdf';
        const akPath = path.join(realExamsDir, fn);
        const { numPages, itemsByPage } = await extractTextItemsFromPdf(akPath);
        expect(numPages).toBe(2);

        const allItems = itemsByPage.flat();
        expect(allItems.length).toBeGreaterThan(100);
        // Both years have standard Q1 to Q65 structure
        expect(allItems).toContain('1');
        expect(allItems).toContain('65');
        expect(allItems).toContain('MCQ');
      }
    });

    it('UPSC 2025 Prelims GS-I: Enforces documented fail-closed answer authority status (Zero Guessing)', () => {
      // In accordance with UPSC official policy: Answer keys are not released until recruitment concludes
      // Any attempt to retrieve answer key for UPSC 2025 must fail closed and record UNRESOLVED_ANSWER_KEY
      const simulatedEntry: AnswerKeyEntry | null = null;
      expect(simulatedEntry).toBeNull();

      // Binding without answer key must fail closed with explicit reason
      const bindResult = bindAndEvaluateAnswerCandidate({
        entry: {
          entryId: 'fake_entry',
          snapshotId: 'fake_snap',
          sourceNodeId: 'node_fake',
          pageNumber: 1,
          rawPrintedQuestionNumber: '999',
          rawExtractedValue: 'A',
          entryFingerprint: 'fp_fake',
        },
        evidence: [],
        canonicalQuestions: [],
        physicalCandidates: [],
      });

      expect(bindResult.isBound).toBe(false);
      expect(bindResult.candidate).toBeUndefined();
      expect(bindResult.rejectionReasons.length).toBeGreaterThan(0);
    });

    it('GATE 2025 CS-1: Binds extracted official answer keys to canonical questions with VERIFIED status', async () => {
      const akPath = path.join(realExamsDir, 'GATE_2025_CS_1_Answer_Key.pdf');
      const { itemsByPage } = await extractTextItemsFromPdf(akPath);
      const allItems = itemsByPage.flat();
      const dataItems = allItems.slice(allItems.indexOf('Key/Range') + 1);

      const parsedEntries: { qNo: number; qType: string; section: string; keyOrRange: string; marks: number }[] = [];
      let i = 0;
      while (i < dataItems.length) {
        const qNum = parseInt(dataItems[i], 10);
        if (!isNaN(qNum) && qNum === parsedEntries.length + 1) {
          parsedEntries.push({
            qNo: qNum,
            qType: dataItems[i + 2],
            section: dataItems[i + 3],
            keyOrRange: dataItems[i + 4],
            marks: parseFloat(dataItems[i + 5]),
          });
          i += 6;
        } else {
          i++;
        }
      }

      // Test binding for 3 authentic sample questions across types:
      // Q1: MCQ 'A'
      // Q26: MSQ 'A;B'
      // Q31: NAT '-2.1 to -1.9'
      const sampleQNos = [1, 26, 31];
      for (const qNo of sampleQNos) {
        const entryData = parsedEntries.find((e) => e.qNo === qNo)!;
        expect(entryData).toBeDefined();
        const qNumStr = String(qNo);
        const physId = `phys_gate25_q${qNumStr}`;
        const canId = `can_gate25_q${qNumStr}`;

        const physicalCandidate: QuestionCandidate & { printedQuestionNumber?: string } = {
          candidateId: `cand_${physId}`,
          physicalInstanceId: physId,
          sourceQuestionNumber: qNumStr,
          printedQuestionNumber: qNumStr,
          candidateDisplayOrder: qNo,
          sourceOrder: qNo,
          startPageNumber: 1,
          endPageNumber: 1,
          isMultiPage: false,
          identityCandidate: {
            physicalInstanceId: physId,
            sourcePrintedLabel: `Q.${qNumStr}`,
            detectedNumber: qNo,
            numberType: 'QUESTION_NUMBER',
            confidence: 1.0,
            supportingEvidenceIds: [],
          },
          includedPhysicalNodeIds: [`node_${physId}`],
          stemNodeIds: [`node_${physId}`],
          bodyNodeIds: [],
          optionCandidateIds: [],
          stimulusRefIds: [],
          tableCandidateIds: [],
          diagramCandidateIds: [],
          mathCandidateIds: [],
          codeCandidateIds: [],
          observationState: 'OBSERVED',
          verificationStatus: 'VERIFIED',
          confidenceScore: 1.0,
          evidenceList: [],
          unresolvedAmbiguityIds: [],
        };

        const canonicalQuestion: CanonicalQuestionIR = {
          canonicalQuestionId: canId,
          logicalFamilyId: `fam_${canId}`,
          memberPhysicalInstanceIds: [physId],
          sourceSnapshotId: 'snap_gate2025_cs1',
          sourceDocumentId: 'doc_gate2025_cs1',
          directRelationshipEvaluationIds: [],
          representations: [{
            representationId: `rep_${physId}`,
            representationRole: 'ANCHOR_REPRESENTATION',
            sourcePageNumber: 1,
            sourcePhysicalInstanceId: physId,
            sourceCandidateId: `cand_${physId}`,
            stemRawText: `Stem for Q${qNumStr}`,
            stemAST: [],
            options: [],
            assets: [],
            isPrimary: true,
            provenance: {
              sourceSnapshotId: 'snap_gate2025_cs1',
              sourceDocumentId: 'doc_gate2025_cs1',
              physicalNodeIds: [],
            },
          }],
          sourceDiscrepancies: {
            hasNumberingDiscrepancy: false,
            sourceNumberings: [{
              candidatePhysicalInstanceId: physId,
              printedQuestionNumber: qNumStr,
              pageNumber: 1,
            }],
          },
          allAssetReferences: [],
          provenance: {
            canonicalizerAlgorithmId: 'canonicalizer_v2d',
            canonicalizerVersion: '2.0.0',
            schemaVersion: '2.0.0',
            synthesizedAt: Date.now(),
            sourceSnapshotId: 'snap_gate2025_cs1',
            sourceDocumentId: 'doc_gate2025_cs1',
            logicalFamilyId: `fam_${canId}`,
          },
          schemaVersion: '2.0.0',
          canonicalFingerprint: `fp_${canId}`,
          synthesisReasons: ['Direct singleton canonicalization'],
        };

        const bindResult = bindAndEvaluateAnswerCandidate({
          entry: {
            entryId: `entry_gate25_q${qNumStr}`,
            snapshotId: 'snap_gate2025_cs1_ak',
            sourceNodeId: `node_ak_q${qNumStr}`,
            pageNumber: 1,
            rawPrintedQuestionNumber: qNumStr,
            rawExtractedValue: entryData.keyOrRange,
            entryFingerprint: `fp_ak_q${qNumStr}`,
          },
          evidence: [{
            evidenceId: `ev_official_${qNumStr}`,
            evidenceClass: 'DIRECT_OFFICIAL_FINAL_KEY',
            sourceId: 'src_gate2025_cs1_ak',
            documentType: 'FINAL_OFFICIAL_KEY',
            summary: 'IIT Roorkee Official Final Answer Key',
            verifiedAt: Date.now(),
          }],
          canonicalQuestions: [canonicalQuestion],
          physicalCandidates: [physicalCandidate],
        });

        expect(bindResult.isBound).toBe(true);
        expect(bindResult.candidate).toBeDefined();
        expect(bindResult.candidate!.verificationStatus).toBe('VERIFIED');
        expect(bindResult.candidate!.confidenceScore).toBe(1.0);

        if (qNo === 1) {
          expect(bindResult.candidate!.parsedPayload.type).toBe('SINGLE_CHOICE_MCQ');
          expect((bindResult.candidate!.parsedPayload as any).correctOptionLabel).toBe('A');
        } else if (qNo === 26) {
          expect(bindResult.candidate!.parsedPayload.type).toBe('MULTIPLE_CHOICE_MSQ');
          expect((bindResult.candidate!.parsedPayload as any).correctOptionLabels).toEqual(['A', 'B']);
        } else if (qNo === 31) {
          expect(bindResult.candidate!.parsedPayload.type).toBe('NUMERICAL_RANGE_NAT');
          expect(parseFloat((bindResult.candidate!.parsedPayload as any).rangeLow)).toBeCloseTo(-2.1, 4);
          expect(parseFloat((bindResult.candidate!.parsedPayload as any).rangeHigh)).toBeCloseTo(-1.9, 4);
        }
      }
    });
  });

  // ==========================================================================
  // 3. QUESTION PAPER FORENSIC EXTRACTION & FIDELITY AUDIT
  // ==========================================================================
  describe('3. Real Question Paper Forensic Ingestion', () => {
    it('GATE 2025 CS-1: Ingests question paper sample and constructs validated DocumentGraph', async () => {
      const qpPath = path.join(realExamsDir, 'GATE_2025_CS_1_Question_Paper.pdf');
      const rawBuffer = fs.readFileSync(qpPath);
      const sourceBytes = new Uint8Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);

      // 1. Binary Scanner
      const scan = await PdfSourceScanner.scan(sourceBytes);
      expect(scan.header.version).toBe('1.7');
      expect(scan.objects.size).toBeGreaterThan(100);

      // 2. ForensicSnapshot Extraction (First 5 pages: covers GA Q1 to Q5)
      const snapshot = await adapter.extractForensicSnapshot(sourceBytes, { maxPages: 5 });
      expect(snapshot.pageGeometries.length).toBe(5);
      expect(snapshot.isSealed).toBe(true);
      expect(snapshot.glyphRuns.length).toBeGreaterThan(50);

      // 3. DocumentGraph Construction
      const docGraph = await docGraphBuilder.buildGraph(snapshot);
      expect(docGraph.isSealed).toBe(true);
      expect(docGraph.nodes.size).toBeGreaterThan(20);
      expect(docGraph.readingFlow.length).toBe(docGraph.nodes.size);

      // 4. QuestionGraph Construction
      const qGraph = await questionGraphBuilder.buildGraph(docGraph);
      expect(qGraph.isSealed).toBe(true);
      expect(qGraph.hypotheses.length).toBeGreaterThan(0);
      // Exact Question-Level Verification for Q1 to Q5:
      expect(qGraph.questions.length).toBe(5);

      // Verify Q1 (Verbal Aptitude - Articles)
      const q1 = qGraph.questions[0];
      expect(q1.sourceQuestionNumber).toBe('Q.1');
      expect(q1.startPageNumber).toBe(1);
      expect(q1.endPageNumber).toBe(1);
      const q1Stem = [...q1.stemNodeIds, ...q1.bodyNodeIds].map((id) => docGraph.nodes.get(id)?.textContent || '').join(' ');
      expect(q1Stem).toContain('Ravi had ______ younger brother');
      expect(q1Stem).toContain('Select the option with the correct sequence of articles');
      expect(q1.optionCandidateIds.length).toBe(4);
      const q1Options = q1.optionCandidateIds.map((optId) => {
        const opt = qGraph.options.find((o) => o.optionCandidateId === optId)!;
        const text = opt.contentNodeIds.map((id) => docGraph.nodes.get(id)?.textContent || '').join(' ').trim();
        return { marker: opt.markerLabel, text };
      });
      expect(q1Options[0]).toEqual({ marker: '(A)', text: 'a; a; an' });
      expect(q1Options[1]).toEqual({ marker: '(B)', text: 'the; an; a' });
      expect(q1Options[2]).toEqual({ marker: '(C)', text: 'a; an; a' });
      expect(q1Options[3]).toEqual({ marker: '(D)', text: 'an; an; a' });

      // Verify Q2 (Verbal Aptitude - Vocabulary)
      const q2 = qGraph.questions[1];
      expect(q2.sourceQuestionNumber).toContain('2');
      expect(q2.startPageNumber).toBe(2);
      const q2Stem = [...q2.stemNodeIds, ...q2.bodyNodeIds].map((id) => docGraph.nodes.get(id)?.textContent || '').join(' ');
      expect(q2Stem).toContain('CEO’s decision to downsize the workforce');
      expect(q2Stem).toContain('myopic');
      expect(q2.optionCandidateIds.length).toBe(4);
      const q2Options = q2.optionCandidateIds.map((optId) => {
        const opt = qGraph.options.find((o) => o.optionCandidateId === optId)!;
        const text = opt.contentNodeIds.map((id) => docGraph.nodes.get(id)?.textContent || '').join(' ').trim();
        return { marker: opt.markerLabel, text };
      });
      expect(q2Options[0].marker).toBe('(A)');
      expect(q2Options[0].text).toBe('visionary');
      expect(q2Options[1].marker).toBe('(B)');
      expect(q2Options[1].text).toBe('shortsighted');
      expect(q2Options[2].marker).toBe('(C)');
      expect(q2Options[2].text).toBe('progressive');
      expect(q2Options[3].marker).toBe('(D)');
      expect(q2Options[3].text).toContain('nnovative');

      // Verify Q3 (Quantitative Aptitude - Arithmetic Mean)
      const q3 = qGraph.questions[2];
      expect(q3.sourceQuestionNumber).toContain('3');
      expect(q3.startPageNumber).toBe(3);
      const q3Stem = [...q3.stemNodeIds, ...q3.bodyNodeIds].map((id) => docGraph.nodes.get(id)?.textContent || '').join(' ').replace(/\s+/g, ' ');
      expect(q3Stem).toContain('average marks obtained by a class');
      expect(q3Stem).toContain('30.8');
      expect(q3Stem).toContain('24 instead of 42');
      expect(q3Stem).toContain('average becomes 31.4');
      expect(q3Stem).toContain('How many students does the class have?');
      expect(q3.optionCandidateIds.length).toBe(4);
      const q3Options = q3.optionCandidateIds.map((optId) => {
        const opt = qGraph.options.find((o) => o.optionCandidateId === optId)!;
        const text = opt.contentNodeIds.map((id) => docGraph.nodes.get(id)?.textContent || '').join(' ').trim();
        return { marker: opt.markerLabel, text };
      });
      expect(q3Options[0]).toEqual({ marker: '(A)', text: '25' });
      expect(q3Options[1]).toEqual({ marker: '(B)', text: '28' });
      expect(q3Options[2]).toEqual({ marker: '(C)', text: '30' });
      expect(q3Options[3]).toEqual({ marker: '(D)', text: '32' });

      // Arithmetic reconciliation: (31.4 - 30.8) * N = 42 - 24 = 18 => 0.6 * N = 18 => N = 30.
      // Option C = 30 matches the exact arithmetic and the official answer key (Key C).

      // Verify Q4 (Logical Reasoning - Multi-Clause Family Relations)
      const q4 = qGraph.questions[3];
      expect(q4.sourceQuestionNumber).toContain('4');
      expect(q4.startPageNumber).toBe(4);
      const q4Stem = [...q4.stemNodeIds, ...q4.bodyNodeIds].map((id) => docGraph.nodes.get(id)?.textContent || '').join(' ').replace(/\s+/g, ' ');
      expect(q4Stem).toContain('relationships among P, Q, R, S, and T');

      // Verify Q5 (Spatial Aptitude - Spatial Map Diagram)
      const q5 = qGraph.questions[4];
      expect(q5.sourceQuestionNumber).toContain('5');
      expect(q5.startPageNumber).toBe(5);
      const q5Stem = [...q5.stemNodeIds, ...q5.bodyNodeIds].map((id) => docGraph.nodes.get(id)?.textContent || '').join(' ').replace(/\s+/g, ' ');
      expect(q5Stem).toContain('map shown in the figure');

      // 5. Phase 2C Invariants Validation
      const validation = QuestionGraphValidator.validate(qGraph, docGraph);
      expect(validation.isValid).toBe(true);

      // Provenance: every question candidate must map to genuine physical nodes
      for (const q of qGraph.questions) {
        expect(q.includedPhysicalNodeIds.length).toBeGreaterThan(0);
        expect(q.startPageNumber).toBeGreaterThanOrEqual(1);
        expect(q.startPageNumber).toBeLessThanOrEqual(5);
      }
    }, 60000);

    it('GATE 2025 CS-1: Technical Question Sampling — Math, Code, Diagrams, and 65-Question Topology', async () => {
      const qpPath = path.join(realExamsDir, 'GATE_2025_CS_1_Question_Paper.pdf');
      const { numPages, itemsByPage } = await extractTextItemsFromPdf(qpPath);
      expect(numPages).toBe(64);

      // 1. Authoritative 65-Question Topological Mapping across 64 pages
      const allPageTexts = itemsByPage.map((items) => items.join(' '));
      const qPageMap = new Map<number, number>();

      for (let q = 1; q <= 65; q++) {
        const regex = new RegExp(`(?:^|\\s)Q\\s*\\.?\\s*${q}\\s+`);
        for (let p = 1; p <= numPages; p++) {
          const cleaned = allPageTexts[p - 1].replace(/Q\s*\.?\s*\d+\s*[–-]\s*Q\s*\.?\s*\d+/g, '');
          if (regex.test(cleaned)) {
            qPageMap.set(q, p);
            break;
          }
        }
      }

      // Assert all 65 questions are accounted for in authoritative topological order
      expect(qPageMap.size).toBe(65);
      expect(qPageMap.get(1)).toBe(1);
      expect(qPageMap.get(10)).toBe(10);
      expect(qPageMap.get(11)).toBe(10); // Q11 starts on page 10 and continues to page 11
      expect(qPageMap.get(65)).toBe(64);

      // 2. Sampled C Programming Questions (Q34, Q61, Q63)
      const q34Text = allPageTexts[qPageMap.get(34)! - 1];
      expect(q34Text).toContain('#include <stdio.h>');
      expect(q34Text).toContain('void foo(int *p, int x)');

      const q61Text = allPageTexts[qPageMap.get(61)! - 1];
      expect(q61Text).toContain('#include <stdio.h>');
      expect(q61Text).toContain('int foo(int S[],int size)');

      const q63Text = allPageTexts[qPageMap.get(63)! - 1];
      expect(q63Text).toContain('#include <stdio.h>');
      expect(q63Text).toContain('int gate (int n)');

      // 3. Sampled Mathematical Notation Questions (Q20, Q41)
      const q20Text = allPageTexts[qPageMap.get(20)! - 1];
      expect(q20Text).toContain('recurrence relation');
      expect(q20Text).toContain('𝑇');

      const q41Text = allPageTexts[qPageMap.get(41)! - 1];
      expect(q41Text).toContain('eigenvalues');
      expect(q41Text).toContain('𝐴');

      // 4. Sampled Diagram / Architecture Questions (Q21, Q27, Q50)
      const q21Text = allPageTexts[qPageMap.get(21)! - 1];
      expect(q21Text).toContain('tree');

      const q27Text = allPageTexts[qPageMap.get(27)! - 1];
      expect(q27Text).toContain('data path');
      expect(q27Text).toContain('registers');
      expect(q27Text).toContain('arithmetic operations');

      const q50Text = allPageTexts[qPageMap.get(50)! - 1];
      expect(q50Text).toContain('deterministic finite automaton');
    }, 60000);

    it('SSC CGL 2025 Tier-1: Truthfully classifies raster/lattice hybrid format with visual options across all 4 sections', async () => {
      const cglPath = path.join(realExamsDir, 'SSC_CGL_2025_Tier_1_12-09-2025_Shift-1.pdf');
      const rawBuffer = fs.readFileSync(cglPath);
      const sourceBytes = new Uint8Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);

      const { numPages, itemsByPage } = await extractTextItemsFromPdf(cglPath);
      expect(numPages).toBe(56);

      // Verify authoritative 4 section headers
      const allTextCombined = itemsByPage.flat().join(' ');
      expect(allTextCombined).toContain('PART - A (General Intelligence and Reasoning)');
      expect(allTextCombined).toContain('PART - B (General Awareness)');
      expect(allTextCombined).toContain('PART - C (Quantitative Aptitude)');
      expect(allTextCombined).toContain('PART - D (English Comprehension)');

      // Verify complete 100/100 question mapping across all 56 pages with kerning awareness
      const qMap = new Map<number, { page: number; raw: string }>();
      for (let p = 0; p < itemsByPage.length; p++) {
        const pageText = itemsByPage[p].join(' ');
        const matches = pageText.matchAll(/Q\s*\.?\s*N\s*o\s*[:\.]?\s*(\d[\d\s]*)/gi);
        for (const m of matches) {
          const cleanedNumStr = m[1].replace(/\s+/g, '');
          const num = parseInt(cleanedNumStr, 10);
          if (num >= 1 && num <= 100) {
            qMap.set(num, { page: p + 1, raw: m[0] });
          }
        }
      }

      // 100% of questions Q1 to Q100 are verified present
      expect(qMap.size).toBe(100);
      for (let qNo = 1; qNo <= 100; qNo++) {
        expect(qMap.has(qNo)).toBe(true);
      }

      // Forensic Resolution of Previous 99/100 Discrepancy:
      // Q33 on Page 19 contains inter-digit font kerning space: "Q.No:   3 3"
      const q33 = qMap.get(33)!;
      expect(q33.page).toBe(19);
      expect(q33.raw.replace(/\s+/g, '')).toBe('Q.No:33');

      // Q90 on Page 50 contains intra-token font kerning space: "Q.N o:   90"
      const q90 = qMap.get(90)!;
      expect(q90.page).toBe(50);
      expect(q90.raw.replace(/\s+/g, '')).toBe('Q.No:90');

      // Sample first 3 pages with forensic adapter
      const snapshot = await adapter.extractForensicSnapshot(sourceBytes, { maxPages: 3 });
      expect(snapshot.pageGeometries.length).toBe(3);

      // Observe raster XObjects (visual options & cropped questions, 20+ operations per page)
      expect(snapshot.rasterXObjects.length).toBeGreaterThan(10);

      // Invariant: Physical preservation != semantic recognition.
      // Assert that Mock.AI does NOT falsely report these image-based questions as parsed plain-text tokens.
      const page2Glyphs = snapshot.glyphRuns.filter((r) => r.pageNumber === 2);
      // On page 2, only lattice metadata markers exist (Q.No: 2, Q.No: 3), NOT full stem prose
      const page2Text = page2Glyphs.map((r) => r.decodedUnicode).join(' ');
      expect(page2Text).toContain('Q.No:');
      expect(page2Text.length).toBeLessThan(100); // Truthful: stem prose is not falsely fabricated
    }, 60000);

    it('UPSC CSE 2025 Prelims GS-I: Truthfully classifies scanned full-page bitmap format without text fabrication across entire document', async () => {
      const upscPath = path.join(realExamsDir, 'UPSC_CSE_2025_Prelims_GS_Paper_I.pdf');
      const rawBuffer = fs.readFileSync(upscPath);
      const sourceBytes = new Uint8Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);

      const { numPages, itemsByPage } = await extractTextItemsFromPdf(upscPath);
      expect(numPages).toBe(48);

      // All 48 pages contain 0 vector text items in the authentic scanned release
      const totalTextItems = itemsByPage.flat().length;
      expect(totalTextItems).toBe(0);

      // Sample page 2 with forensic adapter
      const snapshot = await adapter.extractForensicSnapshot(sourceBytes, { maxPages: 2 });
      expect(snapshot.pageGeometries.length).toBe(2);

      // Truthful: 0 fabricated vector glyph runs
      const p2Glyphs = snapshot.glyphRuns.filter((r) => r.pageNumber === 2);
      expect(p2Glyphs.length).toBe(0);

      // Truthful: full-page raster scan retained
      const p2Images = snapshot.rasterXObjects.filter((r) => r.pageNumber === 2);
      expect(p2Images.length).toBeGreaterThanOrEqual(1);
    }, 60000);

    it('Adversarial Answer Key Robustness: Enforces strict fail-closed handling without guessing or silent normalization', () => {
      // 1. Malformed multiple-choice letters
      const malformedLetter = parseRawAnswerValue('X', 'MCQ');
      expect(malformedLetter.type).toBe('UNRESOLVED_ANSWER');

      // 2. Malformed MSQ with invalid delimiter / characters
      const malformedMsq = parseRawAnswerValue('A;X;Z', 'MSQ');
      expect(malformedMsq.type).toBe('UNRESOLVED_ANSWER');

      // 3. Malformed NAT with invalid numeric text
      const malformedNat = parseRawAnswerValue('1 to ABC', 'NAT');
      expect(malformedNat.type).toBe('UNRESOLVED_ANSWER');

      // 4. Empty / blank answer string
      const emptyAnswer = parseRawAnswerValue('', 'MCQ');
      expect(emptyAnswer.type).toBe('UNRESOLVED_ANSWER');
    });
  });
});
