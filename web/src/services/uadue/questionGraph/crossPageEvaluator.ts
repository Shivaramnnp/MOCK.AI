/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Cross-Page Question Continuation Evaluator (Phase 2C)
 *
 * Evaluates DocumentGraph CONTINUES_PHYSICALLY edges for prospective question continuation.
 *
 * Inviolable Principle:
 * "Never automatically convert CONTINUES_PHYSICALLY to SAME_QUESTION.
 * Evaluate sentence flow, typography, numbering, and structure.
 * If ambiguous, preserve competing hypotheses."
 */

import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import { AmbiguityRecord } from '../contracts/questionGraph';

export interface CrossPageEvaluationResult {
  fromNodeId: string;
  toNodeId: string;
  fromPageNumber: number;
  toPageNumber: number;
  isSameQuestionCandidate: boolean;
  confidence: number;
  decisionBasis: string;
  competingHypotheses: {
    hypothesisId: string;
    description: string;
    confidence: number;
  }[];
  ambiguity?: AmbiguityRecord;
}

export class CrossPageEvaluator {
  /**
   * Evaluates cross-page physical continuation candidates from DocumentGraph.
   */
  public static evaluateContinuations(graph: DocumentGraph): CrossPageEvaluationResult[] {
    const results: CrossPageEvaluationResult[] = [];

    for (const cand of graph.crossPageContinuations) {
      const fromNode = graph.nodes.get(cand.fromNodeId);
      const toNode = graph.nodes.get(cand.toNodeId);

      if (!fromNode || !toNode) continue;

      const fromText = (fromNode.textContent || '').trim();
      const toText = (toNode.textContent || '').trim();

      // 1. Check for immediate Question Number Anchor at head of next page
      const nextStartsNewQuestion =
        /^(?:q(?:uestion)?\.?\s*\d{1,3}[\.\)\-]|^\d{1,3}\.[\s\w])/i.test(toText);

      // 2. Check for Section or Page Header contamination
      const nextIsHeaderOrSection =
        /^(?:section|part|general|paper|instructions?)/i.test(toText) || toNode.bbox.y0 <= 40.0;

      // 3. Sentence continuation cues: tail does not end with terminal punctuation
      const tailEndsWithTerminal = /[\.\?!]\s*$/.test(fromText);
      const headStartsWithLower = /^[a-z]/.test(toText);
      const tailEndsWithHyphenOrComma = /[,;\-]\s*$/.test(fromText);

      // 4. Option lattice continuation: e.g. tail was Option (B), head is Option (C)
      const tailIsOption = /^\(?([A-Da-d]|[1-4])\)?[\.\)]/.test(fromText);
      const headIsOption = /^\(?([A-Da-d]|[1-4])\)?[\.\)]/.test(toText);

      let isSameQuestion = false;
      let confidence = 0.5;
      const reasons: string[] = [];

      if (nextStartsNewQuestion) {
        isSameQuestion = false;
        confidence = 0.98;
        reasons.push(`Target node starts with new explicit question number ("${toText.slice(0, 15)}")`);
      } else if (nextIsHeaderOrSection) {
        isSameQuestion = false;
        confidence = 0.95;
        reasons.push(`Target node is section/header at y=${toNode.bbox.y0.toFixed(1)} pt`);
      } else if (tailIsOption && headIsOption) {
        isSameQuestion = true;
        confidence = 0.92;
        reasons.push(`Continuation of option lattice across page boundary (${fromText.slice(0, 5)} -> ${toText.slice(0, 5)})`);
      } else if (headStartsWithLower || tailEndsWithHyphenOrComma) {
        isSameQuestion = true;
        confidence = 0.88;
        reasons.push('Syntactic sentence continuation (hyphen/comma or lowercase start)');
      } else if (!tailEndsWithTerminal) {
        isSameQuestion = true;
        confidence = 0.75;
        reasons.push('Incomplete sentence at page bottom continuing onto next page top');
      } else {
        // Ambiguous boundary!
        isSameQuestion = false;
        confidence = 0.50;
        reasons.push('Terminal punctuation at page bottom without explicit syntactic linkage');
      }

      // Record competing hypotheses whenever confidence is under 0.85
      const competingHypotheses = [
        {
          hypothesisId: `H_CONT_${cand.candidateId}`,
          description: `Page ${cand.fromPageNumber} bottom node and Page ${cand.toPageNumber} top node belong to the SAME question`,
          confidence: isSameQuestion ? confidence : 1.0 - confidence,
        },
        {
          hypothesisId: `H_SPLIT_${cand.candidateId}`,
          description: `Page boundary creates a question delimiter (SEPARATE questions)`,
          confidence: isSameQuestion ? 1.0 - confidence : confidence,
        },
      ];

      let ambiguity: AmbiguityRecord | undefined;
      if (Math.abs(competingHypotheses[0].confidence - competingHypotheses[1].confidence) < 0.25) {
        ambiguity = {
          ambiguityId: `ambig_cross_page_${cand.candidateId}`,
          ambiguityType: 'CROSS_PAGE_AMBIGUITY',
          affectedPhysicalNodeIds: [fromNode.nodeId, toNode.nodeId],
          candidateHypothesisIds: competingHypotheses.map((h) => h.hypothesisId),
          description: `Uncertain cross-page question boundary between page ${cand.fromPageNumber} and ${cand.toPageNumber}`,
          confidenceDelta: Math.abs(competingHypotheses[0].confidence - competingHypotheses[1].confidence),
          reviewRecommended: true,
        };
      }

      results.push({
        fromNodeId: cand.fromNodeId,
        toNodeId: cand.toNodeId,
        fromPageNumber: cand.fromPageNumber,
        toPageNumber: cand.toPageNumber,
        isSameQuestionCandidate: isSameQuestion,
        confidence,
        decisionBasis: reasons.join('; '),
        competingHypotheses,
        ambiguity,
      });
    }

    return results;
  }
}
