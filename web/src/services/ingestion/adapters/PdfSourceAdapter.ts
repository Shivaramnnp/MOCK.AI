import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { ingestPdfDocument } from '../pdf/pdfIngestionEngine';
import { ingestPairedExamSources, PairedIngestionInput } from '../pairing/sourcePairingEngine';
import { createIngestionError } from '../../../types/ingestionErrors';

export interface PdfInput {
  file?: File;
  binaryData?: Uint8Array | ArrayBuffer;
  base64Data?: string;
  fileName?: string;
  byteSize?: number;
  userId?: string;

  // Source Pairing extensions:
  answerKeyFile?: File;
  answerKeyBinaryData?: Uint8Array | ArrayBuffer;
  answerKeyBase64Data?: string;
  answerKeyTextData?: string;
  answerKeyFileName?: string;
  isStandaloneAnswerKey?: boolean;
  continueWithoutAnswerKey?: boolean;
  examHint?: string;
  yearHint?: number;
  paperCodeHint?: string;
}

export class PdfSourceAdapter implements SourceAdapter<PdfInput> {
  readonly sourceType = 'PDF';

  async validateInput(input: PdfInput): Promise<{ valid: boolean; error?: string }> {
    if (!input) {
      return { valid: false, error: 'PDF input is required.' };
    }

    // Answer Key Only mode
    if (input.isStandaloneAnswerKey) {
      if (input.answerKeyFile && input.answerKeyFile.size === 0) {
        return { valid: false, error: 'Answer Key file is empty.' };
      }
      if (input.answerKeyTextData && input.answerKeyTextData.trim().length === 0) {
        return { valid: false, error: 'Answer Key text is empty.' };
      }
      return { valid: true };
    }

    if (input.file) {
      if (input.file.size === 0) {
        return { valid: false, error: 'PDF file is empty (0 bytes).' };
      }
      if (input.file.size > 100 * 1024 * 1024) {
        return { valid: false, error: 'PDF file exceeds the 100MB limit.' };
      }
      return { valid: true };
    }

    if (input.binaryData) {
      const len = input.binaryData instanceof ArrayBuffer ? input.binaryData.byteLength : input.binaryData.length;
      if (len === 0) {
        return { valid: false, error: 'PDF binary buffer is empty.' };
      }
      return { valid: true };
    }

    if (input.base64Data) {
      const clean = input.base64Data.includes(',') ? input.base64Data.split(',')[1] : input.base64Data;
      if (clean.length < 32) {
        return { valid: false, error: 'PDF payload is empty or invalid.' };
      }
      const approxBytes = Math.floor((clean.length * 3) / 4);
      if (approxBytes > 20 * 1024 * 1024) {
        return { valid: false, error: 'PDF file is larger than 20MB. Please use direct file upload.' };
      }
      return { valid: true };
    }

    return { valid: false, error: 'Please provide a valid PDF file or binary payload.' };
  }

  async process(input: PdfInput, options?: IngestionOptions): Promise<IngestionResult> {
    const fileName = input.fileName || input.file?.name || 'Uploaded Exam Document.pdf';

    // If paired Answer Key or explicit pairing options are provided:
    const hasAnswerKey = Boolean(
      input.answerKeyFile ||
        input.answerKeyBinaryData ||
        input.answerKeyBase64Data ||
        input.answerKeyTextData ||
        input.isStandaloneAnswerKey
    );

    if (hasAnswerKey) {
      const pairingInput: PairedIngestionInput = {
        questionPaper: input.isStandaloneAnswerKey
          ? undefined
          : {
              file: input.file,
              binaryData: input.binaryData,
              base64Data: input.base64Data,
              fileName,
            },
        answerKey: {
          file: input.answerKeyFile,
          binaryData: input.answerKeyBinaryData,
          base64Data: input.answerKeyBase64Data,
          textData: input.answerKeyTextData,
          fileName: input.answerKeyFileName || input.answerKeyFile?.name || 'AnswerKey.pdf',
        },
      };

      const { ingestionResult } = await ingestPairedExamSources(pairingInput, {
        examHint: input.examHint,
        yearHint: input.yearHint,
        paperCodeHint: input.paperCodeHint,
        skipDeduplication: options?.skipDeduplication,
        userId: input.userId,
        onProgress: options?.onProgress,
      });

      return ingestionResult;
    }

    // Standard Question Paper processing via existing pipeline
    let binaryData: Uint8Array | ArrayBuffer;

    if (input.binaryData) {
      binaryData = input.binaryData;
    } else if (input.file) {
      binaryData = await input.file.arrayBuffer();
    } else if (input.base64Data) {
      const clean = input.base64Data.includes(',') ? input.base64Data.split(',')[1] : input.base64Data;
      try {
        const binaryString = atob(clean);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        binaryData = bytes;
      } catch (err: any) {
        throw createIngestionError(
          'INVALID_FILE',
          'Failed to decode Base64 PDF data.',
          err.message || String(err),
          false,
          'BASE64_DECODE'
        );
      }
    } else {
      throw createIngestionError(
        'INVALID_FILE',
        'No readable PDF payload provided.',
        'Missing binaryData, file, or base64Data in PdfInput',
        false,
        'INPUT_RESOLUTION'
      );
    }

    try {
      const result = await ingestPdfDocument(binaryData, fileName, input.userId, {
        maxConcurrentPages: 4,
        skipDeduplication: options?.skipDeduplication ?? false,
      });

      return result;
    } catch (err: any) {
      if (err && err.code) {
        throw err;
      }
      throw createIngestionError(
        'EXTRACTION_FAILED',
        `PDF extraction failed on "${fileName}": ${err.message || 'Processing error'}`,
        err.stack || String(err),
        true,
        'PDF_INGESTION'
      );
    }
  }
}
