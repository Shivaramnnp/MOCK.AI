import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import { IngestionResult } from '../adapters/SourceAdapter';
import { toLegacyQuestion } from '../questionMigrator';
import { createIngestionError } from '../../../types/ingestionErrors';
import { ingestPdfDocument } from '../pdf/pdfIngestionEngine';
import { validatePdfBinary } from '../pdf/pdfValidator';
import { computePdfHash } from '../pdf/pdfHasher';
import { extractPageLayout } from '../pdf/layoutExtractor';
import { evaluateQualityGate } from '../qualityGate';

import {
  ExamSource,
  PaperIdentity,
  RawAnswerEntry,
  PairingIngestionReport,
  PairingOptions,
} from './types';
import { resolvePaperIdentity, validateSourceIdentityCompatibility } from './paperIdentityResolver';
import { extractAnswerKeyFromLines } from './answerKeyExtractor';
import { matchQuestionsWithAnswerKey } from './deterministicMatcher';

/**
 * Dynamically loads pdfjs-dist
 */
async function loadPdfjs(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
    return (window as any).pdfjsLib;
  }
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return pdfjs;
  } catch (err: any) {
    throw createIngestionError(
      'EXTRACTION_FAILED',
      'PDF engine library (pdfjs-dist) could not be loaded.',
      err.message || String(err),
      false,
      'PDFJS_IMPORT'
    );
  }
}

/**
 * Converts generic input (File, Blob, ArrayBuffer, Uint8Array, base64) into Uint8Array
 */
export async function toUint8Array(
  input: File | Blob | ArrayBuffer | Uint8Array | string
): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (input instanceof Blob) {
    const ab = await input.arrayBuffer();
    return new Uint8Array(ab);
  }
  if (typeof input === 'string') {
    const clean = input.includes(',') ? input.split(',')[1] : input;
    const binaryStr = atob(clean);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error('Unsupported input type for binary conversion.');
}

/**
 * Extracts plain text lines from an Answer Key PDF
 */
export async function extractLinesFromPdf(binaryData: Uint8Array): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    data: binaryData,
    standardFontDataUrl: undefined,
  });

  const doc = await loadingTask.promise;
  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const layout = extractPageLayout(textContent.items, pageNum, viewport);

    for (const line of layout.lines) {
      if (line.text && line.text.trim().length > 0) {
        lines.push(line.text.trim());
      }
    }
  }

  return lines;
}

export interface PairedIngestionInput {
  questionPaper?: {
    file?: File;
    binaryData?: Uint8Array | ArrayBuffer;
    base64Data?: string;
    textData?: string;
    fileName?: string;
  };
  answerKey?: {
    file?: File;
    binaryData?: Uint8Array | ArrayBuffer;
    base64Data?: string;
    textData?: string;
    fileName?: string;
  };
}

/**
 * Master Source Pairing Engine.
 * Implements the full 20-step production architecture:
 * 1. Independent Question Paper & Answer Key ingest
 * 2. Identity resolution (Exam, Year, Paper Code, Session)
 * 3. Incompatibility detection (SOURCE_MISMATCH)
 * 4. Full question extraction via existing PDF Engine
 * 5. Answer key extraction & normalization (MCQ, MSQ, NAT, MTA)
 * 6. Deterministic-first matching (Q#, sections, types)
 * 7. Negative-marking and marks calculation
 * 8. Comprehensive pairing report & review states
 */
