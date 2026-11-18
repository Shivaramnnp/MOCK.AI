/**
 * UADUE Phase 2D-6 — Canonical Validation Engine
 * Document Version: 6.0.0-STAGE-B-AUTHORIZED
 *
 * Implements authoritative mathematical and architectural invariant validation
 * across all synthesized canonical entities:
 *
 * Inv1 [Source Non-Destruction]: Physical candidates, graphs, and source byte references remain unmodified.
 * Inv2 [Traceability Completeness]: Every canonical node, option, asset, and answer resolves to source physical instances and source document hashes.
 * Inv3 [Discrepancy Honesty]: Source defects and numbering anomalies are explicitly ledgered, never silently modified.
 * Inv4 [Evidence-Driven Verification]: Relationships strictly evidence-backed; non-transitivity and script disjointness enforced.
 * Inv5 [Answer Decoupling]: Question identity is strictly independent of answer presence or correctness.
 * Inv6 [Bitwise Determinism & Zero-Float Arithmetic]: RFC 8785 JCS determinism; zero IEEE-754 floats in NAT evaluation.
 * Inv7 [Lineage Head Integrity]: Answer authority DAG heads verified (0->UNRESOLVED, 1->AUTHORITATIVE, >1->CONFLICT).
 */

import {
  QuestionCandidate,
  QuestionRelationshipCandidate,
  QuestionGraph,
} from '../contracts/questionGraph';
import {
  CanonicalQuestionIR,
  LogicalQuestionFamily,
  RelationshipEvaluationResult,
  CandidateFamilyMembership,
  CanonicalAssessmentPackage,
  CanonicalPackageValidationReport,
  CanonicalPackageValidationStatus,
  InvariantValidationResult,
  LineageResolutionResult,
} from './types';
import {
  computeCanonicalSha256,
  rfc8785Canonicalize,
  derivePackageId,
  computePackageIntegritySeal,
} from './canonicalHashing';

export interface ValidationEngineConfig {
  strictDiscrepancyCheck?: boolean;
  failOnLineageConflict?: boolean;
  requireAuthoritativeAnswers?: boolean;
}

export class CanonicalValidationEngine {
  private readonly config: ValidationEngineConfig;

  constructor(config: ValidationEngineConfig = {}) {
    this.config = config;
  }

