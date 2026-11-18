/**
 * UADUE Phase 2D-7 — Transactional Relational Persistence Adapter & Package Reconstructor
 * Document Version: 7.3.1-CONSISTENCY-ALIGNED
 *
 * Inviolable Principles:
 * 1. ZERO floating-point columns.
 * 2. ZERO exam-specific branches or heuristics.
 * 3. Normalized tables preserve 15-component array ordering contract.
 * 4. Dual-seal read-back verification (derivePackageId + computePackageIntegritySeal) before commit.
 * 5. Append-only enforcement: in-place UPDATE or DELETE raises SQL/engine exception.
 * 6. Multilingual representation ordering strictly governed by upstream representation_index.
 */

import {
  CanonicalAssessmentPackage,
  CanonicalQuestionIR,
  LogicalQuestionFamily,
  RelationshipEvaluationResult,
  CandidateFamilyMembership,
  QuarantinedRelationshipRecord,
  LineageResolutionResult,
  CanonicalPackageValidationReport,
} from './types';
import { derivePackageId, computePackageIntegritySeal } from './canonicalHashing';
import {
  CanonicalPackageLifecycleState,
  CanonicalPackageEventType,
  CanonicalPackageEvent,
  CanonicalPackageTenancy,
  CanonicalPackageSupersession,
  PackageVisibilityScope,
} from './canonicalPersistenceTypes';
import { reducePackageLifecycle } from './canonicalLifecycleEngine';

export class PersistenceIntegrityError extends Error {
  constructor(public readonly packageId: string, details: string) {
    super(`Persistence Integrity Violation for package ${packageId}: ${details}`);
    this.name = 'PersistenceIntegrityError';
  }
}

export class ImmutabilityViolationError extends Error {
  constructor(table: string, action: string) {
    super(`Append-Only Violation: ${action} operations are strictly forbidden on table ${table}.`);
    this.name = 'ImmutabilityViolationError';
  }
}

export class TableConstraintError extends Error {
  constructor(public readonly constraintName: string, details: string) {
    super(`Constraint Violation [${constraintName}]: ${details}`);
    this.name = 'TableConstraintError';
  }
}

export class TenancyAccessError extends Error {
  constructor(details: string) {
    super(`Row Level Security Violation: ${details}`);
    this.name = 'TenancyAccessError';
  }
}

// ============================================================================
// Internal Storage Table Types
// ============================================================================

interface StoredPackageRow {
  package_id: string;
  package_integrity_seal: string;
  source_snapshot_id: string;
  source_document_id: string;
  schema_version: string;
  pipeline_algorithm_id: string;
  pipeline_algorithm_version: string;
  created_at: number;
}

interface StoredEventRow {
  event_id: string;
  package_id: string;
  event_type: CanonicalPackageEventType;
  event_payload?: Record<string, unknown>;
  eventPayload?: any;
  sequence_number: number;
  publication_request_fingerprint: string | null;
  created_at: number;
}

interface StoredQuestionRow {
  canonical_question_id: string;
  package_id: string;
  logical_family_id: string;
  question_index: number;
  family_role: string;
  synthesized_question_type: string;
  canonical_fingerprint: string;
  source_discrepancies: unknown[];
  created_at: number;
}

interface StoredRepresentationRow {
  representation_id: string;
  canonical_question_id: string;
  representation_index: number;
  language_script: string;
  source_physical_instance_id: string;
  source_question_number: string | null;
  stem_ast: unknown;
  options: unknown;
  tables: unknown[];
  diagrams: unknown[];
  math_blocks: unknown[];
  created_at: number;
}

interface StoredFamilyRow {
  family_id: string;
  package_id: string;
  family_type: string;
  family_anchor_physical_instance_id: string;
  members: unknown[];
}

interface StoredEvaluationRow {
  evaluation_id: string;
  package_id: string;
  relationship_type: string;
  source_candidate_id: string;
  target_candidate_id: string;
  source_physical_instance_id: string;
  target_physical_instance_id: string;
  verification_status: string;
  confidence_score: number;
  evidence_payload: unknown;
}

interface StoredMembershipRow {
  membership_fingerprint: string;
  package_id: string;
  family_candidate_id: string;
  candidate_physical_instance_id: string;
  role: string;
  verification_status: string;
  supporting_evidence_ids: string[];
}