export async function ingestPairedExamSources(
  input: PairedIngestionInput,
  options?: PairingOptions
): Promise<{
  report: PairingIngestionReport;
  ingestionResult: IngestionResult;
}> {
  const qpInput = input.questionPaper;
  const akInput = input.answerKey;

  if (!qpInput && !akInput) {
    throw createIngestionError(
      'INVALID_FILE',
      'Please provide at least a Question Paper or an Answer Key.',
      'Missing both questionPaper and answerKey in PairedIngestionInput',
      false,
      'INPUT_VALIDATION'
    );
  }

  // --- CASE 1: ANSWER_KEY_ONLY MODE ---
  if (!qpInput && akInput) {
    options?.onProgress?.({ stage: 'ANSWER_KEY_INGESTION', percent: 20, message: 'Processing Answer Key...' });
    let akLines: string[] = [];
    let akHash = '';
    const akFileName = akInput.fileName || akInput.file?.name || 'AnswerKey.pdf';

    if (akInput.textData) {
      akLines = akInput.textData.split(/\r?\n/);
      akHash = 'text_' + Date.now();
    } else {
      const akBytes = await toUint8Array(akInput.file || akInput.binaryData || akInput.base64Data!);
      akHash = await computePdfHash(akBytes);
      akLines = await extractLinesFromPdf(akBytes);
    }

    const akIdentity = resolvePaperIdentity(akLines, akFileName, {
      exam: options?.examHint,
      year: options?.yearHint,
      paperCode: options?.paperCodeHint,
    });

    const answerEntries = extractAnswerKeyFromLines(akLines);

    const report: PairingIngestionReport = {
      success: true,
      isStandalone: true,
      mode: 'ANSWER_KEY_ONLY',
      answerKeySummary: {
        fileName: akFileName,
        fileHash: akHash,
        pages: 1,
        keysDetected: answerEntries.length,
        detectedIdentity: akIdentity,
      },
      identityMatched: true,
      matchedCount: 0,
      missingQuestionsCount: answerEntries.length,
      missingKeysCount: 0,
      duplicateQuestionsCount: 0,
      duplicateKeysCount: 0,
      typeConflictsCount: 0,
      sourceConflictsCount: 0,
      reviewRequiredCount: 0,
      verifiedCount: 0,
      unverifiedCount: 0,
      failedCount: 0,
      matches: answerEntries.map((a) => ({
        questionNumber: a.questionNumber,
        matchStatus: 'ANSWER_KEY_ONLY',
        matchConfidence: 0.5,
        matchReason: 'Answer key uploaded without Question Paper. Stored awaiting Question Paper pairing.',
        questionType: a.detectedType || 'MCQ',
        answerKeyEntry: a,
        issues: ['Question paper pending'],
      })),
      canonicalQuestions: [],
      warnings: ['Answer Key uploaded first. System is awaiting Question Paper to complete pairing.'],
      errors: [],
    };

    return {
      report,
      ingestionResult: {
        success: true,
        sourceType: 'PDF',
        sourceTitle: akFileName,
        questions: [],
        legacyQuestions: [],
        qualityReport: {
          total: 0,
          verified: 0,
          partial: 0,
          reviewRequired: 0,
          failed: 0,
          evaluations: [],
        },
        warnings: report.warnings,
      },
    };
  }

  // --- CASE 2 & 3: QUESTION PAPER (PAIRED OR QUESTION_PAPER_ONLY) ---
  const qpFileName = qpInput!.fileName || qpInput!.file?.name || (qpInput!.textData ? 'QuestionPaper.txt' : 'QuestionPaper.pdf');
  let qpLines: string[] = [];
  let qpHash = '';
  let qpBytes: Uint8Array | undefined;

  if (qpInput!.textData) {
    qpLines = qpInput!.textData.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    qpHash = `hash_${qpLines.length}`;
  } else {
    qpBytes = await toUint8Array(qpInput!.file || qpInput!.binaryData || qpInput!.base64Data!);

    options?.onProgress?.({ stage: 'VALIDATING', percent: 10, message: 'Validating Question Paper...' });
    const qpValidation = validatePdfBinary(qpBytes, qpFileName);
    if (!qpValidation.valid) {
      throw createIngestionError(
        'INVALID_FILE',
        qpValidation.error || 'Question Paper is not a valid PDF.',
        `Validation failed: ${qpValidation.error}`,
        false,
        'QP_VALIDATION'
      );
    }

    qpHash = await computePdfHash(qpBytes);

    // 1. Resolve Question Paper identity from text
    options?.onProgress?.({ stage: 'RESOLVING_IDENTITY', percent: 20, message: 'Resolving Question Paper Identity...' });
    qpLines = await extractLinesFromPdf(qpBytes);
  }

  const qpIdentity = resolvePaperIdentity(qpLines, qpFileName, {
    exam: options?.examHint,
    year: options?.yearHint,
    paperCode: options?.paperCodeHint,
  });

  // 2. Parse Answer Key if provided
  let answerEntries: RawAnswerEntry[] = [];
  let akIdentity: PaperIdentity | undefined;
  let akHash = '';
  let akFileName = '';
  let isStandaloneQp = true;

  if (akInput && (akInput.file || akInput.binaryData || akInput.base64Data || akInput.textData)) {
    isStandaloneQp = false;
    akFileName = akInput.fileName || akInput.file?.name || 'AnswerKey.pdf';
    let akLines: string[] = [];

    if (akInput.textData) {
      akLines = akInput.textData.split(/\r?\n/);
      akHash = 'text_' + Date.now();
    } else {
      const akBytes = await toUint8Array(akInput.file || akInput.binaryData || akInput.base64Data!);
      akHash = await computePdfHash(akBytes);
      akLines = await extractLinesFromPdf(akBytes);
    }

    akIdentity = resolvePaperIdentity(akLines, akFileName, {
      exam: options?.examHint,
      year: options?.yearHint,
      paperCode: options?.paperCodeHint,
    });

    answerEntries = extractAnswerKeyFromLines(akLines);

    // 3. Check Source Identity Compatibility (Section 4)
    const compatibility = validateSourceIdentityCompatibility(qpIdentity, akIdentity);
    if (!compatibility.isCompatible) {
      // Abort automatic matching to prevent cross-contamination
      const mismatchReason = compatibility.mismatchReason || 'Source identity mismatch.';
      const report: PairingIngestionReport = {
        success: false,
        isStandalone: false,
        mode: 'PAIRED',
        questionPaperSummary: {
          fileName: qpFileName,
          fileHash: qpHash,
          pages: 1,
          questionsDetected: 0,
          detectedIdentity: qpIdentity,
        },
        answerKeySummary: {
          fileName: akFileName,
          fileHash: akHash,
          pages: 1,
          keysDetected: answerEntries.length,
          detectedIdentity: akIdentity,
        },
        identityMatched: false,
        identityMismatchReason: mismatchReason,
        matchedCount: 0,
        missingQuestionsCount: 0,
        missingKeysCount: answerEntries.length,
        duplicateQuestionsCount: 0,
        duplicateKeysCount: 0,
        typeConflictsCount: 0,
        sourceConflictsCount: 1,
        reviewRequiredCount: answerEntries.length,
        verifiedCount: 0,
        unverifiedCount: 0,
        failedCount: 1,
        matches: [],
        canonicalQuestions: [],
        warnings: [mismatchReason],
        errors: [`SOURCE_MISMATCH: ${mismatchReason}`],
      };

      throw createIngestionError(
        'EXTRACTION_FAILED',
        mismatchReason,
        'Question paper and answer key belong to different disciplines or sessions.',
        false,
        'IDENTITY_MISMATCH'
      );
    }
  }

  // 4. Ingest Question Paper using existing PDF engine (or text line segmentation)
  options?.onProgress?.({ stage: 'EXTRACTING_QUESTIONS', percent: 40, message: 'Extracting Question Paper structure and math...' });
  let canonicalQuestions: CanonicalQuestion[] = [];
  let qpResult: any = null;

  if (qpInput!.textData) {
    let curQ: Partial<CanonicalQuestion> | null = null;
    let qIndex = 0;

    for (const line of qpLines) {
      const qMatch = line.match(/^(?:Q(?:uestion)?\.?\s*(\d+)|\((\d+)\)|(\d+)\.)\s*(.*)/i);
      if (qMatch) {
        if (curQ && curQ.questionNumber) {
          canonicalQuestions.push(curQ as CanonicalQuestion);
        }
        qIndex++;
        const qNum = parseInt(qMatch[1] || qMatch[2] || qMatch[3] || String(qIndex), 10);
        curQ = {
          questionId: `qp_text_q_${qNum}`,
          sourceId: qpHash,
          sourceType: 'PDF',
          questionNumber: qNum,
          questionText: qMatch[4] || `Question ${qNum}`,
          contentBlocks: [{ type: 'text', content: qMatch[4] || `Question ${qNum}` }],
          questionType: 'MCQ',
          options: [],
          answer: { questionType: 'MCQ' },
          scoring: { marks: 1, negativeMarks: 0.33 },
          provenance: { sourceType: 'PDF', sourceFile: qpFileName, sourcePage: 1 },
          assets: [],
          explanation: '',
          verificationStatus: 'UNVERIFIED',
          verificationReasons: [],
          confidence: { extraction: 1, structure: 1, answer: 0.5, asset: 1 },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        continue;
      }

      const optMatch = line.match(/^[\(\[]?([A-D])[\)\]\.\:]\s*(.*)/i);
      if (optMatch && curQ) {
        const optLetter = optMatch[1].toUpperCase();
        const optText = optMatch[2] || `Option ${optLetter}`;
        if (!curQ.options) curQ.options = [];
        curQ.options.push({
          id: optLetter,
          text: optText,
          isCorrect: false,
          contentBlocks: [{ type: 'text', content: optText }],
        });
        continue;
      }

      if (curQ && !line.match(/^(?:Official|Answer Key|Time Allowed)/i)) {
        curQ.questionText = (curQ.questionText ? curQ.questionText + ' ' : '') + line;
      }
    }

    if (curQ && curQ.questionNumber) {
      canonicalQuestions.push(curQ as CanonicalQuestion);
    }
  } else if (qpBytes) {
    qpResult = await ingestPdfDocument(qpBytes, qpFileName, options?.userId, {
      skipDeduplication: options?.skipDeduplication,
      maxConcurrentPages: 4,
    });
    canonicalQuestions = qpResult.questions;
  }

  // 5. Run Deterministic Matching
  options?.onProgress?.({ stage: 'MATCHING', percent: 75, message: 'Deterministically matching questions with answer key...' });
  const matchingResult = matchQuestionsWithAnswerKey(canonicalQuestions, answerEntries, {
    isStandaloneQp,
  });

  // Calculate stats
  const verifiedCount = canonicalQuestions.filter((q) => q.verificationStatus === 'VERIFIED').length;
  const unverifiedCount = canonicalQuestions.filter((q) => q.verificationStatus === 'UNVERIFIED').length;
  const reviewRequiredCount = canonicalQuestions.filter((q) => q.verificationStatus === 'REVIEW_REQUIRED').length;
  const failedCount = canonicalQuestions.filter((q) => q.verificationStatus === 'FAILED').length;

  const warnings: string[] = [];
  if (isStandaloneQp) {
    warnings.push(
      'Question paper ingested without answer key. Questions are marked UNVERIFIED with answer verification pending.'
    );
  }
  if (matchingResult.missingKeysCount > 0) {
    warnings.push(`${matchingResult.missingKeysCount} question(s) lack official answer keys.`);
  }
  if (matchingResult.sourceConflictsCount > 0) {
    warnings.push(`${matchingResult.sourceConflictsCount} source conflict(s) detected.`);
  }

  const report: PairingIngestionReport = {
    success: true,
    isStandalone: isStandaloneQp,
    mode: isStandaloneQp ? 'QUESTION_PAPER_ONLY' : 'PAIRED',
    questionPaperSummary: {
      fileName: qpFileName,
      fileHash: qpHash,
      pages: canonicalQuestions.length > 0 ? (canonicalQuestions[canonicalQuestions.length - 1].provenance.sourcePage || 1) : 1,
      questionsDetected: canonicalQuestions.length,
      detectedIdentity: qpIdentity,
    },
    answerKeySummary: !isStandaloneQp
      ? {
          fileName: akFileName,
          fileHash: akHash,
          pages: 1,
          keysDetected: answerEntries.length,
          detectedIdentity: akIdentity,
        }
      : undefined,
    identityMatched: !isStandaloneQp,
    matchedCount: matchingResult.matchedCount,
    missingQuestionsCount: matchingResult.missingQuestionsCount,
    missingKeysCount: matchingResult.missingKeysCount,
    duplicateQuestionsCount: matchingResult.duplicateQuestionsCount,
    duplicateKeysCount: matchingResult.duplicateKeysCount,
    typeConflictsCount: matchingResult.typeConflictsCount,
    sourceConflictsCount: matchingResult.sourceConflictsCount,
    reviewRequiredCount,
    verifiedCount,
    unverifiedCount,
    failedCount,
    matches: matchingResult.matches,
    canonicalQuestions,
    warnings,
    errors: [],
  };

  const legacyQuestions = canonicalQuestions.map((q) => toLegacyQuestion(q));

  const finalIngestionResult: IngestionResult = {
    success: true,
    sourceType: 'PDF',
    sourceTitle: qpFileName.replace(/\.[^/.]+$/, ''),
    questions: canonicalQuestions,
    legacyQuestions,
    qualityReport: {
      total: canonicalQuestions.length,
      verified: verifiedCount,
      partial: canonicalQuestions.filter((q) => q.verificationStatus === 'PARTIAL').length,
      reviewRequired: reviewRequiredCount,
      failed: failedCount,
      evaluations: qpResult?.qualityReport?.evaluations || canonicalQuestions.map((q) => evaluateQualityGate(q)),
    },
    warnings,
  };

  return {
    report,
    ingestionResult: finalIngestionResult,
  };
}
