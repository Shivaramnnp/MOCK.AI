/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Universal Document IR (Intermediate Representation)
 *
 * Serves as the strictly decoupled interface between file decoders and cognitive assessment parsers.
 * Preserves exact forensic evidence: native PDF glyphs, physical geometries, affine transformations,
 * vector paths, embedded raster XObjects, tabular cell lattices, and mathematical equations.
 */

import { BoundingBox2D } from './evidence';

export type SourceDocumentFormat =
  | 'PDF_NATIVE'
  | 'PDF_SCANNED'
  | 'DOCX'
  | 'PPTX'
  | 'HTML'
  | 'IMAGE_SINGLE'
  | 'IMAGE_BATCH'
  | 'QTI_XML'
  | 'JSON_STRUCTURED'
  | 'AUDIO_TRANSCRIPT'
  | 'VIDEO_TRANSCRIPT';

export type DocumentIRElementType =
  | 'TEXT_LINE'
  | 'GLYPH_RUN'
  | 'IMAGE_BITMAP'
  | 'VECTOR_GRAPHIC'
  | 'TABLE_STRUCTURE'
  | 'EQUATION_CONTAINER'
  | 'WHITE_SPACE'
  | 'DECORATIVE_LINE';

/**
 * Physical coordinate space with explicit bounding boxes and affine transformations.
 */
export interface AffineTransformMatrix {
  a: number; // sx: horizontal scaling
  b: number; // shy: vertical shearing
  c: number; // shx: horizontal shearing
  d: number; // sy: vertical scaling
  e: number; // tx: horizontal translation
  f: number; // ty: vertical translation
}

