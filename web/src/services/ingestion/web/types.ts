/**
 * Web URL Ingestion Engine Types
 * Structured Document IR, Security Models, Semantic Chunks, and Ingestion Results.
 */

import { CanonicalQuestion } from '../../../types/canonicalQuestion';

export type WebFailureReason =
  | 'INVALID_URL'
  | 'SSRF_BLOCKED'
  | 'REDIRECT_SSRF_BLOCKED'
  | 'TOO_MANY_REDIRECTS'
  | 'INVALID_CONTENT_TYPE'
  | 'ACCESS_DENIED'
  | 'RATE_LIMITED'
  | 'SOURCE_UNAVAILABLE'
  | 'EMPTY_CONTENT'
  | 'AI_PROVIDER_ERROR';

export interface WebPageMetadata {
  url: string;
  canonicalUrl: string;
  title: string;
  description?: string;
  author?: string;
  siteName?: string;
  publishedDate?: string;
  retrievedAt: number;
  contentHash: string;
  contentLength: number;
  contentType?: string;
  httpStatus: number;
}

export type WebContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'image'
  | 'code'
  | 'quote';

export interface WebHeadingBlock {
  type: 'heading';
  level: number; // 1 to 6
  text: string;
  id?: string;
}

export interface WebParagraphBlock {
  type: 'paragraph';
  text: string;
}

export interface WebListBlock {
  type: 'list';
  ordered: boolean;
  items: string[];
}

export interface WebTableBlock {
  type: 'table';
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface WebImageBlock {
  type: 'image';
  src: string;
  alt: string;
  caption?: string;
}

export interface WebCodeBlock {
  type: 'code';
  language?: string;
  code: string;
}

export interface WebQuoteBlock {
  type: 'quote';
  text: string;
  cite?: string;
}

export type WebContentBlock =
  | WebHeadingBlock
  | WebParagraphBlock
  | WebListBlock
  | WebTableBlock
  | WebImageBlock
  | WebCodeBlock
  | WebQuoteBlock;

export interface WebSection {
  sectionId: string;
  heading: string;
  level: number;
  headingPath: string[]; // e.g. ["Machine Learning", "Supervised Learning", "Linear Regression"]
  blocks: WebContentBlock[];
  cleanText: string;
  wordCount: number;
}

export interface WebDocumentIR {
  metadata: WebPageMetadata;
  sections: WebSection[];
  fullCleanText: string;
  wordCount: number;
  tableCount: number;
  listCount: number;
  imageCount: number;
}

export interface WebSemanticChunk {
  chunkIndex: number;
  sectionTitle: string;
  headingPath: string[];
  blocks: WebContentBlock[];
  text: string;
  wordCount: number;
  tokenCountApprox: number;
  tables: WebTableBlock[];
  lists: WebListBlock[];
}

export interface WebValidationResult {
  verified: boolean;
  confidence: number; // 0.0 - 1.0
  reasons: string[];
  matchedExcerpt?: string;
}

export interface WebIngestionOptions {
  requestedCount?: number;
  chunkMaxWords?: number; // Default 1,000 words
  timeoutMs?: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'COMPETITIVE';
  mockFetchResponse?: {
    status: number;
    contentType?: string;
    html: string;
    headers?: Record<string, string>;
  };
  mockAiGenerator?: (prompt: string, count: number) => Promise<CanonicalQuestion[]>;
  onProgress?: (progress: WebProgress) => void;
}

export interface WebProgress {
  stage:
    | 'VALIDATING_URL'
    | 'FETCHING_CONTENT'
    | 'PARSING_DOM'
    | 'EXTRACTING_SECTIONS'
    | 'CHUNKING'
    | 'GENERATING_QUESTIONS'
    | 'VALIDATING_QUESTIONS'
    | 'DEDUPLICATING'
    | 'COMPLETE';
  message: string;
  percentage: number;
}

export interface WebIngestionResult {
  success: boolean;
  url: string;
  title: string;
  metadata: WebPageMetadata;
  documentIR?: WebDocumentIR;
  chunks: WebSemanticChunk[];
  questions: CanonicalQuestion[];
  groundingFidelityScore: number;
  latencyMs: number;
  cached: boolean;
  error?: {
    code: WebFailureReason;
    message: string;
    details?: string;
  };
}
