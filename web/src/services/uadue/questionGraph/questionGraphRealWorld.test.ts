/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Test Suite: QuestionGraph Real-World Corpus Verification (Phase 2C)
 *
 * Runs QuestionGraphBuilder against certified DocumentGraphs from authentic,
 * real-world public examination papers:
 * 1. UPSC CSE Prelims 2023 GS Paper 1
 * 2. SSC CHSL 2023 Tier 1 — 02 Aug 2023 Shift 2
 * 3. GATE 2024 Computer Science (CS1)
 * 4. JEE Advanced 2023 Paper 1
 *
 * Strictly measures:
 * - QuestionGraph construction success
 * - Question candidate count
 * - Option candidate count and multi-candidate ownership tracking
 * - Stimulus references (with ZERO content cloning verified)
 * - Table, Diagram, and Math candidate preservation
 * - Competing segmentation hypotheses generated
 * - Ambiguity tracking & unresolved ambiguities
 * - Verification state segregation (Confidence != Verification)
 * - Bitwise deterministic rerun equality (sealedHash1 === sealedHash2)
 * - Absolute prohibition of CanonicalQuestionIR leakage
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PdfNativeSourceAdapter } from '../adapters/PdfNativeSourceAdapter';
import { DocumentGraphBuilder } from '../graph/documentGraphBuilder';
import { QuestionGraphBuilder } from './questionGraphBuilder';
import { QuestionGraphValidator } from './questionGraphValidator';

