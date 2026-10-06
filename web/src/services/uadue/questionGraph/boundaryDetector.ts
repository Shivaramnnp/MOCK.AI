/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Boundary Detector (Phase 2C)
 *
 * Detects evidence-backed candidate question boundaries across reading order flow.
 *
 * Inviolable Principle:
 * "A question is NOT a rectangle. A question is a graph of physically located evidence objects.
 * Do not assume one visual block = one question."
 */

import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import {
  SegmentationEvidence,
  QuestionIdentityCandidate,
  EvidenceObservationState,
  QuestionVerificationStatus,
} from '../contracts/questionGraph';
import { TokenClassifier, TokenClassificationResult } from './tokenClassifier';

export interface CandidateQuestionBoundary {
  boundaryId: string;
  startNodeId: string;
  endNodeId: string;
  startPageNumber: number;
  endPageNumber: number;
  identityCandidate: QuestionIdentityCandidate;
  numberNodeId?: string;
  officialQuestionId?: string;
  stemNodeIds: string[];
  bodyNodeIds: string[];
  includedNodeIds: string[];
  evidenceList: SegmentationEvidence[];
  confidence: number;
  observationState: EvidenceObservationState;
  verificationStatus: QuestionVerificationStatus;
}

export class BoundaryDetector {
  /**
   * Identifies candidate question boundaries across DocumentGraph reading flow.
   */
  public static detectBoundaries(
    graph: DocumentGraph,
    tokenResults: Map<string, TokenClassificationResult>
  ): CandidateQuestionBoundary[] {
    const boundaries: CandidateQuestionBoundary[] = [];

    // Order elements by deterministic reading flow from DocumentGraph
    const flowNodeIds = graph.readingFlow.length > 0
      ? graph.readingFlow
      : Array.from(graph.nodes.keys());

    const flowNodes = flowNodeIds
      .map((id) => graph.nodes.get(id))
      .filter((n): n is DocumentGraphNode => n !== undefined);

    let currentStartNode: DocumentGraphNode | null = null;
    let currentNumberNode: DocumentGraphNode | null = null;
    let currentTokenInfo: TokenClassificationResult | null = null;
    let currentOfficialQuestionId: string | undefined = undefined;
    let currentStemNodeIds: string[] = [];
    let currentBodyNodeIds: string[] = [];
    let currentIncludedNodeIds: string[] = [];
    let currentEvidence: SegmentationEvidence[] = [];

    const flushCurrentQuestion = (endNode: DocumentGraphNode) => {
      if (!currentStartNode || currentIncludedNodeIds.length === 0) return;

      const boundaryId = `qb_${graph.documentId}_${currentStartNode.nodeId}`;
      const detectedNumber = currentTokenInfo?.detectedNumber;
      const printedLabel = currentTokenInfo?.rawLabel;
      const numberType = currentTokenInfo?.tokenType || 'UNKNOWN_NUMBER';

      // Physical instance identity: deterministic combination of document, coordinates, page
      const physicalInstanceId = `inst_${graph.sourceDocumentId}_p${currentStartNode.pageNumber}_y${Math.round(currentStartNode.bbox.y0)}_x${Math.round(currentStartNode.bbox.x0)}`;

      const confidence = currentTokenInfo ? currentTokenInfo.confidence : 0.65;
      const observationState: EvidenceObservationState = currentNumberNode ? 'OBSERVED' : 'INFERRED';
      const verificationStatus: QuestionVerificationStatus = confidence >= 0.85 ? 'SUPPORTED' : 'UNVERIFIED';

      boundaries.push({
        boundaryId,
        startNodeId: currentStartNode.nodeId,
        endNodeId: endNode.nodeId,
        startPageNumber: currentStartNode.pageNumber,
        endPageNumber: endNode.pageNumber,
        identityCandidate: {
          physicalInstanceId,
          sourcePrintedLabel: printedLabel,
          detectedNumber,
          officialQuestionId: currentOfficialQuestionId,
          numberType,
          confidence,
          supportingEvidenceIds: currentEvidence.map((e) => e.evidenceId),
        },
        numberNodeId: currentNumberNode?.nodeId,
        officialQuestionId: currentOfficialQuestionId,
        stemNodeIds: [...currentStemNodeIds],
        bodyNodeIds: [...currentBodyNodeIds],
        includedNodeIds: [...currentIncludedNodeIds],
        evidenceList: [...currentEvidence],
        confidence,
        observationState,
        verificationStatus,
      });

      // Reset accumulators
      currentStartNode = null;
      currentNumberNode = null;
      currentTokenInfo = null;
      currentOfficialQuestionId = undefined;
      currentStemNodeIds = [];
      currentBodyNodeIds = [];
      currentIncludedNodeIds = [];
      currentEvidence = [];
    };

    let previousNode: DocumentGraphNode | null = null;

    for (let idx = 0; idx < flowNodes.length; idx++) {
      const node = flowNodes[idx];
      const token = tokenResults.get(node.nodeId);
      const isQuestionNumber = token && token.tokenType === 'QUESTION_NUMBER';

      if (isQuestionNumber) {
        // If an ongoing question exists, close it
        if (currentStartNode && previousNode) {
          currentEvidence.push({
            evidenceId: `ev_b_after_${previousNode.nodeId}`,
            evidenceType: 'BOUNDARY_AFTER',
            sourceGraphNodeIds: [previousNode.nodeId, node.nodeId],
            confidence: 0.95,
            decisionBasis: `Terminated prior question boundary by arrival of Q.${token.detectedNumber}`,
          });
          flushCurrentQuestion(previousNode);
        }

        // Start new candidate question boundary
        currentStartNode = node;
        currentNumberNode = node;
        currentTokenInfo = token;
        currentIncludedNodeIds.push(node.nodeId);

        // If the number node also carries trailing stem text in the same run
        if ((node.textContent || '').trim().length > (token.rawLabel || '').trim().length) {
          currentStemNodeIds.push(node.nodeId);
        }

        currentEvidence.push({
          evidenceId: `ev_b_before_${node.nodeId}`,
          evidenceType: 'BOUNDARY_BEFORE',
          sourceGraphNodeIds: [node.nodeId],
          confidence: token.confidence,
          decisionBasis: `Identified Question Anchor: "${token.rawLabel}"`,
        });

        currentEvidence.push({
          evidenceId: `ev_num_pat_${node.nodeId}`,
          evidenceType: 'NUMBERING_PATTERN',
          sourceGraphNodeIds: [node.nodeId],
          confidence: token.confidence,
          decisionBasis: token.evidence.sequenceBasis || 'Question number syntax pattern',
        });
      } else {
        if (currentStartNode) {
          // Accumulate into current question
          currentIncludedNodeIds.push(node.nodeId);

          // Extract official question ID if present in metadata text
          if (node.textContent) {
            const qidMatch = node.textContent.match(/Question\s+ID\s*:\s*(\d+)/i);
            if (qidMatch) {
              currentOfficialQuestionId = qidMatch[1];
            }
          }

          // Check if this node is part of the stem (first few text nodes after number)
          if (currentStemNodeIds.length === 0 && (node.nodeType === 'TEXT_RUN' || node.nodeType === 'GLYPH_RUN')) {
            currentStemNodeIds.push(node.nodeId);
          } else {
            currentBodyNodeIds.push(node.nodeId);
          }

          // Evaluate spatial gap from previous node
          if (previousNode && previousNode.pageNumber === node.pageNumber) {
            const dy = node.bbox.y0 - previousNode.bbox.y1;
            if (dy >= 20.0) {
              currentEvidence.push({
                evidenceId: `ev_gap_${node.nodeId}`,
                evidenceType: 'SPATIAL_GAP',
                sourceGraphNodeIds: [previousNode.nodeId, node.nodeId],
                metricValues: { gapPt: dy },
                confidence: 0.85,
                decisionBasis: `Vertical physical gap of ${dy.toFixed(1)} pt between nodes`,
              });
            }
          }
        }
      }

      previousNode = node;
    }

    // Flush final question if open
    if (currentStartNode && previousNode) {
      flushCurrentQuestion(previousNode);
    }

    return boundaries;
  }
}
