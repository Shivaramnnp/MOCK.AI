/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Decoupled Multi-Dimensional Question Identity Architecture
 *
 * Enforces separation between:
 * A. Source Question Instance Identity (Physical presence on paper; strictly immutable)
 * B. Canonical Question Family Identity (Pedagogical equivalence across sets/variants)
 * C. Content Revision Identity (Versioned text/LaTeX AST; increments on corrections)
 * D. Extraction Revision Identity (Algorithmic run and parser provenance)
 * E. Assessment / Test Instance Identity (Runtime student test delivery instance)
 *
 * Core Principle:
 * An OCR or math correction creates a new ContentRevision, NOT a new physical QuestionInstance!
 */

export interface SourceQuestionInstanceIdentity {
  instanceId: string; // Deterministic hash of physical coordinates and source file
  sourceDocumentId: string;
  sourceVariantId?: string; // 'SET_A', 'SHIFT_2', etc.
  sourcePageNumber: number;
  sourceSequenceIndex: number;
  sourcePrintedLabel?: string; // e.g. "Q.1", "Question 104", "1(a)"
  sourceBboxHash: string; // Spatial hash of bounding hull
}

export interface CanonicalQuestionFamilyIdentity {
  familyId: string; // Universal cross-variant family ID
  officialAuthorityQuestionId?: string; // e.g. TCS Master Question ID '1042948291'
  officialSectionCode?: string; // e.g. 'GI_REASONING', 'QUANT_TIER1'
  isAuthorityCertified: boolean;
}

export interface ContentRevisionIdentity {
  revisionId: string; // Content AST hash + revision number
  parentRevisionId?: string;
  revisionNumber: number;
  contentAstHash: string;
  createdAt: number;
  authorType: 'DETERMINISTIC_PARSER' | 'STAFF_PATCH' | 'COMMUNITY_REVIEW';
  authorId?: string;
  changeSummary?: string;
}

export interface ExtractionRevisionIdentity {
  runId: string; // Algorithmic execution identifier
  adapterId: string;
  adapterVersion: string;
  parserVersion: string;
  assessmentProfileId: string;
  assessmentProfileVersion: string;
  executionTimestamp: number;
}

export interface AssessmentInstanceIdentity {
  sessionItemId: string; // Candidate exam session deployment ID
  examSessionId: string;
  sectionKey: string;
  displaySequenceIndex: number;
}

/**
 * Composite Multi-Layered Question Identity:
 * Bundles the 5 decoupled identity dimensions while maintaining backward compatibility.
 */
export interface QuestionIdentity {
  // Dimension A: Physical Source Instance
  sourceInstance: SourceQuestionInstanceIdentity;

  // Dimension B: Canonical Family
  family: CanonicalQuestionFamilyIdentity;

  // Dimension C: Content Revision
  contentRevision: ContentRevisionIdentity;

  // Dimension D: Extraction Run
  extractionRevision: ExtractionRevisionIdentity;

  // Dimension E: Optional Runtime Assessment
  assessmentInstance?: AssessmentInstanceIdentity;

  // Backwards-compatible convenience properties
  sourceDocumentId: string;
  sourceVariantId?: string;
  sourcePageNumber: number;
  sourceSequenceIndex: number;
  sourcePrintedLabel?: string;
  officialAuthorityQuestionId?: string;
  officialSectionCode?: string;
  structuralFingerprint: string;
  contentFingerprint: string;
  assetFingerprint: string;
  canonicalQuestionId: string;
  instanceId: string;
}

/**
 * Deterministic string hasher (FNV-1a 64-bit variant represented as hex string).
 */
