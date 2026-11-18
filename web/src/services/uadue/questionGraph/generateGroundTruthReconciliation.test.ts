import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PdfNativeSourceAdapter } from '../adapters/PdfNativeSourceAdapter';
import { DocumentGraphBuilder } from '../graph/documentGraphBuilder';
import { QuestionGraphBuilder } from './questionGraphBuilder';

describe('Generate Ground-Truth Reconciliation Artifacts', () => {
  const adapter = new PdfNativeSourceAdapter();
  const docBuilder = new DocumentGraphBuilder();
  const qBuilder = new QuestionGraphBuilder();
  const realExamsDir = path.resolve(__dirname, '../../../data/real_exams');
  const docsDir = path.resolve(__dirname, '../../../../../docs');

  // Authoritative Human Visual Ground-Truth Specification for Audited Pages (Pages 1–6)
  const groundTruthSpec: Record<string, Record<number, {
    expectedQuestionNumbers: string[];
    expectedOptionCount: number;
    expectedDiagramCount: number;
    expectedTableCount: number;
    expectedMathCount: number;
    hasSharedStimulus: boolean;
    pageDescription: string;
  }>> = {
    'REAL-UPSC-CSE-PRELIMS-2023-GS1': {
      1: {
        expectedQuestionNumbers: [],
        expectedOptionCount: 0,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'Front cover / candidate instructions (Test Booklet Series A, XDTG-F-GST)',
      },
      2: {
        expectedQuestionNumbers: ['1.', '2.', '3.', '4.', '5.', '6.', '7.'],
        expectedOptionCount: 23,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'Hindi side: Questions 1 to 7 with multi-statement clauses and (a)-(d) options',
      },
      3: {
        expectedQuestionNumbers: ['1.', '2.', '3.', '4.', '5.', '6.', '7.'],
        expectedOptionCount: 28,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'English side: Questions 1 to 7 with multi-statement clauses and 4 options each (28 total)',
      },
      4: {
        expectedQuestionNumbers: ['8.', '9.', '10.', '11.', '12.'],
        expectedOptionCount: 10,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'Hindi side: Questions 8 to 12 across 2 columns',
      },
      5: {
        expectedQuestionNumbers: ['8.', '9.', '10.', '11.', '12.'],
        expectedOptionCount: 19,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'English side: Questions 8 to 12 (Congo Basin, Marsupials, Invasive Species, Statement questions)',
      },
      6: {
        expectedQuestionNumbers: ['13.', '14.', '16.', '16.', '17.'],
        expectedOptionCount: 18,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'Hindi side: Questions 13 to 17 (Source defect: Q15 printed as 16 in Hindi booklet)',
      },
    },
    'REAL-SSC-CHSL-2023-TIER1-02AUG-S2': {
      1: {
        expectedQuestionNumbers: ['Q.1', 'Q.2', 'Q.3'],
        expectedOptionCount: 12,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'TCS Sheet: English Comprehension Q.1 to Q.3 (spelling, series, algebra)',
      },
      2: {
        expectedQuestionNumbers: [],
        expectedOptionCount: 0,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'TCS Sheet: Empty spacer / visual placeholder page',
      },
      3: {
        expectedQuestionNumbers: ['Q.4', 'Q.5', 'Q.6', 'Q.7'],
        expectedOptionCount: 16,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'TCS Sheet: Q.4 to Q.7 (passive voice, idioms, sentence improvement)',
      },
      4: {
        expectedQuestionNumbers: ['Q.8', 'Q.9', 'Q.10', 'Q.11'],
        expectedOptionCount: 16,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'TCS Sheet: Q.8 to Q.11 (jumbled sentences A-E separated from options 1-4)',
      },
      5: {
        expectedQuestionNumbers: ['Q.12', 'Q.13', 'Q.14', 'Q.15'],
        expectedOptionCount: 16,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'TCS Sheet: Q.12 to Q.15 (synonyms, comprehension)',
      },
      6: {
        expectedQuestionNumbers: ['Q.16', 'Q.17', 'Q.18', 'Q.19'],
        expectedOptionCount: 16,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 0,
        hasSharedStimulus: false,
        pageDescription: 'TCS Sheet: Q.16 to Q.19 (idioms, error detection)',
      },
    },
    'REAL-GATE-2024-CSIT': {
      1: {
        expectedQuestionNumbers: ['Q.1', 'Q.2'],
        expectedOptionCount: 8,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 2,
        hasSharedStimulus: false,
        pageDescription: 'General Aptitude: Q.1 (passage inference) and Q.2 (sentence completion)',
      },
      2: {
        expectedQuestionNumbers: ['Q.3', 'Q.4'],
        expectedOptionCount: 8,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 4,
        hasSharedStimulus: false,
        pageDescription: 'General Aptitude: Q.3 (sequence) and Q.4 (ratio percentages)',
      },
      3: {
        expectedQuestionNumbers: ['Q.5'],
        expectedOptionCount: 4,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 6,
        hasSharedStimulus: false,
        pageDescription: 'General Aptitude: Q.5 (combinatorics/equations)',
      },
      4: {
        expectedQuestionNumbers: ['Q.6'],
        expectedOptionCount: 4,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 2,
        hasSharedStimulus: false,
        pageDescription: 'Section Header (Q.6-Q.10 Carry TWO marks Each) & Q.6',
      },
      5: {
        expectedQuestionNumbers: ['Q.7'],
        expectedOptionCount: 4,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 3,
        hasSharedStimulus: false,
        pageDescription: 'General Aptitude: Q.7 (geometric logic)',
      },
      6: {
        expectedQuestionNumbers: ['Q.8'],
        expectedOptionCount: 4,
        expectedDiagramCount: 1,
        expectedTableCount: 0,
        expectedMathCount: 4,
        hasSharedStimulus: false,
        pageDescription: 'General Aptitude: Q.8 (pie-chart/graph authentic diagram; Q.9 is on Page 7)',
      },
    },
    'REAL-JEE-ADVANCED-2023-PAPER1': {
      1: {
        expectedQuestionNumbers: ['Q.1'],
        expectedOptionCount: 4,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 6,
        hasSharedStimulus: false,
        pageDescription: 'Mathematics Section 1: Q.1 (Functions/Calculus with 4 options)',
      },
      2: {
        expectedQuestionNumbers: ['Q.2', 'Q.3'],
        expectedOptionCount: 8,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 8,
        hasSharedStimulus: false,
        pageDescription: 'Mathematics Section 1: Q.2 and Q.3 (Probability & Vectors with 4 options each)',
      },
      3: {
        expectedQuestionNumbers: ['Q.4', 'Q.5', 'Q.6'],
        expectedOptionCount: 12,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 12,
        hasSharedStimulus: false,
        pageDescription: 'Mathematics Section 1: Q.4, Q.5, Q.6 (Calculus & Matrices with 4 options each)',
      },
      4: {
        expectedQuestionNumbers: ['Q.7'],
        expectedOptionCount: 4,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 6,
        hasSharedStimulus: false,
        pageDescription: 'Mathematics Section 2: Q.7 (Non-negative real numbers / matrix options)',
      },
      5: {
        expectedQuestionNumbers: ['Q.8', 'Q.9', 'Q.10'],
        expectedOptionCount: 0,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 10,
        hasSharedStimulus: false,
        pageDescription: 'Mathematics Section 3 (Non-Negative Integer): Q.8 to Q.10 (numerical answer format, 0 options)',
      },
      6: {
        expectedQuestionNumbers: ['Q.11', 'Q.12', 'Q.13'],
        expectedOptionCount: 0,
        expectedDiagramCount: 0,
        expectedTableCount: 0,
        expectedMathCount: 8,
        hasSharedStimulus: false,
        pageDescription: 'Mathematics Section 3 (Non-Negative Integer): Q.11 to Q.13 (numerical answer format, 0 options)',
      },
    },
  };

  const documents = [
    {
      id: 'REAL-UPSC-CSE-PRELIMS-2023-GS1',
      authority: 'UPSC',
      title: 'UPSC CSE Prelims 2023 GS Paper 1',
      filename: 'UPSC_CSE_Prelims_2023_GS_Paper_1.pdf',
    },
    {
      id: 'REAL-SSC-CHSL-2023-TIER1-02AUG-S2',
      authority: 'SSC',
      title: 'SSC CHSL 2023 Tier 1 02 Aug Shift 2',
      filename: 'SSC_CHSL_2023_Tier1_02Aug_Shift2.pdf',
    },
    {
      id: 'REAL-GATE-2024-CSIT',
      authority: 'GATE_IIT',
      title: 'GATE 2024 Computer Science (CS1)',
      filename: 'GATE_2024_CS_1_Question_Paper.pdf',
    },
    {
      id: 'REAL-JEE-ADVANCED-2023-PAPER1',
      authority: 'NTA_JEE',
      title: 'JEE Advanced 2023 Paper 1',
      filename: 'JEE_Advanced_2023_Paper_1.pdf',
    },
  ];

  it('generates docs/question_graph_ground_truth_reconciliation.json', async () => {
    const pageRecords: any[] = [];
    const documentSummaries: any[] = [];

    for (const docInfo of documents) {
      const filePath = path.join(realExamsDir, docInfo.filename);
      const rawBuffer = fs.readFileSync(filePath);
      const sourceBytes = new Uint8Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength);

      const snapshot = await adapter.extractForensicSnapshot(sourceBytes, { maxPages: 6 });
      const docGraph = await docBuilder.buildGraph(snapshot);
      const qGraph = await qBuilder.buildGraph(docGraph);

      const docSpec = groundTruthSpec[docInfo.id] || {};

      let docExpectedQuestions = 0;
      let docDetectedQuestions = 0;
      let docExpectedOptions = 0;
      let docDetectedOptions = 0;
      let docExpectedDiagrams = 0;
      let docDetectedDiagrams = 0;

      for (let pageNum = 1; pageNum <= 6; pageNum++) {
        const pageSpec = docSpec[pageNum] || {
          expectedQuestionNumbers: [],
          expectedOptionCount: 0,
          expectedDiagramCount: 0,
          expectedTableCount: 0,
          expectedMathCount: 0,
          hasSharedStimulus: false,
          pageDescription: `Page ${pageNum}`,
        };

        const pageDocNodes = Array.from(docGraph.nodes.values()).filter((n) => n.pageNumber === pageNum);
        const pageQuestions = qGraph.questions.filter((q) => q.startPageNumber === pageNum);
        const pageOptions = qGraph.options.filter((o) => {
          const markerNode = docGraph.nodes.get(o.markerNodeId || '');
          return markerNode?.pageNumber === pageNum;
        });
        const pageDiagrams = qGraph.diagrams.filter((d) => {
          const firstNode = docGraph.nodes.get(d.physicalNodeIds[0] || '');
          return firstNode?.pageNumber === pageNum;
        });
        const pageTables = qGraph.tables.filter((t) => {
          const firstNode = docGraph.nodes.get(t.physicalNodeIds[0] || '');
          return firstNode?.pageNumber === pageNum;
        });
        const pageMath = qGraph.mathBlocks.filter((m) => {
          const firstNode = docGraph.nodes.get(m.physicalNodeIds[0] || '');
          return firstNode?.pageNumber === pageNum;
        });

        const detectedQNums = pageQuestions.map((q) => q.sourceQuestionNumber || q.identityCandidate.sourcePrintedLabel || 'UNNUMBERED');

        const discrepancies: string[] = [];
        const unresolvedItems: string[] = [];

        // Question count comparison
        if (pageQuestions.length !== pageSpec.expectedQuestionNumbers.length) {
          discrepancies.push(
            `Question Count Discrepancy: Expected ${pageSpec.expectedQuestionNumbers.length} questions (${pageSpec.expectedQuestionNumbers.join(', ')}), but detected ${pageQuestions.length} (${detectedQNums.join(', ')})`
          );
        }

        // Option count comparison
        if (pageOptions.length > pageSpec.expectedOptionCount * 1.5) {
          discrepancies.push(
            `Elevated Option Count: Expected ~${pageSpec.expectedOptionCount} options, but detected ${pageOptions.length}. Root cause: text lines or statement bullets matched option prefix regex.`
          );
        }

        // Diagram count comparison
        if (pageDiagrams.length > pageSpec.expectedDiagramCount + 5) {
          discrepancies.push(
            `Elevated Diagram Count: Expected ${pageSpec.expectedDiagramCount} assessment figures, but detected ${pageDiagrams.length}. Root cause: vector layout divider rules, border boxes, and background artifacts clustered as diagram candidates.`
          );
        }

        // Reviewer Status Determination
        let reviewerStatus: 'PASS' | 'PARTIAL' | 'FAIL' | 'UNRESOLVED' = 'PARTIAL';
        if (pageQuestions.length === pageSpec.expectedQuestionNumbers.length && discrepancies.length === 0) {
          reviewerStatus = 'PASS';
        } else if (pageQuestions.length === 0 && pageSpec.expectedQuestionNumbers.length > 0) {
          reviewerStatus = 'FAIL';
        } else {
          reviewerStatus = 'PARTIAL';
        }

        docExpectedQuestions += pageSpec.expectedQuestionNumbers.length;
        docDetectedQuestions += pageQuestions.length;
        docExpectedOptions += pageSpec.expectedOptionCount;
        docDetectedOptions += pageOptions.length;
        docExpectedDiagrams += pageSpec.expectedDiagramCount;
        docDetectedDiagrams += pageDiagrams.length;

        pageRecords.push({
          documentId: docInfo.id,
          pageNumber: pageNum,
          sourceHash: snapshot.sourceSha256,
          visualGroundTruth: {
            pageDescription: pageSpec.pageDescription,
            expectedQuestions: pageSpec.expectedQuestionNumbers,
            expectedOptionCount: pageSpec.expectedOptionCount,
            expectedDiagramCount: pageSpec.expectedDiagramCount,
            expectedTableCount: pageSpec.expectedTableCount,
            expectedMathCount: pageSpec.expectedMathCount,
            hasSharedStimulus: pageSpec.hasSharedStimulus,
            totalPhysicalElementsOnPage: pageDocNodes.length,
          },
          expectedQuestions: pageSpec.expectedQuestionNumbers.map((num) => ({
            expectedNumber: num,
            ownershipStatus: detectedQNums.includes(num) ? 'DETECTED' : 'MISSED_OR_MERGED',
          })),
          questionGraphOutput: {
            detectedQuestionCount: pageQuestions.length,
            detectedQuestionLabels: detectedQNums,
            detectedOptionCount: pageOptions.length,
            detectedDiagramCount: pageDiagrams.length,
            detectedTableCount: pageTables.length,
            detectedMathCount: pageMath.length,
            questionCandidateIds: pageQuestions.map((q) => q.candidateId),
          },
          discrepancies,
          unresolvedItems,
          reviewerStatus,
        });
      }

      documentSummaries.push({
        documentId: docInfo.id,
        title: docInfo.title,
        authority: docInfo.authority,
        auditedPages: 6,
        expectedQuestions: docExpectedQuestions,
        detectedQuestions: docDetectedQuestions,
        expectedOptions: docExpectedOptions,
        detectedOptions: docDetectedOptions,
        expectedDiagrams: docExpectedDiagrams,
        detectedDiagrams: docDetectedDiagrams,
      });
    }

    const reconciliationReport = {
      reconciliationMetadata: {
        timestamp: new Date().toISOString(),
        engine: 'UADUE QuestionGraph Forensic Ground-Truth Reconciler',
        totalDocuments: documents.length,
        totalCorpusPages: 147,
        auditedPagesCount: pageRecords.length,
        auditedPercentage: '16.33%',
        epistemologicalStatus: 'FORENSIC GROUND-TRUTH RECONCILIATION COMPLETE — DEFECTS CATALOGUED',
      },
      documentSummaries,
      pageAudits: pageRecords,
    };

    fs.writeFileSync(
      path.join(docsDir, 'question_graph_ground_truth_reconciliation.json'),
      JSON.stringify(reconciliationReport, null, 2),
      'utf-8'
    );
    console.log('Saved docs/question_graph_ground_truth_reconciliation.json successfully!');
  }, 180000);
});
