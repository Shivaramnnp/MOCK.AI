/**
 * UADUE Phase 2D-8 — Real PostgreSQL Performance Benchmark & Latency Profiler
 * Document Version: 8.0.0-POSTGRES-BENCHMARK
 *
 * Measures:
 * - Package Persistence Latency (p50, p95, max)
 * - Package Reconstruction Latency (p50, p95, max)
 * - Transactional Publication Latency (p50, p95, max)
 * - Publication Contention Throughput (ops/sec under lock contention)
 * - Cryptographic Dual-Seal Recomputation Latency
 */

import { Pool } from 'pg';
import { CanonicalPostgresPersistenceAdapter } from './canonicalPostgresPersistenceAdapter';
import { CanonicalPipelineOrchestrator } from './canonicalPipelineOrchestrator';
import { derivePackageId, computePackageIntegritySeal } from './canonicalHashing';
import { QuestionCandidate, QuestionGraph } from '../contracts/questionGraph';

export interface BenchmarkMetrics {
  persistLatencyP50Ms: number;
  persistLatencyP95Ms: number;
  persistLatencyMaxMs: number;
  reconstructLatencyP50Ms: number;
  reconstructLatencyP95Ms: number;
  reconstructLatencyMaxMs: number;
  publicationLatencyP50Ms: number;
  publicationLatencyP95Ms: number;
  contentionThroughputOpsPerSec: number;
  dualSealVerificationLatencyP50Ms: number;
}

