/**
 * UADUE Phase 2D-7 — Canonical Persistence, Export, and Publication Contracts
 * Document Version: 7.3.1-CONSISTENCY-ALIGNED
 *
 * Inviolable Boundaries:
 * 1. PhysicalQuestionCandidate is immutable.
 * 2. Phase 2A through 2D-6 upstream contracts remain 100% frozen.
 * 3. CanonicalAssessmentPackage is immutable upon sealing.
 * 4. Relational records are append-only (ZERO in-place UPDATE or DELETE statements).
 * 5. Lifecycle states are derived strictly via deterministic history fold reduction.
 * 6. publicationRequestFingerprint is physically persisted and mandatory for PUBLICATION_ISSUED.
 * 7. 15-component array ordering contract strictly distinguishes ORDERED_SEMANTIC from UNORDERED_ID_COLLECTION.
 * 8. Zero language-priority heuristics (representation_index is authoritative).
 */

import {
  CanonicalAssessmentPackage,
  CanonicalQuestionIR,
  LogicalQuestionFamily,
  RelationshipEvaluationResult,
  CandidateFamilyMembership,
  QuarantinedRelationshipRecord,
  LineageResolutionResult,
} from './types';

// ============================================================================
// 1. Formal Lifecycle Taxonomy (States vs Events)
// ============================================================================

export type CanonicalPackageLifecycleState =
  | 'DRAFT'
  | 'PERSISTED'
  | 'VALIDATED'
  | 'PUBLISHED'
  | 'QUARANTINED'
  | 'SUPERSEDED';

export type CanonicalPackageEventType =
  | 'PERSISTENCE_COMMITTED'
  | 'VALIDATION_RECORDED'
  | 'PUBLICATION_ISSUED'
  | 'QUARANTINE_APPLIED'
  | 'QUARANTINE_RELEASED'
  | 'SUPERSESSION_REGISTERED';

export type QuarantineOriginState = 'PERSISTED' | 'VALIDATED' | 'PUBLISHED';

export interface CanonicalPackageEvent {
  readonly eventId: string;
  readonly packageId: string;
  readonly eventType: CanonicalPackageEventType;
  readonly sequenceNumber: number;
  readonly publicationRequestFingerprint?: string | null;
  readonly eventPayload: Record<string, unknown>;
  readonly createdAt: number;
}

// ============================================================================
// 2. Publication & Idempotency Contracts
// ============================================================================

export interface PublicationRequestPayload {
  readonly packageId: string;
  readonly packageIntegritySeal: string;
  readonly publicationAuthorityId: string;
  readonly targetScope: string;
  readonly publicationPolicyConfig?: Record<string, unknown>;
}

export interface CanonicalPublicationReceipt {
  readonly receiptId: string;
  readonly packageId: string;
  readonly packageIntegritySeal: string;
  readonly publicationAuthorityId: string;
  readonly publicationSequenceNumber: number;
  readonly publicationRequestFingerprint: string;
  readonly publishedAt: string;
  readonly hmacSignature: string;
}

// ============================================================================
// 3. Package Version Lineage DAG
// ============================================================================

export interface CanonicalPackageSupersession {
  readonly supersessionId: string;
  readonly predecessorPackageId: string;
  readonly successorPackageId: string;
  readonly supersessionReason: string;
  readonly authorityDocumentSourceId?: string | null;
  readonly createdAt: number;
}

// ============================================================================
// 4. Multi-Tenancy & Ownership Architecture
// ============================================================================

export type PackageVisibilityScope =
  | 'PUBLIC'
  | 'ORGANIZATION_PRIVATE'
  | 'RESTRICTED'
  | 'TENANT_RESTRICTED'
  | 'PRIVATE';

export interface CanonicalPackageTenancy {
  readonly bindingId: string;
  readonly packageId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly visibilityScope: PackageVisibilityScope;
  readonly createdAt: number;
}

// ============================================================================
// 5. Universal Content-Addressed Asset Registry
// ============================================================================