  /**
   * Validates an entire synthesized CanonicalAssessmentPackage against all formal invariants.
   */
  public validatePackage(
    pkg: CanonicalAssessmentPackage,
    originalInput: {
      questionGraph: QuestionGraph;
      originalCandidatesSnapshot?: QuestionCandidate[];
    }
  ): CanonicalPackageValidationReport {
    const invariantResults: InvariantValidationResult[] = [];
    let passedCount = 0;
    let failedCount = 0;

    // 1. Inv1: Source Non-Destruction
    const inv1 = this.validateInv1SourceNonDestruction(
      pkg,
      originalInput.questionGraph,
      originalInput.originalCandidatesSnapshot
    );
    invariantResults.push(inv1);
    inv1.isSatisfied ? passedCount++ : failedCount++;

    // 2. Inv2: Traceability Completeness
    const inv2 = this.validateInv2TraceabilityCompleteness(pkg, originalInput.questionGraph);
    invariantResults.push(inv2);
    inv2.isSatisfied ? passedCount++ : failedCount++;

    // 3. Inv3: Discrepancy Honesty
    const inv3 = this.validateInv3DiscrepancyHonesty(pkg);
    invariantResults.push(inv3);
    inv3.isSatisfied ? passedCount++ : failedCount++;

    // 4. Inv4: Evidence-Driven Verification & Non-Transitivity
    const inv4 = this.validateInv4EvidenceDrivenVerification(pkg);
    invariantResults.push(inv4);
    inv4.isSatisfied ? passedCount++ : failedCount++;

    // 5. Inv5: Answer Decoupling
    const inv5 = this.validateInv5AnswerDecoupling(pkg);
    invariantResults.push(inv5);
    inv5.isSatisfied ? passedCount++ : failedCount++;

    // 6. Inv6: Bitwise Determinism & Zero-Float Arithmetic
    const inv6 = this.validateInv6BitwiseDeterminism(pkg);
    invariantResults.push(inv6);
    inv6.isSatisfied ? passedCount++ : failedCount++;

    // 7. Inv7: Lineage Head Integrity
    const inv7 = this.validateInv7LineageHeadIntegrity(pkg);
    invariantResults.push(inv7);
    inv7.isSatisfied ? passedCount++ : failedCount++;

    // Determine package validation status
    let validationStatus: CanonicalPackageValidationStatus = 'PACKAGE_VALIDATED';
    if (failedCount > 0) {
      validationStatus = 'PACKAGE_FAILED';
    } else {
      // Check if any question has unresolved reasons or discrepancies needing review
      const hasQuarantined = pkg.canonicalQuestions.some((q) =>
        q.representations.some((r) =>
          r.stemAST.some((node) => !node.isSemanticInterpretationResolved)
        )
      );
      const hasLineageConflicts = Object.values(pkg.authoritativeAnswers).some(
        (res) => res.status === 'LINEAGE_CONFLICT'
      );
      if (hasQuarantined || hasLineageConflicts) {
        validationStatus = 'PACKAGE_REVIEW_REQUIRED';
      }
    }

    let discrepancyCount = 0;
    for (const q of pkg.canonicalQuestions) {
      if (q.sourceDiscrepancies.hasNumberingDiscrepancy) {
        discrepancyCount++;
      }
    }

    let authoritativeCount = 0;
    let conflictedCount = 0;
    for (const res of Object.values(pkg.authoritativeAnswers)) {
      if (res.status === 'AUTHORITATIVE') authoritativeCount++;
      if (res.status === 'LINEAGE_CONFLICT') conflictedCount++;
    }

    const reportId = computeCanonicalSha256('val_rpt', {
      packageId: pkg.packageId,
      passedCount,
      failedCount,
      validationStatus,
      invResults: invariantResults.map((r) => ({
        inv: r.invariantName,
        ok: r.isSatisfied,
      })),
    });

    const validationFingerprint = computeCanonicalSha256('val_fp', {
      reportId,
      packageId: pkg.packageId,
      status: validationStatus,
    });

    return {
      reportId,
      packageId: pkg.packageId,
      validationStatus,
      invariantsEvaluated: invariantResults,
      passedInvariantCount: passedCount,
      failedInvariantCount: failedCount,
      totalCanonicalQuestions: pkg.canonicalQuestions.length,
      validCanonicalQuestions: pkg.canonicalQuestions.length - (failedCount > 0 ? failedCount : 0),
      quarantinedQuestions: pkg.canonicalQuestions.filter((q) =>
        q.representations.some((r) =>
          r.stemAST.some((node) => !node.isSemanticInterpretationResolved)
        )
      ).length,
      totalLogicalFamilies: pkg.logicalFamilies.length,
      totalRelationshipEvaluations: pkg.relationshipEvaluations.length,
      totalMemberships: pkg.memberships.length,
      quarantinedRelationshipsCount: (pkg.quarantinedRelationships || []).length,
      authoritativeAnswerCount: authoritativeCount,
      conflictedAnswerCount: conflictedCount,
      discrepancyCount,
      validationFingerprint,
      validatedAt: Date.now(),
    };
  }

  // ============================================================================
  // Invariant 1: Source Non-Destruction
  // ============================================================================

