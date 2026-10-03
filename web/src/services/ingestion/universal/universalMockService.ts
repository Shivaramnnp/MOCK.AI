import { ExamPaper } from '../../../types';
import {
  ingestPairedExamSources,
  PairedIngestionInput,
  extractLinesFromPdf,
  toUint8Array,
} from '../pairing/sourcePairingEngine';
import { PairingIngestionReport, PairingOptions, RawAnswerEntry } from '../pairing/types';
import { generateMockPaperFromQuestions } from './universalMockGenerator';
import { detectEmbeddedAnswers } from './embeddedAnswerDetector';
import { extractAnswerKeyFromLines } from '../pairing/answerKeyExtractor';
import { matchQuestionsWithAnswerKey } from '../pairing/deterministicMatcher';
import { getPaperById, registerExamPaper } from '../../../data/exams/catalog';
import { ExamService } from '../../examService';

/**
 * Universal Mock Service — Orchestrates the complete PAPER -> MOCK pipeline.
 * Supports:
 * 1. Immediate Mock conversion (with or without answer keys)
 * 2. Embedded answer key auto-detection
 * 3. Late Answer-Key attachment without re-uploading the Question Paper (Section 32)
 */
export class UniversalMockService {
  /**
   * Converts any Question Paper into a fully testable Mock.AI ExamPaper.
   */
  static async convertPaperToMock(
    input: PairedIngestionInput,
    options?: PairingOptions
  ): Promise<{
    paper: ExamPaper;
    report: PairingIngestionReport;
  }> {
    // Check for embedded answers if no separate Answer Key was provided
    let effectiveInput = { ...input };

    if (effectiveInput.questionPaper && !effectiveInput.answerKey) {
      try {
        const qp = effectiveInput.questionPaper;
        const qpBytes = await toUint8Array(qp.file || qp.binaryData || qp.base64Data!);
        const lines = await extractLinesFromPdf(qpBytes);
        const embedded = detectEmbeddedAnswers(lines);

        if (embedded.hasEmbeddedAnswers && embedded.entries.length > 0) {
          effectiveInput.answerKey = {
            textData: embedded.entries
              .map((e) => `Q${e.questionNumber}: ${e.rawAnswerText}`)
              .join('\n'),
            fileName: `[Embedded in ${qp.fileName || 'Question Paper'}]`,
          };
        }
      } catch (err) {
        // Safe degrade to standalone QP if embedded check fails
      }
    }

    // Ingest and deterministically pair
    const { report } = await ingestPairedExamSources(effectiveInput, options);

    // Transform into universal playable MockPaper
    const paper = generateMockPaperFromQuestions(
      report.canonicalQuestions,
      report.questionPaperSummary?.detectedIdentity || {
        exam: options?.examHint || 'Custom',
        year: options?.yearHint,
        paperCode: options?.paperCodeHint,
        confidence: 0.8,
      },
      {
        paperTitle: report.questionPaperSummary?.fileName.replace(/\.[^/.]+$/, ''),
      }
    );

    return { paper, report };
  }

  /**
   * Late Answer-Key Attachment (Section 32):
   * Attaches an official Answer Key to an existing previously-uploaded MockPaper
   * without re-uploading the original Question Paper.
   */
  static async attachLateAnswerKey(
    paperId: string,
    answerKeyInput: {
      file?: File;
      binaryData?: Uint8Array | ArrayBuffer;
      base64Data?: string;
      textData?: string;
      fileName?: string;
    }
  ): Promise<{
    paper: ExamPaper;
    updatedCount: number;
    warnings: string[];
  }> {
    const existingPaper = getPaperById(paperId);
    if (!existingPaper) {
      throw new Error(`Paper with ID "${paperId}" not found for late answer-key attachment.`);
    }

    let akLines: string[] = [];
    if (answerKeyInput.textData) {
      akLines = answerKeyInput.textData.split(/\r?\n/);
    } else {
      const akBytes = await toUint8Array(
        answerKeyInput.file || answerKeyInput.binaryData || answerKeyInput.base64Data!
      );
      akLines = await extractLinesFromPdf(akBytes);
    }

    const answerEntries: RawAnswerEntry[] = extractAnswerKeyFromLines(akLines);
    if (answerEntries.length === 0) {
      throw new Error('No valid answer key entries could be extracted from the uploaded document.');
    }

    const akMap = new Map<number, RawAnswerEntry>();
    for (const entry of answerEntries) {
      akMap.set(entry.questionNumber, entry);
    }

    let updatedCount = 0;
    const warnings: string[] = [];

    // Reconcile each existing question with the new answer key
    for (const q of existingPaper.questions) {
      const entry = akMap.get(q.questionNumber);
      if (!entry) {
        warnings.push(`Missing answer key entry for Question ${q.questionNumber}.`);
        continue;
      }

      if (entry.isMta) {
        q.isMta = true;
        updatedCount++;
        continue;
      }

      if (entry.detectedType) {
        q.questionType = entry.detectedType as 'MCQ' | 'MSQ' | 'NAT';
      }

      if (q.questionType === 'MCQ' && entry.mcqOption) {
        q.correctAnswer = entry.mcqOption;
        const optIdx = q.options.findIndex(
          (_, i) => ['A', 'B', 'C', 'D', 'E', 'F'][i] === entry.mcqOption!.toUpperCase()
        );
        q.correctAnswerIndex = optIdx >= 0 ? optIdx : 0;
        updatedCount++;
      } else if (q.questionType === 'MSQ' && entry.msqOptions) {
        q.correctAnswerSet = entry.msqOptions;
        q.correctAnswer = entry.msqOptions.join(';');
        updatedCount++;
      } else if (q.questionType === 'NAT') {
        if (entry.natRange) {
          q.answerRange = entry.natRange;
          q.correctAnswer = `${entry.natRange.min} to ${entry.natRange.max}`;
          updatedCount++;
        } else if (typeof entry.natValue === 'number') {
          q.answerRange = { min: entry.natValue, max: entry.natValue };
          q.correctAnswer = String(entry.natValue);
          updatedCount++;
        }
      }

      if (entry.marks && entry.marks > 0) {
        q.marks = entry.marks;
        q.negativeMarks = entry.negativeMarks ?? 0;
      }
    }

    // Upgrade paper status to AVAILABLE and SCORED
    existingPaper.answerKeyStatus = 'AVAILABLE';
    existingPaper.isScored = true;

    // Persist in catalog & service
    registerExamPaper(existingPaper);

    return {
      paper: existingPaper,
      updatedCount,
      warnings,
    };
  }
}
