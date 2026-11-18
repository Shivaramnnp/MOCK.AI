/**
 * UADUE Phase 2D — Canonical Ingestion & Semantic Unification Contracts
 * Document Version: 3.0.0-TOPOLOGY-HARDENED
 *
 * Inviolable Principles:
 * 1. PhysicalQuestionCandidate is immutable.
 * 2. Phase 2C DocumentGraph and QuestionGraph remain untouched.
 * 3. Confidence is descriptive metadata, never independently authorizing verification.
 * 4. Verification is strictly evidence-driven.
 * 5. LANGUAGE_REPRESENTATION_OF, VARIANT_OF, SHARED_STIMULUS_CHILD_OF are strictly NON-TRANSITIVE.
 * 6. Graph connectivity != LogicalQuestionFamily identity.
 */

import {
  QuestionCandidate,
  QuestionRelationshipCandidate,
  RelationshipEvidence,
  RelationshipEvidenceType,
  RelationshipEvidenceStrength,
  RelationshipVerificationStatus,
  QuestionGraph,
} from '../contracts/questionGraph';
import { DocumentGraph } from '../contracts/documentGraph';
import { SourceReference } from '../contracts/sourceReference';

// ============================================================================
// 1. Canonical Relationship Types (Phase 2D 9-Type Taxonomy)
// ============================================================================

export type CanonicalRelationshipType =
  | 'SAME_LOGICAL_QUESTION'
  | 'LANGUAGE_REPRESENTATION_OF'
  | 'VARIANT_OF'
  | 'CONTINUATION_OF'
  | 'SHARED_STIMULUS_CHILD_OF'
  | 'POSSIBLE_DUPLICATE_CANDIDATE'
  | 'REVISED_KEY_FOR'
  | 'RELATED_BUT_DISTINCT'
  | 'UNKNOWN_RELATIONSHIP';

// ============================================================================
// 2. Evaluated Relationship Structure (Phase 2D-1 Output)
// ============================================================================

export interface RelationshipProvenance {
  sourceSnapshotId: string;
  sourceDocumentId: string;
  algorithmId: string;
  algorithmVersion: string;
  evaluatedAt: number;
}

export interface RelationshipEvaluationResult {
  evaluationId: string; // Deterministic hash
  relationshipId: string;
  relationshipType: CanonicalRelationshipType;
  sourceCandidateId: string;
  targetCandidateId: string;
  sourcePhysicalInstanceId: string;
  targetPhysicalInstanceId: string;

  // Evidentiary Breakdown (Phase 2C 4-Tier Hierarchy)
  allEvidence: RelationshipEvidence[];
  hardEvidence: RelationshipEvidence[];
  supportingEvidence: RelationshipEvidence[];
  weakEvidence: RelationshipEvidence[];
  conflictingEvidence: RelationshipEvidence[];

  // Decoupled Confidence & Verification
  confidenceScore: number; // Descriptive continuous belief [0.0, 1.0]
  verificationStatus: RelationshipVerificationStatus; // Discrete authoritative gate

  // Algebraic & Topological Properties
  isSymmetric: boolean;
  isTransitive: boolean;
  transitivityConditions?: string;
  /**
   * Indicates whether this direct pairwise relationship may be consumed by a future
   * CandidateFamilyMembership evaluator.
   *
   * CRITICAL INVARIANT:
   * This flag MUST NOT mean that a candidate is automatically a member of the same family.
   * Family membership requires an explicit CandidateFamilyMembership evaluation with direct
   * relationship evaluation references and evidence.
   */
  isEligibleForFamilySynthesis: boolean;

  // Evidentiary Justification
  evaluationReasons: string[];
  unresolvedReasons?: string[];

  provenance: RelationshipProvenance;
}

// ============================================================================
// 3. Engine Inputs
// ============================================================================

export interface RelationshipEvaluationInput {
  relationship: QuestionRelationshipCandidate;
  sourceCandidate: QuestionCandidate;
  targetCandidate: QuestionCandidate;
  documentGraph?: DocumentGraph;
  sourceReferences?: SourceReference[];
  algorithmId?: string;
  algorithmVersion?: string;
}

