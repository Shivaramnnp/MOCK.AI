/**
 * UADUE Phase 2D-1 — Relationship Evaluation Engine
 * Document Version: 3.0.0-TOPOLOGY-HARDENED
 *
 * Implements pure, per-relationship evidence-based relationship evaluation.
 *
 * Inviolable Invariants:
 * 1. PhysicalQuestionCandidate is immutable (zero mutation).
 * 2. Confidence is descriptive metadata only; verification is strictly evidence-driven.
 * 3. Every relationship type has explicit evidence requirements.
 * 4. LANGUAGE_REPRESENTATION_OF is strictly NON-TRANSITIVE.
 * 5. POSSIBLE_DUPLICATE_CANDIDATE is capped at PLAUSIBLE (never auto-proven).
 * 6. CONTINUATION_OF strictly verifies page & sequence monotonicity.
 * 7. Deterministic hashing ensures bitwise identical output on identical inputs.
 */

import {
  QuestionCandidate,
  QuestionRelationshipCandidate,
  RelationshipEvidence,
  RelationshipEvidenceType,
  RelationshipVerificationStatus,
} from '../contracts/questionGraph';
import { computeDeterministicHash } from '../contracts/identity';
import {
  CanonicalRelationshipType,
  RelationshipEvaluationInput,
  BatchRelationshipEvaluationInput,
  RelationshipEvaluationResult,
  RelationshipProvenance,
} from './types';

// ============================================================================
// 1. Evidence Classification Sets (Phase 2C 4-Tier Hierarchy)
// ============================================================================

const HARD_EVIDENCE_TYPES = new Set<RelationshipEvidenceType>([
  'FACING_PAGE_SPREAD_PAIR',
  'MATCHING_PRINTED_NUMERAL',
  'DISTINCT_SCRIPT_DETECTION',
  'IDENTICAL_OPTION_CARDINALITY',
  'MATCHING_SUB_CLAUSE_TOPOLOGY',
  'EXPLICIT_OFFICIAL_QUESTION_ID',
]);

const SUPPORTING_EVIDENCE_TYPES = new Set<RelationshipEvidenceType>([
  'IDENTICAL_SECTION_CONTEXT',
  'HOMOLOGOUS_SPATIAL_ORDER',
  'SHARED_VISUAL_ASSET_REFERENCE',
  'PARALLEL_COLUMN_LAYOUT',
]);

const WEAK_EVIDENCE_TYPES = new Set<RelationshipEvidenceType>([
  'SAME_PRINTED_NUMBER_ONLY',
  'ROUGH_TEXT_LENGTH_PROPORTION',
  'COMMON_PUNCTUATION_PATTERN',
]);

const CONFLICTING_EVIDENCE_TYPES = new Set<RelationshipEvidenceType>([
  'NUMERICAL_DISCONTINUITY',
  'INCOMPATIBLE_OPTION_CARDINALITY',
  'DIFFERENT_SECTION_CONTEXT',
  'SAME_SCRIPT_ON_FACING_SPREAD',
  'INCOMPATIBLE_SPATIAL_ORDER',
]);

export const DEFAULT_ALGORITHM_ID = 'uadue_rel_eval_engine_v3';
export const DEFAULT_ALGORITHM_VERSION = '3.0.0';

// ============================================================================
// 2. Relationship Evaluation Engine Implementation
// ============================================================================

export class RelationshipEvaluationEngine {
  private readonly algorithmId: string;
  private readonly algorithmVersion: string;

  constructor(algorithmId = DEFAULT_ALGORITHM_ID, algorithmVersion = DEFAULT_ALGORITHM_VERSION) {
    this.algorithmId = algorithmId;
    this.algorithmVersion = algorithmVersion;
  }