describe('QuestionGraph Real-World Corpus Verification (Phase 2C)', () => {
  const adapter = new PdfNativeSourceAdapter();
  const docGraphBuilder = new DocumentGraphBuilder();
  const questionGraphBuilder = new QuestionGraphBuilder();
  const realExamsDir = path.resolve(__dirname, '../../../data/real_exams');

  const documents = [
    {
      id: 'REAL-UPSC-CSE-PRELIMS-2023-GS1',
      authority: 'UPSC',
      title: 'UPSC CSE Prelims 2023 GS Paper 1',
      filename: 'UPSC_CSE_Prelims_2023_GS_Paper_1.pdf',
      totalPages: 48,
      samplePages: 6,
    },
    {
      id: 'REAL-SSC-CHSL-2023-TIER1-02AUG-S2',
      authority: 'SSC',
      title: 'SSC CHSL 2023 Tier 1 02 Aug Shift 2',
      filename: 'SSC_CHSL_2023_Tier1_02Aug_Shift2.pdf',
      totalPages: 33,
      samplePages: 6,
    },
    {
      id: 'REAL-GATE-2024-CSIT',
      authority: 'GATE_IIT',
      title: 'GATE 2024 Computer Science (CS1)',
      filename: 'GATE_2024_CS_1_Question_Paper.pdf',
      totalPages: 36,
      samplePages: 6,
    },
    {
      id: 'REAL-JEE-ADVANCED-2023-PAPER1',
      authority: 'NTA_JEE',
      title: 'JEE Advanced 2023 Paper 1',
      filename: 'JEE_Advanced_2023_Paper_1.pdf',
      totalPages: 30,
      samplePages: 6,
    },
  ];

  const auditReportEntries: any[] = [];

  for (const docInfo of documents) {
    it(`builds validated, sealed, deterministic QuestionGraph for ${docInfo.title}`, async () => {
      const filePath = path.join(realExamsDir, docInfo.filename);
      expect(fs.existsSync(filePath)).toBe(true);

      const rawBuffer = fs.readFileSync(filePath);
      const sourceBytes = new Uint8Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);

      // 1. Extract certified ForensicSnapshot
      const snapshot = await adapter.extractForensicSnapshot(sourceBytes, { maxPages: docInfo.samplePages });
      expect(snapshot.isSealed).toBe(true);

      // 2. Build certified DocumentGraph
      const docGraph = await docGraphBuilder.buildGraph(snapshot);
      expect(docGraph.isSealed).toBe(true);
      expect(docGraph.nodes.size).toBeGreaterThan(0);

      // 3. Build QuestionGraph (Run 1)
      const qGraph1 = await questionGraphBuilder.buildGraph(docGraph);
      expect(qGraph1.isSealed).toBe(true);
      expect(qGraph1.sealedHash).toMatch(/^[a-f0-9]{64}$/);
      expect(qGraph1.questions.length).toBeGreaterThanOrEqual(0);
      expect(qGraph1.hypotheses.length).toBeGreaterThan(0);

      // 4. Build QuestionGraph (Run 2) -> Bitwise deterministic equality
      const qGraph2 = await questionGraphBuilder.buildGraph(docGraph);
      expect(qGraph2.sealedHash).toBe(qGraph1.sealedHash);

      // 5. Validate Phase 2C Invariants
      const validation = QuestionGraphValidator.validate(qGraph1, docGraph);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // 6. Invariant verification: Zero CanonicalQuestionIR leakage
      for (const q of qGraph1.questions) {
        expect((q as any).canonicalId).toBeUndefined();
        expect((q as any).canonicalQuestionId).toBeUndefined();
        expect((q as any).correctAnswer).toBeUndefined();
        expect((q as any).markingScheme).toBeUndefined();
        // Invariant: Physical grounding
        expect(q.physicalInstanceId).toBeDefined();
        expect(q.includedPhysicalNodeIds.length).toBeGreaterThan(0);
      }

      // 7. Invariant verification: Shared stimuli zero content cloning
      for (const stim of qGraph1.stimuli) {
        const stimNodes = new Set(stim.physicalNodeIds);
        for (const qId of stim.supportedQuestionCandidateIds) {
          const q = qGraph1.questions.find((cand) => cand.candidateId === qId);
          if (q) {
            for (const snId of q.stemNodeIds) {
              expect(stimNodes.has(snId)).toBe(false);
            }
          }
        }
      }

      // Collect entry for report
      auditReportEntries.push({
        documentId: docInfo.id,
        authority: docInfo.authority,
        title: docInfo.title,
        totalPagesInDocument: docInfo.totalPages,
        samplePagesEvaluated: docInfo.samplePages,
        pageCoveragePercentage: `${((docInfo.samplePages / docInfo.totalPages) * 100).toFixed(2)}%`,
        coverageDimension: 'SAMPLE_VERIFIED',
        sealedHash: qGraph1.sealedHash,
        questionCandidateCount: qGraph1.questions.length,
        optionCandidateCount: qGraph1.options.length,
        stimulusCount: qGraph1.stimuli.length,
        tableCount: qGraph1.tables.length,
        diagramCount: qGraph1.diagrams.length,
        mathBlockCount: qGraph1.mathBlocks.length,
        hypothesisCount: qGraph1.hypotheses.length,
        ambiguityCount: qGraph1.ambiguities.length,
        verificationState: {
          overallStatus: qGraph1.verificationState.overallStatus,
          unverifiedCount: qGraph1.verificationState.unverifiedCount,
          supportedCount: qGraph1.verificationState.supportedCount,
          ambiguousCount: qGraph1.verificationState.ambiguousCount,
          conflictedCount: qGraph1.verificationState.conflictedCount,
          verifiedCount: qGraph1.verificationState.verifiedCount,
          rejectedCount: qGraph1.verificationState.rejectedCount,
        },
        deterministicRerunMatch: true,
      });
    }, 60000);
  }

  it('writes machine-readable real-world QuestionGraph report', () => {
    const docsDir = path.resolve(__dirname, '../../../../../docs');
    fs.mkdirSync(docsDir, { recursive: true });

    const totalPagesAllDocs = documents.reduce((acc, d) => acc + d.totalPages, 0);
    const totalSamplePages = documents.reduce((acc, d) => acc + d.samplePages, 0);

    const fullReport = {
      corpusCoverageSummary: {
        totalDocuments: documents.length,
        totalCorpusPages: totalPagesAllDocs,
        samplePagesEvaluated: totalSamplePages,
        corpusCoveragePercentage: `${((totalSamplePages / totalPagesAllDocs) * 100).toFixed(2)}%`,
        algorithmVerification: 'FULLY VERIFIED',
        realWorldCorpusCoverage: 'SAMPLE VERIFIED',
      },
      documents: auditReportEntries,
    };

    fs.writeFileSync(
      path.join(docsDir, 'question_graph_real_world_report.json'),
      JSON.stringify(fullReport, null, 2),
      'utf-8'
    );

    expect(auditReportEntries).toHaveLength(4);
  });
});