export interface BatchRelationshipEvaluationInput {
  relationships: QuestionRelationshipCandidate[];
  candidates: QuestionCandidate[];
  documentGraph?: DocumentGraph;
  sourceReferences?: SourceReference[];
  algorithmId?: string;
  algorithmVersion?: string;
}

// ============================================================================
// 4. Candidate Family Membership Contracts (Phase 2D-2)
// ============================================================================

export interface CandidateFamilyMembershipProvenance {
  sourceSnapshotId: string;
  sourceDocumentId: string;
  algorithmId: string;
  algorithmVersion: string;
  evaluatedAt: number;
}

export interface CandidateFamilyMembership {
  candidatePhysicalInstanceId: string;
  familyCandidateId: string;

  directRelationshipEvaluationIds: string[];

  directEvidenceReferences: RelationshipEvidence[];

  verificationStatus: RelationshipVerificationStatus;

  provenance: CandidateFamilyMembershipProvenance;

  algorithmVersion: string;

  // Traceability & Audit Metadata
  membershipFingerprint: string; // Deterministic hash
  isAccepted: boolean;
  membershipReasons: string[];
  rejectionReasons?: string[];
}

export interface CandidateFamilyMembershipInput {
  candidate: QuestionCandidate;
  familyTargetCandidate: QuestionCandidate;
  directRelationshipEvaluation: RelationshipEvaluationResult;
  sourceSnapshotId?: string;
  sourceDocumentId?: string;
  algorithmId?: string;
  algorithmVersion?: string;
}

export interface CandidateFamilyMembershipEvaluationResult {
  membership?: CandidateFamilyMembership;
  isAccepted: boolean;
  rejectionReasons: string[];
  evaluationReasons: string[];
  deterministicFingerprint: string;
}

export interface BatchCandidateFamilyMembershipInput {
  candidates: QuestionCandidate[];
  relationshipEvaluations: RelationshipEvaluationResult[];
  membershipProposals: {
    candidateId: string;
    familyTargetCandidateId: string;
    relationshipEvaluationId: string;
  }[];
  sourceSnapshotId?: string;
  sourceDocumentId?: string;
  algorithmId?: string;
  algorithmVersion?: string;
}

// ============================================================================
// 5. Logical Family Synthesis Contracts (Phase 2D-3)
// ============================================================================

export type FamilyRepresentationRole =
  | 'ANCHOR_REPRESENTATION'
  | 'LANGUAGE_REPRESENTATION'
  | 'LOGICAL_VIEW_REPRESENTATION';

export interface LogicalFamilyMember {
  candidatePhysicalInstanceId: string;
  candidateId: string;
  representationRole: FamilyRepresentationRole;
  languageScript?: string;
  sourceQuestionNumber?: string;
  pageNumber: number;
  directMembershipFingerprint: string;
  directRelationshipEvaluationId?: string;
  directEvidenceReferences: RelationshipEvidence[];
}

export interface LogicalQuestionFamilyProvenance {
  sourceSnapshotId: string;
  sourceDocumentId: string;
  algorithmId: string;
  algorithmVersion: string;
  synthesizedAt: number;
}

export interface LogicalQuestionFamily {
  familyId: string; // Deterministic hash
  anchorPhysicalInstanceId: string;
  anchorCandidateId: string;
  members: LogicalFamilyMember[];
  directRelationshipEvaluationIds: string[];
  verificationStatus: RelationshipVerificationStatus;
  provenance: LogicalQuestionFamilyProvenance;
  algorithmVersion: string;
  familyFingerprint: string;
  synthesisReasons: string[];
}

export interface LogicalFamilySynthesisInput {
  anchorCandidate: QuestionCandidate;
  acceptedMemberships: CandidateFamilyMembership[];
  allCandidates: QuestionCandidate[];
  sourceSnapshotId?: string;
  sourceDocumentId?: string;
  algorithmId?: string;
  algorithmVersion?: string;
}

export interface LogicalFamilySynthesisResult {
  family?: LogicalQuestionFamily;
  isSynthesized: boolean;
  rejectionReasons: string[];
  synthesisReasons: string[];
  deterministicFingerprint: string;
}

export interface BatchLogicalFamilySynthesisInput {
  candidates: QuestionCandidate[];
  acceptedMemberships: CandidateFamilyMembership[];
  sourceSnapshotId?: string;
  sourceDocumentId?: string;
  algorithmId?: string;
  algorithmVersion?: string;
}

