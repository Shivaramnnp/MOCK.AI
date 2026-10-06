/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Certification Lifecycle, Quality States & Multi-Dimensional Confidence
 */

export type UadueLifecycleState =
  | 'EXTRACTED'
  | 'NORMALIZED'
  | 'UNIT_TESTED'
  | 'STRUCTURALLY_VALID'
  | 'SOURCE_COMPARED'
  | 'ANSWER_VERIFIED'
  | 'UI_VERIFIED'
  | 'CERTIFIED'
  | 'REVIEW_REQUIRED'
  | 'FAILED'
  | 'RESOLVED'
  | 'REJECTED';

/**
 * 9-Dimensional Orthogonal Forensic Confidence Vector:
 * Prevents high aggregate scores from concealing fatal isolated defects.
 */
export interface ForensicConfidenceVector {
  boundaryConfidence: number;   // 0.0 - 1.0: Certainty that question start & end anchors are correct
  ownershipConfidence: number;  // 0.0 - 1.0: Certainty that options, diagrams, and tables belong to this stem
  textConfidence: number;       // 0.0 - 1.0: Character encoding fidelity & OCR engine confidence
  mathConfidence: number;       // 0.0 - 1.0: Delimiter parity, LaTeX parsing success, KaTeX compilability
  tableConfidence: number;      // 0.0 - 1.0: Grid lattice completeness, non-overlapping cell text
  visualConfidence: number;     // 0.0 - 1.0: Resolution, aspect ratio sanity, unclipped diagram hulls
  answerConfidence: number;     // 0.0 - 1.0: Key provenance clarity, valid option target, non-null value
  identityConfidence: number;   // 0.0 - 1.0: Fingerprint uniqueness, sequence continuity
  uiFidelityScore: number;      // 0.0 - 1.0: Visual rendering containment score inside mock exam viewport
}

export function createDefaultConfidenceVector(initialValue: number = 1.0): ForensicConfidenceVector {
  return {
    boundaryConfidence: initialValue,
    ownershipConfidence: initialValue,
    textConfidence: initialValue,
    mathConfidence: initialValue,
    tableConfidence: initialValue,
    visualConfidence: initialValue,
    answerConfidence: initialValue,
    identityConfidence: initialValue,
    uiFidelityScore: initialValue,
  };
}

export interface InvariantValidationReport {
  invariantName: string;
  category: 'MATH' | 'GEOMETRY' | 'SCORING' | 'OPTIONS' | 'ANSWER_KEY' | 'IDENTITY' | 'ASSET';
  passed: boolean;
  message?: string;
  severity: 'FATAL' | 'REVIEW_REQUIRED' | 'WARNING';
}

export interface CertificationVerdict {
  status: 'CERTIFIED' | 'REVIEW_REQUIRED' | 'FAILED';
  lifecycleState: UadueLifecycleState;
  confidence: number; // 0.0 - 1.0
  confidenceVector: ForensicConfidenceVector;
  invariantsPassed: InvariantValidationReport[];
  invariantsFlagged: InvariantValidationReport[];
  requiresManualReview: boolean;
  fatalVetoTriggered?: boolean;
  vetoReason?: string;
  suggestedAction?: 'AUTO_PUBLISH' | 'ENQUEUE_STAFF_REVIEW' | 'REJECT_SOURCE';
}

export interface ReviewQueueItemCandidate {
  questionId: string;
  paperId: string;
  anomalyCategory: 'MATH_SYNTAX' | 'OPTION_STRUCTURE' | 'DIAGRAM_ALIGNMENT' | 'ANSWER_KEY' | 'LAYOUT_AMBIGUITY' | 'OTHER';
  severity: 'FATAL' | 'REVIEW_REQUIRED' | 'WARNING';
  details: Record<string, unknown>;
  cropUrl?: string;
  suggestedPatch?: Record<string, unknown>;
}

export interface ReviewQueueItem extends ReviewQueueItemCandidate {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}