export interface PhysicalGeometry {
  bbox: BoundingBox2D;
  polygon?: [number, number][]; // Exact hull for slanted, rotated, or curved glyphs/tables
  rotationDeg: 0 | 90 | 180 | 270;
  transformMatrix: AffineTransformMatrix;
  clippingBox?: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Atomic Glyph Evidence: Preserves exact character encoding, font dictionary, and advance width.
 */
export interface ForensicGlyph {
  glyphId: string;
  char: string;
  unicodeHex: string;
  fontName: string;
  fontFamily: string;
  fontSizePt: number;
  weight: number; // 100 - 900
  isItalic: boolean;
  colorRgba: [number, number, number, number];
  charSpacingPt: number;
  wordSpacingPt: number;
  geometry: PhysicalGeometry;
  sourceStreamOffset: number; // Byte index in raw PDF content stream
  renderMode: number; // PDF text rendering mode (fill, stroke, invisible/clip)
}

/**
 * Text Span: Contiguous run of glyphs sharing uniform font, transformation, and baseline.
 */
export interface ForensicTextSpan {
  spanId: string;
  rawText: string;
  normalizedText: string;
  geometry: PhysicalGeometry;
  fontName: string;
  fontSizePt: number;
  isBold: boolean;
  isItalic: boolean;
  isSubscript: boolean;
  isSuperscript: boolean;
  colorRgba: [number, number, number, number];
  glyphs?: ForensicGlyph[];
  readingOrderIndex: number;
}

/**
 * Vector Path Object: Preserves lines, curves, borders, arrows, and geometric diagrams.
 */
export interface ForensicVectorPath {
  pathId: string;
  operations: { op: 'M' | 'L' | 'C' | 'Z'; args: number[] }[];
  fillRgba?: [number, number, number, number];
  strokeRgba?: [number, number, number, number];
  lineWidthPt: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  dashPattern?: number[];
  geometry: PhysicalGeometry;
  isDecorative: boolean; // True for horizontal dividers, column rules, border boxes
}

/**
 * Embedded Raster / XObject Image: Preserves raw binary stream hash and display geometry.
 */
export interface ForensicRasterImage {
  rasterId: string;
  xObjectId?: string; // Original PDF resource name (e.g., 'Im1', 'X12')
  sourceByteHash: string; // SHA-256 of raw underlying image bytes
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/jp2';
  intrinsicWidthPx: number;
  intrinsicHeightPx: number;
  geometry: PhysicalGeometry;
  colorSpace: 'DeviceRGB' | 'DeviceGray' | 'DeviceCMYK' | 'Indexed';
  bitsPerComponent: number;
  isMask: boolean;
  drawingOrderIndex: number; // Position in page rendering command sequence
}

/**
 * Tabular Structure: Mathematical cell lattice with colspans and nested boundaries.
 */
export interface ForensicTableStructure {
  tableId: string;
  rowCount: number;
  colCount: number;
  geometry: PhysicalGeometry;
  hasOuterBorders: boolean;
  hasInnerGrid: boolean;
  cells: {
    cellId: string;
    rowIndex: number;
    colIndex: number;
    rowSpan: number;
    colSpan: number;
    geometry: PhysicalGeometry;
    rawText: string;
    containedSpanIds: string[];
  }[];
}

/**
 * Mathematical Equation Container: Explicit AST / TeX / MathML candidates linked to vector/glyph evidence.
 */
export interface ForensicEquationContainer {
  equationId: string;
  geometry: PhysicalGeometry;
  rawLatexCandidate: string;
  mathmlCandidate?: string;
  isDisplayMode: boolean; // Display ($$...$$) vs Inline ($...$)
  astTree?: Record<string, unknown>;
  containedGlyphIds: string[];
  sourceMethod: 'OMML' | 'GLYPH_SYNTHESIS' | 'VISION_MATH_OCR';
  confidence: number;
}

export interface DocumentIRTextStyle {
  fontFamily?: string;
  fontSizePt?: number;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isSuperscript?: boolean;
  isSubscript?: boolean;
  colorHex?: string;
}

export interface DocumentIRTableCell {
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  bbox: BoundingBox2D;
  rawText: string;
  elements: DocumentIRElement[];
}

export interface DocumentIRTableData {
  rowCount: number;
  colCount: number;
  headers?: string[];
  cells: DocumentIRTableCell[];
  caption?: string;
  hasBorders: boolean;
}

export interface DocumentIRMediaAsset {
  assetId: string;
  mimeType: string;
  sha256: string;
  widthPx: number;
  heightPx: number;
  originalFileName?: string;
  storagePath?: string;
  publicUrl?: string;
  dataUrl?: string;
  caption?: string;
}

export interface DocumentIRElement {
  elementId: string;
  pageNumber: number;
  type: DocumentIRElementType;
  bbox: BoundingBox2D;
  geometry?: PhysicalGeometry;
  polygon?: [number, number][];
  rawContent?: string;
  confidence: number; // 0.0 - 1.0
  style?: DocumentIRTextStyle;
  tableData?: DocumentIRTableData;
  mediaRefId?: string;
  readingOrderIndex: number;
  drawingOrderIndex?: number;
  sourceStreamOffset?: number;
  vectorData?: ForensicVectorPath;
  imageData?: ForensicRasterImage;
  equationData?: ForensicEquationContainer;
  glyphData?: ForensicGlyph[];
  metadata?: Record<string, unknown>;
}

export interface DocumentIRPage {
  pageNumber: number; // 1-indexed
  dimensions: {
    width: number;
    height: number;
    unit: 'pt' | 'px' | 'mm';
  };
  elements: DocumentIRElement[];
  readingOrder: string[]; // Ordered list of elementIds
  pageHash: string; // SHA-256 of visual page representation
  mediaBox?: { x0: number; y0: number; x1: number; y1: number };
  cropBox?: { x0: number; y0: number; x1: number; y1: number };
  rotationDeg?: 0 | 90 | 180 | 270;
}

export interface DocumentIR {
  documentId: string;
  sourceHash: string; // SHA-256 of entire source binary
  sourceFormat: SourceDocumentFormat;
  sourceFileName: string;
  fileSizeBytes: number;
  totalPages: number;
  pages: DocumentIRPage[];
  embeddedMedia: DocumentIRMediaAsset[];
  metadata: Record<string, unknown>;
  createdAt: number;
}
