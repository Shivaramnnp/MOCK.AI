/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Evidence-Based Multi-Dimensional Verification Model
 *
 * Eliminates primitive boolean flags (verified: true).
 * Models verification as forensic evidence runs across 6 independent equivalence dimensions.
 */

export type VerificationDimension =
  | 'FORENSIC_EQUIVALENCE'   // Stream byte offsets, glyph hashes, physical containment
  | 'SEMANTIC_EQUIVALENCE'   // Question topology, stem/stimulus relationship, option lattice
  | 'STRUCTURAL_EQUIVALENCE' // LaTeX AST compilability, table grid integrity, code block indentation
  | 'CONTENT_EQUIVALENCE'    // Token containment, exact Unicode glyph-stream equality
  | 'ANSWER_EQUIVALENCE'     // Answer key provenance authenticated, zero Option-A coercion
  | 'UI_EQUIVALENCE';        // Headless browser viewport render passes without CSS clipping or overflow

export type VerificationSeverity =
  | 'FATAL'
  | 'REVIEW_REQUIRED'
  | 'WARNING'
  | 'INFO'
  | 'PASS';

export type ComparisonMethod =
  | 'EXACT_BYTES'
  | 'TOKEN_STREAM_CONTAINMENT'
  | 'LATEX_AST_EQUAL'
  | 'SSIM_PIXEL_DIFFERENTIAL'
  | 'LEVENSTEIN_NORMALIZED'
  | 'GRID_LATTICE_PARITY'
  | 'MANUAL_INSPECTION';

/**
 * Objective Verification Evidence:
 * Concrete proof comparing source truth against derived representation.
 */
export interface VerificationEvidence {
  evidenceId: string;
  findingId: string;
  comparisonMethod: ComparisonMethod;
  expectedValue?: string | number | Record<string, unknown>;
  observedValue?: string | number | Record<string, unknown>;
  differentialMetric?: number; // e.g. SSIM score, edit distance, pixel error rate
  thresholdLimit?: number;
  sourceArtifactUri?: string; // Path to original crop
  derivedArtifactUri?: string; // Path to player-rendered canvas output
}

/**
 * Discrete Verification Finding:
 * An immutable audit record of a rule evaluation.
 */
export interface VerificationFinding {
  findingId: string;
  runId: string;
  dimension: VerificationDimension;
  severity: VerificationSeverity;
  ruleId: string;
  message: string;
  evidenceList: VerificationEvidence[];
  resolutionStatus: 'UNRESOLVED' | 'RESOLVED_AUTO' | 'RESOLVED_STAFF' | 'WAIVED' | 'REJECTED';
  resolutionProvenance?: {
    resolvedBy: string;
    resolvedAt: number;
    comment: string;
  };
}

/**
 * Execution Audit of a Verification Suite Run:
 */
export interface VerificationRun {
  runId: string;
  targetType: 'DOCUMENT' | 'QUESTION' | 'ASSET';
  targetId: string;
  profileId: string;
  profileVersion: string;
  suiteVersion: string;
  executedAt: number;
  environment: 'WORKER_NODE' | 'CI_HEADLESS' | 'BROWSER_REVIEW';
  findings: VerificationFinding[];
}

/**
 * Final Multi-Dimensional Certification Decision:
 * Cryptographically sealed verdict requiring pass status across all applicable dimensions.
 */
export interface VerificationDecision {
  decisionId: string;
  runId: string;
  targetId: string;
  status: 'CERTIFIED' | 'REVIEW_REQUIRED' | 'FAILED' | 'RESOLVED' | 'REJECTED';
  dimensionPassRates: Record<VerificationDimension, boolean>;
  fatalCount: number;
  reviewRequiredCount: number;
  warningCount: number;
  decidedBy: string;
  decidedAt: number;
  cryptographicSignature?: string; // SHA-256 seal of all findings and evidence
}
