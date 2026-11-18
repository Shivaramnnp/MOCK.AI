/**
 * UADUE Phase 2D-5 — Answer Authority Resolution & Lineage Engine
 * Document Version: 5.3.0-APPEND-ONLY-LINEAGE
 *
 * Implements:
 * 1. RESOLUTION_IMMUTABILITY: Zero in-place mutation of persisted resolution records.
 * 2. SINGLE_CURRENT_HEAD Lineage Traversal:
 *    - 0 heads  => UNRESOLVED
 *    - 1 head   => AUTHORITATIVE
 *    - >1 heads => LINEAGE_CONFLICT (fail-closed, no versionNumber guessing)
 * 3. Dynamic lineage-derived effectiveTo without mutating previous records.
 * 4. Option B Conflict Resolution: Explicit ConflictResolutionEvent without violating single-parent lineage.
 */

import {
  AnswerAuthorityResolutionVersion,
  AnswerCandidate,
  AnswerVerificationStatus,
  ConflictResolutionEvent,
  LineageResolutionResult,
  QuestionDisposition,
  ResolutionConflictRecord,
  ScoringDisposition,
} from './types';
import {
  deriveConflictId,
  deriveResolutionFamilyId,
  deriveResolutionVersionId,
} from './canonicalHashing';

export interface CreateResolutionVersionInput {
  canonicalQuestionId: string;
  candidate: AnswerCandidate;
  versionNumber: number;
  questionDisposition?: QuestionDisposition;
  scoringDisposition?: ScoringDisposition;
  authorityDocumentSourceId: string;
  supersedesVersionId?: string | null;
  effectiveFrom: string;
  createdAt?: number;
}

/**
 * Creates an immutable AnswerAuthorityResolutionVersion.
 * Invariant: All identity fields participate in deterministic hashing; non-identity metadata is excluded.
 */
export function createResolutionVersion(
  input: CreateResolutionVersionInput
): AnswerAuthorityResolutionVersion {
  const {
    canonicalQuestionId,
    candidate,
    versionNumber,
    questionDisposition = 'ACTIVE',
    scoringDisposition = 'STANDARD_EVALUATION',
    authorityDocumentSourceId,
    supersedesVersionId = null,
    effectiveFrom,
    createdAt = Date.now(),
  } = input;

  const resolutionFamilyId = deriveResolutionFamilyId(canonicalQuestionId);

  const resolutionVersionId = deriveResolutionVersionId({
    canonicalQuestionId,
    versionNumber,
    candidateAnswerId: candidate.candidateAnswerId,
    verificationStatus: candidate.verificationStatus,
    questionDisposition,
    scoringDisposition,
    authorityDocumentSourceId,
    supersedesVersionId,
    effectiveFrom,
  });

  return {
    resolutionVersionId,
    resolutionFamilyId,
    versionNumber,
    canonicalQuestionId,
    candidateAnswerId: candidate.candidateAnswerId,
    verificationStatus: candidate.verificationStatus,
    questionDisposition,
    scoringDisposition,
    authorityDocumentSourceId,
    supersedesVersionId,
    effectiveFrom,
    createdAt,
  };
}

/**
 * Derives the dynamic effective time range for a historical version by inspecting its successor.
 * Invariant: Never mutates the original version record.
 */
export function deriveEffectiveTimeRange(
  version: AnswerAuthorityResolutionVersion,
  allFamilyVersions: AnswerAuthorityResolutionVersion[]
): { effectiveFrom: string; effectiveTo: string | null } {
  // Find immediate successor where successor.supersedesVersionId === version.resolutionVersionId
  const successor = allFamilyVersions.find(
    (v) => v.supersedesVersionId === version.resolutionVersionId
  );

  return {
    effectiveFrom: version.effectiveFrom,
    effectiveTo: successor ? successor.effectiveFrom : null,
  };
}

/**
 * Evaluates the lineage graph for a given family of resolution records.
 * Enforces the SINGLE_CURRENT_HEAD invariant.
 */
