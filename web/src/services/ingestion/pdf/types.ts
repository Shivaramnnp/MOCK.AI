import {
  CanonicalQuestion,
  CanonicalContentBlock,
  QuestionType,
  VerificationStatus,
  CanonicalOption,
  CanonicalAnswer,
  CanonicalScoring,
  CanonicalProvenance,
  CanonicalAsset,
  CanonicalConfidence,
} from '../../../types/canonicalQuestion';

export type PdfPageClassification =
  | 'TEXT_NATIVE'
  | 'SCANNED_IMAGE'
  | 'MIXED'
  | 'IMAGE_HEAVY'
  | 'TABLE_HEAVY'
  | 'FORMULA_HEAVY';

export type PdfJobStage =
  | 'QUEUED'
  | 'VALIDATING'
  | 'EXTRACTING'
  | 'STRUCTURING'
  | 'VALIDATING_QUESTIONS'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'REVIEW_REQUIRED'
  | 'FAILED';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth?: number;
  pageHeight?: number;
}

export interface TextSpan {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  hasEOL: boolean;
  pageNumber: number;
}

export interface TextLine {
  y: number;
  height: number;
  fontSize: number;
  spans: TextSpan[];
  text: string;
  pageNumber: number;
  minX: number;
  maxX: number;
}

export type AssetOwnership =
  | 'QUESTION'
  | 'OPTION_A'
  | 'OPTION_B'
  | 'OPTION_C'
  | 'OPTION_D'
  | 'DOCUMENT_DECORATION'
  | 'WATERMARK'
  | 'HEADER'
  | 'FOOTER';

export interface ExtractedAsset {
  assetId: string;
  sourcePage: number;
  boundingBox: BoundingBox;
  mimeType: string;
  width: number;
  height: number;
  hash: string;
  ownership: AssetOwnership;
  contentType: 'image' | 'diagram' | 'chart' | 'graph' | 'table';
  dataUrl?: string;
  storagePath?: string;
  caption?: string;
}

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
  alignments?: ('left' | 'center' | 'right')[];
  boundingBox: BoundingBox;
  pageNumber: number;
  caption?: string;
}

export interface PageExtractionResult {
  pageNumber: number;
  classification: PdfPageClassification;
  viewport: { width: number; height: number };
  lines: TextLine[];
  rawText: string;
  assets: ExtractedAsset[];
  tables: ExtractedTable[];
  charCount: number;
  imageCount: number;
  hasFormulas: boolean;
}

export interface QuestionBoundary {
  questionNumber: number;
  startPage: number;
  endPage: number;
  startY: number;
  endY: number;
  rawStemLines: TextLine[];
  rawOptionLines: Map<string, TextLine[]>;
  associatedAssets: ExtractedAsset[];
  associatedTables: ExtractedTable[];
  sectionName?: string;
  marks?: number;
  negativeMarks?: number;
  confidence: number;
  questionType: QuestionType;
}

export interface PdfJobProgress {
  stage: PdfJobStage;
  percent: number;
  currentPage?: number;
  totalPages?: number;
  questionsFound?: number;
  message: string;
  error?: string;
}

export interface PdfDocumentProvenance {
  documentId: string;
  fileName: string;
  fileSizeBytes: number;
  contentHashSha256: string;
  pageCount: number;
  uploadedAt: number;
  storagePath?: string;
  storageBucket?: string;
  isDuplicate?: boolean;
  duplicateOfDocumentId?: string;
}

export interface PdfIngestionOptions {
  maxPages?: number;
  maxConcurrentPages?: number;
  enableAiFallback?: boolean;
  skipDeduplication?: boolean;
  targetExamType?: 'GATE' | 'SSC' | 'GENERAL';
  onProgress?: (progress: PdfJobProgress) => void;
}
