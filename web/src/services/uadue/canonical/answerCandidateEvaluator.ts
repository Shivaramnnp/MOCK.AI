/**
 * UADUE Phase 2D-5 — Answer Candidate Evaluator & Question Binding Engine
 * Document Version: 5.3.0-BINDING-ENGINE
 *
 * Implements:
 * 1. Safe parsing of AnswerKeyEntry into typed UniversalAnswerPayload.
 * 2. Deterministic binding from physical AnswerKeyEntry to CanonicalQuestionIR via physical candidate provenance.
 * 3. Evidence classification & capping (AI predictions capped strictly at CANDIDATE).
 * 4. Deterministic identity derivations.
 */

import {
  AnswerKeyEntry,
  AnswerCandidate,
  AnswerEvidence,
  AnswerEvidenceClass,
  AnswerVerificationStatus,
  CanonicalQuestionIR,
  UniversalAnswerPayload,
} from './types';
import { QuestionCandidate } from '../contracts/questionGraph';
import { deriveCandidateAnswerId } from './canonicalHashing';

export interface BindAndEvaluateCandidateInput {
  entry: AnswerKeyEntry;
  evidence: AnswerEvidence[];
  canonicalQuestions: CanonicalQuestionIR[];
  physicalCandidates: QuestionCandidate[];
  adapterVersion?: string;
}

export interface CandidateEvaluationResult {
  isBound: boolean;
  candidate?: AnswerCandidate;
  rejectionReasons: string[];
  canonicalQuestionId?: string;
}

/**
 * Parses raw text value from an answer key entry into a typed UniversalAnswerPayload.
 */
export function parseRawAnswerValue(
  rawValue: string,
  questionTypeHint?: string
): UniversalAnswerPayload {
  const trimmed = rawValue.trim();

  // 1. Check for explicit hint: if MULTIPLE_CHOICE_MSQ and single option (e.g. "D")
  if ((questionTypeHint === 'MULTIPLE_CHOICE_MSQ' || questionTypeHint === 'MSQ') && /^[A-Da-d]$/i.test(trimmed)) {
    return {
      type: 'MULTIPLE_CHOICE_MSQ',
      correctOptionLabels: [trimmed.toUpperCase()],
      isOrderSensitive: false,
    };
  }

  // 2. Check for multiple options: e.g. "A, C", "B;D", "A;B;C", "A and C", "A,C,D"
  const multiOptionParts = trimmed.split(/\s*(?:[;,]|\band\b|\bor\b)\s*/i).map((s) => s.trim()).filter(Boolean);
  if (multiOptionParts.length > 1 && multiOptionParts.every((p) => /^[A-Da-d]$/i.test(p))) {
    return {
      type: 'MULTIPLE_CHOICE_MSQ',
      correctOptionLabels: [...new Set(multiOptionParts.map((p) => p.toUpperCase()))].sort(),
      isOrderSensitive: false,
    };
  }

  // 3. Check for single letter MCQ: e.g. "A", "B", "C", "D", "(A)", "Option 1"
  const singleOptionMatch = trimmed.match(/^(?:Option\s*)?\(?([A-Da-d1-4])\)?$/i);
  if (singleOptionMatch && (!questionTypeHint || questionTypeHint === 'SINGLE_CHOICE_MCQ' || questionTypeHint === 'MCQ')) {
    const rawChar = singleOptionMatch[1].toUpperCase();
    // Normalize "1"->"A", "2"->"B", "3"->"C", "4"->"D" if digit
    const label = ['1', '2', '3', '4'].includes(rawChar)
      ? String.fromCharCode(65 + parseInt(rawChar, 10) - 1)
      : rawChar;

    return {
      type: 'SINGLE_CHOICE_MCQ',
      correctOptionLabel: label,
    };
  }

  // 4. Check for numerical range or exact number: e.g. "12.5 to 13.0", "-2.1 to -1.9", "12.75", "1/4"
  const rangeMatch = trimmed.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:to|-)\s*([+-]?\d+(?:\.\d+)?)$/i);
  if (rangeMatch && !trimmed.includes('Option')) {
    return {
      type: 'NUMERICAL_RANGE_NAT',
      rangeLow: rangeMatch[1].trim(),
      rangeHigh: rangeMatch[2].trim(),
    };
  }

  const numericMatch = trimmed.match(/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/);
  if (numericMatch || trimmed.includes('/')) {
    return {
      type: 'NUMERICAL_RANGE_NAT',
      exactValue: trimmed,
    };
  }

  // 4. Check for Matrix match: e.g. "P->1, Q->2, R->3, S->4"
  if (trimmed.includes('->') || trimmed.includes('→')) {
    const pairs: { sourceLabel: string; targetLabels: string[] }[] = [];
    const segments = trimmed.split(/[,;]/);
    for (const seg of segments) {
      const parts = seg.split(/->|→/);
      if (parts.length === 2) {
        pairs.push({
          sourceLabel: parts[0].trim().toUpperCase(),
          targetLabels: [parts[1].trim()],
        });
      }
    }
    if (pairs.length > 0) {
      return {
        type: 'MATRIX_MATCH',
        pairs,
      };
    }
  }

  // Fallback for unresolved format
  return {
    type: 'UNRESOLVED_ANSWER',
    unresolvedReason: `Unable to structurally parse raw answer value: '${rawValue}'`,
  };
}

/**
 * Evaluates discrete verification status based strictly on evidence classes.
 * CRITICAL RULE: AI predictions are capped strictly at CANDIDATE.
 */
