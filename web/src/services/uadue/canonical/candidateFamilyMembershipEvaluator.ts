/**
 * UADUE Phase 2D-2 — Candidate Family Membership Evaluator
 * Document Version: 3.0.0-TOPOLOGY-HARDENED
 *
 * Implements pure, direct-evidence-based evaluation of CandidateFamilyMembership.
 *
 * Inviolable Architectural Invariants:
 * 1. PhysicalQuestionCandidate is immutable (zero mutation of source truth).
 * 2. Relationship transitivity != family membership transitivity.
 * 3. NO graph closure, NO connected components, NO BFS/DFS, NO union-find clustering.
 * 4. A CandidateFamilyMembership requires an independently evaluated, direct, proven relationship
 *    between the candidate and the referenced family target.
 * 5. Only PROVEN SAME_LOGICAL_QUESTION and PROVEN LANGUAGE_REPRESENTATION_OF are eligible.
 * 6. Evidence and evaluation ID integrity: dangling, mismatched, or stale references are rejected.
 * 7. Zero exam-specific or language-specific branching logic.
 * 8. 100% deterministic output and pass-through for deeply frozen inputs.
 */

import {
  QuestionCandidate,
  RelationshipEvidence,
} from '../contracts/questionGraph';
import { computeDeterministicHash } from '../contracts/identity';
import {
  CandidateFamilyMembership,
  CandidateFamilyMembershipProvenance,
  CandidateFamilyMembershipInput,
  CandidateFamilyMembershipEvaluationResult,
  BatchCandidateFamilyMembershipInput,
  RelationshipEvaluationResult,
  CanonicalRelationshipType,
} from './types';

export const DEFAULT_MEMBERSHIP_ALGORITHM_ID = 'uadue_family_membership_evaluator_v3';
export const DEFAULT_MEMBERSHIP_ALGORITHM_VERSION = '3.0.0';

const ALLOWED_MEMBERSHIP_RELATIONSHIP_TYPES = new Set<CanonicalRelationshipType>([
  'SAME_LOGICAL_QUESTION',
  'LANGUAGE_REPRESENTATION_OF',
]);

export class CandidateFamilyMembershipEvaluator {
  private readonly algorithmId: string;
  private readonly algorithmVersion: string;

  constructor(
    algorithmId = DEFAULT_MEMBERSHIP_ALGORITHM_ID,
    algorithmVersion = DEFAULT_MEMBERSHIP_ALGORITHM_VERSION
  ) {
    this.algorithmId = algorithmId;
    this.algorithmVersion = algorithmVersion;
  }