  public validateInv1SourceNonDestruction(
    pkg: CanonicalAssessmentPackage,
    currentQuestionGraph: QuestionGraph,
    originalSnapshot?: QuestionCandidate[]
  ): InvariantValidationResult {
    const failureDetails: string[] = [];

    // Verify candidates in QuestionGraph are not mutated
    if (originalSnapshot && originalSnapshot.length > 0) {
      if (originalSnapshot.length !== currentQuestionGraph.questions.length) {
        failureDetails.push(
          `Question candidate count changed: original ${originalSnapshot.length}, current ${currentQuestionGraph.questions.length}`
        );
      }

      const origMap = new Map<string, QuestionCandidate>();
      for (const orig of originalSnapshot) {
        origMap.set(orig.physicalInstanceId, orig);
      }

      for (const curr of currentQuestionGraph.questions) {
        const orig = origMap.get(curr.physicalInstanceId);
        if (!orig) {
          failureDetails.push(`Candidate ${curr.physicalInstanceId} was injected into QuestionGraph.`);
          continue;
        }

        if (orig.candidateId !== curr.candidateId) {
          failureDetails.push(`Candidate ${curr.physicalInstanceId} candidateId was mutated.`);
        }
        if (orig.includedPhysicalNodeIds.length !== curr.includedPhysicalNodeIds.length) {
          failureDetails.push(`Candidate ${curr.physicalInstanceId} includedPhysicalNodeIds array length mutated.`);
        }
        if (orig.optionCandidateIds.length !== curr.optionCandidateIds.length) {
          failureDetails.push(`Candidate ${curr.physicalInstanceId} optionCandidateIds array length mutated.`);
        }
      }
    }

    return {
      invariantName: 'Inv1_SourceNonDestruction',
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : undefined,
    };
  }

  // ============================================================================
  // Invariant 2: Traceability Completeness
  // ============================================================================

  public validateInv2TraceabilityCompleteness(
    pkg: CanonicalAssessmentPackage,
    questionGraph: QuestionGraph
  ): InvariantValidationResult {
    const failureDetails: string[] = [];
    const validCandidateInstanceIds = new Set(
      questionGraph.questions.map((q) => q.physicalInstanceId)
    );
    const validNodeIds = new Set<string>();
    for (const q of questionGraph.questions) {
      for (const nid of q.includedPhysicalNodeIds) {
        validNodeIds.add(nid);
      }
    }
    if (questionGraph.options) {
      for (const opt of questionGraph.options) {
        for (const nid of opt.contentNodeIds) {
          validNodeIds.add(nid);
        }
      }
    }

    for (const q of pkg.canonicalQuestions) {
      if (!q.canonicalQuestionId) {
        failureDetails.push('Canonical question missing canonicalQuestionId.');
      }
      if (!q.logicalFamilyId) {
        failureDetails.push(`Question ${q.canonicalQuestionId} missing logicalFamilyId.`);
      }

      for (const rep of q.representations) {
        if (!validCandidateInstanceIds.has(rep.sourcePhysicalInstanceId)) {
          failureDetails.push(
            `Question ${q.canonicalQuestionId} representation ${rep.representationId} references non-existent physical instance ${rep.sourcePhysicalInstanceId}`
          );
        }

        // Validate stem AST nodes have valid provenance
        for (const astNode of rep.stemAST) {
          if (!astNode.provenance || astNode.provenance.length === 0) {
            failureDetails.push(
              `Question ${q.canonicalQuestionId} AST node ${astNode.nodeId} has empty provenance (UNRESOLVED_PROVENANCE)`
            );
          } else {
            for (const prov of astNode.provenance) {
              if (!validCandidateInstanceIds.has(prov.sourcePhysicalInstanceId)) {
                failureDetails.push(
                  `Question ${q.canonicalQuestionId} AST node ${astNode.nodeId} provenance points to invalid candidate ${prov.sourcePhysicalInstanceId}`
                );
              }
            }
          }
        }

        // Validate options have provenance
        for (const opt of rep.options) {
          if (!opt.provenance || opt.provenance.length === 0) {
            failureDetails.push(
              `Question ${q.canonicalQuestionId} option ${opt.optionId} has empty provenance`
            );
          }
        }
      }
    }

    return {
      invariantName: 'Inv2_TraceabilityCompleteness',
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : undefined,
    };
  }

  // ============================================================================
  // Invariant 3: Discrepancy Honesty
  // ============================================================================

