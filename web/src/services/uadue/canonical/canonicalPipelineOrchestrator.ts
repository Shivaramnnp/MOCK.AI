/**
 * UADUE Phase 2D-6 — Canonical Pipeline Orchestrator
 * Document Version: 6.0.0-STAGE-B-AUTHORIZED
 *
 * Implements end-to-end orchestration of the canonical understanding pipeline:
 * QuestionGraph (Layer 3)
 *   ↓
 * Stage 1: Batch Relationship Evaluation (Phase 2D-1)
 *   ↓
 * Stage 2: Batch Candidate Family Membership Evaluation (Phase 2D-2)
 *   ↓
 * Stage 3: Logical Question Family Construction (Phase 2D-3)
 *   ↓
 * Stage 4: Canonical Question IR Transformation (Phase 2D-4)
 *   ↓
 * Stage 5: Answer Authority Resolution & Candidate Linking (Phase 2D-5)
 *   ↓
 * Stage 6: Package Sealing & Cryptographic Hash Generation (Phase 2D-6)
 *   ↓
 * Stage 7: Formal Invariant Validation Suite (Phase 2D-6)
 *
 * Inviolable Architectural Invariants:
 * 1. Zero input mutation: QuestionGraph and candidates remain strictly immutable.
 * 2. 100% Bitwise replay determinism: independent of input array ordering or system timestamps.
 * 3. Complete traceability: every canonical element resolves to physical nodes and source hash.
 * 4. Dual language representation preservation: neither English nor Hindi is silently dropped.
 * 5. Decoupled answer authority: question identity is independent of answer presence or correctness.
 * 6. Lineage head conflict handling: multi-head conflicts fail closed without version-number heuristics.
 * 7. Zero exam-specific heuristics or branches.
 */

import {
  QuestionGraph,
  QuestionCandidate,
  QuestionRelationshipCandidate,
} from '../contracts/questionGraph';
import {
  CanonicalAssessmentPackage,
  CanonicalPipelineExecutionInput,
  CanonicalPipelineExecutionResult,
  CanonicalQuestionIR,
  LogicalQuestionFamily,
  RelationshipEvaluationResult,
  CandidateFamilyMembership,
  LineageResolutionResult,
  AnswerAuthorityResolutionVersion,
  ConflictResolutionEvent,
  CanonicalPackageValidationReport,
  QuarantinedRelationshipRecord,
} from './types';
import { RelationshipEvaluationEngine } from './relationshipEvaluationEngine';
import { CandidateFamilyMembershipEvaluator } from './candidateFamilyMembershipEvaluator';
import { LogicalFamilySynthesizer } from './logicalFamilySynthesizer';
import { CanonicalQuestionSynthesizer } from './canonicalQuestionSynthesizer';
import { evaluateLineageHead } from './answerAuthorityResolver';
import { CanonicalValidationEngine } from './canonicalValidationEngine';
import { computeCanonicalSha256, derivePackageId, computePackageIntegritySeal } from './canonicalHashing';

export const DEFAULT_PIPELINE_ALGORITHM_ID = 'uadue_canonical_pipeline_orchestrator_v6';
export const DEFAULT_PIPELINE_ALGORITHM_VERSION = '6.0.0';
export const DEFAULT_SCHEMA_VERSION = 'uadue-canonical-package-v6.0.0';

export const MAX_CANDIDATES_PER_PACKAGE = 5000;
export const MAX_RELATIONSHIPS_PER_PACKAGE = 25000;

export class CanonicalPipelineOrchestrator {
  private readonly algorithmId: string;
  private readonly algorithmVersion: string;
  private readonly schemaVersion: string;
  private readonly relEngine: RelationshipEvaluationEngine;
  private readonly membershipEvaluator: CandidateFamilyMembershipEvaluator;
  private readonly familySynthesizer: LogicalFamilySynthesizer;
  private readonly canonicalSynthesizer: CanonicalQuestionSynthesizer;
  private readonly validationEngine: CanonicalValidationEngine;

