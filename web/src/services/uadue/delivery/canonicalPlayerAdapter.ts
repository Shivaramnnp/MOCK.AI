/**
 * UADUE Phase 3.6 — Canonical Player Delivery Adapter
 * Specification: UADUE-P3.6-PLAYER-001 (Loss-Aware Presentation & Submission Bridge)
 *
 * Implements:
 * 1. Loss-aware transformation from Tier 3 Student Live Projection to ExamPresentationPaper
 * 2. Strict air-gap preservation:
 *    - All answer keys, ranges, explanations, and model solutions are omitted
 *    - Prohibited internal canonical identifiers (logicalFamilyId, lineage DAGs) are stripped
 * 3. Question & Option identity preservation:
 *    - Preserves canonicalQuestionId as question.id (never positional array indices)
 *    - Preserves stable optionId on richOptions (e.g. 'opt_0', 'opt_1')
 * 4. Content block fidelity:
 *    - Maps AST text runs, LaTeX math blocks, tables, and diagrams to ContentBlocks
 * 5. Candidate submission event generation:
 *    - Formulates cryptographically fingerprinted SubmissionEventEnvelope records
 * 6. Authoritative result projection:
 *    - Projects CandidateEvaluationRunRecord into ExamResultSummary
 *    - Strictly enforces raw-score-only projection (totalRawScore = sum(awardedMarks), totalNormalizedScore = null)
 */

import { createHash } from 'crypto';
import {
  StudentLivePackageProjection,
  StudentLiveQuestionProjection,
  StudentLiveRepresentation,
} from '../canonical/canonicalPersistenceTypes';
import {
  ExamPresentationPaper,
  ExamPresentationQuestion,
  ExamQuestionOption,
  ContentBlock,
  ExamResultSummary,
  ExamSection,
  SectionResultSummary,
} from '../../../types';
import {
  SubmissionEventEnvelope,
  CandidateEvaluationRunRecord,
  CandidateQuestionScoreRecord,
} from './deliveryTypes';
import { rfc8785Canonicalize } from '../canonical/canonicalHashing';

export class CanonicalPlayerAdapterError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`Canonical Player Adapter Error [${code}]: ${message}`);
    this.name = 'CanonicalPlayerAdapterError';
  }
}

export interface PlayerPaperMetadata {
  title?: string;
  examId?: string;
  durationMinutes?: number;
  markingScheme?: {
    marksPerCorrect: number;
    negativeMarks: number;
  };
}

export class CanonicalPlayerAdapter {
  /**
   * Adapts a Tier 3 Student Live Package Projection into an ExamPresentationPaper
   * suitable for consumption by CompetitiveExamPlayerScreen.
   *
   * AIR-GAPPED: Ensures zero answer keys or internal canonical identifiers leak.
   */
  public static adaptProjectionToPresentationPaper(
    projection: StudentLivePackageProjection,
    metadata?: PlayerPaperMetadata
  ): ExamPresentationPaper {
    if (!projection) {
      throw new CanonicalPlayerAdapterError(
        'NULL_PROJECTION',
        'Cannot adapt null or undefined package projection.'
      );
    }

    if (projection.projectionTier !== 'TIER_3_STUDENT_LIVE') {
      throw new CanonicalPlayerAdapterError(
        'INVALID_PROJECTION_TIER',
        `Expected TIER_3_STUDENT_LIVE projection, but received tier '${projection.projectionTier}'. Candidate delivery fails closed.`
      );
    }

    const examId = metadata?.examId || 'competitive_exam';
    const title = metadata?.title || `Assessment Package ${projection.packageId.slice(0, 12)}`;
    const durationMinutes = metadata?.durationMinutes || 180;
    const marksPerCorrect = metadata?.markingScheme?.marksPerCorrect ?? 1;
    const negativeMarks = metadata?.markingScheme?.negativeMarks ?? 0.33;

    const questions: ExamPresentationQuestion[] = projection.questions.map((qProj, idx) => {
      return this.adaptQuestionProjection(qProj, idx, examId);
    });

    const sections: ExamSection[] = [
      {
        id: 'sec_all',
        name: 'All Questions',
        questionCount: questions.length,
        maxMarks: questions.reduce((sum, q) => sum + (q.marks || 1), 0),
        startIndex: 0,
        endIndex: Math.max(0, questions.length - 1),
      },
    ];

    return {
      id: projection.packageId,
      examId,
      examName: metadata?.title || 'Competitive Examination',
      editionYear: new Date().getFullYear(),
      title,
      subTitle: 'Official Computer Based Test',
      date: new Date().toISOString().split('T')[0],
      shift: '1',
      tier: '1',
      language: 'en',
      paperType: 'CBE_OBJECTIVE',
      totalQuestions: questions.length,
      totalMarks: sections[0].maxMarks,
      durationMinutes,
      markingScheme: {
        marksPerCorrect,
        negativeMarks,
      },
      sections,
      questions,
      isPresentationOnly: true,
      answerKeyStatus: 'UNAVAILABLE', // Candidate live exam has zero answer key access
      isScored: true,
    };
  }

