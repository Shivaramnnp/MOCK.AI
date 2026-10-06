/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contextual Token Reconstructor (Phase 2C Remediation)
 *
 * Reconstructs question anchors, statement lists, and metadata tokens across
 * neighboring physical nodes before token classification and boundary detection.
 *
 * Inviolable Principle:
 * "Question numbers must NOT be classified from isolated text nodes.
 * Use Physical Evidence -> Context -> Candidate Hypothesis -> Semantic Candidate."
 */

import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';

export interface SplitAnchorReconstruction {
  primaryNodeId: string;
  secondaryNodeId: string;
  detectedNumber: number;
  combinedLabel: string;
  confidence: number;
}

export interface ContextualAnalysisResult {
  splitQuestionAnchors: Map<string, SplitAnchorReconstruction>;
  statementNodeIds: Set<string>;
  metadataNodeIds: Set<string>;
  ordinaryTextNodeIds: Set<string>;
}

export class ContextualTokenReconstructor {
  /**
   * Analyzes the entire document graph contextually to resolve split tokens,
   * multi-statement clauses, metadata blocks, and ordinary sentences.
   */
  public static analyze(graph: DocumentGraph): ContextualAnalysisResult {
    const splitQuestionAnchors = new Map<string, SplitAnchorReconstruction>();
    const statementNodeIds = new Set<string>();
    const metadataNodeIds = new Set<string>();
    const ordinaryTextNodeIds = new Set<string>();

    const nodesByPage = new Map<number, DocumentGraphNode[]>();
    for (const node of graph.nodes.values()) {
      if (node.nodeType === 'TEXT_RUN' || node.nodeType === 'GLYPH_RUN') {
        if (!nodesByPage.has(node.pageNumber)) {
          nodesByPage.set(node.pageNumber, []);
        }
        nodesByPage.get(node.pageNumber)!.push(node);
      }
    }

    for (const [, pageNodes] of nodesByPage) {
      // Sort in visual reading order (top to bottom, left to right)
      pageNodes.sort((a, b) => {
        const yDiff = a.bbox.y0 - b.bbox.y0;
        if (Math.abs(yDiff) > 4.0) return yDiff;
        return a.bbox.x0 - b.bbox.x0;
      });

      let inStatementDirective = false;
      let statementDirectiveY = -1;

      for (let i = 0; i < pageNodes.length; i++) {
        const node = pageNodes[i];
        const text = (node.textContent || '').trim();
        if (!text) continue;

        // 1. Detect Split Question Anchors (e.g. Node A: "Q." and Node B: "2")
        if (/^(?:q(?:uestion)?|qn|que)\.?$/i.test(text)) {
          // Look for adjacent numeric node to the right on the same baseline
          for (let j = i + 1; j < Math.min(i + 6, pageNodes.length); j++) {
            const nextNode = pageNodes[j];
            const nextText = (nextNode.textContent || '').trim();

            const isSameBaseline = Math.abs(nextNode.bbox.y0 - node.bbox.y0) <= 6.0;
            const isHorizontalRight =
              nextNode.bbox.x0 >= node.bbox.x0 - 2.0 &&
              nextNode.bbox.x0 <= node.bbox.x1 + 40.0;

            if (isSameBaseline && isHorizontalRight) {
              const numMatch = nextText.match(/^(\d{1,4})(?:[\.\)\-\:]|\s+|$)/);
              if (numMatch) {
                const detectedNum = parseInt(numMatch[1], 10);
                const combinedLabel = `${text} ${numMatch[1]}`;
                const reconstruction: SplitAnchorReconstruction = {
                  primaryNodeId: node.nodeId,
                  secondaryNodeId: nextNode.nodeId,
                  detectedNumber: detectedNum,
                  combinedLabel,
                  confidence: 0.98,
                };
                splitQuestionAnchors.set(node.nodeId, reconstruction);
                splitQuestionAnchors.set(nextNode.nodeId, reconstruction);
                break;
              }
            }
          }
        }

        // 2. Track Statement Directive Context (e.g. "Consider the following statements:")
        if (
          /(?:consider\s+(?:the\s+)?following|which\s+of\s+the\s+following\s+statements?|read\s+the\s+following|निम्न(?:नलिखित)?\s+कथन)/i.test(
            text
          )
        ) {
          inStatementDirective = true;
          statementDirectiveY = node.bbox.y1;
        }

        // Reset statement directive if vertical distance exceeds 350 pt or a clear question boundary is crossed
        if (inStatementDirective && node.bbox.y0 > statementDirectiveY + 350.0) {
          inStatementDirective = false;
        }

        // Check if node is an enumerated statement under an active statement directive
        if (inStatementDirective) {
          const stmtMatch = text.match(/^(\d{1,2}|[ivx]+)[\.\)]\s+(.*)/i);
          if (stmtMatch) {
            statementNodeIds.add(node.nodeId);
          }
        }

        // 3. Detect TCS / CBT Metadata Blocks
        if (
          /^(?:Question\s+ID|Option\s+\d+\s+ID|Status|Chosen\s+Option)\s*:/i.test(text) ||
          /(?:Question\s+ID\s*:\s*\d+|Status\s*:\s*\w+|Chosen\s+Option\s*:\s*\d+)/i.test(text)
        ) {
          metadataNodeIds.add(node.nodeId);

          // If next node is the metadata value (e.g. "Chosen Option :" followed by "1")
          if (/Chosen\s+Option\s*:/i.test(text) && !/Chosen\s+Option\s*:\s*\d+/i.test(text)) {
            const nextNode = pageNodes[i + 1];
            if (nextNode && Math.abs(nextNode.bbox.y0 - node.bbox.y0) <= 8.0) {
              metadataNodeIds.add(nextNode.nodeId);
            }
          }
        }

        // 4. Detect Ordinary Sentences Starting with Indefinite Article "A" or Pronoun "I"
        // e.g. "A sudden noise frightened the horse.", "A rapid transit system..."
        const proseMatch = text.match(/^(?:A|An|The|I)\s+([a-zA-Z]{2,}\s+.*)/);
        if (proseMatch && !/^[A-Ea-e]\s*[\.\)]/.test(text) && !/^\([A-Ea-e]\)/.test(text)) {
          // Check that it does NOT look like an option card with short label
          if (text.length >= 15 && text.split(/\s+/).length >= 3) {
            ordinaryTextNodeIds.add(node.nodeId);
          }
        }
      }
    }

    return {
      splitQuestionAnchors,
      statementNodeIds,
      metadataNodeIds,
      ordinaryTextNodeIds,
    };
  }
}
