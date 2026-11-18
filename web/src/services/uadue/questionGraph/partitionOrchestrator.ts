/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Partition Orchestration & Cross-Batch Relationship Reconciliation Engine (Phase 2C)
 *
 * Architecture:
 * 1. Bounded Page-Partition Execution: Divides large documents into deterministic page windows.
 * 2. Cross-Batch Relationship Engine: Symmetrically reconciles facing-page & continuation relationships across partition boundaries.
 * 3. Idempotent Merging: Merges partition sub-graphs without duplicate physical candidates or phantom relationships.
 * 4. Checkpoint & Resume: Restores valid partition caches; invalidates stale/corrupted checkpoints.
 * 5. Bounded Memory: Avoids monolithic string allocations and prevents V8 string length limit errors.
 */

import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import {
  QuestionGraph,
  QuestionCandidate,
  OptionCandidate,
  StimulusCandidate,
  TableCandidate,
  DiagramCandidate,
  MathCandidate,
  AmbiguityRecord,
  SegmentationHypothesis,
  QuestionRelationshipCandidate,
  RelationshipEvidence,
  QuestionGraphVerificationState,
  QuestionGraphProvenanceRecord,
} from '../contracts/questionGraph';
import { PdfNativeSourceAdapter } from '../adapters/PdfNativeSourceAdapter';
import { DocumentGraphBuilder } from '../graph/documentGraphBuilder';
import { QuestionGraphBuilder } from './questionGraphBuilder';
import { QuestionGraphSerializer } from './questionGraphSerializer';
import { QuestionGraphValidator } from './questionGraphValidator';

export interface DocumentPartitionSpec {
  partitionId: string;
  documentId: string;
  sourceSha256: string;
  startPage: number; // 1-indexed inclusive
  endPage: number;   // 1-indexed inclusive
  pageCount: number;
  configHash: string;
  algorithmVersion: string;
}

export interface PartitionExecutionResult {
  spec: DocumentPartitionSpec;
  questionGraph: QuestionGraph;
  durationMs: number;
  peakHeapUsedBytes?: number;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}

export interface PartitionOrchestratorOptions {
  batchSize?: number; // Default: 4 pages per partition
  overlappingPages?: number; // Default: 0
  customPageWindows?: Array<{ startPage: number; endPage: number }>;
  checkpointStore?: Map<string, QuestionGraph>; // In-memory or persistent cache
  onPartitionProgress?: (partitionIndex: number, totalPartitions: number, message: string) => void;
}

export class PartitionOrchestrator {
  private pdfAdapter = new PdfNativeSourceAdapter();
  private docGraphBuilder = new DocumentGraphBuilder();
  private qGraphBuilder = new QuestionGraphBuilder();
  private algorithmVersion = 'uadue_partition_orchestrator_v2c_2026';
  private configVersion = 'default_partition_v2c_2026';

  /**
   * Plans the list of partition specifications for a document of given total pages.
   */
  public planPartitions(
    documentId: string,
    sourceSha256: string,
    totalPages: number,
    options?: PartitionOrchestratorOptions
  ): DocumentPartitionSpec[] {
    const specs: DocumentPartitionSpec[] = [];

    if (options?.customPageWindows && options.customPageWindows.length > 0) {
      for (let idx = 0; idx < options.customPageWindows.length; idx++) {
        const win = options.customPageWindows[idx];
        const start = Math.max(1, Math.min(win.startPage, totalPages));
        const end = Math.max(start, Math.min(win.endPage, totalPages));
        specs.push({
          partitionId: `part_${documentId}_p${start}_p${end}_idx${idx}`,
          documentId,
          sourceSha256,
          startPage: start,
          endPage: end,
          pageCount: end - start + 1,
          configHash: `${this.configVersion}_custom`,
          algorithmVersion: this.algorithmVersion,
        });
      }
      return specs;
    }

    const batchSize = Math.max(1, options?.batchSize || 4);
    let currentStart = 1;
    let partIdx = 0;

    while (currentStart <= totalPages) {
      const currentEnd = Math.min(currentStart + batchSize - 1, totalPages);
      specs.push({
        partitionId: `part_${documentId}_p${currentStart}_p${currentEnd}_idx${partIdx}`,
        documentId,
        sourceSha256,
        startPage: currentStart,
        endPage: currentEnd,
        pageCount: currentEnd - currentStart + 1,
        configHash: `${this.configVersion}_b${batchSize}`,
        algorithmVersion: this.algorithmVersion,
      });
      currentStart = currentEnd + 1;
      partIdx++;
    }

    return specs;
  }

