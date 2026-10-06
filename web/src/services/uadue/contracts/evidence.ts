/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Source Evidence Model & Unbroken Evidence Chain
 *
 * Guarantees immutable provenance back to physical coordinates, stream byte offsets,
 * and cryptographic hashes. Never discards source truth.
 */

import { SourceReference } from './sourceReference';

export type ExtractionMethod =
  | 'NATIVE_VECTOR_STREAM'
  | 'TESSERACT_OCR'
  | 'VISION_OCR'
  | 'OMML_XML'
  | 'MANUAL_AUTHORING'
  | 'STRUCTURED_IMPORT';

export type CoordinateSpaceType =
  | 'PDF_PT_BOTTOM_LEFT'
  | 'VIEWPORT_PT_TOP_LEFT'
  | 'RASTER_PIXEL'
  | 'SCAN_NORMALIZED_1000';

export interface BoundingBox2D {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
  pageWidth?: number;
  pageHeight?: number;
  unit: 'pt' | 'px' | 'mm';
}

/**
 * Hardened Unbroken 7-Stage Evidence Chain:
 * Traces every semantic assertion from raw binary bytes through physical slices to canonical AST.
 */
export interface SourceEvidenceChain {
  evidenceId: string;
  sourceDocumentHash: string; // SHA-256 of immutable source binary
  sourceDocumentUri: string; // Storage path or immutable acquisition URI
  pageIndex: number; // 0-indexed physical page
  pageNumber: number; // 1-indexed document display page
  coordinateSpace: CoordinateSpaceType;

  // Physical Coordinate Hull
  bbox: BoundingBox2D;
  polygon?: [number, number][]; // Multi-point hull for irregular/slanted boundaries
  clippingHull?: [number, number][];

  // Generalized Multi-Reference Provenance
  sourceReferences: SourceReference[];

  // Legacy Stream Offset Provenance (Backwards-compatible)
  sourceStreamOffsets?: { startOffset: number; endOffset: number };
  sourceObjectIds?: string[]; // e.g. ['page_14', 'font_f3', 'xobject_im12']

  // Visual Verification Evidence
  losslessRasterCropHash: string; // SHA-256 of PNG raster crop
  losslessRasterCropStoragePath?: string;

  // Textual Provenance
  rawTextStream: string; // Exact bytes before normalization or punctuation stripping
  decodedUnicodeStream: string; // Raw text after font CMap decoding

  // Extraction Metadata
  extractorEngine: 'PYMUPDF_NATIVE' | 'PDFJS_FORENSIC' | 'OPENXML_PARSER' | 'VISION_TRANSFORMER' | string;
  extractorVersion: string;
  extractionConfidence: number; // 0.0 - 1.0
  transformHistory: { transformType: string; appliedAt: number; parameters: Record<string, unknown> }[];

  // Chain Links
  parentEvidenceId?: string;
  derivedEvidenceIds: string[];
}

export interface SourceEvidence {
  evidenceId: string;
  sourceId: string;
  pageNumber: number; // 1-indexed
  bbox: BoundingBox2D;
  polygon?: [number, number][]; // Optional non-rectangular polygon coordinates
  contentHash: string; // SHA-256 of visual crop or exact byte slice
  rasterCropUrl?: string; // High-resolution lossless image snippet
  rawTextStream: string; // Original extracted text before any normalization
  extractionMethod: ExtractionMethod;
  detectorConfidence: number; // 0.0 - 1.0
  timestamp: number; // Unix epoch ms
  coordinateSpace?: CoordinateSpaceType;
  sourceStreamOffsets?: { startOffset: number; endOffset: number };
  sourceObjectIds?: string[];
  sourceReferences?: SourceReference[];
  evidenceChain?: SourceEvidenceChain;
  metadata?: Record<string, unknown>;
}
