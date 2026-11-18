/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: QuestionGraph & Evidence-Backed Semantic Segmentation (Phase 2C)
 *
 * Inviolable Forensic Hierarchy:
 * SOURCE EVIDENCE > PHYSICAL GRAPH > SEGMENTATION HYPOTHESIS > VERIFIED QUESTION STRUCTURE
 *
 * Principles:
 * 1. A question is NOT a rectangle. It is a graph of physically located evidence objects.
 * 2. Three Distinct Observation States: OBSERVED, INFERRED, HYPOTHETICAL.
 * 3. Confidence != Verification. Verification status is explicitly separated from confidence scores.
 * 4. Question identity is decoupled: physical instance + candidate source identity.
 *    (Zero canonical question identity in Phase 2C).
 * 5. Option and stimulus ownership are represented as evidence-backed candidate relationships.
 * 6. Tables, diagrams, and math preserve original physical evidence without premature text/LaTeX flattening.
 */

import { BoundingBox2D, SourceEvidence } from './evidence';
import { QuestionIdentity } from './identity';
import { AssetGraph } from './assetGraph';

// ============================================================================
// 1. Observation States & Verification Statuses
// ============================================================================

export type EvidenceObservationState =
  | 'OBSERVED'      // Directly supported by physical evidence
  | 'INFERRED'      // Derived from multiple physical observations
  | 'HYPOTHETICAL'; // One of multiple plausible interpretations

export type QuestionVerificationStatus =
  | 'UNVERIFIED'
  | 'SUPPORTED'
  | 'CONFLICTED'
  | 'AMBIGUOUS'
  | 'VERIFIED'
  | 'REJECTED';

// ============================================================================
// 2. Candidate Semantic Roles & Number Token Distinctions
// ============================================================================

export type SemanticCandidateRole =
  | 'QUESTION_NUMBER_CANDIDATE'
  | 'STEM_CANDIDATE'
  | 'BODY_CANDIDATE'
  | 'OPTION_CANDIDATE'
  | 'STIMULUS_CANDIDATE'
  | 'PASSAGE_CANDIDATE'
  | 'TABLE_CANDIDATE'
  | 'DIAGRAM_CANDIDATE'
  | 'CODE_CANDIDATE'
  | 'MATH_CANDIDATE'
  | 'SECTION_HEADER_CANDIDATE'
  | 'INSTRUCTION_CANDIDATE'
  | 'PAGE_HEADER_FOOTER_CANDIDATE';

export type NumberCandidateType =
  | 'QUESTION_NUMBER'
  | 'PAGE_NUMBER'
  | 'SECTION_NUMBER'
  | 'OPTION_NUMBER'
  | 'FIGURE_NUMBER'
  | 'TABLE_NUMBER'
  | 'PARAGRAPH_NUMBER'
  | 'CODE_LINE_NUMBER'
  | 'YEAR_NUMBER'
  | 'MATHEMATICAL_NUMBER'
  | 'STATEMENT_NUMBER'
  | 'METADATA_NUMBER'
  | 'INSTRUCTION_NUMBER'
  | 'UNKNOWN_NUMBER';

export type VisualCandidateRole =
  | 'DECORATIVE_VISUAL'
  | 'PAGE_TEMPLATE'
  | 'PAGE_BACKGROUND'
  | 'WATERMARK'
  | 'BORDER'
  | 'LAYOUT_DIVIDER'
  | 'CHECKBOX'
  | 'ICON'
  | 'DECORATION'
  | 'GLYPH_VECTOR'
  | 'TABLE_RULE'
  | 'MATH_VECTOR'
  | 'DIAGRAM_PRIMITIVE'
  | 'DIAGRAM_REGION'
  | 'IMAGE'
  | 'VISUAL_OPTION'
  | 'STIMULUS_VISUAL'
  | 'OTHER';

// ============================================================================
// 3. Segmentation Evidence Model
// ============================================================================

export type SegmentationEvidenceType =
  | 'BOUNDARY_BEFORE'
  | 'BOUNDARY_AFTER'
  | 'CONTINUATION_EVIDENCE'
  | 'TYPOGRAPHIC_CHANGE'
  | 'SPATIAL_GAP'
  | 'NUMBERING_PATTERN'
  | 'READING_ORDER_TRANSITION'
  | 'COLUMN_TRANSITION'
  | 'PAGE_TRANSITION'
  | 'SHARED_STIMULUS_EVIDENCE'
  | 'OPTION_PATTERN_EVIDENCE'
  | 'DIAGRAM_ANCHOR_EVIDENCE'
  | 'TABLE_BOUNDARY_EVIDENCE'
  | 'MATH_CONTINUITY_EVIDENCE';

