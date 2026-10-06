/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Immutable Forensic Snapshot (Layer 1)
 *
 * Captures an immutable, reproducible representation of the original source
 * BEFORE any semantic interpretation, question segmentation, or OCR normalization.
 *
 * Inviolable Architectural Principle:
 * No semantic classifier, segmenter, OCR normalizer, math reconstructor,
 * or answer-key matcher may mutate the ForensicSnapshot.
 * The snapshot is sealed and strictly immutable. Derived structures reference it.
 */

import { SourceDocumentFormat, PhysicalGeometry, ForensicVectorPath } from './documentIR';
import { CoordinateSpaceType } from './evidence';
import { SourceReference } from './sourceReference';

export type UnicodeMappingStatus =
  | 'NATIVE_UNICODE'
  | 'TO_UNICODE_CMAP'
  | 'STANDARD_ENCODING'
  | 'UNICODE_UNCERTAIN';

export interface ForensicPageGeometry {
  pageIndex: number; // 0-indexed
  pageNumber: number; // 1-indexed
  dimensions: { width: number; height: number; unit: 'pt' | 'px' | 'mm' };
  mediaBox: { x0: number; y0: number; x1: number; y1: number };
  cropBox: { x0: number; y0: number; x1: number; y1: number };
  bleedBox?: { x0: number; y0: number; x1: number; y1: number };
  trimBox?: { x0: number; y0: number; x1: number; y1: number };
  rotationDeg: 0 | 90 | 180 | 270;
}

export interface ForensicSourceObjectEntry {
  objectId: string;
  objectType: 'PAGE' | 'XOBJECT_IMAGE' | 'FONT' | 'COLOR_SPACE' | 'CONTENT_STREAM' | 'ANNOTATION' | 'METADATA';
  pdfObjectNumber?: number;
  pdfGenerationNumber?: number;
  byteOffset?: number;
  byteLength?: number;
  sha256: string;
}

export interface ForensicContentStreamEntry {
  streamId: string;
  pageNumber: number;
  streamIndex: number;
  byteLength?: number;
  sha256?: string;
  operatorCount: number;
  // Forensic Source Evidence (Phase 2A Remediation)
  pdfObjectNumber?: number;
  pdfGenerationNumber?: number;
  rawStreamSha256?: string;
  decodedStreamSha256?: string;
  filterChain?: string[];
  declaredLength?: number;
  byteRange?: { startByte: number; endByte: number };
}

export interface ForensicFontDictionaryEntry {
  fontId: string;
  fontName: string;
  baseFont: string;
  subtype: 'Type1' | 'TrueType' | 'Type3' | 'CIDFontType0' | 'CIDFontType2' | 'OpenType' | 'Other';
  encoding?: string;
  hasToUnicodeCMap: boolean;
  isEmbedded?: boolean;
  fontFileSha256?: string;
  // Forensic Source Evidence (Phase 2A Remediation)
  pdfObjectNumber?: number;
  toUnicodeObjectNumber?: number;
  toUnicodeSha256?: string;
}

export interface ForensicGlyphRunEntry {
  glyphRunId: string;
  pageNumber: number;
  streamId: string;
  operatorIndex: number;
  fontId: string;
  fontSizePt: number;
  rawBytesHex?: string;
  decodedUnicode: string;
  advanceWidthPt: number;
  geometry: PhysicalGeometry;
  renderMode: number;
  unicodeStatus?: UnicodeMappingStatus;
  // Forensic Source Evidence (Phase 2A Remediation)
  evidenceClassification?: 'RAW_SOURCE_EVIDENCE' | 'DIRECT_PARSER_OBSERVATION' | 'DERIVED_PHYSICAL_OBSERVATION';
  sourceStreamObjectId?: number;
}

export interface ForensicRasterXObjectEntry {
  xObjectId: string;
  pageNumber: number;
  sourceByteHash?: string;
  mimeType?: string;
  widthPx?: number;
  heightPx?: number;
  colorSpace?: string;
  bitsPerComponent?: number;
  isMask?: boolean;
  geometry: PhysicalGeometry;
  drawingOrderIndex: number;
  // Forensic Source Evidence (Phase 2A Remediation)
  pdfObjectNumber?: number;
  encodedStreamSha256?: string;
  decodedImageSha256?: string;
  filterChain?: string[];
}

export interface ForensicClippingStateEntry {
  clipId: string;
  pageNumber: number;
  operatorIndex: number;
  clippingBox: { x0: number; y0: number; x1: number; y1: number };
  windingRule: 'NON_ZERO' | 'EVEN_ODD';
}

export interface ForensicAnnotationEntry {
  annotationId: string;
  pageNumber: number;
  subtype: 'Link' | 'Widget' | 'Highlight' | 'Popup' | 'Other';
  rect: { x0: number; y0: number; x1: number; y1: number };
  actionUri?: string;
  isPrintable: boolean;
}

/**
 * Immutable Forensic Snapshot:
 * The single, immutable anchor of Source Truth for an assessment file.
 */
export interface ForensicSnapshot {
  snapshotId: string;
  sourceDocumentId: string;
  sourceSha256: string;

  acquisitionMetadata: {
    sourceUri: string;
    acquiredAt: number;
    fileSizeBytes: number;
    mimeType: string;
    contentHash: string;
  };

  sourceFormat: SourceDocumentFormat;

  adapterProvenance: {
    adapterId: string;
    adapterVersion: string;
    parserEngine: string;
    parserVersion: string;
    schemaVersion: string;
    processingConfigHash: string;
  };

  pageGeometries: ForensicPageGeometry[];
  sourceObjects: ForensicSourceObjectEntry[];
  contentStreams: ForensicContentStreamEntry[];
  fonts: ForensicFontDictionaryEntry[];
  glyphRuns: ForensicGlyphRunEntry[];
  rasterXObjects: ForensicRasterXObjectEntry[];
  vectorPaths: ForensicVectorPath[];
  clippingStates: ForensicClippingStateEntry[];
  annotations: ForensicAnnotationEntry[];
  coordinateSystems: CoordinateSpaceType[];
  sourceReferences?: SourceReference[];

  // Seal & Integrity
  isSealed: boolean;
  sealedHash: string; // SHA-256 of all physical evidence records
  sealedAt: number;
}
