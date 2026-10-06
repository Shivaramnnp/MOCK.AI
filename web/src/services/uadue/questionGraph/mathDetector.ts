/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Math Detector (Phase 2C)
 *
 * Groups mathematical physical objects and fractions without premature LaTeX conversion.
 *
 * Inviolable Principle:
 * "Do NOT rewrite mathematical expressions during segmentation.
 * Preserve original glyph evidence, geometry, source references.
 * No silent LaTeX conversion."
 */

import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import {
  MathCandidate,
  EvidenceObservationState,
  QuestionVerificationStatus,
} from '../contracts/questionGraph';

export class MathDetector {
  private static MATH_SYMBOLS_REGEX = /[∫∑∏√≤≥≠≈±×÷∂∞∈∉⊂∪∩αβγδλμπσωθΩ∀∃∇∆→⇒⇔]/;

  /**
   * Detects and groups mathematical expressions into MathCandidate blocks.
   */
  public static detectMath(graph: DocumentGraph): MathCandidate[] {
    const mathCandidates: MathCandidate[] = [];
    const processedNodeIds = new Set<string>();

    const nodesList = Array.from(graph.nodes.values()).sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.bbox.y0 - b.bbox.y0;
    });

    for (let i = 0; i < nodesList.length; i++) {
      const node = nodesList[i];
      if (processedNodeIds.has(node.nodeId)) continue;

      const text = node.textContent || '';
      const w = node.bbox.width !== undefined ? node.bbox.width : Math.abs(node.bbox.x1 - node.bbox.x0);
      const h = node.bbox.height !== undefined ? node.bbox.height : Math.abs(node.bbox.y1 - node.bbox.y0);

      const hasMathSymbol = MathDetector.MATH_SYMBOLS_REGEX.test(text) || /[\^=]/.test(text);
      const isSubSuperscript =
        node.style?.fontSizePt ? (node.style.fontSizePt <= 8.5 && /[0-9a-z]/i.test(text)) : false;

      // Check if node is a potential horizontal fraction bar
      const isFractionBar =
        node.nodeType === 'VECTOR_PATH' &&
        h <= 2.5 &&
        w >= 5.0 &&
        w <= 120.0;

      if (!hasMathSymbol && !isSubSuperscript && !isFractionBar) continue;

      const pageNum = node.pageNumber;
      const clusterNodeIds: string[] = [node.nodeId];
      const glyphRunIds: string[] = [];

      if (node.sourceEvidence?.sourceObjectId) {
        glyphRunIds.push(node.sourceEvidence.sourceObjectId);
      }
      processedNodeIds.add(node.nodeId);

      let minX = node.bbox.x0;
      let minY = node.bbox.y0;
      let maxX = node.bbox.x1;
      let maxY = node.bbox.y1;
      let containsFractionOrMatrix = isFractionBar;

      // Group horizontally aligned or vertically stacked math tokens (fraction numerator/denominator)
      for (let j = 0; j < nodesList.length; j++) {
        const otherNode = nodesList[j];
        if (processedNodeIds.has(otherNode.nodeId)) continue;
        if (otherNode.pageNumber !== pageNum) continue;

        const otherText = otherNode.textContent || '';
        const oh = otherNode.bbox.height !== undefined ? otherNode.bbox.height : Math.abs(otherNode.bbox.y1 - otherNode.bbox.y0);
        const otherHasMath =
          MathDetector.MATH_SYMBOLS_REGEX.test(otherText) ||
          /[\^=]/.test(otherText) ||
          (otherNode.nodeType === 'VECTOR_PATH' && oh <= 2.5);

        // Near distance threshold for mathematical formulas (within 15 pt horizontally or 12 pt vertically)
        const dx = Math.max(0, Math.max(minX - otherNode.bbox.x1, otherNode.bbox.x0 - maxX));
        const dy = Math.max(0, Math.max(minY - otherNode.bbox.y1, otherNode.bbox.y0 - maxY));

        if (dx <= 15.0 && dy <= 12.0 && (otherHasMath || /[0-9a-zA-Z\+\-\=\/\(\)]/.test(otherText))) {
          clusterNodeIds.push(otherNode.nodeId);
          processedNodeIds.add(otherNode.nodeId);
          if (otherNode.sourceEvidence?.sourceObjectId) {
            glyphRunIds.push(otherNode.sourceEvidence.sourceObjectId);
          }
          if (otherNode.nodeType === 'VECTOR_PATH') {
            containsFractionOrMatrix = true;
          }
          minX = Math.min(minX, otherNode.bbox.x0);
          minY = Math.min(minY, otherNode.bbox.y0);
          maxX = Math.max(maxX, otherNode.bbox.x1);
          maxY = Math.max(maxY, otherNode.bbox.y1);
        }
      }

      const mathId = `math_p${pageNum}_${node.nodeId}`;
      const observationState: EvidenceObservationState = 'OBSERVED';
      const verificationStatus: QuestionVerificationStatus = 'SUPPORTED';

      mathCandidates.push({
        mathCandidateId: mathId,
        physicalNodeIds: clusterNodeIds,
        glyphRunIds,
        bbox: {
          x0: minX,
          y0: minY,
          x1: maxX,
          y1: maxY,
          width: maxX - minX,
          height: maxY - minY,
          unit: 'pt',
        },
        containsFractionOrMatrix,
        originalGlyphsPreserved: true,
        observationState,
        verificationStatus,
        confidenceScore: 0.93,
      });
    }

    return mathCandidates;
  }
}