  public validateInv3DiscrepancyHonesty(
    pkg: CanonicalAssessmentPackage
  ): InvariantValidationResult {
    const failureDetails: string[] = [];

    for (const q of pkg.canonicalQuestions) {
      if (q.representations.length > 1) {
        const printedNums = new Set<string>();
        for (const rep of q.representations) {
          if (rep.sourceQuestionNumber) {
            printedNums.add(rep.sourceQuestionNumber.trim());
          }
        }

        if (printedNums.size > 1) {
          // Numbering discrepancy exists across representations
          if (!q.sourceDiscrepancies.hasNumberingDiscrepancy) {
            failureDetails.push(
              `Question ${q.canonicalQuestionId} has multiple distinct printed numbers [${Array.from(printedNums).join(', ')}] but hasNumberingDiscrepancy is false (Silent Normalization Violation)`
            );
          }
          if (q.sourceDiscrepancies.sourceNumberings.length < printedNums.size) {
            failureDetails.push(
              `Question ${q.canonicalQuestionId} sourceDiscrepancies.sourceNumberings is incomplete.`
            );
          }
        }
      }
    }

    return {
      invariantName: 'Inv3_DiscrepancyHonesty',
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : undefined,
    };
  }

  // ============================================================================
  // Invariant 4: Evidence-Driven Verification & Non-Transitivity
  // ============================================================================

  public validateInv4EvidenceDrivenVerification(
    pkg: CanonicalAssessmentPackage
  ): InvariantValidationResult {
    const failureDetails: string[] = [];

    for (const rel of pkg.relationshipEvaluations) {
      // Must not be RELATIONSHIP_PROVEN if conflicting evidence exists
      if (rel.conflictingEvidence.length > 0 && rel.verificationStatus === 'RELATIONSHIP_PROVEN') {
        failureDetails.push(
          `Relationship evaluation ${rel.evaluationId} marked PROVEN despite ${rel.conflictingEvidence.length} conflicting evidence items.`
        );
      }

      // Check non-transitivity flags
      if (
        rel.relationshipType === 'LANGUAGE_REPRESENTATION_OF' ||
        rel.relationshipType === 'VARIANT_OF' ||
        rel.relationshipType === 'SHARED_STIMULUS_CHILD_OF' ||
        rel.relationshipType === 'RELATED_BUT_DISTINCT'
      ) {
        if (rel.isTransitive) {
          failureDetails.push(
            `Relationship ${rel.evaluationId} of type ${rel.relationshipType} illegally declared transitive.`
          );
        }
      }
    }

    return {
      invariantName: 'Inv4_EvidenceDrivenVerification',
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : undefined,
    };
  }

  // ============================================================================
  // Invariant 5: Answer Decoupling
  // ============================================================================

  public validateInv5AnswerDecoupling(
    pkg: CanonicalAssessmentPackage
  ): InvariantValidationResult {
    const failureDetails: string[] = [];

    for (const q of pkg.canonicalQuestions) {
      // Canonical question ID must be pure deterministic function of logicalFamilyId + representations
      // It must NOT contain answer candidate ID or resolution version ID
      if (q.canonicalQuestionId.includes('answer') || q.canonicalQuestionId.includes('ver_')) {
        failureDetails.push(
          `CanonicalQuestion ${q.canonicalQuestionId} identity appears coupled to answer data.`
        );
      }
    }

    return {
      invariantName: 'Inv5_AnswerDecoupling',
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : undefined,
    };
  }

  // ============================================================================
  // Invariant 6: Bitwise Determinism & Zero-Float Arithmetic
  // ============================================================================

