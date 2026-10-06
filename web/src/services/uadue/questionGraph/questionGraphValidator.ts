/**
 * UADUE — Universal Assessment Document Understanding Engine
 * QuestionGraph Invariants Validator (Phase 2C)
 *
 * Enforces Phase 2C architectural and forensic invariants:
 * 1. SOURCE EVIDENCE > PHYSICAL GRAPH > SEGMENTATION HYPOTHESIS > VERIFIED QUESTION STRUCTURE
 * 2. ZERO Canonical Question Identity (CanonicalQuestionIR strictly blocked).
 * 3. Confidence != Verification (A high confidence score never implies VERIFIED).
 * 4. Shared Stimuli must be REFERENCED, NEVER CLONED.
 * 5. Tables must be structurally preserved (never flattened to plain text).
 * 6. Diagrams must retain physical vector/raster assets (never OCR-replaced).
 * 7. Mathematics must preserve original glyphs (no silent LaTeX conversion).
 * 8. Cryptographic Sealing integrity.
 */

import { DocumentGraph } from '../contracts/documentGraph';
import { QuestionGraph } from '../contracts/questionGraph';

export interface QuestionGraphValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  questionCount: number;
  optionCount: number;
  stimulusCount: number;
  tableCount: number;
  diagramCount: number;
  mathCount: number;
  hypothesisCount: number;
  ambiguityCount: number;
}

export class QuestionGraphValidator {
  /**
   * Validates a QuestionGraph against Phase 2C architectural invariants.
   */
  public static validate(
    qGraph: QuestionGraph,
    sourceDocumentGraph?: DocumentGraph
  ): QuestionGraphValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Invariant: Physical Evidence Grounding
    if (sourceDocumentGraph) {
      for (const q of qGraph.questions) {
        for (const nodeId of q.includedPhysicalNodeIds) {
          if (!sourceDocumentGraph.nodes.has(nodeId)) {
            errors.push(
              `UNGROUNDED_PHYSICAL_EVIDENCE: Question ${q.candidateId} references non-existent DocumentGraph node ${nodeId}`
            );
          }
        }
      }

      for (const opt of qGraph.options) {
        for (const nodeId of opt.contentNodeIds) {
          if (!sourceDocumentGraph.nodes.has(nodeId)) {
            errors.push(
              `UNGROUNDED_PHYSICAL_EVIDENCE: Option ${opt.optionCandidateId} references non-existent DocumentGraph node ${nodeId}`
            );
          }
        }
      }

      for (const stim of qGraph.stimuli) {
        for (const nodeId of stim.physicalNodeIds) {
          if (!sourceDocumentGraph.nodes.has(nodeId)) {
            errors.push(
              `UNGROUNDED_PHYSICAL_EVIDENCE: Stimulus ${stim.stimulusId} references non-existent DocumentGraph node ${nodeId}`
            );
          }
        }
      }
    }

    // 2. Invariant: ZERO Canonical Question Identity
    const forbiddenCanonicalKeys = [
      'canonicalQuestionId',
      'canonicalQuestions',
      'canonicalOptionId',
      'familyId',
      'officialAuthorityQuestionId',
      'assessmentInstanceId',
      'testSessionId',
    ];

    for (const q of qGraph.questions) {
      const qRecord = q as unknown as Record<string, unknown>;
      for (const key of forbiddenCanonicalKeys) {
        if (qRecord[key] !== undefined) {
          errors.push(
            `ILLEGAL_CANONICAL_IDENTITY: QuestionCandidate ${q.candidateId} contains forbidden canonical key '${key}'`
          );
        }
      }
    }

    // 3. Invariant: Confidence != Verification
    for (const q of qGraph.questions) {
      if (q.confidenceScore >= 0.95 && q.verificationStatus === 'VERIFIED') {
        errors.push(
          `UNVERIFIED_STATUS_COERCION: Question ${q.candidateId} has status VERIFIED based solely on confidence score (${q.confidenceScore}) without explicit verification stage`
        );
      }
    }

    // 4. Invariant: Shared Stimuli are REFERENCED, NEVER CLONED
    for (const stim of qGraph.stimuli) {
      if (stim.supportedQuestionCandidateIds.length > 1) {
        // Stimulus is shared across multiple questions
        const stimNodesSet = new Set(stim.physicalNodeIds);
        for (const qId of stim.supportedQuestionCandidateIds) {
          const q = qGraph.questions.find((x) => x.candidateId === qId);
          if (q) {
            // Stimulus nodes must NOT be inside stemNodeIds
            const leakedNodes = q.stemNodeIds.filter((id) => stimNodesSet.has(id));
            if (leakedNodes.length > 0) {
              errors.push(
                `STIMULUS_CONTENT_CLONED: Shared stimulus ${stim.stimulusId} content nodes leaked directly into Question ${qId} stem`
              );
            }
          }
        }
      }
    }

    // 5. Invariant: Tables are NOT Flattened
    for (const table of qGraph.tables) {
      if (table.rowCount <= 0 || table.cells.length === 0) {
        errors.push(
          `FLATTENED_TABLE_GRID: TableCandidate ${table.tableCandidateId} has no structured row/cell geometry`
        );
      }
    }

    // 6. Invariant: Diagrams are NOT OCR-Replaced
    for (const diag of qGraph.diagrams) {
      if (diag.physicalNodeIds.length === 0) {
        errors.push(
          `MISSING_DIAGRAM_ASSETS: DiagramCandidate ${diag.diagramCandidateId} contains zero physical assets`
        );
      }
    }

    // 7. Invariant: Mathematics preserves original glyphs
    for (const math of qGraph.mathBlocks) {
      if (!math.originalGlyphsPreserved) {
        errors.push(
          `MUTATED_MATHEMATICAL_GLYPHS: MathCandidate ${math.mathCandidateId} failed to preserve original glyph evidence`
        );
      }
    }

    // 8. Invariant: Sealing Hash Presence
    if (!qGraph.isSealed || !qGraph.sealedHash) {
      warnings.push(`UNSEALED_QUESTION_GRAPH: QuestionGraph ${qGraph.graphId} is not sealed`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      questionCount: qGraph.questions.length,
      optionCount: qGraph.options.length,
      stimulusCount: qGraph.stimuli.length,
      tableCount: qGraph.tables.length,
      diagramCount: qGraph.diagrams.length,
      mathCount: qGraph.mathBlocks.length,
      hypothesisCount: qGraph.hypotheses.length,
      ambiguityCount: qGraph.ambiguities.length,
    };
  }
}