export function evaluateLineageHead(
  canonicalQuestionId: string,
  familyVersions: AnswerAuthorityResolutionVersion[],
  conflictEvents: ConflictResolutionEvent[] = []
): LineageResolutionResult {
  const relevantVersions = familyVersions.filter(
    (v) => v.canonicalQuestionId === canonicalQuestionId
  );

  if (relevantVersions.length === 0) {
    return {
      status: 'UNRESOLVED',
    };
  }

  const resolutionFamilyId = relevantVersions[0].resolutionFamilyId;

  // 1. Single-parent tree supersession:
  const supersededByParent = new Set<string>();
  for (const v of relevantVersions) {
    if (v.supersedesVersionId) {
      supersededByParent.add(v.supersedesVersionId);
    }
  }

  const treeHeads = relevantVersions.filter(
    (v) => !supersededByParent.has(v.resolutionVersionId)
  );

  if (treeHeads.length === 0) {
    return {
      status: 'UNRESOLVED',
    };
  }

  // 2. Process explicit ConflictResolutionEvents without version-number heuristics
  const supersededByConflict = new Set<string>();

  for (const event of conflictEvents) {
    if (event.resolutionFamilyId !== resolutionFamilyId) {
      continue;
    }

    // Look up unifying resolution version
    const unifyingVer = relevantVersions.find(
      (v) => v.resolutionVersionId === event.unifyingResolutionVersionId
    );

    // Invariant D: Invalid or unverified unifying version -> fail closed
    if (!unifyingVer || unifyingVer.verificationStatus !== 'VERIFIED') {
      const conflictId = deriveConflictId({
        resolutionFamilyId,
        conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId),
      });
      return {
        status: 'LINEAGE_CONFLICT',
        competingResolutionVersions: treeHeads,
        conflictRecord: {
          conflictId,
          resolutionFamilyId,
          conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId).sort(),
          conflictReason: `Conflict resolution event specifies invalid or unverified unifying resolution '${event.unifyingResolutionVersionId}'; fails closed`,
          detectedAt: Date.now(),
          isResolved: false,
        },
      };
    }

    // Normalize referenced heads (deterministic unique set)
    const referencedHeads = [...new Set(event.resolvedConflictHeadVersionIds || [])];

    for (const headId of referencedHeads) {
      const targetVer = relevantVersions.find((v) => v.resolutionVersionId === headId);

      // Invariant C: Dangling head reference -> fail closed
      if (!targetVer) {
        const conflictId = deriveConflictId({
          resolutionFamilyId,
          conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId),
        });
        return {
          status: 'LINEAGE_CONFLICT',
          competingResolutionVersions: treeHeads,
          conflictRecord: {
            conflictId,
            resolutionFamilyId,
            conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId).sort(),
            conflictReason: `Conflict resolution event references non-existent / dangling resolution version '${headId}'; fails closed`,
            detectedAt: Date.now(),
            isResolved: false,
          },
        };
      }

      // Invariant G: Unrelated historical version included -> reject / fail closed
      // A resolved head must be either:
      // a) An active tree head (competing alongside unifyingVer or its branch), OR
      // b) Directly superseded by unifyingVer (as its parent branch)
      const isCurrentTreeHead = treeHeads.some((th) => th.resolutionVersionId === headId);
      const isParentOfUnifying = unifyingVer.supersedesVersionId === headId;

      if (!isCurrentTreeHead && !isParentOfUnifying) {
        const conflictId = deriveConflictId({
          resolutionFamilyId,
          conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId),
        });
        return {
          status: 'LINEAGE_CONFLICT',
          competingResolutionVersions: treeHeads,
          conflictRecord: {
            conflictId,
            resolutionFamilyId,
            conflictingVersionIds: treeHeads.map((h) => h.resolutionVersionId).sort(),
            conflictReason: `Conflict resolution event references unrelated historical version '${headId}' that is not an active competing head; fails closed`,
            detectedAt: Date.now(),
            isResolved: false,
          },
        };
      }

      supersededByConflict.add(headId);
    }
  }

  // 3. Compute remaining candidate heads
  const candidateHeads = relevantVersions.filter(
    (v) =>
      !supersededByParent.has(v.resolutionVersionId) &&
      !supersededByConflict.has(v.resolutionVersionId)
  );

  if (candidateHeads.length === 0) {
    return {
      status: 'UNRESOLVED',
    };
  }

  if (candidateHeads.length === 1) {
    return {
      status: 'AUTHORITATIVE',
      authoritativeResolution: candidateHeads[0],
    };
  }

  // More than 1 head exists => LINEAGE_CONFLICT! Fail closed!
  // CRITICAL INVARIANT: Deterministic conflictId derived strictly from state; no Date.now()!
  const conflictRecord: ResolutionConflictRecord = {
    conflictId: deriveConflictId({
      resolutionFamilyId,
      conflictingVersionIds: candidateHeads.map((h) => h.resolutionVersionId),
    }),
    resolutionFamilyId,
    conflictingVersionIds: candidateHeads.map((h) => h.resolutionVersionId).sort(),
    conflictReason: `Multiple competing lineage heads detected (${candidateHeads.length} heads); resolution failed closed`,
    detectedAt: Date.now(),
    isResolved: false,
  };

  return {
    status: 'LINEAGE_CONFLICT',
    competingResolutionVersions: candidateHeads,
    conflictRecord,
  };
}
