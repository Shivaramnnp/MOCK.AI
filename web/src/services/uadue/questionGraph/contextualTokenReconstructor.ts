/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contextual Token Reconstructor (Phase 2C Final Semantic Closure)
 *
 * Reconstructs question anchors, statement lists, candidate instructions,
 * metadata tokens, and language scripts across neighboring physical nodes
 * before token classification and boundary detection.
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
  instructionNodeIds: Set<string>;
  pageLanguageScript: Map<number, 'LATIN' | 'DEVANAGARI' | 'OTHER'>;
  coverPageNumbers: Set<number>;
}

export class ContextualTokenReconstructor {
  /**
   * Analyzes the entire document graph contextually to resolve split tokens,
   * candidate instructions, multi-statement clauses, metadata blocks, and language scripts.
   */
  public static analyze(graph: DocumentGraph): ContextualAnalysisResult {
    const splitQuestionAnchors = new Map<string, SplitAnchorReconstruction>();
    const statementNodeIds = new Set<string>();
    const metadataNodeIds = new Set<string>();
    const ordinaryTextNodeIds = new Set<string>();
    const instructionNodeIds = new Set<string>();
    const coverPageNumbers = new Set<number>();
    const pageLanguageScript = new Map<number, 'LATIN' | 'DEVANAGARI' | 'OTHER'>();

    const nodesByPage = new Map<number, DocumentGraphNode[]>();
    for (const node of graph.nodes.values()) {
      if (node.nodeType === 'TEXT_RUN' || node.nodeType === 'GLYPH_RUN') {
        if (!nodesByPage.has(node.pageNumber)) {
          nodesByPage.set(node.pageNumber, []);
        }
        nodesByPage.get(node.pageNumber)!.push(node);
      }
    }

    for (const [pageNum, pageNodes] of nodesByPage) {
      // 1. Detect dominant character script for the page
      let devanagariCount = 0;
      let latinCount = 0;
      for (const node of pageNodes) {
        const t = node.textContent || '';
        for (let c = 0; c < t.length; c++) {
          const code = t.charCodeAt(c);
          if (code >= 0x0900 && code <= 0x097f) devanagariCount++;
          else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latinCount++;
        }
      }

      const script: 'LATIN' | 'DEVANAGARI' | 'OTHER' =
        devanagariCount > 25 && devanagariCount > latinCount
          ? 'DEVANAGARI'
          : latinCount > 25
          ? 'LATIN'
          : 'OTHER';
      pageLanguageScript.set(pageNum, script);

      // Sort in visual reading order (top to bottom, left to right)
      pageNodes.sort((a, b) => {
        const yDiff = a.bbox.y0 - b.bbox.y0;
        if (Math.abs(yDiff) > 4.0) return yDiff;
        return a.bbox.x0 - b.bbox.x0;
      });

      // Check if page contains cover page indicators / instruction headers
      let hasPageCoverInstructions = false;
      for (const node of pageNodes) {
        const text = (node.textContent || '').trim();
        if (
          /(?:INSTRUCTIONS|INSTRUCTIONS\s+TO\s+CANDIDATES|IMPORTANT\s+INSTRUCTIONS|GENERAL\s+INSTRUCTIONS|DO\s+NOT\s+OPEN\s+THIS\s+TEST\s+BOOKLET|PLEASE\s+READ\s+THE\s+FOLLOWING\s+INSTRUCTIONS|TEST\s+BOOKLET\s+SERIES)/i.test(
            text
          )
        ) {
          hasPageCoverInstructions = true;
          coverPageNumbers.add(pageNum);
          break;
        }
      }

      const pageColumns = graph.columns.filter((c) => c.pageNumber === pageNum);

      let inStatementDirective = false;
      let statementDirectiveY = -1;
      let inJumbledDirective = false;
      let inInstructionDirective = false;
      let instructionDirectiveY = -1;

      for (let i = 0; i < pageNodes.length; i++) {
        const node = pageNodes[i];
        const text = (node.textContent || '').trim();
        if (!text) continue;

        // Reset statement directive upon encountering answers, options, question prompts, or new questions
        if (
          inStatementDirective &&
          (/^(?:Ans|Answer|Chosen\s+Option|Question\s+ID|Status)\b/i.test(text) ||
           /^(?:Which\s+of\s+the\s+statements|Select\s+the\s+correct|Which\s+of\s+the\s+above|उपर्युक्त|उपरोक्त)/i.test(text) ||
           /^(?:q(?:uestion)?|qn|que)\.?\s*\d+/i.test(text) ||
           (inJumbledDirective && /^[1-4][\.\)]/.test(text)))
        ) {
          inStatementDirective = false;
          inJumbledDirective = false;
        }

        // 2. Track Candidate Instructions / Front Cover Directives
        if (
          /(?:INSTRUCTIONS|INSTRUCTIONS\s+TO\s+CANDIDATES|IMPORTANT\s+INSTRUCTIONS|GENERAL\s+INSTRUCTIONS|DO\s+NOT\s+OPEN\s+THIS\s+TEST\s+BOOKLET|PLEASE\s+READ\s+THE\s+FOLLOWING\s+INSTRUCTIONS)/i.test(
            text
          )
        ) {
          inInstructionDirective = true;
          instructionDirectiveY = node.bbox.y1;
        }

        // On Page 1 with cover instructions, or under active instructions directive
        if (inInstructionDirective || (pageNum === 1 && hasPageCoverInstructions)) {
          const instMatch = text.match(/^(\d{1,2}|[ivx]+|[a-e])[\.\)](?:\s+.*)?$/i);
          if (instMatch) {
            instructionNodeIds.add(node.nodeId);
          }
        }

        // 3. Detect Split Question Anchors (e.g. Node A: "Q." and Node B: "2")
        if (/^(?:q(?:uestion)?|qn|que)\.?$/i.test(text)) {
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

        // 4. Track Statement Directive Context (e.g. "Consider the following statements:" or "Jumbled order")
        if (
          /(?:sentences?\s+of\s+a\s+paragraph|jumbled\s+order|arrange\s+(?:the\s+)?(?:sentences|words)|meaningful\s+and\s+coherent\s+paragraph)/i.test(
            text
          )
        ) {
          inStatementDirective = true;
          inJumbledDirective = true;
          statementDirectiveY = node.bbox.y1;
        } else if (
          /(?:consider\s+(?:the\s+)?following|which\s+of\s+the\s+following\s+statements?|read\s+the\s+following|pairs\s+given\s+below|statements?\s+given\s+below|निम्नलिखित|निम्न\s+कथन|कथनों\s+पर\s+विचार|युग्मों\s+पर\s+विचार)/i.test(
            text
          )
        ) {
          inStatementDirective = true;
          inJumbledDirective = false;
          statementDirectiveY = node.bbox.y1;
        }

        if (inStatementDirective && node.bbox.y0 > statementDirectiveY + 350.0) {
          inStatementDirective = false;
          inJumbledDirective = false;
        }

        if (inStatementDirective) {
          const stmtMatch = inJumbledDirective
            ? text.match(/^([A-Ea-e])[\.\)](?:\s+.*)?$/)
            : text.match(/^(\d{1,2}|[ivx]+)[\.\)](?:\s+.*)?$/i);
          if (stmtMatch && !inInstructionDirective && !(pageNum === 1 && hasPageCoverInstructions)) {
            statementNodeIds.add(node.nodeId);
          }
        }



