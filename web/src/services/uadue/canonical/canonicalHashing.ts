/**
 * UADUE Phase 2D-5 — Canonical Deterministic Serialization & Hashing Engine
 * Document Version: 5.3.0-RFC8785-COMPLIANT
 *
 * Implements:
 * 1. Domain Semantic Normalization (Sorts semantically unordered sets; preserves ordered sequences)
 * 2. RFC 8785 JSON Canonicalization Scheme (JCS) (Lexicographical key sorting; preserves array order)
 * 3. UTF-8 SHA-256 Digest
 * 4. Strict Identity Payloads (Excludes runtime/operational metadata)
 */

import { createHash } from 'crypto';
import {
  UniversalAnswerPayload,
  AnswerVerificationStatus,
  QuestionDisposition,
  ScoringDisposition,
  ScoringPolicyRule,
  CanonicalQuestionIR,
  LogicalQuestionFamily,
  RelationshipEvaluationResult,
  CandidateFamilyMembership,
  QuarantinedRelationshipRecord,
  LineageResolutionResult,
} from './types';

// ============================================================================
// 1. RFC 8785 JSON Canonicalization Scheme (JCS)
// ============================================================================

/**
 * Formats a JSON-serializable value strictly according to RFC 8785 (JCS).
 * - Object keys are sorted lexicographically by UTF-16 code units.
 * - Array element ordering is strictly PRESERVED (JCS does NOT sort arrays).
 * - Whitespace is completely omitted.
 * - Numbers are serialized via ECMAScript canonical representation.
 */
export function rfc8785Canonicalize(val: unknown): string {
  if (val === null) {
    return 'null';
  }
  if (typeof val === 'boolean') {
    return val ? 'true' : 'false';
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      throw new Error(`RFC 8785 forbids non-finite numbers: ${val}`);
    }
    // Object.is(-0, val) checks for negative zero
    if (Object.is(-0, val) || val === 0) {
      return '0';
    }
    return JSON.stringify(val);
  }
  if (typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    const serializedElements = val.map((item) => {
      if (item === undefined) {
        return 'null'; // In JSON arrays, undefined becomes null
      }
      return rfc8785Canonicalize(item);
    });
    return `[${serializedElements.join(',')}]`;
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    // Keys sorted lexicographically by Unicode code point / UTF-16 code unit
    const sortedKeys = Object.keys(obj).sort();
    const pairs: string[] = [];

    for (const key of sortedKeys) {
      const propVal = obj[key];
      // RFC 8785: properties with undefined value are omitted
      if (propVal !== undefined) {
        pairs.push(`${JSON.stringify(key)}:${rfc8785Canonicalize(propVal)}`);
      }
    }
    return `{${pairs.join(',')}}`;
  }

  throw new Error(`Unsupported type for RFC 8785 canonicalization: ${typeof val}`);
}

// ============================================================================
// 2. Domain Semantic Normalization
// ============================================================================

/**
 * Recursively normalizes domain semantic structures.
 * Normalizes unordered sets by sorting their elements, while preserving order for ordered arrays.
 */