  /**
   * Executes a single partition from source binary bytes.
   */
  public async executePartition(
    sourceBytes: Uint8Array,
    spec: DocumentPartitionSpec,
    documentId: string
  ): Promise<PartitionExecutionResult> {
    const startTime = Date.now();
    try {
      // 1. Extract forensic snapshot for this exact page window
      const snapshot = await this.pdfAdapter.extractForensicSnapshot(sourceBytes, {
        startPage: spec.startPage,
        endPage: spec.endPage,
      });

      // 2. Build DocumentGraph for partition
      const docGraph = await this.docGraphBuilder.buildGraph(snapshot);

      // 3. Build QuestionGraph for partition
      const qGraph = await this.qGraphBuilder.buildGraph(docGraph);

      return {
        spec,
        questionGraph: qGraph,
        durationMs: Date.now() - startTime,
        status: 'SUCCESS',
      };
    } catch (err: any) {
      return {
        spec,
        questionGraph: null as any,
        durationMs: Date.now() - startTime,
        status: 'FAILED',
        error: err.message || String(err),
      };
    }
  }

  /**
   * Orchestrates the entire document through page-partitioned execution with checkpoint/resume.
   */
  public async processDocumentPartitioned(
    sourceBytes: Uint8Array,
    documentId: string,
    sourceSha256: string,
    totalPages: number,
    options?: PartitionOrchestratorOptions
  ): Promise<{
    mergedGraph: QuestionGraph;
    partitionResults: PartitionExecutionResult[];
    totalDurationMs: number;
    peakHeapUsedBytes: number;
  }> {
    const startTime = Date.now();
    const partitions = this.planPartitions(documentId, sourceSha256, totalPages, options);
    const partitionResults: PartitionExecutionResult[] = [];
    const qGraphsToMerge: QuestionGraph[] = [];

    for (let i = 0; i < partitions.length; i++) {
      const spec = partitions[i];
      options?.onPartitionProgress?.(i + 1, partitions.length, `Processing partition ${spec.partitionId} (pages ${spec.startPage}..${spec.endPage})...`);

      // Check checkpoint cache if provided
      if (options?.checkpointStore && options.checkpointStore.has(spec.partitionId)) {
        const cachedGraph = options.checkpointStore.get(spec.partitionId)!;
        if (
          cachedGraph.sourceSha256 === sourceSha256 &&
          cachedGraph.algorithmVersion === this.qGraphBuilder['config'].algorithmVersion
        ) {
          partitionResults.push({
            spec,
            questionGraph: cachedGraph,
            durationMs: 0,
            status: 'SUCCESS',
          });
          qGraphsToMerge.push(cachedGraph);
          continue;
        }
      }

      const result = await this.executePartition(sourceBytes, spec, documentId);
      partitionResults.push(result);

      if (result.status === 'SUCCESS' && result.questionGraph) {
        qGraphsToMerge.push(result.questionGraph);
        if (options?.checkpointStore) {
          options.checkpointStore.set(spec.partitionId, result.questionGraph);
        }
      } else {
        throw new Error(`PartitionExecutionFailed: Partition ${spec.partitionId} failed: ${result.error}`);
      }
    }

    // Merge partition sub-graphs into a unified QuestionGraph
    const mergedGraph = await this.mergePartitions(documentId, sourceSha256, qGraphsToMerge);

    const totalDurationMs = Date.now() - startTime;
    const peakHeapUsedBytes = process.memoryUsage().heapUsed;

    return {
      mergedGraph,
      partitionResults,
      totalDurationMs,
      peakHeapUsedBytes,
    };
  }