export interface SegmentationEvidence {
  evidenceId: string;
  evidenceType: SegmentationEvidenceType;
  sourceGraphNodeIds: string[];
  sourceGraphEdgeIds?: string[];
  metricValues?: Record<string, number>;
  confidence: number;
  decisionBasis: string;
}

// ============================================================================
// 4. Decoupled Question Identity Candidate
// ============================================================================

export interface QuestionIdentityCandidate {
  physicalInstanceId: string; // Deterministic hash of sourceDocumentId + physical coordinates + page
  sourcePrintedLabel?: string; // e.g. "Q.1", "Question 104", "1(a)"
  detectedNumber?: number;
  officialQuestionId?: string; // e.g. "Question ID : 123456" from assessment metadata
  numberType: NumberCandidateType;
  confidence: number;
  supportingEvidenceIds: string[];
}

// ============================================================================
// 5. Option Candidate & Explicit Ownership Hypotheses
// ============================================================================

export interface OptionOwnershipCandidate {
  questionCandidateId: string;
  confidence: number;
  decisionBasis: string;
  supportingRelationIds?: string[];
}

export interface OptionCandidate {
  optionCandidateId: string;
  markerNodeId?: string; // e.g. "(A)", "1.", "(i)"
  markerLabel?: string;  // Decoded text of marker
  contentNodeIds: string[]; // Physical node IDs in DocumentGraph
  candidateOwners: OptionOwnershipCandidate[];
  resolvedOwnerQuestionId?: string;
  isMultiColumnOption: boolean;
  hasVisualAsset: boolean;
  hasMathematics: boolean;
  observationState: EvidenceObservationState;
  verificationStatus: QuestionVerificationStatus;
  confidenceScore: number;
  supportingEvidenceIds: string[];
}

// ============================================================================
// 6. Stimulus Candidate (Shared References, Zero Cloning)
// ============================================================================

export interface StimulusCandidate {
  stimulusId: string;
  stimulusType: 'PASSAGE' | 'SHARED_DIAGRAM' | 'SHARED_TABLE' | 'CASELET' | 'CODE_BLOCK';
  physicalNodeIds: string[];
  supportedQuestionCandidateIds: string[]; // References to questions; physical content NOT cloned!
  observationState: EvidenceObservationState;
  verificationStatus: QuestionVerificationStatus;
  confidenceScore: number;
  supportingEvidenceIds: string[];
}

// ============================================================================
// 7. Table, Diagram, and Math Candidates (Zero Flattening, Zero Replacement)
// ============================================================================

export interface TableCellCandidate {
  rowIndex: number;
  columnIndex: number;
  rowSpan: number;
  colSpan: number;
  physicalNodeIds: string[];
  textContent?: string;
  bbox: BoundingBox2D;
}

export interface TableCandidate {
  tableCandidateId: string;
  physicalNodeIds: string[];
  rowCount: number;
  columnCount: number;
  cells: TableCellCandidate[];
  gridGeometry: { x0: number; y0: number; x1: number; y1: number; unit: string };
  isColumnIColumnIIMatch: boolean; // Structural feature without semantic bias
  observationState: EvidenceObservationState;
  verificationStatus: QuestionVerificationStatus;
  confidenceScore: number;
}

export interface DiagramCandidate {
  diagramCandidateId: string;
  physicalNodeIds: string[]; // Vector paths, raster images
  labelNodeIds: string[];    // Spatial labels embedded in or adjacent to diagram
  visualBbox: BoundingBox2D;
  hasAccompanyingText: boolean;
  visualRole?: VisualCandidateRole;
  authoritativeSourceAssetIds: string[];
  observationState: EvidenceObservationState;
  verificationStatus: QuestionVerificationStatus;
  confidenceScore: number;
}

export interface MathCandidate {
  mathCandidateId: string;
  physicalNodeIds: string[];
  glyphRunIds: string[];
  bbox: BoundingBox2D;
  containsFractionOrMatrix: boolean;
  originalGlyphsPreserved: boolean;
  observationState: EvidenceObservationState;
  verificationStatus: QuestionVerificationStatus;
  confidenceScore: number;
}

// ============================================================================
// 8. Question Candidate
// ============================================================================

export interface LanguageRepresentationCandidate {
  languageScript: 'LATIN' | 'DEVANAGARI' | 'OTHER';
  pageNumber: number;
  columnIndex?: number;
  numberNodeId?: string;
  sourceQuestionNumber?: string;
  stemNodeIds: string[];
  bodyNodeIds: string[];
  optionCandidateIds: string[];
}