        // Detect split section range headers (e.g. Node A: "Q.1", Node B: "–", Node C: "Q.5 Carry ONE mark Each")
        if (/^(?:q(?:uestion)?|qn|que)\.?\s*\d+$/i.test(text)) {
          for (let j = i + 1; j < Math.min(i + 6, pageNodes.length); j++) {
            const nextNode = pageNodes[j];
            if (Math.abs(nextNode.bbox.y0 - node.bbox.y0) <= 6.0) {
              const nextText = (nextNode.textContent || '').trim();
              if (/(?:-|–|to)\s*(?:q(?:uestion)?|qn|que)?\.?\s*\d+|carry\s+\w+\s+marks?/i.test(nextText)) {
                metadataNodeIds.add(node.nodeId);
                metadataNodeIds.add(nextNode.nodeId);
                break;
              }
            }
          }
        }

        // 5. Detect TCS / CBT Metadata Blocks
        if (
          /^(?:Question\s+ID|Option\s+\d+\s+ID|Status|Chosen\s+Option)\s*:/i.test(text) ||
          /(?:Question\s+ID\s*:\s*\d+|Status\s*:\s*\w+|Chosen\s+Option\s*:\s*\d+)/i.test(text)
        ) {
          metadataNodeIds.add(node.nodeId);

          if (/Chosen\s+Option\s*:/i.test(text) && !/Chosen\s+Option\s*:\s*\d+/i.test(text)) {
            const nextNode = pageNodes[i + 1];
            if (nextNode && Math.abs(nextNode.bbox.y0 - node.bbox.y0) <= 8.0) {
              metadataNodeIds.add(nextNode.nodeId);
            }
          }
        }

        // 6. Detect Ordinary Sentences Starting with Indefinite Article "A" or Pronoun "I"
        const proseMatch = text.match(/^(?:A|An|The|I)\s+([a-zA-Z]{2,}\s+.*)/);
        if (proseMatch && !/^[A-Ea-e]\s*[\.\)]/.test(text) && !/^\([A-Ea-e]\)/.test(text)) {
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
      instructionNodeIds,
      pageLanguageScript,
      coverPageNumbers,
    };
  }
}