  /**
   * Evaluates a single pairwise candidate family membership proposal.
   * Pure function: does NOT mutate candidate, familyTargetCandidate, or relationship evaluation.
   */
  public evaluateMembership(
    input: CandidateFamilyMembershipInput
  ): CandidateFamilyMembershipEvaluationResult {
    const { candidate, familyTargetCandidate, directRelationshipEvaluation } = input;
    const algorithmId = input.algorithmId || this.algorithmId;
    const algorithmVersion = input.algorithmVersion || this.algorithmVersion;

    const rejectionReasons: string[] = [];
    const evaluationReasons: string[] = [];

    // 1. Basic entity presence validation
    if (!candidate || !candidate.physicalInstanceId) {
      rejectionReasons.push('Candidate physical instance ID is missing or invalid.');
    }
    if (!familyTargetCandidate || !familyTargetCandidate.candidateId) {
      rejectionReasons.push('Family target candidate is missing or invalid.');
    }
    if (!directRelationshipEvaluation) {
      rejectionReasons.push('Direct relationship evaluation reference is missing (dangling reference).');
      const hash = computeDeterministicHash(
        `membership_rejected:${candidate?.physicalInstanceId || 'unknown'}:${familyTargetCandidate?.candidateId || 'unknown'}:missing_eval`
      );
      return {
        isAccepted: false,
        rejectionReasons,
        evaluationReasons,
        deterministicFingerprint: hash,
      };
    }

    // 2. Relationship Type Gate (P4: Only SAME_LOGICAL_QUESTION and LANGUAGE_REPRESENTATION_OF allowed)
    if (!ALLOWED_MEMBERSHIP_RELATIONSHIP_TYPES.has(directRelationshipEvaluation.relationshipType)) {
      rejectionReasons.push(
        `Relationship type '${directRelationshipEvaluation.relationshipType}' is not eligible for family membership. Permitted types are: SAME_LOGICAL_QUESTION, LANGUAGE_REPRESENTATION_OF.`
      );
    }

    // 3. Verification Status Gate (P2: Must be RELATIONSHIP_PROVEN)
    if (directRelationshipEvaluation.verificationStatus !== 'RELATIONSHIP_PROVEN') {
      rejectionReasons.push(
        `Direct relationship verification status '${directRelationshipEvaluation.verificationStatus}' is not RELATIONSHIP_PROVEN.`
      );
    }

    // 4. Family Synthesis Eligibility Gate
    if (!directRelationshipEvaluation.isEligibleForFamilySynthesis) {
      rejectionReasons.push(
        'Direct relationship evaluation has isEligibleForFamilySynthesis = false.'
      );
    }

    // 5. Fatal Conflicting Evidence Check
    if (
      directRelationshipEvaluation.conflictingEvidence &&
      directRelationshipEvaluation.conflictingEvidence.length > 0
    ) {
      rejectionReasons.push(
        `Direct relationship contains ${directRelationshipEvaluation.conflictingEvidence.length} conflicting evidence tokens.`
      );
    }

    // 6. Direct Candidate Pair Binding Gate (P2/P6 Case H)
    if (candidate && familyTargetCandidate) {
      const evalSourcePhys = directRelationshipEvaluation.sourcePhysicalInstanceId;
      const evalTargetPhys = directRelationshipEvaluation.targetPhysicalInstanceId;
      const candPhys = candidate.physicalInstanceId;
      const targetPhys = familyTargetCandidate.physicalInstanceId;

      const isDirectPair =
        (evalSourcePhys === candPhys && evalTargetPhys === targetPhys) ||
        (evalTargetPhys === candPhys && evalSourcePhys === targetPhys);

      if (!isDirectPair) {
        rejectionReasons.push(
          `Evaluation ID '${directRelationshipEvaluation.evaluationId}' candidate pair (${evalSourcePhys}, ${evalTargetPhys}) does not match membership candidates (${candPhys}, ${targetPhys}).`
        );
      }
    }

    // 7. Evaluation ID Integrity Gate (P6)
    if (!directRelationshipEvaluation.evaluationId || directRelationshipEvaluation.evaluationId.trim().length === 0) {
      rejectionReasons.push('Direct relationship evaluation contains an empty or invalid evaluation ID.');
    }

    // 8. Provenance Snapshot / Document Compatibility Gate (P6 Case F)
    if (input.sourceSnapshotId && directRelationshipEvaluation.provenance) {
      if (directRelationshipEvaluation.provenance.sourceSnapshotId !== input.sourceSnapshotId) {
        rejectionReasons.push(
          `Provenance mismatch: input sourceSnapshotId '${input.sourceSnapshotId}' does not match evaluation '${directRelationshipEvaluation.provenance.sourceSnapshotId}'.`
        );
      }
    }
    if (input.sourceDocumentId && directRelationshipEvaluation.provenance) {
      if (directRelationshipEvaluation.provenance.sourceDocumentId !== input.sourceDocumentId) {
        rejectionReasons.push(
          `Provenance mismatch: input sourceDocumentId '${input.sourceDocumentId}' does not match evaluation '${directRelationshipEvaluation.provenance.sourceDocumentId}'.`
        );
      }
    }

    // 9. Process Rejection vs Acceptance
    if (rejectionReasons.length > 0) {
      const sortedRejections = [...rejectionReasons].sort().join(';');
      const rejectionFingerprint = computeDeterministicHash(
        `membership_rejected:${candidate?.physicalInstanceId || 'unknown'}:${familyTargetCandidate?.candidateId || 'unknown'}:${directRelationshipEvaluation.evaluationId}:${sortedRejections}`
      );

      return {
        isAccepted: false,
        rejectionReasons,
        evaluationReasons: [],
        deterministicFingerprint: rejectionFingerprint,
      };
    }

    // 10. Construct Accepted Membership
    const directEvidenceReferences: RelationshipEvidence[] = [
      ...(directRelationshipEvaluation.allEvidence || []),
    ];

    const provenance: CandidateFamilyMembershipProvenance = {
      sourceSnapshotId: directRelationshipEvaluation.provenance?.sourceSnapshotId || 'snapshot_unknown',
      sourceDocumentId: directRelationshipEvaluation.provenance?.sourceDocumentId || 'doc_unknown',
      algorithmId,
      algorithmVersion,
      evaluatedAt: 0, // Deterministic epoch for stable hashing
    };

    const sortedEvidenceIds = directEvidenceReferences
      .map((e) => e.evidenceId)
      .sort()
      .join(',');

    const membershipFingerprint = computeDeterministicHash(
      `membership_accepted:${candidate.physicalInstanceId}:${familyTargetCandidate.candidateId}:${directRelationshipEvaluation.evaluationId}:${sortedEvidenceIds}`
    );

    evaluationReasons.push(
      `Directly proven ${directRelationshipEvaluation.relationshipType} relationship verified against family target ${familyTargetCandidate.candidateId}.`
    );
    evaluationReasons.push(`Direct evaluation ID: ${directRelationshipEvaluation.evaluationId}`);
    evaluationReasons.push(`Supporting evidence count: ${directEvidenceReferences.length}`);

    const membership: CandidateFamilyMembership = {
      candidatePhysicalInstanceId: candidate.physicalInstanceId,
      familyCandidateId: familyTargetCandidate.candidateId,
      directRelationshipEvaluationIds: [directRelationshipEvaluation.evaluationId],
      directEvidenceReferences,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      provenance,
      algorithmVersion,
      membershipFingerprint,
      isAccepted: true,
      membershipReasons: evaluationReasons,
    };

    return {
      membership,
      isAccepted: true,
      rejectionReasons: [],
      evaluationReasons,
      deterministicFingerprint: membershipFingerprint,
    };
  }