export function computeDeterministicHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${part1}${part2}${part1}${part2}`;
}

export function computeStructuralFingerprint(
  topology: string,
  optionCount: number,
  hasMath: boolean,
  hasDiagram: boolean,
  hasTable: boolean
): string {
  const descriptor = `${topology}|optCount:${optionCount}|math:${hasMath}|diag:${hasDiagram}|tbl:${hasTable}`;
  return computeDeterministicHash(`struct_${descriptor}`);
}

export function computeContentFingerprint(stemText: string, optionTexts: string[]): string {
  const normStem = stemText.trim().toLowerCase().replace(/\s+/g, ' ');
  const normOpts = [...optionTexts]
    .map((o) => o.trim().toLowerCase().replace(/\s+/g, ' '))
    .sort()
    .join('||');
  return computeDeterministicHash(`content_${normStem}||options_${normOpts}`);
}

export function computeAssetFingerprint(assetHashes: string[]): string {
  if (assetHashes.length === 0) return computeDeterministicHash('no_assets');
  const sorted = [...assetHashes].sort().join('::');
  return computeDeterministicHash(`assets_${sorted}`);
}

export interface BuildQuestionIdentityParams {
  sourceDocumentId: string;
  sourceVariantId?: string;
  sourcePageNumber: number;
  sourceSequenceIndex: number;
  sourcePrintedLabel?: string;
  sourceBboxHash?: string;
  officialAuthorityQuestionId?: string;
  officialSectionCode?: string;
  topology: string;
  optionCount: number;
  hasMath: boolean;
  hasDiagram: boolean;
  hasTable: boolean;
  stemText: string;
  optionTexts: string[];
  assetHashes?: string[];
  revisionNumber?: number;
  adapterId?: string;
  adapterVersion?: string;
  parserVersion?: string;
  assessmentProfileId?: string;
  assessmentProfileVersion?: string;
}

export function buildQuestionIdentity(params: BuildQuestionIdentityParams): QuestionIdentity {
  const structuralFingerprint = computeStructuralFingerprint(
    params.topology,
    params.optionCount,
    params.hasMath,
    params.hasDiagram,
    params.hasTable
  );

  const contentFingerprint = computeContentFingerprint(params.stemText, params.optionTexts);
  const assetFingerprint = computeAssetFingerprint(params.assetHashes || []);

  const bboxHash = params.sourceBboxHash || computeDeterministicHash(`page_${params.sourcePageNumber}_seq_${params.sourceSequenceIndex}`);

  // A. Source Question Instance Identity (Strictly physical, immutable)
  const physicalInstanceId = computeDeterministicHash(
    `phys_inst:${params.sourceDocumentId}:${params.sourcePageNumber}:${params.sourceSequenceIndex}:${bboxHash}`
  );

  const sourceInstance: SourceQuestionInstanceIdentity = {
    instanceId: physicalInstanceId,
    sourceDocumentId: params.sourceDocumentId,
    sourceVariantId: params.sourceVariantId,
    sourcePageNumber: params.sourcePageNumber,
    sourceSequenceIndex: params.sourceSequenceIndex,
    sourcePrintedLabel: params.sourcePrintedLabel,
    sourceBboxHash: bboxHash,
  };

  // B. Canonical Question Family Identity
  const canonicalSeed = params.officialAuthorityQuestionId
    ? `official_${params.officialAuthorityQuestionId}`
    : `canonical_${contentFingerprint}`;
  const canonicalQuestionId = computeDeterministicHash(canonicalSeed);

  const family: CanonicalQuestionFamilyIdentity = {
    familyId: canonicalQuestionId,
    officialAuthorityQuestionId: params.officialAuthorityQuestionId,
    officialSectionCode: params.officialSectionCode,
    isAuthorityCertified: !!params.officialAuthorityQuestionId,
  };

  // C. Content Revision Identity
  const revNum = params.revisionNumber || 1;
  const contentRevisionId = computeDeterministicHash(`content_rev:${contentFingerprint}:v${revNum}`);

  const contentRevision: ContentRevisionIdentity = {
    revisionId: contentRevisionId,
    revisionNumber: revNum,
    contentAstHash: contentFingerprint,
    createdAt: 0, // Deterministic epoch
    authorType: 'DETERMINISTIC_PARSER',
  };

  // D. Extraction Revision Identity
  const adapterId = params.adapterId || 'uadue_adapter_universal';
  const adapterVersion = params.adapterVersion || '1.0.0';
  const parserVersion = params.parserVersion || '1.0.0';
  const assessmentProfileId = params.assessmentProfileId || 'universal_profile';
  const assessmentProfileVersion = params.assessmentProfileVersion || '1.0.0';

  const runId = computeDeterministicHash(
    `run:${adapterId}:${adapterVersion}:${parserVersion}:${assessmentProfileId}:${assessmentProfileVersion}`
  );

  const extractionRevision: ExtractionRevisionIdentity = {
    runId,
    adapterId,
    adapterVersion,
    parserVersion,
    assessmentProfileId,
    assessmentProfileVersion,
    executionTimestamp: 0,
  };

  // Application instance identity
  const instanceId = computeDeterministicHash(
    `inst_${params.sourceDocumentId}:${canonicalQuestionId}:${params.sourceSequenceIndex}`
  );

  return {
    sourceInstance,
    family,
    contentRevision,
    extractionRevision,
    sourceDocumentId: params.sourceDocumentId,
    sourceVariantId: params.sourceVariantId,
    sourcePageNumber: params.sourcePageNumber,
    sourceSequenceIndex: params.sourceSequenceIndex,
    sourcePrintedLabel: params.sourcePrintedLabel,
    officialAuthorityQuestionId: params.officialAuthorityQuestionId,
    officialSectionCode: params.officialSectionCode,
    structuralFingerprint,
    contentFingerprint,
    assetFingerprint,
    canonicalQuestionId,
    instanceId,
  };
}