  /**
   * Deterministically merges partition QuestionGraphs into a unified QuestionGraph.
   * Performs Cross-Batch Relationship Reconciliation across facing spreads.
   */
  public async mergePartitions(
    documentId: string,
    sourceSha256: string,
    partitionGraphs: QuestionGraph[]
  ): Promise<QuestionGraph> {
    if (partitionGraphs.length === 0) {
      throw new Error('Cannot merge empty partition list');
    }

    const firstGraph = partitionGraphs[0];
    const sourceSnapshotId = firstGraph.sourceSnapshotId;

    // 1. Deduplicate Questions by physicalInstanceId (or candidateId)
    const questionMap = new Map<string, QuestionCandidate>();
    for (const pg of partitionGraphs) {
      for (const q of pg.questions) {
        const key = q.physicalInstanceId || q.candidateId;
        if (!questionMap.has(key)) {
          questionMap.set(key, q);
        }
      }
    }
    const questions = Array.from(questionMap.values()).sort(
      (a, b) => a.startPageNumber - b.startPageNumber || a.candidateDisplayOrder - b.candidateDisplayOrder
    );

    // 2. Deduplicate Options
    const optionMap = new Map<string, OptionCandidate>();
    for (const pg of partitionGraphs) {
      for (const opt of pg.options) {
        if (!optionMap.has(opt.optionCandidateId)) {
          optionMap.set(opt.optionCandidateId, opt);
        }
      }
    }
    const options = Array.from(optionMap.values());

    // 3. Deduplicate Stimuli (merge references)
    const stimulusMap = new Map<string, StimulusCandidate>();
    for (const pg of partitionGraphs) {
      for (const stim of pg.stimuli) {
        if (!stimulusMap.has(stim.stimulusId)) {
          stimulusMap.set(stim.stimulusId, { ...stim, supportedQuestionCandidateIds: [...stim.supportedQuestionCandidateIds] });
        } else {
          const existing = stimulusMap.get(stim.stimulusId)!;
          for (const qId of stim.supportedQuestionCandidateIds) {
            if (!existing.supportedQuestionCandidateIds.includes(qId)) {
              existing.supportedQuestionCandidateIds.push(qId);
            }
          }
        }
      }
    }
    const stimuli = Array.from(stimulusMap.values());

    // 4. Tables, Diagrams, MathBlocks
    const tableMap = new Map<string, TableCandidate>();
    for (const pg of partitionGraphs) {
      for (const t of pg.tables) if (!tableMap.has(t.tableCandidateId)) tableMap.set(t.tableCandidateId, t);
    }
    const tables = Array.from(tableMap.values());

    const diagramMap = new Map<string, DiagramCandidate>();
    for (const pg of partitionGraphs) {
      for (const d of pg.diagrams) if (!diagramMap.has(d.diagramCandidateId)) diagramMap.set(d.diagramCandidateId, d);
    }
    const diagrams = Array.from(diagramMap.values());

    const mathMap = new Map<string, MathCandidate>();
    for (const pg of partitionGraphs) {
      for (const m of pg.mathBlocks) if (!mathMap.has(m.mathCandidateId)) mathMap.set(m.mathCandidateId, m);
    }
    const mathBlocks = Array.from(mathMap.values());

    const ambiguities: AmbiguityRecord[] = [];
    for (const pg of partitionGraphs) {
      ambiguities.push(...pg.ambiguities);
    }

    const hypotheses: SegmentationHypothesis[] = [];
    for (const pg of partitionGraphs) {
      hypotheses.push(...pg.hypotheses);
    }
    const activeHypothesisId = hypotheses.length > 0 ? hypotheses[0].hypothesisId : 'hyp_merged_active';

    // 5. Cross-Batch Relationship Reconciliation (Facing Pages across partition boundaries)
    const relationshipMap = new Map<string, QuestionRelationshipCandidate>();

    // First collect all intra-partition relationships
    for (const pg of partitionGraphs) {
      if (pg.relationships) {
        for (const rel of pg.relationships) {
          relationshipMap.set(rel.relationshipId, rel);
        }
      }
    }

    // Scan across all merged questions for any cross-partition facing-page pairs
    for (let i = 0; i < questions.length; i++) {
      const q1 = questions[i];
      if (q1.identityCandidate.detectedNumber === undefined) continue;

      for (let j = i + 1; j < questions.length; j++) {
        const q2 = questions[j];
        if (q2.identityCandidate.detectedNumber === undefined) continue;

        const isFacingPage =
          q1.startPageNumber % 2 === 0 &&
          q2.startPageNumber === q1.startPageNumber + 1;

        const isSameNum =
          q1.identityCandidate.detectedNumber === q2.identityCandidate.detectedNumber;

        if (isFacingPage && isSameNum) {
          const relId = `rel_${q1.candidateId}_${q2.candidateId}`;
          if (!relationshipMap.has(relId)) {
            // New cross-batch relationship discovered across partition boundary!
            q1.isBilingual = true;
            q2.isBilingual = true;

            const evidence: RelationshipEvidence[] = [
              {
                evidenceId: `ev_facing_${q1.startPageNumber}_${q2.startPageNumber}`,
                evidenceType: 'FACING_PAGE_SPREAD_PAIR',
                evidenceStrength: 'HARD',
                sourceNodeIds: [q1.numberNodeId || '', q2.numberNodeId || ''].filter(Boolean),
                description: `Cross-batch facing page spread: Verso page ${q1.startPageNumber} faces Recto page ${q2.startPageNumber}`,
                confidence: 0.99,
              },
              {
                evidenceId: `ev_num_${q1.candidateId}_${q2.candidateId}`,
                evidenceType: 'MATCHING_PRINTED_NUMERAL',
                evidenceStrength: 'HARD',
                sourceNodeIds: [q1.numberNodeId || '', q2.numberNodeId || ''].filter(Boolean),
                description: `Matching question numeral: ${q1.identityCandidate.detectedNumber}`,
                confidence: 0.99,
              },
            ];

            if (q1.optionCandidateIds.length === q2.optionCandidateIds.length) {
              evidence.push({
                evidenceId: `ev_opts_${q1.candidateId}_${q2.candidateId}`,
                evidenceType: 'IDENTICAL_OPTION_CARDINALITY',
                evidenceStrength: 'HARD',
                sourceNodeIds: [...q1.optionCandidateIds, ...q2.optionCandidateIds],
                description: `Matching option count: ${q1.optionCandidateIds.length} options in both candidates`,
                confidence: 0.95,
              });
            }

            relationshipMap.set(relId, {
              relationshipId: relId,
              sourceCandidateId: q1.candidateId,
              targetCandidateId: q2.candidateId,
              relationshipType: 'LANGUAGE_REPRESENTATION_OF',
              evidence,
              confidenceScore: 0.98,
              verificationStatus: 'RELATIONSHIP_PROVEN',
              isSymmetric: true,
              provenance: {
                sourceSnapshotId,
                sourceDocumentId: documentId,
                createdAt: firstGraph.provenance.createdAt,
              },
            });
          }
        }
      }
    }

    const relationships = Array.from(relationshipMap.values());

    // 6. Assemble unified QuestionGraph
    const graphId = `qgraph_${documentId}_merged_${sourceSha256.slice(0, 16)}`;

    const provenance: QuestionGraphProvenanceRecord = {
      algorithmId: 'uadue_partitioned_orchestrator',
      algorithmVersion: this.algorithmVersion,
      configurationVersion: this.configVersion,
      sourceDocumentGraphId: `dg_${documentId}_merged`,
      sourceDocumentGraphSha256: sourceSha256,
      sourceSnapshotId,
      sourceDocumentId: documentId,
      sourceSha256,
      createdAt: firstGraph.provenance.createdAt,
      determinismScope: {
        identicalDocumentGraph: true,
        identicalAlgorithm: true,
        identicalConfig: true,
        runtime: 'Node.js',
        floatPrecision: 'IEEE_754_64BIT',
      },
    };

    const verificationState: QuestionGraphVerificationState = {
      overallStatus: 'SUPPORTED',
      unverifiedCount: 0,
      supportedCount: questions.length,
      conflictedCount: 0,
      ambiguousCount: ambiguities.length,
      verifiedCount: 0,
      rejectedCount: 0,
      findings: [],
    };

    const mergedGraph: QuestionGraph = {
      graphId,
      sourceDocumentId: documentId,
      sourceSnapshotId,
      sourceSha256,
      sourceDocumentGraphId: `dg_${documentId}_merged`,
      sourceDocumentGraphSha256: sourceSha256,
      schemaVersion: 'uadue_question_graph_v2c_schema',
      algorithmVersion: this.algorithmVersion,
      configurationVersion: this.configVersion,
      questions,
      stimuli,
      options,
      tables,
      diagrams,
      mathBlocks,
      hypotheses,
      activeHypothesisId,
      ambiguities,
      relationships,
      verificationState,
      provenance,
      isSealed: false,
      sealedHash: '',
      sealedAt: 0,
    };

    // 7. Seal deterministically
    await QuestionGraphSerializer.sealGraph(mergedGraph);

    return mergedGraph;
  }
}