export function domainCanonicalize(val: unknown): unknown {
  if (val === null || val === undefined || typeof val !== 'object') {
    return val;
  }

  if (Array.isArray(val)) {
    // By default, preserves array element sequence unless explicitly marked
    return val.map((item) => domainCanonicalize(item));
  }

  const obj = val as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  for (const [key, propVal] of Object.entries(obj)) {
    if (propVal === undefined) {
      continue;
    }

    // Domain Rule: Specific known unordered set fields are sorted deterministically
    if (key === 'userSelectedOptionIds' && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else if (key === 'correctOptionLabels' && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else if (key === 'correctOptionIds' && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else if (key === 'conflictingVersionIds' && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else if (key === 'resolvedConflictHeadVersionIds' && Array.isArray(propVal)) {
      normalized[key] = [...new Set(propVal.map(String))].sort();
    } else if (key === 'targetLabels' && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else if (key === 'requiredTraits' && Array.isArray(propVal)) {
      normalized[key] = [...propVal].map(String).sort();
    } else {
      normalized[key] = domainCanonicalize(propVal);
    }
  }

  return normalized;
}

/**
 * Computes a deterministic SHA-256 hash using Domain Normalization + RFC 8785 JCS.
 */
export function computeCanonicalSha256(domainPrefix: string, payload: Record<string, unknown>): string {
  const domainNormalized = domainCanonicalize(payload);
  const jcsString = rfc8785Canonicalize(domainNormalized);
  return createHash('sha256').update(`${domainPrefix}:${jcsString}`, 'utf8').digest('hex');
}

// ============================================================================
// 3. Strict Identity Payload Derivations
// ============================================================================

export function deriveSourceId(input: {
  sourceFileHash: string;
  documentType: string;
  issuingAuthority: string;
}): string {
  return computeCanonicalSha256('key_src', {
    documentType: input.documentType,
    issuingAuthority: input.issuingAuthority,
    sourceFileHash: input.sourceFileHash,
  });
}

export function deriveEntryId(input: {
  snapshotId: string;
  sourceNodeId: string;
  pageNumber: number;
  rawPaperSetOrVariant?: string | null;
  rawSectionId?: string | null;
  rawPrintedQuestionNumber: string;
  rawExtractedValue: string;
}): string {
  return computeCanonicalSha256('key_entry', {
    pageNumber: input.pageNumber,
    rawExtractedValue: input.rawExtractedValue,
    rawPaperSetOrVariant: input.rawPaperSetOrVariant ?? null,
    rawPrintedQuestionNumber: input.rawPrintedQuestionNumber,
    rawSectionId: input.rawSectionId ?? null,
    snapshotId: input.snapshotId,
    sourceNodeId: input.sourceNodeId,
  });
}

export function deriveCandidateAnswerId(input: {
  canonicalQuestionId: string;
  sourceEntryId: string;
  parsedPayload: UniversalAnswerPayload;
}): string {
  return computeCanonicalSha256('ans_cand', {
    canonicalQuestionId: input.canonicalQuestionId,
    parsedPayload: input.parsedPayload,
    sourceEntryId: input.sourceEntryId,
  });
}

export function deriveResolutionFamilyId(canonicalQuestionId: string): string {
  return computeCanonicalSha256('ans_res_fam', {
    canonicalQuestionId,
  });
}

export interface StrictResolutionVersionIdentityPayload {
  canonicalQuestionId: string;
  versionNumber: number;
  candidateAnswerId: string;
  verificationStatus: AnswerVerificationStatus;
  questionDisposition: QuestionDisposition;
  scoringDisposition: ScoringDisposition;
  authorityDocumentSourceId: string;
  supersedesVersionId: string | null;
  effectiveFrom: string;
}

export function deriveResolutionVersionId(input: StrictResolutionVersionIdentityPayload): string {
  return computeCanonicalSha256('ans_res_ver', {
    authorityDocumentSourceId: input.authorityDocumentSourceId,
    candidateAnswerId: input.candidateAnswerId,
    canonicalQuestionId: input.canonicalQuestionId,
    effectiveFrom: input.effectiveFrom,
    questionDisposition: input.questionDisposition,
    scoringDisposition: input.scoringDisposition,
    supersedesVersionId: input.supersedesVersionId ?? null,
    verificationStatus: input.verificationStatus,
    versionNumber: input.versionNumber,
  });
}

export function derivePolicyId(policyName: string): string {
  return computeCanonicalSha256('pol_fam', {
    policyName,
  });
}

export function derivePolicyFingerprint(rules: ScoringPolicyRule[]): string {
  return computeCanonicalSha256('pol_fp', {
    rules,
  });
}

export function derivePolicyVersionId(input: {
  policyId: string;
  versionNumber: number;
  policyFingerprint: string;
}): string {
  return computeCanonicalSha256('pol_ver', {
    policyFingerprint: input.policyFingerprint,
    policyId: input.policyId,
    versionNumber: input.versionNumber,
  });
}

export function deriveResponseFingerprint(input: {
  userSelectedOptionIds?: string[];
  userNumericalInput?: string | null;
  userMatrixPairs?: { source: string; target: string }[];
  isSkipped: boolean;
}): string {
  return computeCanonicalSha256('resp_fp', {
    isSkipped: input.isSkipped,
    userMatrixPairs: input.userMatrixPairs ?? null,
    userNumericalInput: input.userNumericalInput ?? null,
    userSelectedOptionIds: input.userSelectedOptionIds ?? null,
  });
}

export function deriveEvaluationId(input: {
  attemptId: string;
  canonicalQuestionId: string;
  responseFingerprint: string;
  resolvedAnswerVersionId: string;
  scoringPolicyVersionId: string;
}): string {
  return computeCanonicalSha256('score_eval', {
    attemptId: input.attemptId,
    canonicalQuestionId: input.canonicalQuestionId,
    resolvedAnswerVersionId: input.resolvedAnswerVersionId,
    responseFingerprint: input.responseFingerprint,
    scoringPolicyVersionId: input.scoringPolicyVersionId,
  });
}

export function deriveConflictId(input: {
  resolutionFamilyId: string;
  conflictingVersionIds: string[];
}): string {
  return computeCanonicalSha256('conflict', {
    conflictingVersionIds: input.conflictingVersionIds,
    resolutionFamilyId: input.resolutionFamilyId,
  });
}

export function deriveConflictResolutionEventId(input: {
  conflictId: string;
  resolutionFamilyId: string;
  unifyingResolutionVersionId: string;
  resolvedConflictHeadVersionIds: string[];
}): string {
  return computeCanonicalSha256('conf_event', {
    conflictId: input.conflictId,
    resolutionFamilyId: input.resolutionFamilyId,
    resolvedConflictHeadVersionIds: input.resolvedConflictHeadVersionIds,
    unifyingResolutionVersionId: input.unifyingResolutionVersionId,
  });
}

// ============================================================================
// 4. Package Identity & Cryptographic Integrity Sealing
// ============================================================================

export function derivePackageId(input: {
  sourceSnapshotId: string;
  sourceDocumentId: string;
  canonicalQuestionIds: string[];
  logicalFamilyIds: string[];
  relationshipEvaluationIds: string[];
  membershipIds: string[];
  quarantinedRelationshipIds?: string[];
  schemaVersion: string;
  pipelineAlgorithmId: string;
  pipelineAlgorithmVersion: string;
}): string {
  return computeCanonicalSha256('canonical_package', {
    canonicalQuestionIds: [...input.canonicalQuestionIds].sort(),
    logicalFamilyIds: [...input.logicalFamilyIds].sort(),
    membershipIds: [...input.membershipIds].sort(),
    pipelineAlgorithmId: input.pipelineAlgorithmId,
    pipelineAlgorithmVersion: input.pipelineAlgorithmVersion,
    quarantinedRelationshipIds: input.quarantinedRelationshipIds
      ? [...input.quarantinedRelationshipIds].sort()
      : [],
    relationshipEvaluationIds: [...input.relationshipEvaluationIds].sort(),
    schemaVersion: input.schemaVersion,
    sourceDocumentId: input.sourceDocumentId,
    sourceSnapshotId: input.sourceSnapshotId,
  });
}

export function computePackageIntegritySeal(input: {
  packageId: string;
  sourceSnapshotId?: string;
  sourceDocumentId?: string;
  canonicalQuestions: CanonicalQuestionIR[];
  logicalFamilies: LogicalQuestionFamily[];
  relationshipEvaluations: RelationshipEvaluationResult[];
  memberships: CandidateFamilyMembership[];
  quarantinedRelationships: QuarantinedRelationshipRecord[];
  authoritativeAnswers: Record<string, LineageResolutionResult>;
  schemaVersion: string;
  pipelineAlgorithmId: string;
  pipelineAlgorithmVersion: string;
}): string {
  const contentPayload = {
    authoritativeAnswers: Object.entries(input.authoritativeAnswers)
      .map(([qid, res]) => ({
        authoritativeResolutionId: res.authoritativeResolution?.resolutionVersionId ?? null,
        candidateAnswerId: res.authoritativeResolution?.candidateAnswerId ?? null,
        canonicalQuestionId: qid,
        competingVersionIds: res.competingResolutionVersions
          ? res.competingResolutionVersions.map((v) => v.resolutionVersionId).sort()
          : [],
        status: res.status,
      }))
      .sort((a, b) => a.canonicalQuestionId.localeCompare(b.canonicalQuestionId)),
    canonicalQuestions: input.canonicalQuestions.map((q: any) => ({
      canonicalFingerprint: q.canonicalFingerprint,
      canonicalQuestionId: q.canonicalQuestionId,
      familyRole: q.familyRole,
      logicalFamilyId: q.logicalFamilyId,
      representations: q.representations.map((r: any) => ({
        diagrams: r.diagrams,
        languageScript: r.languageScript,
        mathBlocks: r.mathBlocks,
        options: r.options,
        representationId: r.representationId,
        sourcePhysicalInstanceId: r.sourcePhysicalInstanceId,
        sourceQuestionNumber: r.sourceQuestionNumber ?? null,
        stemAST: r.stemAST,
        tables: r.tables,
      })),
      sourceDiscrepancies: q.sourceDiscrepancies,
      synthesizedQuestionType: q.synthesizedQuestionType,
    })),
    logicalFamilies: input.logicalFamilies.map((f: any) => ({
      familyAnchorPhysicalInstanceId: f.familyAnchorPhysicalInstanceId || f.anchorPhysicalInstanceId,
      familyId: f.familyId,
      familyType: f.familyType,
      members: f.members,
    })),
    memberships: input.memberships.map((m: any) => ({
      candidatePhysicalInstanceId: m.candidatePhysicalInstanceId,
      familyCandidateId: m.familyCandidateId,
      membershipFingerprint: m.membershipFingerprint,
      role: m.role,
      verificationStatus: m.verificationStatus,
    })),
    packageId: input.packageId,
    pipelineAlgorithmId: input.pipelineAlgorithmId,
    pipelineAlgorithmVersion: input.pipelineAlgorithmVersion,
    quarantinedRelationships: input.quarantinedRelationships.map((qr) => ({
      quarantineReason: qr.quarantineReason,
      relationshipId: qr.relationshipId,
      relationshipType: qr.relationshipType,
      sourceCandidateId: qr.sourceCandidateId,
      targetCandidateId: qr.targetCandidateId,
    })),
    relationshipEvaluations: input.relationshipEvaluations.map((r) => ({
      evaluationId: r.evaluationId,
      relationshipType: r.relationshipType,
      sourcePhysicalInstanceId: r.sourcePhysicalInstanceId,
      targetPhysicalInstanceId: r.targetPhysicalInstanceId,
      verificationStatus: r.verificationStatus,
    })),
    schemaVersion: input.schemaVersion,
    sourceDocumentId: input.sourceDocumentId ?? null,
    sourceSnapshotId: input.sourceSnapshotId ?? null,
  };

  return computeCanonicalSha256('pkg_integrity_seal', contentPayload);
}