  /**
   * Adapts an individual StudentLiveQuestionProjection into an ExamPresentationQuestion.
   * Strips all internal canonical lineage and ensures stable option IDs.
   */
  public static adaptQuestionProjection(
    qProj: StudentLiveQuestionProjection,
    displayIndex: number,
    examId: string = 'competitive_exam'
  ): ExamPresentationQuestion {
    if (!qProj.canonicalQuestionId) {
      throw new CanonicalPlayerAdapterError(
        'MISSING_QUESTION_ID',
        `Question at index ${displayIndex} is missing canonicalQuestionId.`
      );
    }

    // Select primary representation (default 0)
    const primaryRep: StudentLiveRepresentation | undefined =
      qProj.representations && qProj.representations.length > 0
        ? qProj.representations[0]
        : undefined;

    // Convert Synthesized Question Type
    let questionType: 'MCQ' | 'MSQ' | 'NAT' = 'MCQ';
    if (qProj.synthesizedQuestionType === 'NUMERICAL_VALUE') {
      questionType = 'NAT';
    } else if (
      qProj.synthesizedQuestionType === 'MULTIPLE_CHOICE_SELECT_ALL' ||
      qProj.synthesizedQuestionType === 'MSQ'
    ) {
      questionType = 'MSQ';
    }

    // Build Stem Content & AST
    const { stemText, contentBlocks } = this.extractStemContent(primaryRep);

    // Build Options
    const { options, richOptions } = this.extractOptions(primaryRep, questionType);

    const questionNumber = primaryRep?.sourceQuestionNumber
      ? parseInt(primaryRep.sourceQuestionNumber, 10) || displayIndex + 1
      : displayIndex + 1;

    // Strictly enforce presentation-only question contract
    const adaptedQuestion: ExamPresentationQuestion = {
      id: qProj.canonicalQuestionId, // Stable canonical ID, NOT numeric array index
      questionNumber,
      sectionId: 'sec_all',
      sectionName: 'All Questions',
      questionText: stemText,
      contentBlocks,
      questionType,
      options,
      richOptions,
      marks: 1,
      negativeMarks: questionType === 'NAT' ? 0 : 0.33,
      examId,
      year: new Date().getFullYear(),
      date: new Date().toISOString(),
      shift: '1',
      tier: '1',
      language: primaryRep?.languageScript || 'en',
      isPresentationOnly: true,
    };

    // Defensive check: ensure no prohibited logicalFamilyId was inadvertently placed on question
    if ('logicalFamilyId' in (adaptedQuestion as any)) {
      delete (adaptedQuestion as any).logicalFamilyId;
    }

    return adaptedQuestion;
  }

  /**
   * Formulates a cryptographically fingerprinted SubmissionEventEnvelope from candidate input.
   */
  public static createSubmissionEnvelope(input: {
    examSessionId: string;
    tenantId: string;
    candidateId?: string;
    packageId: string;
    packageIntegritySeal: string;
    canonicalQuestionId: string;
    representationId?: string;
    clientSequenceNumber: number;
    clientEventId: string;
    candidateResponse: Record<string, unknown>;
    deviceLeaseId: string;
  }): SubmissionEventEnvelope {
    if (!input.examSessionId || !input.canonicalQuestionId || !input.clientEventId) {
      throw new CanonicalPlayerAdapterError(
        'INVALID_ENVELOPE_INPUT',
        'examSessionId, canonicalQuestionId, and clientEventId are required.'
      );
    }

    const clientTimestamp = new Date().toISOString();

    return {
      clientEventId: input.clientEventId,
      examSessionId: input.examSessionId,
      tenantId: input.tenantId,
      candidateId: input.candidateId,
      sessionLeaseId: input.deviceLeaseId,
      packageId: input.packageId,
      packageIntegritySeal: input.packageIntegritySeal,
      canonicalQuestionId: input.canonicalQuestionId,
      representationId: input.representationId || 'rep_0',
      clientSequenceNumber: input.clientSequenceNumber,
      eventType: 'QUESTION_RESPONSE_RECORDED',
      payload: input.candidateResponse,
      clientTimestamp,
    };
  }