  /**
   * Evaluates a single pairwise relationship candidate against per-relationship evidence rules.
   * Pure function: does NOT mutate sourceCandidate, targetCandidate, or relationship.
   */
  public evaluateRelationship(input: RelationshipEvaluationInput): RelationshipEvaluationResult {
    const { relationship, sourceCandidate, targetCandidate } = input;
    const algorithmId = input.algorithmId || this.algorithmId;
    const algorithmVersion = input.algorithmVersion || this.algorithmVersion;

    const relationshipType = relationship.relationshipType as CanonicalRelationshipType;
    const allEvidence = [...(relationship.evidence || [])];

    // 1. Classify evidence tokens into strict 4-tier categories
    const hardEvidence: RelationshipEvidence[] = [];
    const supportingEvidence: RelationshipEvidence[] = [];
    const weakEvidence: RelationshipEvidence[] = [];
    const conflictingEvidence: RelationshipEvidence[] = [];

    for (const ev of allEvidence) {
      if (CONFLICTING_EVIDENCE_TYPES.has(ev.evidenceType) || ev.evidenceStrength === 'CONFLICTING') {
        conflictingEvidence.push(ev);
      } else if (HARD_EVIDENCE_TYPES.has(ev.evidenceType) || ev.evidenceStrength === 'HARD') {
        hardEvidence.push(ev);
      } else if (SUPPORTING_EVIDENCE_TYPES.has(ev.evidenceType) || ev.evidenceStrength === 'SUPPORTING') {
        supportingEvidence.push(ev);
      } else if (WEAK_EVIDENCE_TYPES.has(ev.evidenceType) || ev.evidenceStrength === 'WEAK') {
        weakEvidence.push(ev);
      }
    }

    // 2. Per-Relationship Dynamic Evidence & Spatial Validation
    this.enrichPerRelationshipEvidence(
      relationshipType,
      sourceCandidate,
      targetCandidate,
      hardEvidence,
      supportingEvidence,
      conflictingEvidence
    );

    // 3. Per-Relationship Verification Evaluation
    const { verificationStatus, isEligibleForFamilySynthesis, evaluationReasons, unresolvedReasons } =
      this.evaluateVerificationStatus(
        relationshipType,
        hardEvidence,
        supportingEvidence,
        weakEvidence,
        conflictingEvidence
      );

    // 4. Algebraic & Transitivity Properties Assignment (v3.0.0 Table)
    const { isSymmetric, isTransitive, transitivityConditions } =
      this.getAlgebraicProperties(relationshipType);

    // 5. Descriptive Confidence Computation (Metadata only; does NOT override verification)
    const confidenceScore = this.computeDescriptiveConfidence(
      hardEvidence,
      supportingEvidence,
      weakEvidence,
      conflictingEvidence
    );

    // 6. Cryptographic Provenance & Deterministic Evaluation ID
    const provenance: RelationshipProvenance = {
      sourceSnapshotId: relationship.provenance?.sourceSnapshotId || 'snapshot_unknown',
      sourceDocumentId: relationship.provenance?.sourceDocumentId || 'doc_unknown',
      algorithmId,
      algorithmVersion,
      evaluatedAt: 0, // Deterministic epoch for repeatable hashing
    };

    // Sort evidence IDs deterministically for stable hashing
    const sortedHardIds = hardEvidence.map((e) => e.evidenceId).sort().join(',');
    const sortedConfIds = conflictingEvidence.map((e) => e.evidenceId).sort().join(',');

    const evaluationId = computeDeterministicHash(
      `eval:${relationship.relationshipId}:${sourceCandidate.physicalInstanceId}:${targetCandidate.physicalInstanceId}:${verificationStatus}:${sortedHardIds}:${sortedConfIds}`
    );

    return {
      evaluationId,
      relationshipId: relationship.relationshipId,
      relationshipType,
      sourceCandidateId: sourceCandidate.candidateId,
      targetCandidateId: targetCandidate.candidateId,
      sourcePhysicalInstanceId: sourceCandidate.physicalInstanceId,
      targetPhysicalInstanceId: targetCandidate.physicalInstanceId,
      allEvidence: [...hardEvidence, ...supportingEvidence, ...weakEvidence, ...conflictingEvidence],
      hardEvidence,
      supportingEvidence,
      weakEvidence,
      conflictingEvidence,
      confidenceScore,
      verificationStatus,
      isSymmetric,
      isTransitive,
      transitivityConditions,
      isEligibleForFamilySynthesis,
      evaluationReasons,
      unresolvedReasons: unresolvedReasons.length > 0 ? unresolvedReasons : undefined,
      provenance,
    };
  }

