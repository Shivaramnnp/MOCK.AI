/**
 * UADUE Phase 2D-3 — Logical Family Synthesizer
 * Document Version: 3.0.0-TOPOLOGY-HARDENED
 *
 * Implements pure, direct-evidence-backed synthesis of LogicalQuestionFamily entities.
 *
 * Inviolable Invariants:
 * 1. PhysicalQuestionCandidate is immutable (zero mutation of source truth).
 * 2. NO generic graph clustering (NO connected components, NO BFS/DFS, NO union-find, NO Warshall).
 * 3. NO synthetic relationship manufacturing (A-B and B-C proven does NOT create A-C).
 * 4. A family contains physical candidates ONLY through explicit, accepted CandidateFamilyMembership records.
 * 5. Deterministic family anchor model: family anchor is explicit and evidence-backed.
 * 6. Authentic source numbering discrepancies across representations are preserved exactly.
 * 7. 100% deterministic output; zero dependence on timestamp, random UUIDs, or array traversal order.
 * 8. Zero canonical IR synthesis at this phase (identity & topology only; no stem/option/answer merging).
 */

import {
  QuestionCandidate,
  RelationshipEvidence,
} from '../contracts/questionGraph';
import { computeDeterministicHash } from '../contracts/identity';
import {
  CandidateFamilyMembership,
  LogicalQuestionFamily,
  LogicalFamilyMember,
  LogicalQuestionFamilyProvenance,
  LogicalFamilySynthesisInput,
  LogicalFamilySynthesisResult,
  BatchLogicalFamilySynthesisInput,
  FamilyRepresentationRole,
} from './types';

export const DEFAULT_FAMILY_SYNTHESIS_ALGORITHM_ID = 'uadue_family_synthesizer_v3';
export const DEFAULT_FAMILY_SYNTHESIS_ALGORITHM_VERSION = '3.0.0';

export class LogicalFamilySynthesizer {
  private readonly algorithmId: string;
  private readonly algorithmVersion: string;

  constructor(
    algorithmId = DEFAULT_FAMILY_SYNTHESIS_ALGORITHM_ID,
    algorithmVersion = DEFAULT_FAMILY_SYNTHESIS_ALGORITHM_VERSION
  ) {
    this.algorithmId = algorithmId;
    this.algorithmVersion = algorithmVersion;
  }

