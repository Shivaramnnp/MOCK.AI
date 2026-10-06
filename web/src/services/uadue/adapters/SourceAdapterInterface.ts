/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Source Adapter Interface
 *
 * Source adapters are PURE DECODERS.
 * They transform physical file formats into Universal DocumentIR.
 * They MUST NOT perform question boundary detection or answer key assignment.
 */

import { DocumentIR, SourceDocumentFormat } from '../contracts/documentIR';

export interface SourceValidationResult {
  valid: boolean;
  error?: string;
  detectedFormat?: SourceDocumentFormat;
  fileSizeBytes: number;
  warnings?: string[];
}

export interface AdapterExtractionOptions {
  maxPages?: number;
  extractImages?: boolean;
  ocrFallback?: boolean;
  onProgress?: (progress: { percent: number; stage: string; message: string }) => void;
}

export interface UadueSourceAdapter<TInput = unknown> {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly supportedFormats: SourceDocumentFormat[];
  readonly supportedMimeTypes: string[];

  validateInput(input: TInput): Promise<SourceValidationResult>;
  extractDocumentIR(input: TInput, options?: AdapterExtractionOptions): Promise<DocumentIR>;
}