// ============================================================================
// 6. Canonical Question IR Contracts (Phase 2D-4)
// ============================================================================

export type CanonicalASTNodeType =
  | 'TEXT'
  | 'MATH'
  | 'TABLE'
  | 'IMAGE'
  | 'DIAGRAM'
  | 'GRAPH'
  | 'CODE'
  | 'PSEUDOCODE'
  | 'LIST'
  | 'MIXED'
  | 'UNKNOWN';

export interface CanonicalASTNodeProvenance {
  sourcePhysicalCandidateId: string;
  sourcePhysicalInstanceId: string;
  sourcePhysicalNodeIds: string[];
  sourcePageNumber: number;
  sourceBoundingBox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface CanonicalASTNode {
  nodeId: string;
  nodeType: CanonicalASTNodeType;
  rawContent: string;
  normalizedContent?: string;
  isSemanticInterpretationResolved: boolean;
  unresolvedReasons?: string[];
  attributes?: Record<string, any>;
  children?: CanonicalASTNode[];
  provenance: CanonicalASTNodeProvenance[];
}

export interface CanonicalAssetReference {
  assetId: string;
  assetType: 'IMAGE' | 'DIAGRAM' | 'GRAPH' | 'TABLE_VISUAL' | 'MATH_VISUAL' | 'UNKNOWN';
  assetHash?: string;
  sourcePageNumber: number;
  sourceNodeIds: string[];
  sourceBoundingBox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  isSemanticEquivalenceProven: boolean;
  provenance: CanonicalASTNodeProvenance;
}

export interface CanonicalOption {
  optionId: string;
  sourceLabel?: string;
  sourceRawText: string;
  normalizedText?: string;
  astNodes: CanonicalASTNode[];
  associatedAssetIds: string[];
  provenance: CanonicalASTNodeProvenance[];
}

export interface CanonicalRepresentation {
  representationId: string;
  representationRole: FamilyRepresentationRole;
  languageScript?: string;
  sourceQuestionNumber?: string;
  sourcePageNumber: number;
  sourcePhysicalInstanceId: string;
  sourceCandidateId: string;
  stemRawText: string;
  stemNormalizedText?: string;
  stemAST: CanonicalASTNode[];
  options: CanonicalOption[];
  assets: CanonicalAssetReference[];
  isPrimary: boolean;
  provenance: {
    sourceSnapshotId: string;
    sourceDocumentId: string;
    physicalNodeIds: string[];
  };
}

export interface CanonicalQuestionProvenance {
  sourceSnapshotId: string;
  sourceDocumentId: string;
  logicalFamilyId: string;
  canonicalizerAlgorithmId: string;
  canonicalizerVersion: string;
  schemaVersion: string;
  synthesizedAt: number;
}

export interface CanonicalQuestionIR {
  canonicalQuestionId: string; // Deterministic hash
  logicalFamilyId: string;
  memberPhysicalInstanceIds: string[];
  sourceSnapshotId: string;
  sourceDocumentId: string;
  directRelationshipEvaluationIds: string[];

  // Representations by Language / View (Lossless dual/multilingual preservation)
  representations: CanonicalRepresentation[];

  // Source Discrepancies Recorded Explicitly
  sourceDiscrepancies: {
    hasNumberingDiscrepancy: boolean;
    sourceNumberings: {
      candidatePhysicalInstanceId: string;
      printedQuestionNumber?: string;
      pageNumber: number;
    }[];
  };

  // Content Components & Assets
  allAssetReferences: CanonicalAssetReference[];

