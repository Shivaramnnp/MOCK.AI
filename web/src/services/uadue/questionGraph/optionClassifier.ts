/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Option Classifier (Phase 2C)
 *
 * Classifies option candidates (text, visual cards, math options) and
 * evaluates explicit, multi-candidate ownership hypotheses.
 *
 * Inviolable Principle:
 * "Never assume nearest question = owner. Represent ownership hypotheses explicitly."
 */

import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import {
  OptionCandidate,
  OptionOwnershipCandidate,
  EvidenceObservationState,
  QuestionVerificationStatus,
} from '../contracts/questionGraph';
import { TokenClassificationResult } from './tokenClassifier';
import { ContextualAnalysisResult } from './contextualTokenReconstructor';

export interface QuestionAnchor {
  candidateId: string;
  numberNodeId?: string;
  stemTopY: number;
  stemBottomY: number;
  pageNumber: number;
  columnIndex: number;
  isMultiPage?: boolean;
}

export class OptionClassifier {
  /**
   * Identifies candidate options across the document graph and evaluates ownership hypotheses.
   */
  public static classifyOptions(
    graph: DocumentGraph,
    questionAnchors: QuestionAnchor[],
    tokenResults?: Map<string, TokenClassificationResult>,
    context?: ContextualAnalysisResult
  ): OptionCandidate[] {
    const optionCandidates: OptionCandidate[] = [];
    const visitedNodes = new Set<string>();

    const nodesList = Array.from(graph.nodes.values()).sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.bbox.y0 - b.bbox.y0;
    });

    for (let i = 0; i < nodesList.length; i++) {
      const node = nodesList[i];
      if (visitedNodes.has(node.nodeId)) continue;
      if (node.nodeType !== 'TEXT_RUN' && node.nodeType !== 'GLYPH_RUN') continue;

      // 1. Contextual exclusion: Statements, Metadata, and Ordinary Prose must NEVER become options
      if (context?.statementNodeIds.has(node.nodeId)) continue;
      if (context?.metadataNodeIds.has(node.nodeId)) continue;
      if (context?.ordinaryTextNodeIds.has(node.nodeId)) continue;

      const tokenRes = tokenResults?.get(node.nodeId);
      if (tokenRes) {
        if (
          tokenRes.tokenType === 'STATEMENT_NUMBER' ||
          tokenRes.tokenType === 'METADATA_NUMBER' ||
          tokenRes.tokenType === 'QUESTION_NUMBER' ||
          tokenRes.tokenType === 'PAGE_NUMBER'
        ) {
          continue;
        }
      }

      const text = (node.textContent || '').trim();
      if (!text) continue;

      // Match strict option marker patterns: (A), (B), (1), (2), (a), (b), A., B., 1., 2.
      // Crucial: The delimiter (dot, parenthesis, bracket) is REQUIRED. Bare words starting with 'A ' are NOT options!
      const markerMatch = text.match(
        /^(\([A-Ea-e1-4ivx]+\)|\[[A-Ea-e1-4ivx]+\]|(?:[A-Ea-e]|[1-4]|[ivx]+)[\.\)])(?:\s+(.*))?$/i
      );
      if (!markerMatch) continue;

      // Ensure it's not an explicit Question prefix (e.g. "Q.1")
      if (/^q/i.test(text)) continue;

      const rawMarker = markerMatch[1];
      const remainderText = markerMatch[2];
      const contentNodeIds: string[] = [];

      visitedNodes.add(node.nodeId);

      let hasVisualAsset = false;
      let hasMathematics = false;

      if (remainderText && remainderText.trim().length > 0) {
        // Combined marker + text in same node
        contentNodeIds.push(node.nodeId);
      } else {
        // Marker is isolated; find adjacent content node (to the right or immediately below)
        const nextNode = nodesList[i + 1];
        if (nextNode && nextNode.pageNumber === node.pageNumber) {
          const isRightAdjacent =
            nextNode.bbox.x0 >= node.bbox.x1 - 5.0 &&
            Math.abs(nextNode.bbox.y0 - node.bbox.y0) <= 8.0;
          const isImmediateBelow =
            nextNode.bbox.y0 >= node.bbox.y1 - 2.0 &&
            nextNode.bbox.y0 <= node.bbox.y1 + 15.0;

          if (isRightAdjacent || isImmediateBelow) {
            contentNodeIds.push(nextNode.nodeId);
            visitedNodes.add(nextNode.nodeId);

            if (nextNode.nodeType === 'RASTER_IMAGE' || nextNode.nodeType === 'VECTOR_PATH') {
              hasVisualAsset = true;
            }
          }
        }
      }

      // Check if any neighboring element is an image/diagram (Visual Option Card)
      const nearVisualEdges = graph.edges.filter(
        (e) =>
          (e.sourceNodeId === node.nodeId || contentNodeIds.includes(e.sourceNodeId)) &&
          (e.relation === 'NEAR' || e.relation === 'INSIDE' || e.relation === 'BELOW')
      );
      for (const edge of nearVisualEdges) {
        const targetNode = graph.nodes.get(edge.targetNodeId);
        if (targetNode && (targetNode.nodeType === 'RASTER_IMAGE' || targetNode.nodeType === 'VECTOR_PATH')) {
          hasVisualAsset = true;
          if (!contentNodeIds.includes(targetNode.nodeId)) {
            contentNodeIds.push(targetNode.nodeId);
          }
        }
      }

      // Determine multi-column option alignment
      const colZone = graph.columns.find((c) => c.pageNumber === node.pageNumber && c.elementIds.includes(node.nodeId));
      const isMultiColumnOption = (graph.columns.filter((c) => c.pageNumber === node.pageNumber).length > 1);

      // Evaluate explicit ownership hypotheses across all candidate question anchors
      const candidateOwners: OptionOwnershipCandidate[] = OptionClassifier.evaluateOwnershipHypotheses(
        node,
        questionAnchors,
        rawMarker
      );

      // Determine observation state:
      // OBSERVED if directly contained beneath a single clear question anchor,
      // HYPOTHETICAL if multiple competing question anchors share comparable ownership confidence
      const observationState: EvidenceObservationState =
        candidateOwners.length > 1 && Math.abs(candidateOwners[0].confidence - candidateOwners[1].confidence) < 0.25
          ? 'HYPOTHETICAL'
          : candidateOwners.length === 1 && candidateOwners[0].confidence > 0.85
          ? 'OBSERVED'
          : 'INFERRED';

      const verificationStatus: QuestionVerificationStatus =
        candidateOwners.length > 1 && Math.abs(candidateOwners[0].confidence - candidateOwners[1].confidence) < 0.15
          ? 'AMBIGUOUS'
          : candidateOwners.length > 0
          ? 'SUPPORTED'
          : 'UNVERIFIED';

      const optionId = `opt_p${node.pageNumber}_${node.nodeId}_${rawMarker.replace(/[^a-zA-Z0-9]/g, '')}`;

      optionCandidates.push({
        optionCandidateId: optionId,
        markerNodeId: node.nodeId,
        markerLabel: rawMarker,
        contentNodeIds: contentNodeIds.length > 0 ? contentNodeIds : [node.nodeId],
        candidateOwners,
        resolvedOwnerQuestionId: candidateOwners.length > 0 && candidateOwners[0].confidence >= 0.70 ? candidateOwners[0].questionCandidateId : undefined,
        isMultiColumnOption,
        hasVisualAsset,
        hasMathematics,
        observationState,
        verificationStatus,
        confidenceScore: candidateOwners.length > 0 ? candidateOwners[0].confidence : 0.5,
        supportingEvidenceIds: [`ev_marker_${node.nodeId}`],
      });
    }

    return optionCandidates;
  }

  /**
   * Computes explicit ownership hypotheses for an option across question anchors.
   * Never assumes nearest question is the sole owner.
   */
  private static evaluateOwnershipHypotheses(
    optionMarkerNode: DocumentGraphNode,
    questionAnchors: QuestionAnchor[],
    markerLabel: string
  ): OptionOwnershipCandidate[] {
    const candidates: OptionOwnershipCandidate[] = [];
    const optY = optionMarkerNode.bbox.y0;
    const optPage = optionMarkerNode.pageNumber;

    // Filter anchors: Enforce P0 Page Isolation. Cross-page options allowed ONLY for multi-page questions.
    const relevantAnchors = questionAnchors.filter(
      (a) => a.pageNumber === optPage || (a.isMultiPage && a.pageNumber === optPage - 1)
    );

    for (let idx = 0; idx < relevantAnchors.length; idx++) {
      const anchor = relevantAnchors[idx];
      const nextAnchor = relevantAnchors[idx + 1];

      let score = 0.5;
      const reasons: string[] = [];

      if (anchor.pageNumber === optPage) {
        if (optY >= anchor.stemTopY - 5.0) {
          score += 0.30;
          reasons.push(`Physically within/below Q stem (y=${optY.toFixed(1)} >= ${anchor.stemTopY.toFixed(1)})`);

          if (!nextAnchor || optY < nextAnchor.stemTopY - 5.0) {
            score += 0.25;
            reasons.push(nextAnchor ? `Precedes next Q at y=${nextAnchor.stemTopY.toFixed(1)} pt` : 'Terminal question on page');
          } else {
            // Option is below next question!
            score -= 0.35;
            reasons.push(`Below subsequent question ${nextAnchor.candidateId}`);
          }
        } else {
          // Option is above this question's stem!
          score -= 0.40;
          reasons.push(`Precedes question stem`);
        }
      } else if (anchor.pageNumber === optPage - 1) {
        // Cross-page question candidate
        if (!nextAnchor || nextAnchor.pageNumber === optPage) {
          score += 0.20;
          reasons.push(`Candidate cross-page option continuation from page ${anchor.pageNumber}`);
        }
      }

      const clampedScore = Math.max(0.05, Math.min(0.99, score));
      if (clampedScore >= 0.30) {
        candidates.push({
          questionCandidateId: anchor.candidateId,
          confidence: clampedScore,
          decisionBasis: `Ownership basis for ${markerLabel}: ${reasons.join('; ')}`,
        });
      }
    }

    // Sort descending by confidence score
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates;
  }
}
