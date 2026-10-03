import { SourceAdapter, IngestionOptions, IngestionResult } from '../adapters/SourceAdapter';
import { InputSourceType } from '../../../types';
import { ingestOfficeDocument } from './officeIngestionEngine';
import { validateOfficeBinary } from './officeSecurity';
import { OfficeDocumentType } from './types';

export interface DocumentInput {
  file?: File;
  arrayBuffer?: ArrayBuffer;
  binaryData?: Uint8Array | ArrayBuffer;
  fileName?: string;
  fileType?: string;
  userId?: string;
}

/**
 * Base Document Source Adapter implementing common validation and processing
 * for Office documents (DOCX and PPTX).
 */
export abstract class DocumentSourceAdapter implements SourceAdapter<DocumentInput> {
  readonly sourceType: InputSourceType = 'Docx';
  abstract readonly expectedType: OfficeDocumentType;

  async validateInput(input: DocumentInput): Promise<{ valid: boolean; error?: string }> {
    if (!input) {
      return { valid: false, error: 'Document input is required.' };
    }

    const buffer = input.arrayBuffer || (input.binaryData instanceof ArrayBuffer ? input.binaryData : input.binaryData?.buffer);
    if (!buffer && !input.file) {
      return { valid: false, error: 'Document arrayBuffer or file is required.' };
    }

    const byteLen = input.file ? input.file.size : buffer?.byteLength || 0;
    if (byteLen < 30) {
      return { valid: false, error: 'Document file appears to be empty.' };
    }

    // Binary check
    if (buffer) {
      const validation = await validateOfficeBinary(buffer, input.fileName || 'document');
      if (!validation.valid) {
        return { valid: false, error: validation.error };
      }
      if (validation.detectedType && validation.detectedType !== this.expectedType) {
        return {
          valid: false,
          error: `Expected ${this.expectedType} document, but detected ${validation.detectedType}.`,
        };
      }
    }

    return { valid: true };
  }

  async process(input: DocumentInput, options?: IngestionOptions): Promise<IngestionResult> {
    const fileName = input.fileName || input.file?.name || `Document.${this.expectedType.toLowerCase()}`;
    let data: Uint8Array | ArrayBuffer;

    if (input.file) {
      data = await input.file.arrayBuffer();
    } else if (input.arrayBuffer) {
      data = input.arrayBuffer;
    } else if (input.binaryData) {
      data = input.binaryData;
    } else {
      throw new Error('No binary document data provided.');
    }

    return ingestOfficeDocument(data, fileName, input.userId, {
      skipDeduplication: options?.skipDeduplication,
      targetExamType: options?.targetExamType || 'GATE',
      onProgress: options?.onProgress
        ? (p) => {
            options.onProgress?.({
              stage: p.stage as any,
              percent: p.percent,
              message: p.message,
              questionsFound: p.questionsFound,
            });
          }
        : undefined,
    });
  }
}

/**
 * Specialized Word DOCX Document Adapter.
 */
export class DocxAdapter extends DocumentSourceAdapter {
  readonly sourceType = 'Docx';
  readonly expectedType: OfficeDocumentType = 'DOCX';
}

/**
 * Specialized PowerPoint PPTX Document Adapter.
 */
export class PptxAdapter extends DocumentSourceAdapter {
  readonly sourceType = 'Docx';
  readonly expectedType: OfficeDocumentType = 'PPTX';
}
