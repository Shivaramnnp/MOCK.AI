/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Stimulus Detector (Phase 2C)
 *
 * Detects shared stimuli (reading comprehension passages, caselets,
 * shared diagrams, and shared tables).
 *
 * Inviolable Principle:
 * "Represent stimulus ownership independently from question ownership.
 * Do NOT duplicate the passage into every question as independent source content.
 * Preserve shared ownership via reference links."
 */

import { DocumentGraph, DocumentGraphNode } from '../contracts/documentGraph';
import {
  StimulusCandidate,
  EvidenceObservationState,
  QuestionVerificationStatus,
} from '../contracts/questionGraph';

export class StimulusDetector {
  /**
   * Scans the DocumentGraph to identify shared stimuli and their supported question scopes.
   */
  public static detectStimuli(graph: DocumentGraph): StimulusCandidate[] {
    const stimuli: StimulusCandidate[] = [];
    const visitedNodes = new Set<string>();

    const nodesList = Array.from(graph.nodes.values()).sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.bbox.y0 - b.bbox.y0;
    });

    for (let i = 0; i < nodesList.length; i++) {
      const node = nodesList[i];
      if (visitedNodes.has(node.nodeId)) continue;
      if (node.nodeType !== 'TEXT_RUN' && node.nodeType !== 'GLYPH_RUN') continue;

      const text = (node.textContent || '').trim();
      if (!text) continue;

      // Identify shared stimulus header patterns:
      // - "Directions (Q. 1 to 5): ..."
      // - "Read the following passage and answer the questions..."
      // - "Common Data for Questions 24 and 25:"
      // - "Consider the following diagram / code for questions 12 - 14:"
      const isStimulusHeader =
        /^(?:directions?\s*(?:\(?(?:q(?:uestions?)?\.?\s*\d+\s*(?:-|to)\s*\d+)\)?)?|common\s+data\s+for\s+questions?|read\s+(?:the\s+)?(?:following\s+)?(?:passage|text|case|data|scenario)|based\s+on\s+(?:the\s+)?(?:passage|table|data)|consider\s+(?:the\s+)?(?:following\s+)?(?:code|program|pseudocode|diagram|figure))/i.test(
          text
        );

      if (!isStimulusHeader) continue;

      // Extract explicit targeted question numbers if declared (e.g. "Q. 1 to 5", "24 and 25")
      const rangeMatch = text.match(/(\d+)\s*(?:to|-|and)\s*(\d+)/i);
      const startQ = rangeMatch ? parseInt(rangeMatch[1], 10) : undefined;
      const endQ = rangeMatch ? parseInt(rangeMatch[2], 10) : undefined;

      const stimulusNodeIds: string[] = [node.nodeId];
      visitedNodes.add(node.nodeId);

      // Classify stimulus type
      let stimulusType: StimulusCandidate['stimulusType'] = 'PASSAGE';
      if (/code|program|pseudocode/i.test(text)) stimulusType = 'CODE_BLOCK';
      else if (/table|data/i.test(text)) stimulusType = 'SHARED_TABLE';
      else if (/diagram|figure/i.test(text)) stimulusType = 'SHARED_DIAGRAM';
      else if (/case|scenario/i.test(text)) stimulusType = 'CASELET';

      // Collect following passage paragraphs until an explicit question number (e.g. "Q.1", "1.") is encountered
      for (let j = i + 1; j < nodesList.length; j++) {
        const nextNode = nodesList[j];
        if (nextNode.pageNumber !== node.pageNumber) break;

        const nextText = (nextNode.textContent || '').trim();
        // If next node looks like a question number anchor (e.g. "Q.1", "1.", "Question 1"), stimulus ends
        const isQuestionStart =
          /^(?:q(?:uestion)?\.?\s*\d{1,3}(?:[\.\)\-\:]|\s|$)|^\d{1,3}\.[\s\w])/i.test(nextText);
        if (isQuestionStart) {
          break;
        }

        // Add node to stimulus body
        stimulusNodeIds.push(nextNode.nodeId);
        visitedNodes.add(nextNode.nodeId);

        // Include any embedded diagram or table
        if (nextNode.nodeType === 'RASTER_IMAGE' || nextNode.nodeType === 'VECTOR_PATH') {
          stimulusType = 'SHARED_DIAGRAM';
        }
      }

      const stimulusId = `stim_p${node.pageNumber}_${node.nodeId}`;
      const observationState: EvidenceObservationState = rangeMatch ? 'OBSERVED' : 'INFERRED';
      const verificationStatus: QuestionVerificationStatus = rangeMatch ? 'SUPPORTED' : 'UNVERIFIED';

      stimuli.push({
        stimulusId,
        stimulusType,
        physicalNodeIds: stimulusNodeIds,
        supportedQuestionCandidateIds: [], // Populated dynamically during question assembly
        observationState,
        verificationStatus,
        confidenceScore: rangeMatch ? 0.95 : 0.80,
        supportingEvidenceIds: [`ev_stimulus_${node.nodeId}`],
      });
    }

    return stimuli;
  }
}