export async function runPostgresBenchmark(iterations = 30): Promise<BenchmarkMetrics> {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'mockai_uadue_test',
    user: process.env.USER || 'postgres',
    max: 20,
  });

  const adapter = new CanonicalPostgresPersistenceAdapter(pool);
  const orchestrator = new CanonicalPipelineOrchestrator();

  const createCandidate = (candidateId: string, physicalInstanceId: string): QuestionCandidate => ({
    candidateId,
    physicalInstanceId,
    candidateDisplayOrder: 1,
    sourceOrder: 1,
    startPageNumber: 1,
    endPageNumber: 1,
    isMultiPage: false,
    identityCandidate: {
      physicalInstanceId,
      numberType: 'QUESTION_NUMBER',
      confidence: 1.0,
      supportingEvidenceIds: [],
    },
    includedPhysicalNodeIds: [`node_${candidateId}`],
    stemNodeIds: [`node_${candidateId}`],
    bodyNodeIds: [],
    optionCandidateIds: [`opt_${candidateId}_1`, `opt_${candidateId}_2`],
    stimulusRefIds: [],
    tableCandidateIds: [],
    diagramCandidateIds: [],
    mathCandidateIds: [],
    codeCandidateIds: [],
    observationState: 'OBSERVED',
    verificationStatus: 'SUPPORTED',
    confidenceScore: 0.95,
    evidenceList: [],
    unresolvedAmbiguityIds: [],
    languageRepresentations: [
      {
        languageScript: 'LATIN',
        pageNumber: 1,
        stemNodeIds: [`node_${candidateId}`],
        bodyNodeIds: [],
        optionCandidateIds: [`opt_${candidateId}_1`, `opt_${candidateId}_2`],
      },
    ],
  });

  const createQuestionGraph = (id: string, questions: QuestionCandidate[]): QuestionGraph =>
    ({
    graphId: `qgraph_bench_${id}`,
    sourceDocumentId: `doc_bench_${id}`,
    sourceSnapshotId: `snap_bench_${id}`,
    sourceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sourceDocumentGraphId: `docgraph_bench_${id}`,
    sourceDocumentGraphSha256: 'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    schemaVersion: 'uadue-qg-v3',
    algorithmVersion: '3.0.0',
    configurationVersion: '1.0.0',
    questions,
    stimuli: [],
    options: [
      {
        optionCandidateId: `opt_${questions[0]?.candidateId || '1'}_1`,
        contentNodeIds: ['node_opt_1'],
        candidateOwners: [],
        isMultiColumnOption: false,
        hasVisualAsset: false,
        hasMathematics: false,
        observationState: 'OBSERVED',
        verificationStatus: 'SUPPORTED',
        confidenceScore: 1.0,
        supportingEvidenceIds: [],
      },
    ],
    tables: [],
    diagrams: [],
    mathBlocks: [],
    hypotheses: [],
    activeHypothesisId: 'hyp_1',
    ambiguities: [],
    relationships: [],
    verificationState: {
      overallStatus: 'VERIFIED',
      unverifiedCount: 0,
      supportedCount: 1,
      conflictedCount: 0,
      ambiguousCount: 0,
      verifiedCount: 1,
      rejectedCount: 0,
      findings: [],
    },
  } as unknown as QuestionGraph);

  const persistTimes: number[] = [];
  const reconstructTimes: number[] = [];
  const publicationTimes: number[] = [];
  const sealTimes: number[] = [];

  try {
    for (let i = 0; i < iterations; i++) {
      const q = createCandidate(`c_bench_${i}`, `inst_bench_${i}`);
      const qgraph = createQuestionGraph(`b_${i}`, [q]);
      const pkg = orchestrator.executePipeline({ questionGraph: qgraph, strictValidation: true }).package!;

      // 1. Measure Persistence
      const t0 = performance.now();
      await adapter.persistPackage(pkg);
      const t1 = performance.now();
      persistTimes.push(t1 - t0);

      // 2. Measure Reconstruction
      const t2 = performance.now();
      const reconstructed = await adapter.reconstructPackage(pkg.packageId);
      const t3 = performance.now();
      reconstructTimes.push(t3 - t2);

      // 3. Measure Dual Seal Recomputation
      const t4 = performance.now();
      derivePackageId({
        sourceSnapshotId: reconstructed.sourceSnapshotId,
        sourceDocumentId: reconstructed.sourceDocumentId,
        canonicalQuestionIds: reconstructed.canonicalQuestions.map((q) => q.canonicalQuestionId),
        logicalFamilyIds: reconstructed.logicalFamilies.map((f) => f.familyId),
        relationshipEvaluationIds: reconstructed.relationshipEvaluations.map((e) => e.evaluationId),
        membershipIds: reconstructed.memberships.map((m) => m.membershipFingerprint),
        quarantinedRelationshipIds: reconstructed.quarantinedRelationships.map((r) => r.relationshipId),
        schemaVersion: reconstructed.schemaVersion,
        pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
        pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion,
      });
      computePackageIntegritySeal({
        packageId: reconstructed.packageId,
        sourceSnapshotId: reconstructed.sourceSnapshotId,
        sourceDocumentId: reconstructed.sourceDocumentId,
        canonicalQuestions: reconstructed.canonicalQuestions,
        logicalFamilies: reconstructed.logicalFamilies,
        relationshipEvaluations: reconstructed.relationshipEvaluations,
        memberships: reconstructed.memberships,
        quarantinedRelationships: reconstructed.quarantinedRelationships,
        authoritativeAnswers: reconstructed.authoritativeAnswers,
        schemaVersion: reconstructed.schemaVersion,
        pipelineAlgorithmId: reconstructed.pipelineAlgorithmId,
        pipelineAlgorithmVersion: reconstructed.pipelineAlgorithmVersion,
      });
      const t5 = performance.now();
      sealTimes.push(t5 - t4);

      // 4. Measure Publication
      const t6 = performance.now();
      await adapter.publishPackage({
        packageId: pkg.packageId,
        packageIntegritySeal: pkg.packageIntegritySeal,
        publicationAuthorityId: `BENCH_AUTHORITY_${i}`,
        targetScope: 'GLOBAL',
      });
      const t7 = performance.now();
      publicationTimes.push(t7 - t6);
    }

    // Measure Contention Throughput: 50 concurrent requests on a single package
    const benchQ = createCandidate('c_contention', 'inst_contention');
    const benchPkg = orchestrator.executePipeline({ questionGraph: createQuestionGraph('contention', [benchQ]), strictValidation: true }).package!;
    await adapter.persistPackage(benchPkg);

    const contentionStart = performance.now();
    await Promise.all(
      Array.from({ length: 50 }, () =>
        adapter.publishPackage({
          packageId: benchPkg.packageId,
          packageIntegritySeal: benchPkg.packageIntegritySeal,
          publicationAuthorityId: 'CONTENTION_BOARD',
          targetScope: 'STUDENT_ALL_INDIA',
        })
      )
    );
    const contentionEnd = performance.now();
    const contentionDurationSec = (contentionEnd - contentionStart) / 1000;
    const contentionThroughputOpsPerSec = 50 / contentionDurationSec;

    const calcPercentile = (arr: number[], p: number) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
      return sorted[idx];
    };

    return {
      persistLatencyP50Ms: Number(calcPercentile(persistTimes, 50).toFixed(2)),
      persistLatencyP95Ms: Number(calcPercentile(persistTimes, 95).toFixed(2)),
      persistLatencyMaxMs: Number(Math.max(...persistTimes).toFixed(2)),
      reconstructLatencyP50Ms: Number(calcPercentile(reconstructTimes, 50).toFixed(2)),
      reconstructLatencyP95Ms: Number(calcPercentile(reconstructTimes, 95).toFixed(2)),
      reconstructLatencyMaxMs: Number(Math.max(...reconstructTimes).toFixed(2)),
      publicationLatencyP50Ms: Number(calcPercentile(publicationTimes, 50).toFixed(2)),
      publicationLatencyP95Ms: Number(calcPercentile(publicationTimes, 95).toFixed(2)),
      contentionThroughputOpsPerSec: Number(contentionThroughputOpsPerSec.toFixed(1)),
      dualSealVerificationLatencyP50Ms: Number(calcPercentile(sealTimes, 50).toFixed(3)),
    };
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('canonicalPostgresBenchmark.ts') || process.argv[1]?.endsWith('canonicalPostgresBenchmark.mjs')) {
  runPostgresBenchmark(20).then((res) => {
    process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  }).catch((err) => {
    process.stderr.write(String(err) + '\n');
    process.exit(1);
  });
}