export interface QuestionCandidate {
  candidateId: string;
  physicalInstanceId: string;
  sourceQuestionNumber?: string;
  officialQuestionId?: string;
  identityCandidate: QuestionIdentityCandidate;
  candidateDisplayOrder: number;
  sourceOrder: number;
  startPageNumber: number;
  endPageNumber: number;
  isMultiPage: boolean;
  isBilingual?: boolean;
  languageRepresentations?: LanguageRepresentationCandidate[];
  includedPhysicalNodeIds: string[];
  numberNodeId?: string;
  stemNodeIds: string[];
  bodyNodeIds: string[];
  optionCandidateIds: string[]; // References to OptionCandidate
  stimulusRefIds: string[];     // References to StimulusCandidate (shared, not cloned)
  tableCandidateIds: string[];
  diagramCandidateIds: string[];
  mathCandidateIds: string[];
  codeCandidateIds: string[];
  observationState: EvidenceObservationState;
  verificationStatus: QuestionVerificationStatus;
  confidenceScore: number;
  evidenceList: SegmentationEvidence[];
  unresolvedAmbiguityIds: string[];
}

// ============================================================================
// 8b. Question Identity Relationship Candidates & Formal Evidence Model
// ============================================================================

export type QuestionRelationshipType =
  | 'LANGUAGE_REPRESENTATION_OF'
  | 'CONTINUATION_OF'
  | 'SHARED_STIMULUS_CHILD_OF'
  | 'POSSIBLE_DUPLICATE_CANDIDATE'
  | 'RELATED_BUT_DISTINCT'
  | 'UNKNOWN_RELATIONSHIP';

export type RelationshipEvidenceType =
  // Hard Evidence
  | 'FACING_PAGE_SPREAD_PAIR'
  | 'MATCHING_PRINTED_NUMERAL'
  | 'DISTINCT_SCRIPT_DETECTION'
  | 'IDENTICAL_OPTION_CARDINALITY'
  | 'MATCHING_SUB_CLAUSE_TOPOLOGY'
  | 'EXPLICIT_OFFICIAL_QUESTION_ID'
  // Supporting Evidence
  | 'IDENTICAL_SECTION_CONTEXT'
  | 'HOMOLOGOUS_SPATIAL_ORDER'
  | 'SHARED_VISUAL_ASSET_REFERENCE'
  | 'PARALLEL_COLUMN_LAYOUT'
  // Weak / Contextual Evidence
  | 'SAME_PRINTED_NUMBER_ONLY'
  | 'ROUGH_TEXT_LENGTH_PROPORTION'
  | 'COMMON_PUNCTUATION_PATTERN'
  // Conflicting Evidence
  | 'NUMERICAL_DISCONTINUITY'
  | 'INCOMPATIBLE_OPTION_CARDINALITY'
  | 'DIFFERENT_SECTION_CONTEXT'
  | 'SAME_SCRIPT_ON_FACING_SPREAD'
  | 'INCOMPATIBLE_SPATIAL_ORDER';

export type RelationshipEvidenceStrength =
  | 'HARD'
  | 'SUPPORTING'
  | 'WEAK'
  | 'CONFLICTING';

export interface RelationshipEvidence {
  evidenceId: string;
  evidenceType: RelationshipEvidenceType;
  evidenceStrength: RelationshipEvidenceStrength;
  sourceNodeIds: string[];
  description: string;
  confidence: number;
}

export type RelationshipVerificationStatus =
  | 'RELATIONSHIP_UNVERIFIED'
  | 'RELATIONSHIP_PROVEN'
  | 'RELATIONSHIP_PLAUSIBLE'
  | 'RELATIONSHIP_AMBIGUOUS'
  | 'RELATIONSHIP_CONFLICTED'
  | 'RELATIONSHIP_REJECTED';

export interface QuestionRelationshipCandidate {
  relationshipId: string;
  sourceCandidateId: string;
  targetCandidateId: string;
  relationshipType: QuestionRelationshipType;
  evidence: RelationshipEvidence[];
  confidenceScore: number;
  verificationStatus: RelationshipVerificationStatus;
  isSymmetric: boolean;
  provenance: {
    sourceSnapshotId: string;
    sourceDocumentId: string;
    createdAt: number;
  };
  unresolvedReasons?: string[];
}

// ============================================================================
// 9. Ambiguity Record & Segmentation Hypotheses
// ============================================================================

export interface AmbiguityRecord {
  ambiguityId: string;
  ambiguityType:
    | 'BOUNDARY_UNCERTAINTY'
    | 'OPTION_OWNERSHIP_UNCERTAINTY'
    | 'STIMULUS_SCOPE_UNCERTAINTY'
    | 'NUMBERING_DISCONTINUITY'
    | 'CROSS_PAGE_AMBIGUITY'
    | 'SPATIAL_INTERLEAVING_AMBIGUITY';
  affectedPhysicalNodeIds: string[];
  candidateHypothesisIds: string[];
  description: string;
  confidenceDelta: number;
  reviewRecommended: boolean;
}

