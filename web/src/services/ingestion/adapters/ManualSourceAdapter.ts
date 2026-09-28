import { SourceAdapter, IngestionOptions, IngestionResult } from './SourceAdapter';
import { CanonicalQuestion, CanonicalOption, CanonicalAnswer, QuestionType } from '../../../types/canonicalQuestion';
import { toLegacyQuestion } from '../questionMigrator';
import { evaluateQualityGate, QualityGateEvaluation } from '../qualityGate';
import { createIngestionError } from '../../../types/ingestionErrors';

export interface ManualQuestionInput {
  questionNumber?: number;
  questionText: string;
  questionType?: QuestionType;
  options?: { id?: string; text: string; imageUrl?: string | null }[];
  correctAnswerIndex?: number;
  correctAnswerIndices?: number[];
  natRange?: { min: number; max: number };
  natValue?: number;
  explanation?: string;
  topic?: string;
  diagramUrl?: string | null;
  marks?: number;
  negativeMarks?: number;
}

export class ManualSourceAdapter implements SourceAdapter<{ title?: string; questions: ManualQuestionInput[] }> {
  readonly sourceType = 'Manual';

  async validateInput(input: { title?: string; questions: ManualQuestionInput[] }): Promise<{ valid: boolean; error?: string }> {
    if (!input || !Array.isArray(input.questions) || input.questions.length === 0) {
      return { valid: false, error: 'At least one manual question must be provided.' };
    }
    return { valid: true };
  }

  async process(
    input: { title?: string; questions: ManualQuestionInput[] },
    options?: IngestionOptions
  ): Promise<IngestionResult> {
    if (!input.questions || input.questions.length === 0) {
      throw createIngestionError(
        'INVALID_FILE',
        'No questions provided in manual entry.',
        'Manual input questions array is empty',
        false,
        'MANUAL_INPUT'
      );
    }

    const title = input.title || 'Manual Mock Test';
    const canonicalQuestions: CanonicalQuestion[] = input.questions.map((mq, idx) => {
      const qNum = mq.questionNumber || idx + 1;
      const qType: QuestionType = mq.questionType || (mq.natRange || mq.natValue !== undefined ? 'NAT' : mq.correctAnswerIndices && mq.correctAnswerIndices.length > 1 ? 'MSQ' : 'MCQ');

      const options: CanonicalOption[] = (mq.options || []).map((opt, optIdx) => ({
        id: opt.id || String.fromCharCode(65 + optIdx),
        text: opt.text.trim(),
        imageUrl: opt.imageUrl || null,
      }));

      const answer: CanonicalAnswer = {
        questionType: qType,
        correctOptionIndex: mq.correctAnswerIndex,
        correctOptionId:
          mq.correctAnswerIndex !== undefined && options[mq.correctAnswerIndex]
            ? options[mq.correctAnswerIndex].id
            : undefined,
        correctOptionIndices: mq.correctAnswerIndices,
        correctOptionIds: mq.correctAnswerIndices
          ? mq.correctAnswerIndices.map((i) => options[i]?.id).filter(Boolean)
          : undefined,
        natRange: mq.natRange || (mq.natValue !== undefined ? { min: mq.natValue, max: mq.natValue } : undefined),
        natValue: mq.natValue,
      };

      const q: CanonicalQuestion = {
        questionId: `manual-q-${Date.now()}-${idx}`,
        sourceId: 'manual-entry',
        sourceType: 'Manual',
        questionNumber: qNum,
        questionText: mq.questionText.trim(),
        contentBlocks: [
          {
            type: 'text',
            content: mq.questionText.trim(),
          },
        ],
        questionType: qType,
        options,
        answer,
        scoring: {
          marks: mq.marks || 1,
          negativeMarks: mq.negativeMarks || 0,
        },
        provenance: {
          sourceType: 'Manual',
        },
        assets: [],
        diagramUrl: mq.diagramUrl || null,
        explanation: mq.explanation || '',
        topic: mq.topic || 'General',
        verificationStatus: 'UNVERIFIED',
        verificationReasons: [],
        confidence: {
          extraction: 1.0,
          structure: 1.0,
          answer: 1.0,
          asset: 1.0,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      return q;
    });

    const evaluations: QualityGateEvaluation[] = [];
    let verifiedCount = 0;
    let partialCount = 0;
    let reviewCount = 0;
    let failedCount = 0;

    canonicalQuestions.forEach((q) => {
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
      success: canonicalQuestions.length > 0,
      sourceType: 'Manual',
      sourceTitle: title,
      questions: canonicalQuestions,
      legacyQuestions: canonicalQuestions.map(toLegacyQuestion),
      qualityReport: {
        total: canonicalQuestions.length,
        verified: verifiedCount,
        partial: partialCount,
        reviewRequired: reviewCount,
        failed: failedCount,
        evaluations,
      },
    };
  }
}