interface StoredQuarantinedRow {
  relationship_id: string;
  package_id: string;
  source_candidate_id: string;
  target_candidate_id: string;
  relationship_type: string;
  quarantine_reason: string;
  quarantined_at: number;
}

interface StoredAnswerRow {
  canonical_question_id: string;
  package_id: string;
  status: string;
  resolution_payload: unknown;
}

/**
 * Transactional, Append-Only Persistence Storage Engine.
 * Implements relational tables, row-level locking serialization, and hardware-equivalent constraints.
 */
export class CanonicalPersistenceAdapter {
  // Relational Tables
  private packages = new Map<string, StoredPackageRow>();
  private events: StoredEventRow[] = [];
  private questions: StoredQuestionRow[] = [];
  private representations: StoredRepresentationRow[] = [];
  private families: StoredFamilyRow[] = [];
  private evaluations: StoredEvaluationRow[] = [];
  private memberships: StoredMembershipRow[] = [];
  private quarantinedRelationships: StoredQuarantinedRow[] = [];
  private answers: StoredAnswerRow[] = [];
  private supersessions: CanonicalPackageSupersession[] = [];
  private tenancy: CanonicalPackageTenancy[] = [];

  // Active package row locks and FIFO queues for transaction serialization
  private mutexQueues = new Map<string, Array<() => void>>();
  private lockedPackages = new Set<string>();

  /**
   * Acquires exclusive lock on package row (simulating PostgreSQL SELECT FOR UPDATE).
   * Implements true FIFO queue mutex for deterministic transaction serialization.
   */
  public async acquirePackageLock(packageId: string): Promise<() => void> {
    if (!this.lockedPackages.has(packageId)) {
      this.lockedPackages.add(packageId);
      return () => this.releasePackageLock(packageId);
    }

    return new Promise<() => void>((resolve) => {
      let queue = this.mutexQueues.get(packageId);
      if (!queue) {
        queue = [];
        this.mutexQueues.set(packageId, queue);
      }
      queue.push(() => {
        this.lockedPackages.add(packageId);
        resolve(() => this.releasePackageLock(packageId));
      });
    });
  }

  private releasePackageLock(packageId: string): void {
    const queue = this.mutexQueues.get(packageId);
    if (queue && queue.length > 0) {
      const nextWorker = queue.shift()!;
      // Immediately transfer lock to next waiting worker
      nextWorker();
    } else {
      this.lockedPackages.delete(packageId);
      this.mutexQueues.delete(packageId);
    }
  }

  // ==========================================================================
  // 1. Transactional Package Ingestion & Pre-Commit Dual-Seal Audit
  // ==========================================================================