export function evaluateVerificationStatusFromEvidence(
  evidence: AnswerEvidence[]
): { status: AnswerVerificationStatus; confidenceScore: number } {
  if (evidence.length === 0) {
    return { status: 'CANDIDATE', confidenceScore: 0.1 };
  }

  const hasAIOnly = evidence.every((e) => e.evidenceClass === 'AI_OR_HEURISTIC_PREDICTION');
  if (hasAIOnly) {
    // LLM/AI prediction capped at CANDIDATE
    return { status: 'CANDIDATE', confidenceScore: 0.5 };
  }

  const hasOfficialFinal = evidence.some((e) => e.evidenceClass === 'DIRECT_OFFICIAL_FINAL_KEY');
  const hasCorrigendum = evidence.some((e) => e.evidenceClass === 'OFFICIAL_CORRIGENDUM');
  const hasOfficialProvisional = evidence.some((e) => e.evidenceClass === 'DIRECT_OFFICIAL_PROVISIONAL_KEY');
  const hasWithdrawalNotice = evidence.some((e) => e.evidenceClass === 'OFFICIAL_WITHDRAWAL_NOTICE');

  if (hasWithdrawalNotice) {
    return { status: 'WITHDRAWN', confidenceScore: 1.0 };
  }

  if (hasCorrigendum) {
    return { status: 'VERIFIED', confidenceScore: 1.0 };
  }

  if (hasOfficialFinal) {
    return { status: 'VERIFIED', confidenceScore: 1.0 };
  }

  if (hasOfficialProvisional) {
    return { status: 'SUPPORTED', confidenceScore: 0.85 };
  }

  return { status: 'CANDIDATE', confidenceScore: 0.5 };
}

/**
 * Binds an AnswerKeyEntry to a CanonicalQuestionIR and creates a verified AnswerCandidate.
 */
export function bindAndEvaluateAnswerCandidate(
  input: BindAndEvaluateCandidateInput
): CandidateEvaluationResult {
  const { entry, evidence, canonicalQuestions, physicalCandidates, adapterVersion = '1.0.0' } = input;
  const rejectionReasons: string[] = [];

  // 1. Identify matching PhysicalQuestionCandidate
  // Must match rawPrintedQuestionNumber
  const matchingPhysical = physicalCandidates.filter((pc) => {
    const qNumMatch = ((pc as any).printedQuestionNumber || pc.sourceQuestionNumber) === entry.rawPrintedQuestionNumber;
    if (!qNumMatch) return false;

    // Disambiguate section if specified in both
    if (entry.rawSectionId && (pc as any).sectionId) {
      if (entry.rawSectionId !== (pc as any).sectionId) return false;
    }

    return true;
  });

  if (matchingPhysical.length === 0) {
    rejectionReasons.push(`No physical question candidate found matching question number '${entry.rawPrintedQuestionNumber}'`);
    return { isBound: false, rejectionReasons };
  }

  if (matchingPhysical.length > 1) {
    // If multiple candidates match on printed number without section disambiguation
    const distinctSections = new Set(matchingPhysical.map((p) => (p as any).sectionId || 'default'));
    if (distinctSections.size > 1 && !entry.rawSectionId) {
      rejectionReasons.push(
        `Ambiguous binding: multiple physical candidates with question number '${entry.rawPrintedQuestionNumber}' across distinct sections; fail-closed under homonymous contract`
      );
      return { isBound: false, rejectionReasons };
    }
  }

  const primaryPhysical = matchingPhysical[0];

  // 2. Locate CanonicalQuestionIR containing this physical instance
  const matchedCanonical = canonicalQuestions.find((cq) =>
    cq.memberPhysicalInstanceIds.includes(primaryPhysical.physicalInstanceId) ||
    cq.representations.some((r) => r.sourcePhysicalInstanceId === primaryPhysical.physicalInstanceId)
  );

  if (!matchedCanonical) {
    rejectionReasons.push(
      `Physical candidate '${primaryPhysical.physicalInstanceId}' is not associated with any CanonicalQuestionIR`
    );
    return { isBound: false, rejectionReasons };
  }

  // 3. Parse Universal Answer Payload
  const typeHint = (entry as any).rawQuestionTypeHint || (primaryPhysical as any).questionType;
  const parsedPayload = parseRawAnswerValue(entry.rawExtractedValue, typeHint);

  // 4. Evaluate verification status and confidence
  const { status, confidenceScore } = evaluateVerificationStatusFromEvidence(evidence);

  // 5. Derive deterministic candidate ID
  const candidateAnswerId = deriveCandidateAnswerId({
    canonicalQuestionId: matchedCanonical.canonicalQuestionId,
    sourceEntryId: entry.entryId,
    parsedPayload,
  });

  const candidate: AnswerCandidate = {
    candidateAnswerId,
    canonicalQuestionId: matchedCanonical.canonicalQuestionId,
    sourceEntryId: entry.entryId,
    parsedPayload,
    evidence,
    verificationStatus: status,
    confidenceScore,
    provenance: {
      sourceSnapshotId: entry.snapshotId,
      sourceDocumentId: (primaryPhysical as any).provenance?.sourceDocumentId || 'unknown_document',
      adapterVersion,
    },
  };

  return {
    isBound: true,
    candidate,
    rejectionReasons: [],
    canonicalQuestionId: matchedCanonical.canonicalQuestionId,
  };
}
