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

export type OfficeDocumentType = 'DOCX' | 'PPTX';

export type DocumentBlockType =
  | 'heading'
  | 'paragraph'
  | 'list_item'
  | 'table'
  | 'image'
  | 'equation'
  | 'chart'
  | 'shape'
  | 'speaker_notes'
  | 'callout';

export interface DocumentTableSpan {
  rowIndex: number;
  colIndex: number;
  colSpan?: number;
  rowSpan?: number;
}

export interface DocumentTable {
  headers?: string[];
  rows: string[][];
  numRows: number;
  numCols: number;
  spans?: DocumentTableSpan[];
  caption?: string;
}

export interface DocumentBlock {
  id: string;
  type: DocumentBlockType;
  text?: string;
  headingLevel?: number; // 1 to 6
  listType?: 'bullet' | 'numbered';
  listLevel?: number;
  table?: DocumentTable;
  assetId?: string;
  assetRef?: string;
  equationLatex?: string;
  coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  style?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    superscript?: boolean;
    subscript?: boolean;
    strike?: boolean;
  };
  hyperlink?: {
    url: string;
    text: string;
  };
  metadata?: Record<string, unknown>;
}

export interface DocumentUnit {
  unitNumber: number; // 1-indexed (Page 1..N or Slide 1..N)
  unitType: 'page' | 'slide';
  title?: string;
  speakerNotes?: string;
  blocks: DocumentBlock[];
}

export interface DocumentAsset {
  assetId: string;
  mimeType: string;
  dataUrl?: string;
  storagePath?: string;
  sha256: string;
  width?: number;
  height?: number;
  fileName: string;
  sourcePartPath: string; // e.g. 'word/media/image1.png'
  caption?: string;
  ownership?: 'question' | 'option_A' | 'option_B' | 'option_C' | 'option_D' | 'document_decoration';
}

export interface DocumentIR {
  metadata: {
    sourceType: OfficeDocumentType;
    fileName: string;
    fileSizeBytes: number;
    sha256: string;
    totalUnits: number;
    unitType: 'page' | 'slide';
    createdAt?: number;
    creator?: string;
    hasMacros?: boolean;
  };
  units: DocumentUnit[];
  embeddedAssets: DocumentAsset[];
}

export interface OfficeValidationResult {
  valid: boolean;
  error?: string;
  fileSizeBytes: number;
  detectedType?: OfficeDocumentType;
  hasMacros?: boolean;
  warnings?: string[];
}

export interface OfficeIngestionOptions {
  maxUnits?: number;
  skipDeduplication?: boolean;
  targetExamType?: 'GATE' | 'SSC' | 'GENERAL';
  onProgress?: (progress: OfficeJobProgress) => void;
}

export interface OfficeJobProgress {
  stage:
    | 'QUEUED'
    | 'VALIDATING'
    | 'UNPACKING'
    | 'PARSING_IR'
    | 'EXTRACTING_MEDIA'
    | 'SEGMENTING_QUESTIONS'
    | 'VERIFYING'
    | 'COMPLETED'
    | 'FAILED';
  percent: number;
  currentUnit?: number;
  totalUnits?: number;
  questionsFound?: number;
  message: string;
  error?: string;
}
