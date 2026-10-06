/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Segmentation Hypothesis Engine (Phase 2C)
 *
 * Generates and preserves competing SegmentationHypothesis models.
 *
 * Inviolable Principle:
 * "If evidence does not establish uniqueness, preserve alternatives.
 * Do NOT choose a single hypothesis merely because it has the highest score."
 */

import { DocumentGraph } from '../contracts/documentGraph';
import {
  SegmentationHypothesis,
  QuestionCandidate,
  OptionCandidate,
  StimulusCandidate,
  AmbiguityRecord,
} from '../contracts/questionGraph';
import { CandidateQuestionBoundary } from './boundaryDetector';

export class HypothesisEngine {
  /**
   * Constructs competing segmentation hypotheses from candidate boundaries and ambiguities.
   */
  public static generateHypotheses(
    graph: DocumentGraph,
    boundaries: CandidateQuestionBoundary[],
    options: OptionCandidate[],
    stimuli: StimulusCandidate[],
    ambiguities: AmbiguityRecord[],
    algorithmVersion: string,
    configurationVersion: string
  ): SegmentationHypothesis[] {
    const hypotheses: SegmentationHypothesis[] = [];

    const allPhysicalNodeIds = Array.from(graph.nodes.keys());
    const primaryIncludedNodeIds: string[] = [];

    for (const b of boundaries) {
      primaryIncludedNodeIds.push(...b.includedNodeIds);
    }
    for (const opt of options) {
      primaryIncludedNodeIds.push(...opt.contentNodeIds);
    }
    for (const stim of stimuli) {
      primaryIncludedNodeIds.push(...stim.physicalNodeIds);
    }

    const primaryIncludedSet = new Set(primaryIncludedNodeIds);
    const primaryExcludedNodeIds = allPhysicalNodeIds.filter((id) => !primaryIncludedSet.has(id));

    // 1. Primary Baseline Hypothesis: H1_STANDARD_BOUNDARY
    const h1Id = `hyp_${graph.documentId}_H1_STANDARD`;
    const h1BoundaryEvidence = boundaries.flatMap((b) => b.evidenceList);
    const h1SupportingRelations = graph.edges
      .filter((e) => primaryIncludedSet.has(e.sourceNodeId) && primaryIncludedSet.has(e.targetNodeId))
      .map((e) => e.edgeId);

    const h1ConflictingEvidence: string[] = [];
    if (ambiguities.length > 0) {
      for (const amb of ambiguities) {
        h1ConflictingEvidence.push(`${amb.ambiguityType}: ${amb.description}`);
      }
    }

    // Baseline confidence calculation
    const avgBoundaryConfidence =
      boundaries.length > 0
        ? boundaries.reduce((sum, b) => sum + b.confidence, 0) / boundaries.length
        : 0.5;

    const h1Confidence = ambiguities.length > 0
      ? Math.max(0.60, avgBoundaryConfidence - ambiguities.length * 0.05)
      : avgBoundaryConfidence;

    hypotheses.push({
      hypothesisId: h1Id,
      sourceGraphId: graph.graphId,
      includedPhysicalNodeIds: Array.from(primaryIncludedSet),
      excludedPhysicalNodeIds: primaryExcludedNodeIds,
      candidateQuestionIds: boundaries.map((b) => b.boundaryId),
      boundaryEvidence: h1BoundaryEvidence,
      supportingRelations: h1SupportingRelations.slice(0, 1000), // Cap for memory safety
      conflictingEvidence: h1ConflictingEvidence,
      confidence: h1Confidence,
      unresolvedAmbiguities: ambiguities.map((a) => a.ambiguityId),
      algorithmVersion,
      configurationVersion,
    });

    // 2. Alternative Hypothesis for Cross-Page Ambiguity (if present)
    const crossPageAmbiguities = ambiguities.filter((a) => a.ambiguityType === 'CROSS_PAGE_AMBIGUITY');
    if (crossPageAmbiguities.length > 0) {
      const h2Id = `hyp_${graph.documentId}_H2_PAGE_SPLIT`;
      hypotheses.push({
        hypothesisId: h2Id,
        sourceGraphId: graph.graphId,
        includedPhysicalNodeIds: Array.from(primaryIncludedSet),
        excludedPhysicalNodeIds: primaryExcludedNodeIds,
        candidateQuestionIds: boundaries.map((b) => b.boundaryId),
        boundaryEvidence: h1BoundaryEvidence.filter((e) => e.evidenceType !== 'CONTINUATION_EVIDENCE'),
        supportingRelations: h1SupportingRelations.slice(0, 500),
        conflictingEvidence: ['Cross-page physical continuation is rejected as a page delimiter boundary'],
        confidence: Math.max(0.40, 1.0 - h1Confidence),
        unresolvedAmbiguities: crossPageAmbiguities.map((a) => a.ambiguityId),
        algorithmVersion,
        configurationVersion,
      });
    }

    // 3. Alternative Hypothesis for Option Ownership Ambiguity (if present)
    const optionAmbiguities = ambiguities.filter((a) => a.ambiguityType === 'OPTION_OWNERSHIP_UNCERTAINTY');
    if (optionAmbiguities.length > 0) {
      const h3Id = `hyp_${graph.documentId}_H3_OPTION_REALLOCATION`;
      hypotheses.push({
        hypothesisId: h3Id,
        sourceGraphId: graph.graphId,
        includedPhysicalNodeIds: Array.from(primaryIncludedSet),
        excludedPhysicalNodeIds: primaryExcludedNodeIds,
        candidateQuestionIds: boundaries.map((b) => b.boundaryId),
        boundaryEvidence: h1BoundaryEvidence,
        supportingRelations: h1SupportingRelations.slice(0, 500),
        conflictingEvidence: ['Alternative option ownership pairing for ambiguous option blocks'],
        confidence: 0.65,
        unresolvedAmbiguities: optionAmbiguities.map((a) => a.ambiguityId),
        algorithmVersion,
        configurationVersion,
      });
    }

    return hypotheses;
  }
}