  // Traceability & Provenance
  provenance: CanonicalQuestionProvenance;
  schemaVersion: string;
  canonicalFingerprint: string;
  synthesisReasons: string[];
}

export interface CanonicalizationInput {
  family: LogicalQuestionFamily;
  candidates: QuestionCandidate[];
  sourceSnapshotId?: string;
  sourceDocumentId?: string;
  canonicalizerAlgorithmId?: string;
  canonicalizerVersion?: string;
}

export interface CanonicalizationResult {
  canonicalQuestion?: CanonicalQuestionIR;
  isCanonicalized: boolean;
  rejectionReasons: string[];
  synthesisReasons: string[];
  deterministicFingerprint: string;
}

export interface BatchCanonicalizationInput {
  families: LogicalQuestionFamily[];
  candidates: QuestionCandidate[];
  sourceSnapshotId?: string;
  sourceDocumentId?: string;
  canonicalizerAlgorithmId?: string;
  canonicalizerVersion?: string;
}

// ============================================================================
// 10. UADUE Phase 2D-5 — Layer 5 Answer Authority & Scoring Contracts
// ============================================================================

export type AnswerKeyDocumentType =
  | 'INITIAL_PROVISIONAL_KEY'
  | 'FINAL_OFFICIAL_KEY'
  | 'OFFICIAL_CORRIGENDUM'
  | 'COURT_ORDER_REVISED_KEY';

export interface AnswerKeySource {
  sourceId: string;
  documentType: AnswerKeyDocumentType;
  sourceTitle: string;
  issuingAuthority: string;
  publicationDate: string;
  sourceFileHash: string;
  publisherDeclaredHash?: string;
  sourceUri: string;
  provenance: {
    capturedAt: number;
    adapterVersion: string;
  };
}

export interface AnswerKeySnapshot {
  snapshotId: string;
  sourceId: string;
  pageCount: number;
  extractedTableCount: number;
  extractedRawEntryCount: number;
  snapshotFingerprint: string;
}

export interface AnswerKeyEntry {
  entryId: string;
  snapshotId: string;
  sourceNodeId: string;
  pageNumber: number;
  rawPaperSetOrVariant?: string;
  rawSectionId?: string;
  rawPrintedQuestionNumber: string;
  rawExtractedValue: string;
  boundingPolygon?: { x: number; y: number }[];
  entryFingerprint: string;
}

export type UniversalAnswerPayload =
  | {
      type: 'SINGLE_CHOICE_MCQ';
      correctOptionLabel: string;
      correctOptionId?: string;
    }
  | {
      type: 'MULTIPLE_CHOICE_MSQ';
      correctOptionLabels: string[];
      correctOptionIds?: string[];
      isOrderSensitive: boolean;
    }
  | {
      type: 'NUMERICAL_RANGE_NAT';
      exactValue?: string;
      rangeLow?: string;
      rangeHigh?: string;
      decimalTolerance?: string;
      permittedRepresentations?: string[];
    }
  | {
      type: 'MATRIX_MATCH';
      pairs: { sourceLabel: string; targetLabels: string[] }[];
    }
  | {
      type: 'DESCRIPTIVE_RUBRIC';
      rubricId: string;
      criteriaSummary: string;
    }
  | {
      type: 'UNRESOLVED_ANSWER';
      unresolvedReason: string;
    };

export type QuestionDisposition =
  | 'ACTIVE'
  | 'WITHDRAWN'
  | 'CANCELLED'
  | 'SUPERSEDED'
  | 'UNRESOLVED';

export type ScoringDisposition =
  | 'STANDARD_EVALUATION'
  | 'AWARD_FULL_MARKS'
  | 'EXCLUDE_AND_RESCALE'
  | 'ZERO_MARKS';

export type AnswerVerificationStatus =
  | 'CANDIDATE'
  | 'SUPPORTED'
  | 'VERIFIED'
  | 'CONFLICTED'
  | 'SUPERSEDED'
  | 'WITHDRAWN';

export type AnswerEvidenceClass =
  | 'DIRECT_OFFICIAL_FINAL_KEY'
  | 'OFFICIAL_CORRIGENDUM'
  | 'OFFICIAL_WITHDRAWAL_NOTICE'
  | 'DIRECT_OFFICIAL_PROVISIONAL_KEY'
  | 'SOURCE_PRINTED_SOLUTIONS'
  | 'DERIVED_CROSS_SET_MAPPING'
  | 'AI_OR_HEURISTIC_PREDICTION'
  | 'COMMUNITY_UNVERIFIED_KEY';

export interface AnswerEvidence {
  evidenceId: string;
  evidenceClass: AnswerEvidenceClass;
  sourceId: string;
  documentType: string;
  summary: string;
  verifiedAt?: number;
}

export interface AnswerCandidate {
  candidateAnswerId: string;
  canonicalQuestionId: string;
  sourceEntryId: string;
  parsedPayload: UniversalAnswerPayload;
  evidence: AnswerEvidence[];
  verificationStatus: AnswerVerificationStatus;
  confidenceScore: number;
  provenance: {
    sourceSnapshotId: string;
    sourceDocumentId: string;
    adapterVersion: string;
  };
}

export type ExactNumericRepresentation =
  | {
      format: 'EXACT_DECIMAL';
      sign: '+' | '-';
      coefficientDigits: string;
      exponent: string;
      rawSourceString: string;
    }
  | {
      format: 'EXACT_RATIONAL';
      numerator: string;
      denominator: string;
      rawSourceString: string;
    }
  | {
      format: 'NUMERIC_INTERVAL';
      lowEndpoint: ExactNumericRepresentation;
      highEndpoint: ExactNumericRepresentation;
      isLowInclusive: boolean;
      isHighInclusive: boolean;
      rawSourceString: string;
    };

export interface AnswerAuthorityResolutionVersion {
  resolutionVersionId: string;
  resolutionFamilyId: string;
  versionNumber: number;
  canonicalQuestionId: string;
  candidateAnswerId: string;
  verificationStatus: AnswerVerificationStatus;
  questionDisposition: QuestionDisposition;
  scoringDisposition: ScoringDisposition;
  authorityDocumentSourceId: string;
  supersedesVersionId: string | null;
  effectiveFrom: string;
  createdAt: number;
}

export interface ResolutionConflictRecord {
  conflictId: string;
  resolutionFamilyId: string;
  conflictingVersionIds: string[];
  conflictReason: string;
  detectedAt: number;
  isResolved: boolean;
  resolvedByEventId?: string;
}

export interface ConflictResolutionEvent {
  eventId: string;
  conflictId: string;
  resolutionFamilyId: string;
  unifyingResolutionVersionId: string;
  resolvedConflictHeadVersionIds: string[];
  resolutionRationale: string;
  resolvedAt: number;
}

export type LineageHeadStatus = 'UNRESOLVED' | 'AUTHORITATIVE' | 'LINEAGE_CONFLICT';

export interface LineageResolutionResult {
  status: LineageHeadStatus;
  authoritativeResolution?: AnswerAuthorityResolutionVersion;
  competingResolutionVersions?: AnswerAuthorityResolutionVersion[];
  conflictRecord?: ResolutionConflictRecord;
}

export type GenericScoringPolicyType =
  | 'MCQ_FIXED_PENALTY'
  | 'MCQ_NO_PENALTY'
  | 'MSQ_ALL_OR_NOTHING'
  | 'MSQ_PARTIAL_CREDIT'
  | 'NUMERICAL_EXACT'
  | 'NUMERICAL_TOLERANCE'
  | 'MATRIX_EXACT'
  | 'MATRIX_PARTIAL_CREDIT'
  | 'WITHDRAWN_FULL_CREDIT'
  | 'WITHDRAWN_EXCLUDE';

export interface ScoringPolicyRule {
  ruleId: string;
  policyType: GenericScoringPolicyType;
  canonicalQuestionType: string;
  targetSubtype?: string;
  sectionId?: string;
  requiredTraits?: string[];
  positiveMarks: number;
  negativeMarks: number;
  unansweredMarks: number;
  partialCreditConfig?: {
    singleOptionMatchWeight: number;
    wrongOptionPenalty: number;
    requireAllCorrectForBonus?: boolean;
  };
  numericalToleranceConfig?: {
    absoluteTolerance?: string;
    relativeTolerancePercent?: string;
    boundsInclusivity?: 'INCLUSIVE' | 'EXCLUSIVE';
    allowFractionSyntax?: boolean;
  };
  matrixMatchConfig?: {
    marksPerRow: number;
    penaltyPerWrongRow: number;
    allowDuplicateTargets?: boolean;
  };
  roundingPolicy?: 'NONE' | 'ROUND_HALF_UP_TWO_DECIMALS' | 'TRUNCATE_THREE_DECIMALS';
}

export interface ScoringPolicy {
  policyId: string;
  policyName: string;
  latestVersionNumber: number;
}

export interface ScoringPolicyVersion {
  policyVersionId: string;
  policyId: string;
  versionNumber: number;
  policyFingerprint: string;
  rules: ScoringPolicyRule[];
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdAt: number;
}

export interface UserAttemptResponse {
  attemptId: string;
  canonicalQuestionId: string;
  userSelectedOptionIds?: string[];
  userNumericalInput?: string;
  userMatrixPairs?: { source: string; target: string }[];
  isSkipped: boolean;
  responseFingerprint: string;
  submittedAt: number;
}

export interface ScoreEvaluationRecord {
  evaluationId: string;
  attemptId: string;
  canonicalQuestionId: string;
  responseFingerprint: string;
  resolvedAnswerVersionId: string;
  scoringPolicyVersionId: string;
  selectedRuleId: string;
  isCorrect: boolean;
  isPartial: boolean;
  isWrong: boolean;
  isSkipped: boolean;
  questionDisposition: QuestionDisposition;
  scoringDisposition: ScoringDisposition;
  awardedMarks: number;
  evaluationLog: string[];
  evaluatedAt: number;
}

// ============================================================================
// 11. UADUE Phase 2D-6 — Canonical Pipeline & Invariant Validation Contracts
// ============================================================================

export type CanonicalPackageValidationStatus =
  | 'PACKAGE_VALIDATED'
  | 'PACKAGE_REVIEW_REQUIRED'
  | 'PACKAGE_FAILED';

export interface InvariantValidationResult {
  invariantName: string;
  isSatisfied: boolean;
  failureDetails?: string[];
}

export interface QuarantinedRelationshipRecord {
  relationshipId: string;
  sourceCandidateId: string;
  targetCandidateId: string;
  relationshipType: string;
  quarantineReason:
    | 'DANGLING_SOURCE_CANDIDATE'
    | 'DANGLING_TARGET_CANDIDATE'
    | 'DANGLING_BOTH_CANDIDATES'
    | 'INVALID_RELATIONSHIP_STRUCTURE';
  quarantinedAt: number;
}

export interface CanonicalPackageValidationReport {
  reportId: string;
  packageId: string;
  validationStatus: CanonicalPackageValidationStatus;
  invariantsEvaluated: InvariantValidationResult[];
  passedInvariantCount: number;
  failedInvariantCount: number;
  totalCanonicalQuestions: number;
  validCanonicalQuestions: number;
  quarantinedQuestions: number;
  totalLogicalFamilies: number;
  totalRelationshipEvaluations: number;
  totalMemberships: number;
  quarantinedRelationshipsCount: number;
  authoritativeAnswerCount: number;
  conflictedAnswerCount: number;
  discrepancyCount: number;
  validationFingerprint: string;
  validatedAt: number;
}

export interface CanonicalAssessmentPackage {
  packageId: string; // Content-addressed package structure identity
  sourceSnapshotId: string;
  sourceDocumentId: string;
  schemaVersion: string;
  pipelineAlgorithmId: string;
  pipelineAlgorithmVersion: string;
  canonicalQuestions: CanonicalQuestionIR[];
  logicalFamilies: LogicalQuestionFamily[];
  relationshipEvaluations: RelationshipEvaluationResult[];
  memberships: CandidateFamilyMembership[];
  quarantinedRelationships: QuarantinedRelationshipRecord[];
  authoritativeAnswers: Record<string, LineageResolutionResult>;
  validationReport: CanonicalPackageValidationReport;
  packageIntegritySeal: string; // Full cryptographic content seal over ASTs, representations, answers, discrepancies
  sealedFingerprint: string; // Backward-compatible alias for packageIntegritySeal
  sealedAt: number;
}

export interface CanonicalPipelineExecutionInput {
  questionGraph: QuestionGraph;
  documentGraph?: DocumentGraph;
  answerEntries?: AnswerKeyEntry[];
  resolutionVersions?: AnswerAuthorityResolutionVersion[];
  conflictResolutionEvents?: ConflictResolutionEvent[];
  scoringPolicies?: ScoringPolicyVersion[];
  algorithmId?: string;
  algorithmVersion?: string;
  schemaVersion?: string;
  strictValidation?: boolean;
}

export interface CanonicalPipelineExecutionResult {
  isSuccess: boolean;
  package?: CanonicalAssessmentPackage;
  validationReport: CanonicalPackageValidationReport;
  executionErrors: string[];
  executionWarnings: string[];
}
