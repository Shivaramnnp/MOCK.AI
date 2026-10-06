/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Generalized Multi-Reference Source Provenance (SourceReference)
 *
 * Replaces simplistic single byte-offset pairs with composite, multi-reference provenance.
 * Allows derived semantic entities (stems, options, diagrams, formulas) to reference multiple
 * physical source objects, content streams, operators, font dictionaries, and coordinate matrices.
 */

import { CoordinateSpaceType } from './evidence';
import { AffineTransformMatrix } from './documentIR';

export type SourceReferenceObjectType =
  | 'GLYPH'
  | 'TEXT_SPAN'
  | 'VECTOR_PATH'
  | 'RASTER_IMAGE'
  | 'PAGE_TREE'
  | 'STREAM_OPERATOR'
  | 'FONT_DICTIONARY'
  | 'COLOR_SPACE'
  | 'CLIPPING_PATH'
  | 'ANNOTATION'
  | 'XML_ELEMENT'
  | 'RAW_BYTES';

export type SourceReferenceRole =
  | 'PRIMARY_SOURCE'
  | 'STIMULUS_BASE'
  | 'DIAGRAM_OVERLAY'
  | 'FONT_DICTIONARY'
  | 'BOUNDING_CLIP'
  | 'CONTEXT_SURROUND'
  | 'CALCULATED_HULL';

/**
 * Composite Source Reference:
 * Connects any derived semantic, visual, or mathematical entity to its immutable physical origin.
 */
export interface SourceReference {
  referenceId: string;
  documentId: string;
  pageId: string;
  pageNumber: number;
  objectId?: string; // Resource/XObject ID (e.g., 'Im1', 'FontF2')
  resourceId?: string; // PDF resource name or OpenXML rId
  streamId?: string; // Content stream index / object number (e.g., 'stream_14_0')
  operatorIdentifier?: string; // Draw operator index (e.g., 'op_1042_Do', 'op_312_Tj')
  byteRange?: { startByte: number; endByte: number }; // Stream or file byte range
  coordinateSpace: CoordinateSpaceType;
  transformMatrix: AffineTransformMatrix;
  clippingContextId?: string; // Active clipping path ID
  sourceObjectType: SourceReferenceObjectType;
  roleInDerivedObject: SourceReferenceRole;
  resolutionStatus?: 'EXACT_SOURCE_BYTE' | 'PARSER_INTERPOLATED' | 'UNRESOLVED';
}

/**
 * Helper to construct a standard SourceReference.
 */
export function createSourceReference(params: Omit<SourceReference, 'referenceId'>): SourceReference {
  const seed = `${params.documentId}:${params.pageNumber}:${params.objectId || 'none'}:${params.streamId || 'none'}:${params.operatorIdentifier || 'none'}:${params.sourceObjectType}`;
  return {
    referenceId: `ref_${Math.abs(hashString(seed)).toString(16)}`,
    ...params,
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