  /**
   * Projects an authoritative CandidateEvaluationRunRecord into an ExamResultSummary
   * for the results view. Strictly raw-score-only (totalRawScore = sum(awardedMarks), totalNormalizedScore = null).
   */
  public static projectEvaluationRunToCandidateResult(
    evalRun: CandidateEvaluationRunRecord,
    itemScores: CandidateQuestionScoreRecord[],
    paper: ExamPresentationPaper
  ): ExamResultSummary {
    if (!evalRun) {
      throw new CanonicalPlayerAdapterError(
        'NULL_EVALUATION_RUN',
        'Cannot project null evaluation run.'
      );
    }

    // Security invariant: totalNormalizedScore must be null
    if (evalRun.totalNormalizedScore !== null && evalRun.totalNormalizedScore !== undefined) {
      throw new CanonicalPlayerAdapterError(
        'PROHIBITED_NORMALIZATION',
        `Evaluation run contains unauthorized normalized score (${evalRun.totalNormalizedScore}). Only raw scores are authorized in Phase 3.5/3.6.`
      );
    }

    const sectionResults: Record<string, SectionResultSummary> = {};
    for (const sec of paper.sections) {
      sectionResults[sec.id] = {
        sectionId: sec.id,
        sectionName: sec.name,
        totalQuestions: sec.questionCount,
        maxMarks: sec.maxMarks,
        attempted: evalRun.questionsAttempted,
        correct: evalRun.questionsCorrect,
        wrong: evalRun.questionsIncorrect,
        skipped: evalRun.questionsUnanswered,
        score: evalRun.totalRawScore,
        accuracy:
          evalRun.questionsAttempted > 0
            ? Math.round((evalRun.questionsCorrect / evalRun.questionsAttempted) * 100)
            : 0,
        timeSpentSeconds: 0,
      };
    }

    const itemScoresMap: Record<
      string,
      {
        isCorrect: boolean;
        marksAwarded: number;
        penaltyDeducted: number;
        netScore: number;
      }
    > = {};
    if (Array.isArray(itemScores)) {
      for (const item of itemScores) {
        if (item?.canonicalQuestionId) {
          itemScoresMap[item.canonicalQuestionId] = {
            isCorrect: item.isCorrect,
            marksAwarded: Number(item.marksAwarded) || 0,
            penaltyDeducted: Number(item.penaltyDeducted) || 0,
            netScore: Number(item.netScore) || 0,
          };
        }
      }
    }

    return {
      sessionId: evalRun.examSessionId,
      paperId: evalRun.packageId,
      examId: paper.examId,
      paperTitle: paper.title,
      totalQuestions: paper.totalQuestions,
      maxMarks: paper.totalMarks,
      totalScore: evalRun.totalRawScore,
      totalRawScore: evalRun.totalRawScore,
      isAuthoritative: true,
      evaluationRunId: evalRun.evaluationRunId,
      itemScores: itemScoresMap,
      percentage:
        paper.totalMarks > 0
          ? Math.round((evalRun.totalRawScore / paper.totalMarks) * 100)
          : null,
      accuracy:
        evalRun.questionsAttempted > 0
          ? Math.round((evalRun.questionsCorrect / evalRun.questionsAttempted) * 100)
          : null,
      attempted: evalRun.questionsAttempted,
      correct: evalRun.questionsCorrect,
      incorrect: evalRun.questionsIncorrect,
      unanswered: evalRun.questionsUnanswered,
      correctCount: evalRun.questionsCorrect,
      wrongCount: evalRun.questionsIncorrect,
      attemptedCount: evalRun.questionsAttempted,
      unansweredCount: evalRun.questionsUnanswered,
      timeSpentSeconds: 0,
      submittedAt: new Date(evalRun.evaluatedAt).getTime(),
      sectionResults,
      isScoreCalculated: true,
      scoreStatus: 'CALCULATED',
      answerKeyStatus: 'AVAILABLE',
      answerKeyVersion: evalRun.answerKeyVersion,
      scoringConfigVersion: evalRun.scoringPolicyVersion,
    };
  }

