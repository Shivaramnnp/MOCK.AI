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
    let previousDetectedNumber: number | undefined = undefined;
    let currentHasCompletedOptions = false;

    const flushCurrentQuestion = (endNode: DocumentGraphNode) => {
      if (!currentStartNode || currentIncludedNodeIds.length === 0) return;

      const boundaryId = `qb_${graph.documentId}_${currentStartNode.nodeId}`;
      let detectedNumber = currentTokenInfo?.detectedNumber;
      let printedLabel = currentTokenInfo?.rawLabel;
      let numberType = currentTokenInfo?.tokenType || 'UNKNOWN_NUMBER';

      if (detectedNumber === undefined && previousDetectedNumber !== undefined) {
        detectedNumber = previousDetectedNumber + 1;
        printedLabel = `${detectedNumber}.`;
        numberType = 'QUESTION_NUMBER';
      }
      if (detectedNumber !== undefined) {
        previousDetectedNumber = detectedNumber;
      }

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
      currentHasCompletedOptions = false;
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
        if (token.detectedNumber !== undefined) {
          previousDetectedNumber = token.detectedNumber;
        }
        currentIncludedNodeIds.push(node.nodeId);
        currentHasCompletedOptions = false;

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
          // Track option termination (e.g. option (d) or 4.)
          const nodeText = (node.textContent || '').trim();
          if (/\([dD]\)|^[dD][\.\)]|^4[\.\)]/.test(nodeText)) {
            currentHasCompletedOptions = true;
          }

          // Enforce P0 Page Isolation: Flush question across page boundary unless verified continuation exists
          if (previousNode && node.pageNumber !== previousNode.pageNumber) {
            const hasCrossPage = graph.crossPageContinuations.some(
              (c) => c.fromNodeId === previousNode!.nodeId && c.toNodeId === node.nodeId
            );
            if (!hasCrossPage) {
              flushCurrentQuestion(previousNode);
            }
          }

          // Enforce Column Isolation: Flush question when moving to next column if previous question finished its options
          if (previousNode && node.pageNumber === previousNode.pageNumber) {
            const pageCols = graph.columns.filter((c) => c.pageNumber === node.pageNumber);
            if (pageCols.length > 1) {
              const prevCol = pageCols.find((c) => {
                const b = (c as any).bounds || (c as any).bbox;
                const minX = b ? (b.minX ?? b.x0 ?? 0) : 0;
                const maxX = b ? (b.maxX ?? b.x1 ?? 600) : 600;
                return previousNode!.bbox.x0 >= minX - 10.0 && previousNode!.bbox.x0 <= maxX + 10.0;
              });
              const currCol = pageCols.find((c) => {
                const b = (c as any).bounds || (c as any).bbox;
                const minX = b ? (b.minX ?? b.x0 ?? 0) : 0;
                const maxX = b ? (b.maxX ?? b.x1 ?? 600) : 600;
                return node.bbox.x0 >= minX - 10.0 && node.bbox.x0 <= maxX + 10.0;
              });
              if (prevCol && currCol && currCol.columnIndex > prevCol.columnIndex) {
                // If options were already completed, or if moving back up to top of column (y <= 120 pt)
                if (currentHasCompletedOptions || node.bbox.y0 <= 100.0) {
                  flushCurrentQuestion(previousNode);
                }
              }
            }
          }
        }

        // If no question is currently open:
        // A question candidate can only start without a numeric anchor if it begins with an
        // unambiguous question stimulus/statement directive (e.g. "Statement-I", "Consider the following", "कथन-I")
        // and is NOT metadata, section header, instruction, or cover page.
        if (!currentStartNode) {
          const text = (node.textContent || '').trim();
          const isStatementTrigger =
            /(?:^(?:Statement\s*[-–:]?\s*[I1]|कथन\s*[-–:]?\s*[I1]|~-I:?)|consider\s+(?:the\s+)?following|निम्नलिखित\s+कथनों)/i.test(
              text
            );
          const isNotMetadataOrHeader =
            !/^(?:SECTION|PART|INSTRUCTIONS|DO\s+NOT\s+OPEN|Test\s+Booklet|Question\s+Paper)/i.test(text);

          if (isStatementTrigger && isNotMetadataOrHeader) {
            currentStartNode = node;
            currentNumberNode = null;
            currentTokenInfo = {
              nodeId: node.nodeId,
              rawLabel: text.slice(0, 10),
              tokenType: 'UNKNOWN_NUMBER',
              confidence: 0.85,
              evidence: {
                spatialLocationBasis: `Inferred start of question at (${node.bbox.x0.toFixed(1)}, ${node.bbox.y0.toFixed(1)}) pt`,
                typographicBasis: 'Top-of-column statement sequence without explicit numeric anchor',
                lexicalBasis: `Inferred question start: "${(node.textContent || '').slice(0, 30)}"`,
              },
            };
            currentIncludedNodeIds.push(node.nodeId);
            currentStemNodeIds.push(node.nodeId);
            currentEvidence.push({
              evidenceId: `ev_b_before_${node.nodeId}`,
              evidenceType: 'BOUNDARY_BEFORE',
              sourceGraphNodeIds: [node.nodeId],
              confidence: 0.85,
              decisionBasis: `Identified inferred question boundary from statement directive`,
            });
            previousNode = node;
            continue;
          }
        }

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

          // Check if this node is part of the stem (first text node after number)
          if (
            currentStemNodeIds.length === 0 &&
            (node.nodeType === 'TEXT_RUN' || node.nodeType === 'GLYPH_RUN') &&
            (node.textContent || '').trim().length > 0
          ) {
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
