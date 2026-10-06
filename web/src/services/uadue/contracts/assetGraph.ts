/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Decoupled & Immutable Asset Graph
 *
 * Strictly separates:
 * 1. SourceAsset: Physical immutable source image/vector asset (NO mutable flags!)
 * 2. AssetRepresentation: Versioned alternative renderings (SVG, OCR, LaTeX, WebP)
 * 3. AssetClassification: Semantic role assignment produced by classifiers
 * 4. AssetOwnership: Relational linkages to stems and options
 * 5. AssetVerification: Findings such as stem leakage, clipping, resolution warnings
 */

import { BoundingBox2D } from './evidence';
import { SourceReference } from './sourceReference';

export type AssetSemanticRole =
  | 'STIMULUS_DIAGRAM'
  | 'CIRCUIT_SCHEMATIC'
  | 'MATHEMATICAL_FORMULA'
  | 'CHEMICAL_STRUCTURE'
  | 'DATA_TABLE_RASTER'
  | 'MAP_GEOGRAPHY'
  | 'OPTION_VISUAL_CARD'
  | 'DECORATIVE_WATERMARK'
  | 'CODE_SNIPPET';

/**
 * 1. SourceAsset (Strictly Immutable Physical Asset):
 * Contains only physical attributes extracted from the source file.
 * NEVER stores mutable classification findings or review decisions.
 */
export interface SourceAsset {
  assetId: string; // SHA-256 of raw underlying bytes
  sourceDocumentId: string;
  sourceDocumentHash: string;
  pageNumber: number;
  bbox: BoundingBox2D;

  // Intrinsic Characteristics
  intrinsicDimensions: { widthPx: number; heightPx: number; dpi: number };
  aspectRatio: number;
  colorDepth: number;
  hasAlphaChannel: boolean;
  contentPerceptualHash: string; // pHash / dHash
  rawByteHash: string; // Cryptographic pixel hash

  authoritativeStoragePath: string; // Storage path on CDN/storage
  sourceReferences: SourceReference[]; // Exact stream & object references
}

/**
 * 2. AssetRepresentation (Immutable Derived Representation):
 * Multi-modal alternative renders produced by specific engines.
 */
export interface AssetRepresentation {
  representationId: string;
  assetId: string;
  type: 'LOSSLESS_PNG' | 'VECTOR_SVG' | 'RAW_TEXT_OCR' | 'LATEX_MATH' | 'CODE_AST' | 'WEBP_OPTIMIZED';
  contentPayload: string; // URL, SVG string, LaTeX math, or AST JSON
  engineId: string;
  engineVersion: string;
  confidence: number;
  isAuthoritative: boolean;
  createdAt: number;
}

/**
 * 3. AssetClassification (Semantic Classifier Output):
 * Result of a model/classifier determining what the asset represents.
 */
export interface AssetClassification {
  classificationId: string;
  assetId: string;
  semanticRole: AssetSemanticRole;
  confidence: number;
  classifierEngine: string;
  classifierVersion: string;
  classifiedAt: number;
}

/**
 * 4. AssetOwnership (Relational Linkage):
 * Connects an asset to pedagogical units (question stems, options, stimuli).
 */
export interface AssetOwnership {
  ownershipId: string;
  assetId: string;
  targetNodeId: string; // Question instance ID or Option Node ID
  relationship: 'BELONGS_TO_STEM' | 'IS_OPTION_BODY' | 'PROVIDES_STIMULUS' | 'DERIVED_FROM';
  optionKey?: string; // e.g. 'A'
  confidence: number;
}

/**
 * 5. AssetVerification (Verification Finding):
 * Evaluates asset integrity (stem leakage, clipping, aspect ratio distortion).
 */
export interface AssetVerification {
  verificationId: string;
  assetId: string;
  finding: 'CLEAN' | 'LEAKED_STEM_CONTENT' | 'CLIPPED_BORDER' | 'LOW_RESOLUTION' | 'CORRUPT_BYTES';
  severity: 'FATAL' | 'REVIEW_REQUIRED' | 'WARNING' | 'PASS';
  status: 'UNINSPECTED' | 'VERIFIED' | 'REVIEW_REQUIRED';
  details: Record<string, unknown>;
  verifiedAt: number;
  verifiedBy: string;
}

/**
 * Backwards-compatible AssetGraphNode combining physical asset and active classification.
 */
export interface AssetGraphNode {
  assetId: string;
  semanticRole: AssetSemanticRole;
  sourceEvidenceId: string;
  sourceDocumentHash: string;
  pageNumber: number;
  bbox: BoundingBox2D;
  intrinsicDimensions: { widthPx: number; heightPx: number; dpi: number };
  aspectRatio: number;
  colorDepth: number;
  hasAlphaChannel: boolean;
  contentPerceptualHash: string;
  contentSha256: string;
  authoritativeStoragePath: string;
  representations: AssetRepresentation[];
  associatedQuestionInstanceIds: string[];
  associatedOptionKeys: string[];
  associatedStimulusIds: string[];
  isCorrupted: boolean;
  isLeakedStemContent: boolean;
  verificationStatus: 'UNINSPECTED' | 'VERIFIED' | 'REVIEW_REQUIRED';

  // Decoupled sub-entities
  physicalAsset?: SourceAsset;
  activeClassification?: AssetClassification;
  ownerships?: AssetOwnership[];
  verificationRecords?: AssetVerification[];
}

export interface AssetGraphEdge {
  sourceAssetId: string;
  targetNodeId: string;
  relationship: 'BELONGS_TO_STEM' | 'IS_OPTION_BODY' | 'PROVIDES_STIMULUS' | 'DERIVED_FROM';
}

export interface AssetGraph {
  documentId: string;
  assets: Map<string, AssetGraphNode>;
  edges: AssetGraphEdge[];
  sourceAssets?: Map<string, SourceAsset>;
  classifications?: Map<string, AssetClassification>;
  ownerships?: Map<string, AssetOwnership>;
  verifications?: Map<string, AssetVerification>;
}

export function createEmptyAssetGraph(documentId: string): AssetGraph {
  return {
    documentId,
    assets: new Map<string, AssetGraphNode>(),
    edges: [],
    sourceAssets: new Map<string, SourceAsset>(),
    classifications: new Map<string, AssetClassification>(),
    ownerships: new Map<string, AssetOwnership>(),
    verifications: new Map<string, AssetVerification>(),
  };
}
