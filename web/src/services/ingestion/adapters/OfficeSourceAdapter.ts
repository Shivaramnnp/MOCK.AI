import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { aiProviderService } from '../../ai/aiProviderService';
import { parseCanonicalQuestionsJson } from '../../ai/adapters/adapterHelpers';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';
import { ingestOfficeDocument } from '../office/officeIngestionEngine';

export interface OfficeInput {
  arrayBuffer: ArrayBuffer;
  fileName: string;
  fileType?: string;
}

/**
 * Extracts slide text from PPTX files by unzipping the archive and parsing slide XML.
 */
export async function extractTextFromPptx(buffer: ArrayBuffer): Promise<string> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles: { name: string; num: number; file: any }[] = [];

    zip.forEach((relativePath, file) => {
      const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      if (match) {
        slideFiles.push({
          name: relativePath,
          num: parseInt(match[1], 10),
          file,
        });
      }
    });

    slideFiles.sort((a, b) => a.num - b.num);

    let fullText = '';
    for (const item of slideFiles) {
      const xml = await item.file.async('text');
      // Extract text content from <a:t> tags
      const textMatches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/gi);
      if (textMatches) {
        const slideText = textMatches
          .map((tag: string) => tag.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean)
          .join(' ');

        if (slideText) {
          fullText += `\n--- Slide ${item.num} ---\n${slideText}\n`;
        }
      }
    }

    return fullText.trim();
  } catch (err: any) {
    throw createIngestionError(
      'UNSUPPORTED_FORMAT',
      'Failed to parse PowerPoint (.pptx) file. Please ensure it is a valid PowerPoint presentation.',
      `PPTX unzipping failed: ${err.message}`,
      false,
      'PPTX_EXTRACTION'
    );
  }
}

/**
 * Extracts text from Word (.docx) files using mammoth.
 */
export async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return (result.value || '').trim();
  } catch (err: any) {
    throw createIngestionError(
      'UNSUPPORTED_FORMAT',
      'Failed to parse Word (.docx) file. Please ensure the document is not password-protected or corrupted.',
      `Mammoth parsing failed: ${err.message}`,
      false,
      'DOCX_EXTRACTION'
    );
  }
}

export class OfficeSourceAdapter implements SourceAdapter<OfficeInput> {
  readonly sourceType = 'Docx';

  async validateInput(input: OfficeInput): Promise<{ valid: boolean; error?: string }> {
    if (!input || !input.arrayBuffer) {
      return { valid: false, error: 'Document arrayBuffer is required.' };
    }
    if (input.arrayBuffer.byteLength < 100) {
      return { valid: false, error: 'Document file appears to be empty.' };
    }
    return { valid: true };
  }

  async process(input: OfficeInput, options?: IngestionOptions): Promise<IngestionResult> {
    const isPptx =
      input.fileName?.toLowerCase().endsWith('.pptx') ||
      input.fileType?.includes('presentation') ||
      input.fileType?.includes('powerpoint');

    // 1. First run deterministic OpenXML ingestion pipeline
    try {
      const deterministicResult = await ingestOfficeDocument(input.arrayBuffer, input.fileName, undefined, {
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

      // If document already contained explicit questions, return them directly
      if (deterministicResult.questions.length > 0) {
        return deterministicResult;
      }
    } catch (err: any) {
      // If deterministic parser threw non-fatal error, continue to fallback
      console.warn(`[OfficeSourceAdapter] Deterministic ingestion warning: ${err.message}`);
    }

    // 2. Fallback for lecture notes / study materials without explicit question numbering:
    let extractedText = '';
    if (isPptx) {
      extractedText = await extractTextFromPptx(input.arrayBuffer);
    } else {
      extractedText = await extractTextFromDocx(input.arrayBuffer);
    }

    if (!extractedText || extractedText.length < 50) {
      throw createIngestionError(
        'EXTRACTION_FAILED',
        `No readable text could be extracted from ${input.fileName}. The file may contain only embedded scanned images without OCR.`,
        `Extracted length was ${extractedText.length} chars`,
        false,
        'OFFICE_TEXT_LENGTH'
      );
    }

    const count = options?.requestedCount || 8;
    const textChunk = extractedText.length > 18000 ? extractedText.slice(0, 18000) : extractedText;

    const prompt = `
Source Material: ${isPptx ? 'PowerPoint Presentation' : 'Word Document'}
Document Name: "${input.fileName}"

Document Content:
"""
${textChunk}
"""

Task:
Construct exactly ${count} rigorous competitive examination questions based strictly on the factual principles, definitions, formulas, and concepts present in this document.
If formulas or math are present, format them strictly in LaTeX $...$.

Return ONLY a valid JSON object:
{
  "questions": [
    {
      "questionNumber": 1,
      "questionType": "MCQ",
      "questionText": "Question stem here...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "topic": "${input.fileName.replace(/\.[^/.]+$/, '')}",
      "explanation": "Detailed explanation...",
      "citation": {
        "sourceExactText": "Direct quote or section reference from document"
      }
    }
  ]
}
`;

    const active = aiProviderService.getActiveAdapter();
    if (!active) {
      throw createIngestionError(
        'AI_PROVIDER_ERROR',
        'No AI provider is configured. Please configure an AI Provider in Settings.',
        'Active adapter missing',
        false,
        'PROVIDER_SELECTION'
      );
    }

    const rawResponse = await active.adapter.generateQuestions(prompt, active.connection, { count });
    const questions = parseCanonicalQuestionsJson(JSON.stringify({ questions: rawResponse }), {
      sourceType: 'Docx',
      sourceFile: input.fileName,
    });

    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    questions.forEach((q, index) => {
      q.questionNumber = index + 1;
      const evalRes = evaluateQualityGate(q);
      evaluations.push(evalRes);

      q.verificationStatus = evalRes.status;
      q.verificationReasons = evalRes.reasons;
      q.confidence = evalRes.confidence;

      if (evalRes.status === 'VERIFIED') verifiedCount++;
      else if (evalRes.status === 'PARTIAL') partialCount++;
      else if (evalRes.status === 'REVIEW_REQUIRED') reviewCount++;
      else if (evalRes.status === 'FAILED') failedCount++;
    });

    return {
      success: questions.length > 0,
      sourceType: 'Docx',
      sourceTitle: `${input.fileName.replace(/\.[^/.]+$/, '')} - Exam`,
      questions,
      legacyQuestions: questions.map(toLegacyQuestion),
      qualityReport: {
        total: questions.length,
        verified: verifiedCount,
        partial: partialCount,
        reviewRequired: reviewCount,
        failed: failedCount,
        evaluations,
      },
    };
  }
}