  /**
   * Batch evaluation across multiple explicit candidate family membership proposals.
   * Pure function: operates strictly on supplied proposals without graph closures or transitive clustering.
   */
  public evaluateBatchMemberships(
    input: BatchCandidateFamilyMembershipInput
  ): CandidateFamilyMembershipEvaluationResult[] {
    const candidateMap = new Map<string, QuestionCandidate>();
    input.candidates.forEach((c) => candidateMap.set(c.candidateId, c));

    const evalMap = new Map<string, RelationshipEvaluationResult>();
    input.relationshipEvaluations.forEach((e) => evalMap.set(e.evaluationId, e));

    const results: CandidateFamilyMembershipEvaluationResult[] = [];

    // Sort proposals deterministically by candidateId and familyTargetCandidateId
    const sortedProposals = [...input.membershipProposals].sort((a, b) => {
      const cmpCand = a.candidateId.localeCompare(b.candidateId);
      if (cmpCand !== 0) return cmpCand;
      return a.familyTargetCandidateId.localeCompare(b.familyTargetCandidateId);
    });

    for (const proposal of sortedProposals) {
      const candidate = candidateMap.get(proposal.candidateId);
      const familyTargetCandidate = candidateMap.get(proposal.familyTargetCandidateId);
      const directRelationshipEvaluation = evalMap.get(proposal.relationshipEvaluationId);

      if (!candidate || !familyTargetCandidate || !directRelationshipEvaluation) {
        const rejectionReasons: string[] = [];
        if (!candidate) rejectionReasons.push(`Candidate '${proposal.candidateId}' not found.`);
        if (!familyTargetCandidate)
          rejectionReasons.push(`Family target candidate '${proposal.familyTargetCandidateId}' not found.`);
        if (!directRelationshipEvaluation)
          rejectionReasons.push(`Relationship evaluation '${proposal.relationshipEvaluationId}' not found (dangling ID).`);

        const hash = computeDeterministicHash(
          `membership_rejected:${proposal.candidateId}:${proposal.familyTargetCandidateId}:${proposal.relationshipEvaluationId}:missing_ref`
        );

        results.push({
          isAccepted: false,
          rejectionReasons,
          evaluationReasons: [],
          deterministicFingerprint: hash,
        });
        continue;
      }

      results.push(
        this.evaluateMembership({
          candidate,
          familyTargetCandidate,
          directRelationshipEvaluation,
          sourceSnapshotId: input.sourceSnapshotId,
          sourceDocumentId: input.sourceDocumentId,
          algorithmId: input.algorithmId,
          algorithmVersion: input.algorithmVersion,
        })
      );
    }

    return results;
  }
}