  /**
   * Synthesizes a single LogicalQuestionFamily anchored by a designated anchor candidate.
   * Pure function: does NOT mutate candidates or memberships.
   */
  public synthesizeFamily(input: LogicalFamilySynthesisInput): LogicalFamilySynthesisResult {
    const { anchorCandidate, acceptedMemberships, allCandidates } = input;
    const algorithmId = input.algorithmId || this.algorithmId;
    const algorithmVersion = input.algorithmVersion || this.algorithmVersion;

    const rejectionReasons: string[] = [];
    const synthesisReasons: string[] = [];

    // 1. Basic entity presence validation
    if (!anchorCandidate || !anchorCandidate.physicalInstanceId) {
      rejectionReasons.push('Anchor candidate is missing or invalid.');
      const hash = computeDeterministicHash('family_rejected:missing_anchor');
      return {
        isSynthesized: false,
        rejectionReasons,
        synthesisReasons,
        deterministicFingerprint: hash,
      };
    }

    // Build candidate lookup maps
    const candIdMap = new Map<string, QuestionCandidate>();
    const candPhysMap = new Map<string, QuestionCandidate>();
    for (const c of allCandidates || []) {
      candIdMap.set(c.candidateId, c);
      candPhysMap.set(c.physicalInstanceId, c);
    }

    // Ensure anchor candidate is in maps
    candIdMap.set(anchorCandidate.candidateId, anchorCandidate);
    candPhysMap.set(anchorCandidate.physicalInstanceId, anchorCandidate);

    // 2. Filter accepted memberships strictly bound to this anchor
    // Invariant: only memberships with familyCandidateId === anchorCandidate.candidateId are admitted
    const relevantMemberships = (acceptedMemberships || []).filter(
      (m) => m.isAccepted && m.familyCandidateId === anchorCandidate.candidateId
    );

    // 3. Verify all referenced physical candidates exist (Fail-closed on dangling references - Case H)
    for (const m of relevantMemberships) {
      const referencedCandidate = candPhysMap.get(m.candidatePhysicalInstanceId);
      if (!referencedCandidate) {
        rejectionReasons.push(
          `Membership references non-existent physical candidate '${m.candidatePhysicalInstanceId}'.`
        );
      }
    }

    if (rejectionReasons.length > 0) {
      const sortedRejections = [...rejectionReasons].sort().join(';');
      const hash = computeDeterministicHash(
        `family_rejected:${anchorCandidate.physicalInstanceId}:${sortedRejections}`
      );
      return {
        isSynthesized: false,
        rejectionReasons,
        synthesisReasons: [],
        deterministicFingerprint: hash,
      };
    }

    // 4. Construct Anchor Member
    const anchorScript = anchorCandidate.languageRepresentations?.[0]?.languageScript || 'LATIN';
    const anchorMember: LogicalFamilyMember = {
      candidatePhysicalInstanceId: anchorCandidate.physicalInstanceId,
      candidateId: anchorCandidate.candidateId,
      representationRole: 'ANCHOR_REPRESENTATION',
      languageScript: anchorScript,
      sourceQuestionNumber: anchorCandidate.sourceQuestionNumber,
      pageNumber: anchorCandidate.startPageNumber,
      directMembershipFingerprint: computeDeterministicHash(
        `anchor_membership:${anchorCandidate.physicalInstanceId}:${anchorCandidate.candidateId}`
      ),
      directRelationshipEvaluationId: undefined,
      directEvidenceReferences: [],
    };

    // 5. Construct Additional Members (Idempotent deduplication by candidatePhysicalInstanceId - Case I)
    const membersByPhysId = new Map<string, LogicalFamilyMember>();
    membersByPhysId.set(anchorCandidate.physicalInstanceId, anchorMember);

    const directEvaluationIdsSet = new Set<string>();

    // Sort memberships deterministically before processing
    const sortedMemberships = [...relevantMemberships].sort((a, b) =>
      a.candidatePhysicalInstanceId.localeCompare(b.candidatePhysicalInstanceId)
    );

    for (const m of sortedMemberships) {
      // Avoid re-adding anchor if proposed as membership
      if (m.candidatePhysicalInstanceId === anchorCandidate.physicalInstanceId) {
        continue;
      }

      // Collect evaluation IDs
      for (const evalId of m.directRelationshipEvaluationIds || []) {
        directEvaluationIdsSet.add(evalId);
      }

      const cand = candPhysMap.get(m.candidatePhysicalInstanceId)!;
      const script = cand.languageRepresentations?.[0]?.languageScript || 'LATIN';

      // Assign representation role based on evidence and distinct script
      const isLanguageRep =
        script !== anchorScript ||
        m.directEvidenceReferences.some(
          (e) =>
            e.evidenceType === 'DISTINCT_SCRIPT_DETECTION' ||
            e.evidenceType === 'FACING_PAGE_SPREAD_PAIR'
        );

      const representationRole: FamilyRepresentationRole = isLanguageRep
        ? 'LANGUAGE_REPRESENTATION'
        : 'LOGICAL_VIEW_REPRESENTATION';

      const member: LogicalFamilyMember = {
        candidatePhysicalInstanceId: cand.physicalInstanceId,
        candidateId: cand.candidateId,
        representationRole,
        languageScript: script,
        sourceQuestionNumber: cand.sourceQuestionNumber,
        pageNumber: cand.startPageNumber,
        directMembershipFingerprint: m.membershipFingerprint,
        directRelationshipEvaluationId: m.directRelationshipEvaluationIds[0],
        directEvidenceReferences: [...m.directEvidenceReferences],
      };

      // Idempotently set member
      membersByPhysId.set(cand.physicalInstanceId, member);
    }

    // 6. Deterministically assemble member list (Anchor first, then sorted by physicalInstanceId)
    const nonAnchorMembers = Array.from(membersByPhysId.values())
      .filter((m) => m.representationRole !== 'ANCHOR_REPRESENTATION')
      .sort((a, b) => a.candidatePhysicalInstanceId.localeCompare(b.candidatePhysicalInstanceId));

    const finalMembers: LogicalFamilyMember[] = [anchorMember, ...nonAnchorMembers];
    const sortedDirectEvalIds = Array.from(directEvaluationIdsSet).sort();

    // 7. Compute Deterministic Family ID & Fingerprint
    const memberPhysListStr = finalMembers.map((m) => m.candidatePhysicalInstanceId).join(',');
    const evalListStr = sortedDirectEvalIds.join(',');

    const familyId = computeDeterministicHash(
      `family:${anchorCandidate.physicalInstanceId}:${memberPhysListStr}:${evalListStr}`
    );

    // 8. Build Provenance
    const firstMembership = relevantMemberships[0];
    const provenance: LogicalQuestionFamilyProvenance = {
      sourceSnapshotId:
        firstMembership?.provenance.sourceSnapshotId ||
        input.sourceSnapshotId ||
        'snapshot_unknown',
      sourceDocumentId:
        firstMembership?.provenance.sourceDocumentId ||
        input.sourceDocumentId ||
        'doc_unknown',
      algorithmId,
      algorithmVersion,
      synthesizedAt: 0, // Deterministic epoch
    };

    synthesisReasons.push(
      `Logical family synthesized around anchor candidate ${anchorCandidate.candidateId} (Physical: ${anchorCandidate.physicalInstanceId}).`
    );
    synthesisReasons.push(
      `Total members: ${finalMembers.length} (${finalMembers.filter((m) => m.representationRole === 'LANGUAGE_REPRESENTATION').length} language representations).`
    );
    synthesisReasons.push(
      `Direct evaluation IDs consumed: ${sortedDirectEvalIds.length}.`
    );

    const family: LogicalQuestionFamily = {
      familyId,
      anchorPhysicalInstanceId: anchorCandidate.physicalInstanceId,
      anchorCandidateId: anchorCandidate.candidateId,
      members: finalMembers,
      directRelationshipEvaluationIds: sortedDirectEvalIds,
      verificationStatus: 'RELATIONSHIP_PROVEN',
      provenance,
      algorithmVersion,
      familyFingerprint: familyId,
      synthesisReasons,
    };

    return {
      family,
      isSynthesized: true,
      rejectionReasons: [],
      synthesisReasons,
      deterministicFingerprint: familyId,
    };
  }