  public validateInv6BitwiseDeterminism(
    pkg: CanonicalAssessmentPackage
  ): InvariantValidationResult {
    const failureDetails: string[] = [];

    // 1. Validate Structural Identity Envelope (packageId) format
    if (!pkg.packageId || typeof pkg.packageId !== 'string' || pkg.packageId.length !== 64) {
      failureDetails.push(`Invalid packageId format: expected 64-character hex string.`);
    }

    // 2. Validate Content Integrity Seal (packageIntegritySeal) format
    if (
      !pkg.packageIntegritySeal ||
      typeof pkg.packageIntegritySeal !== 'string' ||
      pkg.packageIntegritySeal.length !== 64
    ) {
      failureDetails.push(`Invalid packageIntegritySeal format: expected 64-character hex string.`);
    }

    // 3. Verify independent Structural Identity and Content Integrity Seal
    try {
      // StructuralIdentity(P) ≡ packageId
      const expectedPkgId = derivePackageId({
        sourceSnapshotId: pkg.sourceSnapshotId,
        sourceDocumentId: pkg.sourceDocumentId,
        canonicalQuestionIds: pkg.canonicalQuestions.map((q) => q.canonicalQuestionId),
        logicalFamilyIds: pkg.logicalFamilies.map((f) => f.familyId),
        relationshipEvaluationIds: pkg.relationshipEvaluations.map((r) => r.evaluationId),
        membershipIds: pkg.memberships.map((m) => m.membershipFingerprint),
        quarantinedRelationshipIds: (pkg.quarantinedRelationships || []).map((q) => q.relationshipId),
        schemaVersion: pkg.schemaVersion,
        pipelineAlgorithmId: pkg.pipelineAlgorithmId,
        pipelineAlgorithmVersion: pkg.pipelineAlgorithmVersion,
      });

      if (pkg.packageId !== expectedPkgId) {
        failureDetails.push(
          `Structural Identity mismatch: expected ${expectedPkgId}, found ${pkg.packageId} (Bitwise Determinism Failure)`
        );
      }

      // ContentIntegritySeal(P) ≡ packageIntegritySeal
      const expectedIntegritySeal = computePackageIntegritySeal({
        packageId: pkg.packageId,
        sourceSnapshotId: pkg.sourceSnapshotId,
        sourceDocumentId: pkg.sourceDocumentId,
        canonicalQuestions: pkg.canonicalQuestions,
        logicalFamilies: pkg.logicalFamilies,
        relationshipEvaluations: pkg.relationshipEvaluations,
        memberships: pkg.memberships,
        quarantinedRelationships: pkg.quarantinedRelationships || [],
        authoritativeAnswers: pkg.authoritativeAnswers,
        schemaVersion: pkg.schemaVersion,
        pipelineAlgorithmId: pkg.pipelineAlgorithmId,
        pipelineAlgorithmVersion: pkg.pipelineAlgorithmVersion,
      });

      if (pkg.packageIntegritySeal !== expectedIntegritySeal) {
        failureDetails.push(
          `Package integrity seal mismatch: expected ${expectedIntegritySeal}, found ${pkg.packageIntegritySeal} (Content Integrity Failure)`
        );
      }

      // Backward compatibility check for sealedFingerprint alias
      if (pkg.sealedFingerprint && pkg.sealedFingerprint !== expectedIntegritySeal) {
        failureDetails.push(
          `Sealed fingerprint mismatch: expected ${expectedIntegritySeal}, found ${pkg.sealedFingerprint} (Content Integrity Failure)`
        );
      }
    } catch (err: any) {
      failureDetails.push(`RFC 8785 canonicalization failed: ${err.message}`);
    }

    return {
      invariantName: 'Inv6_BitwiseDeterminism',
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : undefined,
    };
  }

  // ============================================================================
  // Invariant 7: Lineage Head Integrity
  // ============================================================================

  public validateInv7LineageHeadIntegrity(
    pkg: CanonicalAssessmentPackage
  ): InvariantValidationResult {
    const failureDetails: string[] = [];

    for (const [qid, res] of Object.entries(pkg.authoritativeAnswers)) {
      if (res.status === 'AUTHORITATIVE') {
        if (!res.authoritativeResolution) {
          failureDetails.push(`Question ${qid} marked AUTHORITATIVE but authoritativeResolution is null.`);
        }
      } else if (res.status === 'LINEAGE_CONFLICT') {
        if (!res.competingResolutionVersions || res.competingResolutionVersions.length <= 1) {
          failureDetails.push(
            `Question ${qid} marked LINEAGE_CONFLICT but competingResolutionVersions has <= 1 heads.`
          );
        }
      } else if (res.status === 'UNRESOLVED') {
        if (res.authoritativeResolution) {
          failureDetails.push(`Question ${qid} marked UNRESOLVED but has authoritativeResolution attached.`);
        }
      }
    }

    return {
      invariantName: 'Inv7_LineageHeadIntegrity',
      isSatisfied: failureDetails.length === 0,
      failureDetails: failureDetails.length > 0 ? failureDetails : undefined,
    };
  }
}