export interface CanonicalAssetRecord {
  readonly contentHash: string;
  readonly storageUri: string;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly pixelWidth?: number;
  readonly pixelHeight?: number;
  readonly examMetadata: Record<string, unknown>;
  readonly createdAt: number;
}

// ============================================================================
// 6. 4-Tier Consumer Projections
// ============================================================================

export type ProjectionTier =
  | 'TIER_1_SERVER_CORE'
  | 'TIER_2_STAFF_REVIEW'
  | 'TIER_3_STUDENT_LIVE'
  | 'TIER_4_POST_EXAM';

export interface StudentLiveRepresentation {
  readonly representationIndex: number;
  readonly languageScript: string;
  readonly sourcePhysicalInstanceId: string;
  readonly sourceQuestionNumber?: string | null;
  readonly stemAST: unknown;
  readonly options: Array<{
    readonly optionId: string;
    readonly optionIndex: number;
    readonly contentAST: unknown;
  }>;
  readonly tables: unknown[];
  readonly diagrams: unknown[];
  readonly mathBlocks: unknown[];
}

export interface StudentLiveQuestionProjection {
  readonly canonicalQuestionId: string;
  readonly logicalFamilyId?: string;
  readonly questionIndex: number;
  readonly familyRole: string;
  readonly synthesizedQuestionType: string;
  readonly representations: StudentLiveRepresentation[];
}

export interface StudentLivePackageProjection {
  readonly packageId: string;
  readonly schemaVersion: string;
  readonly totalQuestions: number;
  readonly questions: StudentLiveQuestionProjection[];
  readonly targetScope: string;
  readonly projectionTier: 'TIER_3_STUDENT_LIVE';
}

export interface StaffReviewQuestionProjection extends StudentLiveQuestionProjection {
  readonly canonicalFingerprint: string;
  readonly sourceDiscrepancies: unknown[];
  readonly boundingBoxCrops?: Array<{
    readonly assetHash: string;
    readonly cropBox: { x: number; y: number; width: number; height: number };
  }>;
}

export interface StaffReviewPackageProjection {
  readonly packageId: string;
  readonly packageIntegritySeal: string;
  readonly validationStatus: string;
  readonly discrepancyCount: number;
  readonly questions: StaffReviewQuestionProjection[];
  readonly quarantinedRelationshipsCount: number;
  readonly projectionTier: 'TIER_2_STAFF_REVIEW';
}

export interface PostExamQuestionProjection extends StudentLiveQuestionProjection {
  readonly authoritativeAnswer?: unknown;
  readonly userAttempt?: unknown;
  readonly awardedMarks?: number;
  readonly isCorrect?: boolean;
}

export interface PostExamPackageProjection {
  readonly packageId: string;
  readonly totalMarksAwarded: number;
  readonly questions: PostExamQuestionProjection[];
  readonly projectionTier: 'TIER_4_POST_EXAM';
}

// ============================================================================
// 7. Relational Persistence Records (Normalized Database Schema)
// ============================================================================

export interface PersistedPackageHeader {
  readonly package_id: string;
  readonly package_integrity_seal: string;
  readonly source_snapshot_id: string;
  readonly source_document_id: string;
  readonly schema_version: string;
  readonly pipeline_algorithm_id: string;
  readonly pipeline_algorithm_version: string;
  readonly created_at: number;
}

export interface PersistedQuestionRecord {
  readonly canonical_question_id: string;
  readonly package_id: string;
  readonly logical_family_id: string;
  readonly question_index: number;
  readonly family_role: string;
  readonly synthesized_question_type: string;
  readonly canonical_fingerprint: string;
  readonly source_discrepancies: unknown[];
  readonly created_at: number;
}

export interface PersistedRepresentationRecord {
  readonly representation_id: string;
  readonly canonical_question_id: string;
  readonly representation_index: number;
  readonly language_script: string;
  readonly source_physical_instance_id: string;
  readonly source_question_number: string | null;
  readonly stem_ast: unknown;
  readonly options: unknown;
  readonly tables: unknown[];
  readonly diagrams: unknown[];
  readonly math_blocks: unknown[];
  readonly created_at: number;
}