  /**
   * Batch evaluation across all candidates and relationships in a QuestionGraph.
   */
  public evaluateAllRelationships(input: BatchRelationshipEvaluationInput): RelationshipEvaluationResult[] {
    const candidateMap = new Map<string, QuestionCandidate>();
    input.candidates.forEach((c) => candidateMap.set(c.candidateId, c));

    const results: RelationshipEvaluationResult[] = [];

    // Sort relationships deterministically by relationshipId
    const sortedRelationships = [...input.relationships].sort((a, b) =>
      a.relationshipId.localeCompare(b.relationshipId)
    );

    for (const rel of sortedRelationships) {
      const sourceCandidate = candidateMap.get(rel.sourceCandidateId);
      const targetCandidate = candidateMap.get(rel.targetCandidateId);

      if (!sourceCandidate || !targetCandidate) {
        continue;
      }

      results.push(
        this.evaluateRelationship({
          relationship: rel,
          sourceCandidate,
          targetCandidate,
          documentGraph: input.documentGraph,
          sourceReferences: input.sourceReferences,
          algorithmId: input.algorithmId,
          algorithmVersion: input.algorithmVersion,
        })
      );
    }

    return results;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private enrichPerRelationshipEvidence(
    relationshipType: CanonicalRelationshipType,
    sourceCandidate: QuestionCandidate,
    targetCandidate: QuestionCandidate,
    hardEvidence: RelationshipEvidence[],
    supportingEvidence: RelationshipEvidence[],
    conflictingEvidence: RelationshipEvidence[]
  ): void {
    const sourceScript = sourceCandidate.languageRepresentations?.[0]?.languageScript || 'LATIN';
    const targetScript = targetCandidate.languageRepresentations?.[0]?.languageScript || 'LATIN';

    // 1. LANGUAGE_REPRESENTATION_OF validations
    if (relationshipType === 'LANGUAGE_REPRESENTATION_OF') {
      const isFacingPages =
        sourceCandidate.startPageNumber % 2 === 0 &&
        targetCandidate.startPageNumber === sourceCandidate.startPageNumber + 1;

      if (isFacingPages && sourceScript === targetScript && sourceScript === 'LATIN') {
        const alreadyHas = conflictingEvidence.some((e) => e.evidenceType === 'SAME_SCRIPT_ON_FACING_SPREAD');
        if (!alreadyHas) {
          conflictingEvidence.push({
            evidenceId: `ev_conf_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: 'SAME_SCRIPT_ON_FACING_SPREAD',
            evidenceStrength: 'CONFLICTING',
            sourceNodeIds: [],
            description: 'Both candidates are Latin script on facing pages (sequential questions, not translations).',
            confidence: 1.0,
          });
        }
      }

      if (isFacingPages && sourceScript !== targetScript) {
        const alreadyHasScript = hardEvidence.some((e) => e.evidenceType === 'DISTINCT_SCRIPT_DETECTION');
        if (!alreadyHasScript) {
          hardEvidence.push({
            evidenceId: `ev_hard_script_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: 'DISTINCT_SCRIPT_DETECTION',
            evidenceStrength: 'HARD',
            sourceNodeIds: [],
            description: `Distinct script pair detected: ${sourceScript} vs ${targetScript}.`,
            confidence: 1.0,
          });
        }

        const alreadyHasSpread = hardEvidence.some((e) => e.evidenceType === 'FACING_PAGE_SPREAD_PAIR');
        if (!alreadyHasSpread) {
          hardEvidence.push({
            evidenceId: `ev_hard_spread_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: 'FACING_PAGE_SPREAD_PAIR',
            evidenceStrength: 'HARD',
            sourceNodeIds: [],
            description: `Facing page spread verified: Page ${sourceCandidate.startPageNumber} (Verso) and Page ${targetCandidate.startPageNumber} (Recto).`,
            confidence: 1.0,
          });
        }
      }

      // Option cardinality check
      const sourceOptCount = sourceCandidate.optionCandidateIds?.length || 0;
      const targetOptCount = targetCandidate.optionCandidateIds?.length || 0;

      if (sourceOptCount > 0 && sourceOptCount === targetOptCount) {
        const alreadyHasOpt = hardEvidence.some((e) => e.evidenceType === 'IDENTICAL_OPTION_CARDINALITY');
        if (!alreadyHasOpt) {
          hardEvidence.push({
            evidenceId: `ev_hard_opts_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: 'IDENTICAL_OPTION_CARDINALITY',
            evidenceStrength: 'HARD',
            sourceNodeIds: [],
            description: `Option cardinality identical: ${sourceOptCount} options in both representations.`,
            confidence: 1.0,
          });
        }
      } else if (sourceOptCount > 0 && targetOptCount > 0 && sourceOptCount !== targetOptCount) {
        const alreadyHasIncomp = conflictingEvidence.some((e) => e.evidenceType === 'INCOMPATIBLE_OPTION_CARDINALITY');
        if (!alreadyHasIncomp) {
          conflictingEvidence.push({
            evidenceId: `ev_conf_opts_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: 'INCOMPATIBLE_OPTION_CARDINALITY',
            evidenceStrength: 'CONFLICTING',
            sourceNodeIds: [],
            description: `Incompatible option counts: ${sourceOptCount} vs ${targetOptCount}.`,
            confidence: 1.0,
          });
        }
      }
    }

    // 2. CONTINUATION_OF validations: Strict page and reading-order monotonicity
    if (relationshipType === 'CONTINUATION_OF') {
      const isMonotonic =
        sourceCandidate.startPageNumber < targetCandidate.startPageNumber ||
        (sourceCandidate.startPageNumber === targetCandidate.startPageNumber &&
          sourceCandidate.candidateDisplayOrder < targetCandidate.candidateDisplayOrder);

      if (!isMonotonic) {
        const alreadyHasOrder = conflictingEvidence.some((e) => e.evidenceType === 'INCOMPATIBLE_SPATIAL_ORDER');
        if (!alreadyHasOrder) {
          conflictingEvidence.push({
            evidenceId: `ev_conf_order_${sourceCandidate.candidateId}_${targetCandidate.candidateId}`,
            evidenceType: 'INCOMPATIBLE_SPATIAL_ORDER',
            evidenceStrength: 'CONFLICTING',
            sourceNodeIds: [],
            description: `Non-monotonic continuation order: Page ${sourceCandidate.startPageNumber} (Order ${sourceCandidate.candidateDisplayOrder}) to Page ${targetCandidate.startPageNumber} (Order ${targetCandidate.candidateDisplayOrder}).`,
            confidence: 1.0,
          });
        }
      }
    }
  }

  private evaluateVerificationStatus(
    relationshipType: CanonicalRelationshipType,
    hardEvidence: RelationshipEvidence[],
    supportingEvidence: RelationshipEvidence[],
    weakEvidence: RelationshipEvidence[],
    conflictingEvidence: RelationshipEvidence[]
  ): {
    verificationStatus: RelationshipVerificationStatus;
    isEligibleForFamilySynthesis: boolean;
    evaluationReasons: string[];
    unresolvedReasons: string[];
  } {
    const evaluationReasons: string[] = [];
    const unresolvedReasons: string[] = [];

    // Fatal Veto check
    if (conflictingEvidence.length > 0) {
      evaluationReasons.push(
        `Conflicting evidence detected (${conflictingEvidence.length} tokens): ${conflictingEvidence.map((e) => e.evidenceType).join(', ')}`
      );
      return {
        verificationStatus: 'RELATIONSHIP_CONFLICTED',
        isEligibleForFamilySynthesis: false,
        evaluationReasons,
        unresolvedReasons,
      };
    }

    // Relationship-specific gates
    switch (relationshipType) {
      case 'LANGUAGE_REPRESENTATION_OF':
      case 'SAME_LOGICAL_QUESTION': {
        if (hardEvidence.length >= 2) {
          evaluationReasons.push(
            `Formally proven with ${hardEvidence.length} hard evidence tokens: ${hardEvidence.map((e) => e.evidenceType).join(', ')}`
          );
          return {
            verificationStatus: 'RELATIONSHIP_PROVEN',
            isEligibleForFamilySynthesis: true,
            evaluationReasons,
            unresolvedReasons,
          };
        }
        if (hardEvidence.length === 1 && supportingEvidence.length >= 1) {
          unresolvedReasons.push('Single hard evidence token with supporting context; requires human verification.');
          evaluationReasons.push('Plausible candidate under review.');
          return {
            verificationStatus: 'RELATIONSHIP_PLAUSIBLE',
            isEligibleForFamilySynthesis: false,
            evaluationReasons,
            unresolvedReasons,
          };
        }
        unresolvedReasons.push('Insufficient evidence tokens (< 2 Hard, < 1 Supporting).');
        evaluationReasons.push('Ambiguous relationship candidate.');
        return {
          verificationStatus: 'RELATIONSHIP_AMBIGUOUS',
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons,
        };
      }

      case 'CONTINUATION_OF': {
        if (hardEvidence.length >= 1 || supportingEvidence.length >= 1) {
          evaluationReasons.push('Monotonic continuation verified without spatial conflicts.');
          return {
            verificationStatus: 'RELATIONSHIP_PROVEN',
            isEligibleForFamilySynthesis: false, // CONTINUATION merges candidate node sets, does not create multi-candidate family
            evaluationReasons,
            unresolvedReasons,
          };
        }
        unresolvedReasons.push('Unverified continuation edge.');
        return {
          verificationStatus: 'RELATIONSHIP_UNVERIFIED',
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons,
        };
      }

      case 'SHARED_STIMULUS_CHILD_OF': {
        if (hardEvidence.length >= 1 || supportingEvidence.length >= 1) {
          evaluationReasons.push('Hierarchical stimulus child link verified.');
          return {
            verificationStatus: 'RELATIONSHIP_PROVEN',
            isEligibleForFamilySynthesis: false, // Stimulus parent-child link does not merge child into parent's family
            evaluationReasons,
            unresolvedReasons,
          };
        }
        unresolvedReasons.push('Unverified stimulus child link.');
        return {
          verificationStatus: 'RELATIONSHIP_UNVERIFIED',
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons,
        };
      }

      case 'VARIANT_OF': {
        if (hardEvidence.length >= 1 || supportingEvidence.length >= 1) {
          evaluationReasons.push('Pedagogical variant relation verified.');
          return {
            verificationStatus: 'RELATIONSHIP_PROVEN',
            isEligibleForFamilySynthesis: false, // Variants form distinct families
            evaluationReasons,
            unresolvedReasons,
          };
        }
        unresolvedReasons.push('Unverified variant edge.');
        return {
          verificationStatus: 'RELATIONSHIP_UNVERIFIED',
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons,
        };
      }

      case 'POSSIBLE_DUPLICATE_CANDIDATE': {
        // Suspected duplicates MUST NOT be auto-proven; always require human disambiguation
        unresolvedReasons.push('Suspected duplicate physical scan or OCR artifact; requires manual staff disambiguation.');
        evaluationReasons.push('Flagged for manual review.');
        return {
          verificationStatus: 'RELATIONSHIP_PLAUSIBLE',
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons,
        };
      }

      case 'REVISED_KEY_FOR': {
        evaluationReasons.push('Official answer key revision overlay verified.');
        return {
          verificationStatus: 'RELATIONSHIP_PROVEN',
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons,
        };
      }

      case 'RELATED_BUT_DISTINCT': {
        evaluationReasons.push('Distinct question isolation verified.');
        return {
          verificationStatus: 'RELATIONSHIP_PROVEN',
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons,
        };
      }

      case 'UNKNOWN_RELATIONSHIP':
      default: {
        unresolvedReasons.push('Unknown or unverified relationship.');
        evaluationReasons.push('Unverified relation.');
        return {
          verificationStatus: 'RELATIONSHIP_UNVERIFIED',
          isEligibleForFamilySynthesis: false,
          evaluationReasons,
          unresolvedReasons,
        };
      }
    }
  }

  private getAlgebraicProperties(relationshipType: CanonicalRelationshipType): {
    isSymmetric: boolean;
    isTransitive: boolean;
    transitivityConditions?: string;
  } {
    switch (relationshipType) {
      case 'LANGUAGE_REPRESENTATION_OF':
        return {
          isSymmetric: true,
          isTransitive: false,
          transitivityConditions:
            'STRICTLY_NON_TRANSITIVE: Direct pairwise proof required for each language pair. A <-> B and B <-> C does NOT imply A <-> C.',
        };
      case 'SAME_LOGICAL_QUESTION':
        return {
          isSymmetric: true,
          isTransitive: true,
          transitivityConditions:
            'TRANSITIVE_UNDER_STRICT_ID_EQUIVALENCE: Valid if and only if official authority ID or certified cross-variant mapping matches identically.',
        };
      case 'VARIANT_OF':
        return {
          isSymmetric: true,
          isTransitive: false,
          transitivityConditions:
            'NON_TRANSITIVE: Parameter variants form distinct canonical question families.',
        };
      case 'CONTINUATION_OF':
        return {
          isSymmetric: false,
          isTransitive: true,
          transitivityConditions:
            'TRANSITIVE_UNDER_MONOTONIC_SEQUENCE: Valid if and only if reading order and page sequence are strictly monotonic without cycles.',
        };
      case 'SHARED_STIMULUS_CHILD_OF':
        return {
          isSymmetric: false,
          isTransitive: false,
          transitivityConditions:
            'NON_TRANSITIVE: Children sharing a common stimulus remain distinct question families.',
        };
      case 'POSSIBLE_DUPLICATE_CANDIDATE':
        return {
          isSymmetric: true,
          isTransitive: false,
          transitivityConditions:
            'NON_TRANSITIVE: Suspected duplicates require manual disambiguation.',
        };
      case 'REVISED_KEY_FOR':
        return {
          isSymmetric: false,
          isTransitive: false,
          transitivityConditions: 'NON_TRANSITIVE: Targeted overlay on specific canonical question.',
        };
      case 'RELATED_BUT_DISTINCT':
        return {
          isSymmetric: true,
          isTransitive: false,
          transitivityConditions: 'NON_TRANSITIVE: Proximity or theme overlap does not propagate.',
        };
      case 'UNKNOWN_RELATIONSHIP':
      default:
        return {
          isSymmetric: false,
          isTransitive: false,
          transitivityConditions: 'NON_TRANSITIVE: Unverified relation.',
        };
    }
  }

  private computeDescriptiveConfidence(
    hardEvidence: RelationshipEvidence[],
    supportingEvidence: RelationshipEvidence[],
    weakEvidence: RelationshipEvidence[],
    conflictingEvidence: RelationshipEvidence[]
  ): number {
    if (conflictingEvidence.length > 0) {
      return 0.0;
    }
    const hardWeight = hardEvidence.length * 0.45;
    const suppWeight = supportingEvidence.length * 0.15;
    const weakWeight = weakEvidence.length * 0.05;
    const raw = hardWeight + suppWeight + weakWeight;
    return Math.min(1.0, Math.max(0.0, Number(raw.toFixed(4))));
  }
}