  constructor(
    algorithmId = DEFAULT_PIPELINE_ALGORITHM_ID,
    algorithmVersion = DEFAULT_PIPELINE_ALGORITHM_VERSION,
    schemaVersion = DEFAULT_SCHEMA_VERSION
  ) {
    this.algorithmId = algorithmId;
    this.algorithmVersion = algorithmVersion;
    this.schemaVersion = schemaVersion;
    this.relEngine = new RelationshipEvaluationEngine(algorithmId, algorithmVersion);
    this.membershipEvaluator = new CandidateFamilyMembershipEvaluator(algorithmId, algorithmVersion);
    this.familySynthesizer = new LogicalFamilySynthesizer(algorithmId, algorithmVersion);
    this.canonicalSynthesizer = new CanonicalQuestionSynthesizer(
      algorithmId,
      algorithmVersion,
      schemaVersion
    );
    this.validationEngine = new CanonicalValidationEngine();
  }

  /**
   * Executes the full canonical ingestion and validation pipeline.
   * Pure function: Does NOT mutate input questionGraph, candidates, or relationships.
   */
  public executePipeline(input: CanonicalPipelineExecutionInput): CanonicalPipelineExecutionResult {
    const executionErrors: string[] = [];
    const executionWarnings: string[] = [];

    // 0. Basic Input Validation & Resource Guards
    if (!input || !input.questionGraph) {
      executionErrors.push('Missing mandatory input: questionGraph is undefined.');
      return this.createFailureResult(executionErrors, executionWarnings);
    }

    const { questionGraph } = input;
    const candidates = questionGraph.questions || [];
    const relationships = questionGraph.relationships || [];

    if (candidates.length > MAX_CANDIDATES_PER_PACKAGE) {
      executionErrors.push(
        `Candidate count ${candidates.length} exceeds MAX_CANDIDATES_PER_PACKAGE (${MAX_CANDIDATES_PER_PACKAGE}) (Resource Limit Guard)`
      );
      return this.createFailureResult(executionErrors, executionWarnings);
    }

    if (relationships.length > MAX_RELATIONSHIPS_PER_PACKAGE) {
      executionErrors.push(
        `Relationship count ${relationships.length} exceeds MAX_RELATIONSHIPS_PER_PACKAGE (${MAX_RELATIONSHIPS_PER_PACKAGE}) (Resource Limit Guard)`
      );
      return this.createFailureResult(executionErrors, executionWarnings);
    }

    // Snapshot original candidates for immutability invariant verification
    const originalCandidatesSnapshot = candidates.map((c) => ({ ...c }));

    // Deduplicate working candidate set strictly by physicalInstanceId (NEVER by text content or question number)
    const uniqueCandidatesMap = new Map<string, QuestionCandidate>();
    for (const c of candidates) {
      if (!uniqueCandidatesMap.has(c.physicalInstanceId)) {
        uniqueCandidatesMap.set(c.physicalInstanceId, c);
      }
    }
    const deduplicatedCandidates = Array.from(uniqueCandidatesMap.values());

    // Canonical Sort: candidates sorted deterministically by candidateId, tie-breaking on physicalInstanceId
    const sortedCandidates = deduplicatedCandidates.sort((a, b) => {
      const cmp = a.candidateId.localeCompare(b.candidateId);
      return cmp !== 0 ? cmp : a.physicalInstanceId.localeCompare(b.physicalInstanceId);
    });

    // Build fast lookup maps
    const candIdMap = new Map<string, QuestionCandidate>();
    const candPhysMap = new Map<string, QuestionCandidate>();
    for (const c of sortedCandidates) {
      candIdMap.set(c.candidateId, c);
      candPhysMap.set(c.physicalInstanceId, c);
    }

    // ========================================================================
    // Stage 1: Batch Relationship Evaluation (Phase 2D-1)
    // ========================================================================
    const relationshipEvaluations: RelationshipEvaluationResult[] = [];
    const quarantinedRelationships: QuarantinedRelationshipRecord[] = [];

    // Sort relationships deterministically by relationshipId
    const sortedRelationships = [...relationships].sort((a, b) =>
      a.relationshipId.localeCompare(b.relationshipId)
    );

    for (const rel of sortedRelationships) {
      const sourceCandidate =
        candIdMap.get(rel.sourceCandidateId) || candPhysMap.get(rel.sourceCandidateId);
      const targetCandidate =
        candIdMap.get(rel.targetCandidateId) || candPhysMap.get(rel.targetCandidateId);

      if (!sourceCandidate || !targetCandidate) {
        let quarantineReason: QuarantinedRelationshipRecord['quarantineReason'] =
          'INVALID_RELATIONSHIP_STRUCTURE';
        if (!sourceCandidate && !targetCandidate) {
          quarantineReason = 'DANGLING_BOTH_CANDIDATES';
        } else if (!sourceCandidate) {
          quarantineReason = 'DANGLING_SOURCE_CANDIDATE';
        } else {
          quarantineReason = 'DANGLING_TARGET_CANDIDATE';
        }

        quarantinedRelationships.push({
          relationshipId: rel.relationshipId,
          sourceCandidateId: rel.sourceCandidateId,
          targetCandidateId: rel.targetCandidateId,
          relationshipType: rel.relationshipType,
          quarantineReason,
          quarantinedAt: 0, // Deterministic epoch
        });

        executionWarnings.push(
          `Relationship ${rel.relationshipId} quarantined (${quarantineReason}): source=${rel.sourceCandidateId}, target=${rel.targetCandidateId}`
        );
        continue;
      }

      const evalResult = this.relEngine.evaluateRelationship({
        relationship: rel,
        sourceCandidate,
        targetCandidate,
      });
      relationshipEvaluations.push(evalResult);
    }

    // Sort evaluations and quarantined relationships deterministically
    relationshipEvaluations.sort((a, b) => a.evaluationId.localeCompare(b.evaluationId));
    quarantinedRelationships.sort((a, b) => a.relationshipId.localeCompare(b.relationshipId));

    // ========================================================================
    // Stage 2: Batch Candidate Family Membership Evaluation (Phase 2D-2)
    // ========================================================================
    const acceptedMemberships: CandidateFamilyMembership[] = [];

    // Filter proven, eligible relationships
    const eligibleEvaluations = relationshipEvaluations.filter(
      (e) => e.isEligibleForFamilySynthesis && e.verificationStatus === 'RELATIONSHIP_PROVEN'
    );

    for (const evalResult of eligibleEvaluations) {
      const candidate = candPhysMap.get(evalResult.sourcePhysicalInstanceId);
      const familyTargetCandidate = candPhysMap.get(evalResult.targetPhysicalInstanceId);

      if (!candidate || !familyTargetCandidate) {
        continue;
      }

      // Propose source candidate as member of familyTargetCandidate
      const memberResult = this.membershipEvaluator.evaluateMembership({
        candidate,
        familyTargetCandidate,
        directRelationshipEvaluation: evalResult,
      });

      if (memberResult.isAccepted && memberResult.membership) {
        acceptedMemberships.push(memberResult.membership);
      }

      // If relationship is symmetric, also evaluate reciprocal membership
      if (evalResult.isSymmetric) {
        const reciprocalResult = this.membershipEvaluator.evaluateMembership({
          candidate: familyTargetCandidate,
          familyTargetCandidate: candidate,
          directRelationshipEvaluation: evalResult,
        });

        if (reciprocalResult.isAccepted && reciprocalResult.membership) {
          acceptedMemberships.push(reciprocalResult.membership);
        }
      }
    }

    // Deduplicate and sort memberships deterministically by membershipFingerprint
    const uniqueMembershipsMap = new Map<string, CandidateFamilyMembership>();
    for (const m of acceptedMemberships) {
      uniqueMembershipsMap.set(m.membershipFingerprint, m);
    }
    const finalMemberships = Array.from(uniqueMembershipsMap.values()).sort((a, b) =>
      a.membershipFingerprint.localeCompare(b.membershipFingerprint)
    );

    // ========================================================================
    // Stage 3: Logical Question Family Construction (Phase 2D-3)
    // ========================================================================
    const logicalFamilies: LogicalQuestionFamily[] = [];
    const groupedAnchorIds = new Set<string>();

    for (const m of finalMemberships) {
      if (m.familyCandidateId) {
        groupedAnchorIds.add(m.familyCandidateId);
      }
    }

    // Synthesize multi-candidate families for recognized anchors
    const sortedAnchorIds = Array.from(groupedAnchorIds).sort();
    const candidateIdsInFamilies = new Set<string>();

    for (const anchorId of sortedAnchorIds) {
      const anchorCandidate = candIdMap.get(anchorId);
      if (!anchorCandidate) {
        continue;
      }

      // Avoid creating duplicate mirror family if anchor was already absorbed into a previously synthesized family
      if (candidateIdsInFamilies.has(anchorCandidate.physicalInstanceId)) {
        continue;
      }

      const familyResult = this.familySynthesizer.synthesizeFamily({
        anchorCandidate,
        acceptedMemberships: finalMemberships,
        allCandidates: sortedCandidates,
      });

      if (familyResult.isSynthesized && familyResult.family) {
        logicalFamilies.push(familyResult.family);
        for (const member of familyResult.family.members) {
          candidateIdsInFamilies.add(member.candidatePhysicalInstanceId);
        }
      }
    }

    // Synthesize singleton families for standalone candidates not included in any multi-candidate family
    for (const cand of sortedCandidates) {
      if (!candidateIdsInFamilies.has(cand.physicalInstanceId)) {
        const singletonResult = this.familySynthesizer.synthesizeFamily({
          anchorCandidate: cand,
          acceptedMemberships: [],
          allCandidates: sortedCandidates,
        });

        if (singletonResult.isSynthesized && singletonResult.family) {
          logicalFamilies.push(singletonResult.family);
          candidateIdsInFamilies.add(cand.physicalInstanceId);
        }
      }
    }

    // Sort logical families deterministically by familyId
    logicalFamilies.sort((a, b) => a.familyId.localeCompare(b.familyId));

    // ========================================================================
    // Stage 4: Canonical Question IR Transformation (Phase 2D-4)
    // ========================================================================
    const canonicalQuestions: CanonicalQuestionIR[] = [];

    for (const family of logicalFamilies) {
      const irResult = this.canonicalSynthesizer.synthesizeCanonicalQuestion({
        family,
        candidates: sortedCandidates,
      });

      if (irResult.isCanonicalized && irResult.canonicalQuestion) {
        canonicalQuestions.push(irResult.canonicalQuestion);
      } else {
        executionWarnings.push(
          `Family ${family.familyId} canonicalization rejected: ${irResult.rejectionReasons.join('; ')}`
        );
      }
    }

    // Sort canonical questions deterministically by canonicalQuestionId
    canonicalQuestions.sort((a, b) => a.canonicalQuestionId.localeCompare(b.canonicalQuestionId));

    // ========================================================================
    // Stage 5: Answer Authority Resolution & Candidate Linking (Phase 2D-5)
    // ========================================================================
    const authoritativeAnswers: Record<string, LineageResolutionResult> = {};
    const resolutionVersions = input.resolutionVersions || [];
    const conflictEvents = input.conflictResolutionEvents || [];

    for (const q of canonicalQuestions) {
      const qVersions = resolutionVersions.filter(
        (v) => v.canonicalQuestionId === q.canonicalQuestionId
      );

      if (qVersions.length > 0) {
        authoritativeAnswers[q.canonicalQuestionId] = evaluateLineageHead(
          q.canonicalQuestionId,
          qVersions,
          conflictEvents
        );
      } else {
        // No answer authority records provided for this question: defaults strictly to UNRESOLVED
        authoritativeAnswers[q.canonicalQuestionId] = {
          status: 'UNRESOLVED',
        };
      }
    }

    // ========================================================================
    // Stage 6: Canonical Package Sealing & Cryptographic Hash
    // ========================================================================
    const sourceSnapshotId =
      questionGraph.sourceSnapshotId || questionGraph.provenance?.sourceSnapshotId || 'snapshot_unknown';
    const sourceDocumentId =
      questionGraph.sourceDocumentId || questionGraph.provenance?.sourceDocumentId || 'doc_unknown';
    const pipelineAlgorithmId = input.algorithmId || this.algorithmId;
    const pipelineAlgorithmVersion = input.algorithmVersion || this.algorithmVersion;
    const schemaVersion = input.schemaVersion || this.schemaVersion;

    const packageId = derivePackageId({
      sourceSnapshotId,
      sourceDocumentId,
      canonicalQuestionIds: canonicalQuestions.map((q) => q.canonicalQuestionId),
      logicalFamilyIds: logicalFamilies.map((f) => f.familyId),
      relationshipEvaluationIds: relationshipEvaluations.map((r) => r.evaluationId),
      membershipIds: finalMemberships.map((m) => m.membershipFingerprint),
      quarantinedRelationshipIds: quarantinedRelationships.map((q) => q.relationshipId),
      schemaVersion,
      pipelineAlgorithmId,
      pipelineAlgorithmVersion,
    });

    const packageIntegritySeal = computePackageIntegritySeal({
      packageId,
      sourceSnapshotId,
      sourceDocumentId,
      canonicalQuestions,
      logicalFamilies,
      relationshipEvaluations,
      memberships: finalMemberships,
      quarantinedRelationships,
      authoritativeAnswers,
      schemaVersion,
      pipelineAlgorithmId,
      pipelineAlgorithmVersion,
    });

    const preliminaryPackage: CanonicalAssessmentPackage = {
      packageId,
      sourceSnapshotId,
      sourceDocumentId,
      schemaVersion,
      pipelineAlgorithmId,
      pipelineAlgorithmVersion,
      canonicalQuestions,
      logicalFamilies,
      relationshipEvaluations,
      memberships: finalMemberships,
      quarantinedRelationships,
      authoritativeAnswers,
      validationReport: {} as CanonicalPackageValidationReport, // filled in Stage 7
      packageIntegritySeal,
      sealedFingerprint: packageIntegritySeal,
      sealedAt: 0, // Deterministic epoch
    };

    // ========================================================================
    // Stage 7: Invariant Validation Suite (Phase 2D-6)
    // ========================================================================
    const validationReport = this.validationEngine.validatePackage(preliminaryPackage, {
      questionGraph,
      originalCandidatesSnapshot,
    });

    preliminaryPackage.validationReport = validationReport;

    let isSuccess = true;
    if (input.strictValidation && validationReport.validationStatus === 'PACKAGE_FAILED') {
      isSuccess = false;
      executionErrors.push(
        `Package invariant validation failed with ${validationReport.failedInvariantCount} failed invariants.`
      );
    }

    return {
      isSuccess,
      package: preliminaryPackage,
      validationReport,
      executionErrors,
      executionWarnings,
    };
  }

  private createFailureResult(
    errors: string[],
    warnings: string[]
  ): CanonicalPipelineExecutionResult {
    const reportId = computeCanonicalSha256('val_rpt_fail', { errors });
    return {
      isSuccess: false,
      validationReport: {
        reportId,
        packageId: 'none',
        validationStatus: 'PACKAGE_FAILED',
        invariantsEvaluated: [],
        passedInvariantCount: 0,
        failedInvariantCount: errors.length,
        totalCanonicalQuestions: 0,
        validCanonicalQuestions: 0,
        quarantinedQuestions: 0,
        totalLogicalFamilies: 0,
        totalRelationshipEvaluations: 0,
        totalMemberships: 0,
        quarantinedRelationshipsCount: 0,
        authoritativeAnswerCount: 0,
        conflictedAnswerCount: 0,
        discrepancyCount: 0,
        validationFingerprint: 'none',
        validatedAt: 0,
      },
      executionErrors: errors,
      executionWarnings: warnings,
    };
  }
}