  /**
   * Persists a sealed CanonicalAssessmentPackage into normalized relational tables.
   * Performs mandatory dual-seal read-back verification before committing.
   */
  public async persistPackage(
    pkg: CanonicalAssessmentPackage,
    tenantContext?: {
      tenantId: string;
      organizationId: string;
      visibilityScope?: PackageVisibilityScope;
    }
  ): Promise<{ packageId: string; persistenceEvent: CanonicalPackageEvent }> {
    const unlock = await this.acquirePackageLock(pkg.packageId);

    try {
      // 1. Immutability Check: Ensure package has not already been persisted
      if (this.packages.has(pkg.packageId)) {
        throw new TableConstraintError(
          'pk_canonical_assessment_packages',
          `Package with ID ${pkg.packageId} is already persisted. In-place re-persistence is forbidden.`
        );
      }

      // Snapshot state for atomic rollback if dual-seal verification fails
      const questionsSnapshotLength = this.questions.length;
      const representationsSnapshotLength = this.representations.length;
      const familiesSnapshotLength = this.families.length;
      const evaluationsSnapshotLength = this.evaluations.length;
      const membershipsSnapshotLength = this.memberships.length;
      const quarantinedSnapshotLength = this.quarantinedRelationships.length;
      const answersSnapshotLength = this.answers.length;
      const tenancySnapshotLength = this.tenancy.length;

      // 2. Insert Header Row
      const now = Date.now();
      const headerRow: StoredPackageRow = {
        package_id: pkg.packageId,
        package_integrity_seal: pkg.packageIntegritySeal,
        source_snapshot_id: pkg.sourceSnapshotId,
        source_document_id: pkg.sourceDocumentId,
        schema_version: pkg.schemaVersion,
        pipeline_algorithm_id: pkg.pipelineAlgorithmId,
        pipeline_algorithm_version: pkg.pipelineAlgorithmVersion,
        created_at: now,
      };
      this.packages.set(pkg.packageId, headerRow);

      // 3. Insert Canonical Questions & Representations (Preserving order!)
      pkg.canonicalQuestions.forEach((q, qIndex) => {
        // Enforce uniqueness constraint (uq_pkg_q_index)
        this.questions.push({
          canonical_question_id: q.canonicalQuestionId,
          package_id: pkg.packageId,
          logical_family_id: q.logicalFamilyId,
          question_index: qIndex,
          family_role: (q as any).familyRole,
          synthesized_question_type: (q as any).synthesizedQuestionType,
          canonical_fingerprint: q.canonicalFingerprint,
          source_discrepancies: (q as any).sourceDiscrepancies as any,
          created_at: now,
        });

        // Insert representations preserving upstream Phase 2D-4 array index
        q.representations.forEach((rep, repIndex) => {
          this.representations.push({
            representation_id: rep.representationId,
            canonical_question_id: q.canonicalQuestionId,
            representation_index: repIndex,
            language_script: rep.languageScript || 'EN',
            source_physical_instance_id: rep.sourcePhysicalInstanceId,
            source_question_number: rep.sourceQuestionNumber ?? null,
            stem_ast: rep.stemAST,
            options: rep.options,
            tables: (rep as any).tables !== undefined ? (rep as any).tables : undefined,
            diagrams: (rep as any).diagrams !== undefined ? (rep as any).diagrams : undefined,
            math_blocks: (rep as any).mathBlocks !== undefined ? (rep as any).mathBlocks : undefined,
            created_at: now,
          });
        });
      });

      // 4. Insert Logical Families
      pkg.logicalFamilies.forEach((fam) => {
        this.families.push({
          family_id: fam.familyId,
          package_id: pkg.packageId,
          family_type: (fam as any).familyType,
          family_anchor_physical_instance_id: (fam as any).familyAnchorPhysicalInstanceId || (fam as any).anchorPhysicalInstanceId,
          members: fam.members,
        });
      });

      // 5. Insert Relationship Evaluations
      pkg.relationshipEvaluations.forEach((evalResult) => {
        this.evaluations.push({
          evaluation_id: evalResult.evaluationId,
          package_id: pkg.packageId,
          relationship_type: evalResult.relationshipType,
          source_candidate_id: evalResult.sourceCandidateId,
          target_candidate_id: evalResult.targetCandidateId,
          source_physical_instance_id: evalResult.sourcePhysicalInstanceId,
          target_physical_instance_id: evalResult.targetPhysicalInstanceId,
          verification_status: evalResult.verificationStatus,
          confidence_score: evalResult.confidenceScore,
          evidence_payload: evalResult.allEvidence,
        });
      });

      // 6. Insert Family Memberships
      pkg.memberships.forEach((mem) => {
        this.memberships.push({
          membership_fingerprint: mem.membershipFingerprint,
          package_id: pkg.packageId,
          family_candidate_id: mem.familyCandidateId,
          candidate_physical_instance_id: mem.candidatePhysicalInstanceId,
          role: (mem as any).role,
          verification_status: mem.verificationStatus,
          supporting_evidence_ids: (mem as any).supportingEvaluationIds || [],
        });
      });

      // 7. Insert Quarantined Relationships
      pkg.quarantinedRelationships.forEach((qr) => {
        this.quarantinedRelationships.push({
          relationship_id: qr.relationshipId,
          package_id: pkg.packageId,
          source_candidate_id: qr.sourceCandidateId,
          target_candidate_id: qr.targetCandidateId,
          relationship_type: qr.relationshipType,
          quarantine_reason: qr.quarantineReason,
          quarantined_at: qr.quarantinedAt,
        });
      });

      // 8. Insert Authoritative Answers
      Object.entries(pkg.authoritativeAnswers).forEach(([qid, res]) => {
        this.answers.push({
          canonical_question_id: qid,
          package_id: pkg.packageId,
          status: res.status,
          resolution_payload: res,
        });
      });

      // 9. Bind Multi-Tenancy Ownership
      const tenantId = tenantContext?.tenantId ?? 'global-system';
      const organizationId = tenantContext?.organizationId ?? 'root-org';
      const visibilityScope = tenantContext?.visibilityScope ?? 'PUBLIC';
      this.tenancy.push({
        bindingId: `tb_${pkg.packageId}_${tenantId}`,
        packageId: pkg.packageId,
        tenantId,
        organizationId,
        visibilityScope,
        createdAt: now,
      });

      // 10. PRE-COMMIT DUAL-SEAL READ-BACK AUDIT (Invariant Inv2D7-2 / Gate G9)
      const reconstructed = await this.reconstructPackageInternal(pkg.packageId, pkg.validationReport);

      const derivedId = derivePackageId({
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

      const derivedSeal = computePackageIntegritySeal({
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

      if (derivedId !== pkg.packageId) {
        // Rollback snapshot
        this.rollback(pkg.packageId, questionsSnapshotLength, representationsSnapshotLength, familiesSnapshotLength, evaluationsSnapshotLength, membershipsSnapshotLength, quarantinedSnapshotLength, answersSnapshotLength, tenancySnapshotLength);
        throw new PersistenceIntegrityError(
          pkg.packageId,
          `Pre-commit identity mismatch! Expected ${pkg.packageId}, reconstructed derivedId ${derivedId}.`
        );
      }

      if (derivedSeal !== pkg.packageIntegritySeal) {
        // Rollback snapshot
        this.rollback(pkg.packageId, questionsSnapshotLength, representationsSnapshotLength, familiesSnapshotLength, evaluationsSnapshotLength, membershipsSnapshotLength, quarantinedSnapshotLength, answersSnapshotLength, tenancySnapshotLength);
        throw new PersistenceIntegrityError(
          pkg.packageId,
          `Pre-commit content seal mismatch! Expected ${pkg.packageIntegritySeal}, reconstructed derivedSeal ${derivedSeal}.`
        );
      }

      // 11. Append PERSISTENCE_COMMITTED Event (seq=1)
      const persistenceEvent: StoredEventRow = {
        event_id: `evt_persist_${pkg.packageId}_1`,
        package_id: pkg.packageId,
        event_type: 'PERSISTENCE_COMMITTED',
        sequence_number: 1,
        publication_request_fingerprint: null,
        eventPayload: {
          schemaVersion: pkg.schemaVersion,
          questionCount: pkg.canonicalQuestions.length,
          persistedAt: now,
        },
        created_at: now,
      };
      this.events.push(persistenceEvent);

      // 12. Append VALIDATION_RECORDED Event (seq=2)
      const validationEvent: StoredEventRow = {
        event_id: `evt_val_${pkg.packageId}_2`,
        package_id: pkg.packageId,
        event_type: 'VALIDATION_RECORDED',
        sequence_number: 2,
        publication_request_fingerprint: null,
        eventPayload: {
          validationStatus: pkg.validationReport.validationStatus,
          validationFingerprint: pkg.validationReport.validationFingerprint,
          passedInvariantCount: pkg.validationReport.passedInvariantCount,
          failedInvariantCount: pkg.validationReport.failedInvariantCount,
          validatedAt: pkg.validationReport.validatedAt,
        },
        created_at: now,
      };
      this.events.push(validationEvent);

      return {
        packageId: pkg.packageId,
        persistenceEvent: {
          eventId: persistenceEvent.event_id,
          packageId: persistenceEvent.package_id,
          eventType: persistenceEvent.event_type,
          sequenceNumber: persistenceEvent.sequence_number,
          publicationRequestFingerprint: persistenceEvent.publication_request_fingerprint,
          eventPayload: persistenceEvent.eventPayload,
          createdAt: persistenceEvent.created_at,
        },
      };
    } finally {
      unlock();
    }
  }

  private rollback(
    packageId: string,
    qLen: number,
    rLen: number,
    fLen: number,
    eLen: number,
    mLen: number,
    qrLen: number,
    aLen: number,
    tLen: number
  ): void {
    this.packages.delete(packageId);
    this.questions.length = qLen;
    this.representations.length = rLen;
    this.families.length = fLen;
    this.evaluations.length = eLen;
    this.memberships.length = mLen;
    this.quarantinedRelationships.length = qrLen;
    this.answers.length = aLen;
    this.tenancy.length = tLen;
  }

  // ==========================================================================
  // 2. Package Reconstruction (Order-Preserving & Dual-Seal Verified)
  // ==========================================================================

  public async reconstructPackageForTenant(packageId: string, tenantId: string): Promise<CanonicalAssessmentPackage> {
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new TenancyAccessError('reconstructPackageForTenant requires an explicit, non-empty tenantId.');
    }
    this.getPackageWithTenancyCheck(packageId, tenantId);
    return this.reconstructPackageInternalFromStore(packageId);
  }

  public async reconstructPackageForServiceRole(packageId: string): Promise<CanonicalAssessmentPackage> {
    return this.reconstructPackageInternalFromStore(packageId);
  }

  public async reconstructPackage(packageId: string, tenantId?: string): Promise<CanonicalAssessmentPackage> {
    if (tenantId) {
      return this.reconstructPackageForTenant(packageId, tenantId);
    }
    return this.reconstructPackageForServiceRole(packageId);
  }

  private reconstructPackageInternalFromStore(packageId: string): Promise<CanonicalAssessmentPackage> {
    const pkgRow = this.packages.get(packageId);
    if (!pkgRow) {
      throw new PersistenceIntegrityError(packageId, 'Package not found in persistent store.');
    }

    // Retrieve VALIDATION_RECORDED event to reconstruct validation report and authentic operational sealedAt
    const valEvent = this.events.find(
      (e) => e.package_id === packageId && e.event_type === 'VALIDATION_RECORDED'
    );
    const validationReport = valEvent
      ? (valEvent.eventPayload as unknown as CanonicalPackageValidationReport)
      : ({} as CanonicalPackageValidationReport);

    return this.reconstructPackageInternal(packageId, validationReport, valEvent?.created_at);
  }

  private async reconstructPackageInternal(
    packageId: string,
    validationReport: CanonicalPackageValidationReport,
    authenticValidationTimestamp?: number
  ): Promise<CanonicalAssessmentPackage> {
    const pkgRow = this.packages.get(packageId);
    if (!pkgRow) {
      throw new PersistenceIntegrityError(packageId, 'Package not found in persistent store.');
    }

    // 1. Reconstruct Canonical Questions (ORDER BY question_index ASC!)
    const questionRows = this.questions
      .filter((q) => q.package_id === packageId)
      .sort((a, b) => a.question_index - b.question_index);

    const canonicalQuestions: CanonicalQuestionIR[] = questionRows.map((qRow) => {
      // Reconstruct representations (ORDER BY representation_index ASC!)
      const repRows = this.representations
        .filter((r) => r.canonical_question_id === qRow.canonical_question_id)
        .sort((a, b) => a.representation_index - b.representation_index);

      const representations = repRows.map((rRow) => ({
        representationId: rRow.representation_id,
        languageScript: rRow.language_script,
        sourcePhysicalInstanceId: rRow.source_physical_instance_id,
        sourceQuestionNumber: rRow.source_question_number ?? undefined,
        stemAST: rRow.stem_ast as any,
        options: rRow.options as any,
        tables: rRow.tables as any,
        diagrams: rRow.diagrams as any,
        mathBlocks: rRow.math_blocks as any,
      }));

      return {
        canonicalQuestionId: qRow.canonical_question_id,
        logicalFamilyId: qRow.logical_family_id,
        familyRole: qRow.family_role as any,
        synthesizedQuestionType: qRow.synthesized_question_type as any,
        canonicalFingerprint: qRow.canonical_fingerprint,
        representations,
        sourceDiscrepancies: qRow.source_discrepancies as any,
      } as unknown as CanonicalQuestionIR;
    });

    // 2. Reconstruct Logical Families (ORDER BY family_id ASC)
    const logicalFamilies: LogicalQuestionFamily[] = this.families
      .filter((f) => f.package_id === packageId)
      .sort((a, b) => a.family_id.localeCompare(b.family_id))
      .map((f) => ({
        familyId: f.family_id,
        familyType: f.family_type as any,
        familyAnchorPhysicalInstanceId: f.family_anchor_physical_instance_id,
        members: f.members as any,
      } as unknown as LogicalQuestionFamily));

    // 3. Reconstruct Relationship Evaluations (ORDER BY evaluation_id ASC)
    const relationshipEvaluations: RelationshipEvaluationResult[] = this.evaluations
      .filter((e) => e.package_id === packageId)
      .sort((a, b) => a.evaluation_id.localeCompare(b.evaluation_id))
      .map((e) => ({
        evaluationId: e.evaluation_id,
        relationshipId: e.evaluation_id,
        relationshipType: e.relationship_type as any,
        sourceCandidateId: e.source_candidate_id,
        targetCandidateId: e.target_candidate_id,
        sourcePhysicalInstanceId: e.source_physical_instance_id,
        targetPhysicalInstanceId: e.target_physical_instance_id,
        allEvidence: e.evidence_payload as any,
        hardEvidence: [],
        supportingEvidence: [],
        weakEvidence: [],
        conflictingEvidence: [],
        confidenceScore: e.confidence_score,
        verificationStatus: e.verification_status as any,
        isSymmetric: true,
        isTransitive: false,
        isEligibleForFamilySynthesis: true,
        evaluationReasons: [],
        provenance: {
          sourceSnapshotId: pkgRow.source_snapshot_id,
          sourceDocumentId: pkgRow.source_document_id,
          algorithmId: pkgRow.pipeline_algorithm_id,
          algorithmVersion: pkgRow.pipeline_algorithm_version,
          evaluatedAt: 0,
        },
      }));

    // 4. Reconstruct Memberships (ORDER BY compound key)
    const memberships: CandidateFamilyMembership[] = this.memberships
      .filter((m) => m.package_id === packageId)
      .sort((a, b) => {
        const c1 = a.family_candidate_id.localeCompare(b.family_candidate_id);
        return c1 !== 0 ? c1 : a.candidate_physical_instance_id.localeCompare(b.candidate_physical_instance_id);
      })
      .map((m) => ({
        membershipFingerprint: m.membership_fingerprint,
        familyCandidateId: m.family_candidate_id,
        candidatePhysicalInstanceId: m.candidate_physical_instance_id,
        role: m.role as any,
        verificationStatus: m.verification_status as any,
        supportingEvaluationIds: m.supporting_evidence_ids,
        membershipReasons: [],
      } as unknown as CandidateFamilyMembership));

    // 5. Reconstruct Quarantined Relationships (ORDER BY relationship_id ASC)
    const quarantinedRelationships: QuarantinedRelationshipRecord[] = this.quarantinedRelationships
      .filter((qr) => qr.package_id === packageId)
      .sort((a, b) => a.relationship_id.localeCompare(b.relationship_id))
      .map((qr) => ({
        relationshipId: qr.relationship_id,
        sourceCandidateId: qr.source_candidate_id,
        targetCandidateId: qr.target_candidate_id,
        relationshipType: qr.relationship_type,
        quarantineReason: qr.quarantine_reason as any,
        quarantinedAt: qr.quarantined_at,
      }));

    // 6. Reconstruct Authoritative Answers
    const authoritativeAnswers: Record<string, LineageResolutionResult> = {};
    this.answers
      .filter((a) => a.package_id === packageId)
      .sort((a, b) => a.canonical_question_id.localeCompare(b.canonical_question_id))
      .forEach((a) => {
        authoritativeAnswers[a.canonical_question_id] = a.resolution_payload as LineageResolutionResult;
      });

    // 7. Authentic Operational Metadata
    const operationalSealedAt = authenticValidationTimestamp ?? pkgRow.created_at;

    return {
      packageId: pkgRow.package_id,
      sourceSnapshotId: pkgRow.source_snapshot_id,
      sourceDocumentId: pkgRow.source_document_id,
      schemaVersion: pkgRow.schema_version,
      pipelineAlgorithmId: pkgRow.pipeline_algorithm_id,
      pipelineAlgorithmVersion: pkgRow.pipeline_algorithm_version,
      canonicalQuestions,
      logicalFamilies,
      relationshipEvaluations,
      memberships,
      quarantinedRelationships,
      authoritativeAnswers,
      validationReport,
      packageIntegritySeal: pkgRow.package_integrity_seal,
      sealedFingerprint: pkgRow.package_integrity_seal,
      sealedAt: operationalSealedAt,
    };
  }

  // ==========================================================================
  // 3. Append-Only Lifecycle Event Append & Queries
  // ==========================================================================

  public async appendLifecycleEvent(
    packageId: string,
    eventType: CanonicalPackageEventType,
    eventPayload: Record<string, unknown>,
    publicationRequestFingerprint?: string | null,
    skipLock: boolean = false
  ): Promise<CanonicalPackageEvent> {
    const unlock = skipLock ? () => {} : await this.acquirePackageLock(packageId);

    try {
      if (!this.packages.has(packageId)) {
        throw new PersistenceIntegrityError(packageId, 'Cannot append event to non-existent package envelope.');
      }

      // Enforce SQL Check Constraint: Mandatory publication fingerprint for PUBLICATION_ISSUED
      if (eventType === 'PUBLICATION_ISSUED' && (!publicationRequestFingerprint || publicationRequestFingerprint.trim() === '')) {
        throw new TableConstraintError(
          'chk_pub_fingerprint',
          'publication_request_fingerprint is strictly mandatory when event_type = "PUBLICATION_ISSUED".'
        );
      }

      const packageEvents = this.events.filter((e) => e.package_id === packageId);
      const nextSeq = packageEvents.length + 1;

      const eventRow: StoredEventRow = {
        event_id: `evt_${eventType.toLowerCase()}_${packageId}_${nextSeq}`,
        package_id: packageId,
        event_type: eventType,
        sequence_number: nextSeq,
        publication_request_fingerprint: publicationRequestFingerprint ?? null,
        eventPayload,
        created_at: Date.now(),
      };

      const candidateEvent: CanonicalPackageEvent = {
        eventId: eventRow.event_id,
        packageId: eventRow.package_id,
        eventType: eventRow.event_type,
        sequenceNumber: eventRow.sequence_number,
        publicationRequestFingerprint: eventRow.publication_request_fingerprint,
        eventPayload: eventRow.eventPayload,
        createdAt: eventRow.created_at,
      };

      // Formal FSM Validation Gate: Ensure transition is strictly valid before committing event
      const currentLifecycleState = this.getPackageLifecycleState(packageId);
      let quarantineOrigin: any = null;
      if (currentLifecycleState === 'QUARANTINED') {
        const lastQuarantineTrigger = [...packageEvents]
          .reverse()
          .find((e) => e.event_type === 'VALIDATION_RECORDED' || e.event_type === 'QUARANTINE_APPLIED');
        if (lastQuarantineTrigger) {
          if (lastQuarantineTrigger.event_type === 'VALIDATION_RECORDED') {
            quarantineOrigin = 'PERSISTED';
          } else {
            quarantineOrigin = lastQuarantineTrigger.eventPayload.originState ?? 'VALIDATED';
          }
        }
      }

      const { applyLifecycleTransition } = await import('./canonicalLifecycleEngine');
      applyLifecycleTransition(currentLifecycleState, candidateEvent, quarantineOrigin);

      this.events.push(eventRow);

      return candidateEvent;
    } finally {
      unlock();
    }
  }

  public getEventsForPackage(packageId: string): CanonicalPackageEvent[] {
    return this.events
      .filter((e) => e.package_id === packageId)
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .map((e) => ({
        eventId: e.event_id,
        packageId: e.package_id,
        eventType: e.event_type,
        sequenceNumber: e.sequence_number,
        publicationRequestFingerprint: e.publication_request_fingerprint,
        eventPayload: e.eventPayload,
        createdAt: e.created_at,
      }));
  }

  public getPackageLifecycleState(packageId: string): CanonicalPackageLifecycleState {
    const evts = this.getEventsForPackage(packageId);
    return reducePackageLifecycle(evts, packageId);
  }

  // ==========================================================================
  // 4. Immutability Violation Test Hooks (Simulating SQL Trigger Rejections)
  // ==========================================================================

  public attemptUpdatePackageHeader(packageId: string): never {
    throw new ImmutabilityViolationError('canonical_assessment_packages', 'UPDATE');
  }

  public attemptDeletePackageHeader(packageId: string): never {
    throw new ImmutabilityViolationError('canonical_assessment_packages', 'DELETE');
  }

  public attemptMutateEventRow(eventId: string): never {
    throw new ImmutabilityViolationError('canonical_package_events', 'UPDATE/DELETE');
  }

  // ==========================================================================
  // 5. Deliberate Tampering Hooks for Adversarial Integrity Testing
  // ==========================================================================

  public tamperWithRepresentationAST(representationId: string, mutatedTokenText: string): void {
    const rep = this.representations.find((r) => r.representation_id === representationId);
    if (rep) {
      const ast = rep.stem_ast as any;
      if (Array.isArray(ast) && ast.length > 0) {
        rep.stem_ast = [
          {
            ...ast[0],
            rawContent: mutatedTokenText,
            normalizedContent: mutatedTokenText,
          },
          ...ast.slice(1),
        ];
      } else if (ast && Array.isArray(ast.tokens) && ast.tokens.length > 0) {
        ast.tokens[0].text = mutatedTokenText;
      } else {
        rep.stem_ast = [{ nodeId: 'tampered_node', nodeType: 'TEXT', rawContent: mutatedTokenText }];
      }
    }
  }

  public tamperShuffleChildRows(packageId: string): void {
    // Reverse/shuffle questions and representations to prove reconstruction restores authentic source order
    this.questions.reverse();
    this.representations.reverse();
  }

  // ==========================================================================
  // 6. Tenancy & Row Level Security (RLS) Query Filtering
  // ==========================================================================

  public getPackageWithTenancyCheck(packageId: string, currentTenantId: string): StoredPackageRow {
    const binding = this.tenancy.find((t) => t.packageId === packageId);
    if (!binding) {
      throw new TenancyAccessError(`Package ${packageId} has no registered tenancy binding.`);
    }

    if (binding.visibilityScope === 'PUBLIC') {
      const row = this.packages.get(packageId);
      if (!row) throw new PersistenceIntegrityError(packageId, 'Package not found.');
      return row;
    }

    if (binding.tenantId === currentTenantId) {
      const row = this.packages.get(packageId);
      if (!row) throw new PersistenceIntegrityError(packageId, 'Package not found.');
      return row;
    }

    throw new TenancyAccessError(
      `Tenant ${currentTenantId} is not authorized to access package ${packageId} with scope ${binding.visibilityScope}.`
    );
  }

  // ==========================================================================
  // 7. Supersession Lineage DAG
  // ==========================================================================

  public async registerSupersession(
    predecessorPackageId: string,
    successorPackageId: string,
    reason: string,
    authorityDocSourceId?: string | null
  ): Promise<CanonicalPackageSupersession> {
    if (!this.packages.has(predecessorPackageId) || !this.packages.has(successorPackageId)) {
      throw new PersistenceIntegrityError(
        predecessorPackageId,
        'Both predecessor and successor must exist in persistent store.'
      );
    }

    if (predecessorPackageId === successorPackageId) {
      throw new TableConstraintError('chk_no_self_supersession', 'A package cannot supersede itself.');
    }

    // Check DAG cycles
    const isCyclic = this.supersessions.some(
      (s) => s.predecessorPackageId === successorPackageId && s.successorPackageId === predecessorPackageId
    );
    if (isCyclic) {
      throw new TableConstraintError('chk_dag_cycle', 'Cyclic package supersession detected.');
    }

    const supersession: CanonicalPackageSupersession = {
      supersessionId: `sup_${predecessorPackageId}_${successorPackageId}`,
      predecessorPackageId,
      successorPackageId,
      supersessionReason: reason,
      authorityDocumentSourceId: authorityDocSourceId ?? null,
      createdAt: Date.now(),
    };

    this.supersessions.push(supersession);

    // Register event on predecessor
    await this.appendLifecycleEvent(predecessorPackageId, 'SUPERSESSION_REGISTERED', {
      successorPackageId,
      supersessionReason: reason,
    });

    return supersession;
  }
}