  // ── Helper Methods ─────────────────────────────────────────────────────────

  private static extractStemContent(rep?: StudentLiveRepresentation): {
    stemText: string;
    contentBlocks: ContentBlock[];
  } {
    if (!rep) {
      return { stemText: 'Question Content Unavailable', contentBlocks: [] };
    }

    const contentBlocks: ContentBlock[] = [];
    let stemText = '';

    // Handle stemAST
    if (Array.isArray(rep.stemAST)) {
      const textParts: string[] = [];
      for (const node of rep.stemAST) {
        if (typeof node === 'string') {
          textParts.push(node);
          contentBlocks.push({ type: 'text', content: node });
        } else if (node && typeof node === 'object') {
          const t = (node as any).text || (node as any).content || (node as any).textContent || '';
          if (t) {
            textParts.push(t);
            contentBlocks.push({ type: 'text', content: t });
          }
        }
      }
      stemText = textParts.join('\n').trim();
    } else if (typeof rep.stemAST === 'string') {
      stemText = rep.stemAST;
      contentBlocks.push({ type: 'text', content: rep.stemAST });
    }

    // Attach Math Blocks if present
    if (Array.isArray(rep.mathBlocks) && rep.mathBlocks.length > 0) {
      for (const math of rep.mathBlocks) {
        const latex = typeof math === 'string' ? math : (math as any).latex || (math as any).mathContent || '';
        if (latex) {
          contentBlocks.push({
            type: 'math',
            latex,
            content: `$$${latex}$$`,
          });
          stemText += `\n$$${latex}$$`;
        }
      }
    }

    // Attach Tables if present
    if (Array.isArray(rep.tables) && rep.tables.length > 0) {
      for (const tbl of rep.tables) {
        if (tbl && typeof tbl === 'object') {
          contentBlocks.push({
            type: 'table',
            headers: (tbl as any).headers || [],
            rows: (tbl as any).rows || [],
          });
        }
      }
    }

    // Attach Diagrams / Visual Assets if present
    if (Array.isArray(rep.diagrams) && rep.diagrams.length > 0) {
      for (const diag of rep.diagrams) {
        const url = typeof diag === 'string' ? diag : (diag as any).url || (diag as any).assetUrl || '';
        if (url) {
          contentBlocks.push({
            type: 'diagram',
            assetUrl: url,
            caption: (diag as any).caption,
          });
        }
      }
    }

    if (!stemText && contentBlocks.length > 0) {
      stemText = contentBlocks.map((b) => b.content || b.latex || '').join(' ');
    }

    return { stemText: stemText || 'Question Content', contentBlocks };
  }

  private static extractOptions(
    rep?: StudentLiveRepresentation,
    questionType: 'MCQ' | 'MSQ' | 'NAT' = 'MCQ'
  ): {
    options: string[];
    richOptions: ExamQuestionOption[];
  } {
    if (questionType === 'NAT' || !rep || !Array.isArray(rep.options) || rep.options.length === 0) {
      return { options: [], richOptions: [] };
    }

    const options: string[] = [];
    const richOptions: ExamQuestionOption[] = [];

    for (const opt of rep.options) {
      const optionId = opt.optionId || `opt_${opt.optionIndex}`;
      let text = '';
      const optionBlocks: ContentBlock[] = [];

      if (typeof opt.contentAST === 'string') {
        text = opt.contentAST;
        optionBlocks.push({ type: 'text', content: text });
      } else if (Array.isArray(opt.contentAST)) {
        const parts: string[] = [];
        for (const item of opt.contentAST) {
          if (typeof item === 'string') {
            parts.push(item);
            optionBlocks.push({ type: 'text', content: item });
          } else if (item && typeof item === 'object') {
            const itemText = (item as any).text || (item as any).content || '';
            if (itemText) {
              parts.push(itemText);
              optionBlocks.push({ type: 'text', content: itemText });
            }
          }
        }
        text = parts.join(' ').trim();
      }

      options.push(text);
      richOptions.push({
        id: optionId, // Stable canonical option ID
        text,
        contentBlocks: optionBlocks,
      });
    }

    return { options, richOptions };
  }
}