export interface SegmentationHypothesis {
  hypothesisId: string;
  sourceGraphId: string;
  includedPhysicalNodeIds: string[];
  excludedPhysicalNodeIds: string[];
  candidateQuestionIds: string[];
  boundaryEvidence: SegmentationEvidence[];
  supportingRelations: string[]; // Edge IDs from DocumentGraph
  conflictingEvidence: string[];
  confidence: number;
  unresolvedAmbiguities: string[];
  algorithmVersion: string;
  configurationVersion: string;
}

// ============================================================================
// 10. Verification State & Findings
// ============================================================================

export interface QuestionGraphVerificationFinding {
  findingId: string;
  severity: 'FATAL' | 'REVIEW_REQUIRED' | 'WARNING' | 'INFO';
  ruleId: string;
  message: string;
  affectedCandidateIds: string[];
}

export interface QuestionGraphVerificationState {
  overallStatus: QuestionVerificationStatus;
  unverifiedCount: number;
  supportedCount: number;
  conflictedCount: number;
  ambiguousCount: number;
  verifiedCount: number;
  rejectedCount: number;
  findings: QuestionGraphVerificationFinding[];
}

// ============================================================================
// 11. Provenance & Master QuestionGraph
// ============================================================================

export interface QuestionGraphProvenanceRecord {
  algorithmId: string;
  algorithmVersion: string;
  configurationVersion: string;
  sourceDocumentGraphId: string;
  sourceDocumentGraphSha256: string;
  sourceSnapshotId: string;
  sourceDocumentId: string;
  sourceSha256: string;
  createdAt: number;
  determinismScope: {
    identicalDocumentGraph: boolean;
    identicalAlgorithm: boolean;
    identicalConfig: boolean;
    runtime: string;
    floatPrecision: 'IEEE_754_64BIT';
  };
}

export interface QuestionGraph {
  graphId: string;
  sourceDocumentId: string;
  sourceSnapshotId: string;
  sourceSha256: string;
  sourceDocumentGraphId: string;
  sourceDocumentGraphSha256: string;
  schemaVersion: string;
  algorithmVersion: string;
  configurationVersion: string;
  questions: QuestionCandidate[];
  stimuli: StimulusCandidate[];
  options: OptionCandidate[];
  tables: TableCandidate[];
  diagrams: DiagramCandidate[];
  mathBlocks: MathCandidate[];
  hypotheses: SegmentationHypothesis[];
  activeHypothesisId: string;
  ambiguities: AmbiguityRecord[];
  relationships?: QuestionRelationshipCandidate[];
  verificationState: QuestionGraphVerificationState;
  provenance: QuestionGraphProvenanceRecord;
  isSealed: boolean;
  sealedHash: string;
  sealedAt: number;
}

// ============================================================================
// Backwards-Compatibility Aliases for Phase 1 / Phase 2 Scaffolding
// ============================================================================

export type QuestionTopologyType =
  | 'STANDALONE_MCQ'
  | 'STANDALONE_MSQ'
  | 'STANDALONE_NAT'
  | 'STIMULUS_PARENT'
  | 'STIMULUS_CHILD'
  | 'ASSERTION_REASON'
  | 'MATRIX_MATCH'
  | 'TRUE_FALSE'
  | 'MULTI_PART'
  | 'DESCRIPTIVE'
  | 'UNKNOWN';

export interface QuestionOptionNode {
  optionKey: string;
  optionIndex: number;
  markerElementId?: string;
  contentElementIds: string[];
  detectedVisualAssetId?: string;
  assetId?: string;
  isRasterBanner: boolean;
}

export interface QuestionGraphNode {
  nodeId: string;
  identity?: QuestionIdentity;
  sourceQuestionNumber: number;
  officialQuestionId?: string;
  topology: QuestionTopologyType;
  stimulusRefId?: string;
  sectionKey?: string;
  sectionName?: string;
  startPage: number;
  endPage: number;
  headerElementId?: string;
  promptElementIds: string[];
  options: QuestionOptionNode[];
  associatedAssetIds?: string[];
  footerElementId?: string;
  evidence: SourceEvidence[];
  boundaryConfidence: number;
  isMultiPage: boolean;
}

export interface AssessmentDocumentGraph {
  documentId: string;
  nodes: QuestionGraphNode[];
  stimulusNodes: Map<
    string,
    {
      stimulusId: string;
      type: 'PASSAGE' | 'CASELET' | 'SHARED_DIAGRAM' | 'CODE_BLOCK';
      elementIds: string[];
      childQuestionNodeIds: string[];
    }
  >;
  assetGraph?: AssetGraph;
}