  /**
   * Batch synthesis of logical families across all candidates and accepted memberships.
   * Pure function: groups memberships by anchor familyCandidateId without global graph clustering.
   */
  public synthesizeBatchFamilies(
    input: BatchLogicalFamilySynthesisInput
  ): LogicalQuestionFamily[] {
    const candidateMap = new Map<string, QuestionCandidate>();
    input.candidates.forEach((c) => candidateMap.set(c.candidateId, c));

    // Identify all distinct anchors
    const anchorIds = new Set<string>();
    for (const m of input.acceptedMemberships || []) {
      if (m.isAccepted && m.familyCandidateId) {
        anchorIds.add(m.familyCandidateId);
      }
    }

    const families: LogicalQuestionFamily[] = [];

    // Sort anchor IDs deterministically
    const sortedAnchorIds = Array.from(anchorIds).sort();

    for (const anchorId of sortedAnchorIds) {
      const anchorCandidate = candidateMap.get(anchorId);
      if (!anchorCandidate) {
        continue;
      }

      const result = this.synthesizeFamily({
        anchorCandidate,
        acceptedMemberships: input.acceptedMemberships,
        allCandidates: input.candidates,
        sourceSnapshotId: input.sourceSnapshotId,
        sourceDocumentId: input.sourceDocumentId,
        algorithmId: input.algorithmId,
        algorithmVersion: input.algorithmVersion,
      });

      if (result.isSynthesized && result.family) {
        families.push(result.family);
      }
    }

    // Sort resulting families deterministically by familyId
    return families.sort((a, b) => a.familyId.localeCompare(b.familyId));
  }
}
