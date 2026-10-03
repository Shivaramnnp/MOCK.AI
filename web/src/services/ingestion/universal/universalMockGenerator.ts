import { CanonicalQuestion } from '../../../types/canonicalQuestion';
import {
  ExamPaper,
  CompetitiveQuestion,
  ExamSection,
  MarkingScheme,
} from '../../../types';
import { PaperIdentity } from '../pairing/types';
import { universalExamRegistry, ExamScoringConfig } from './universalExamConfig';
import { registerExamPaper } from '../../../data/exams/catalog';

export interface MockPaperGenerationOptions {
  paperTitle?: string;
  durationMinutes?: number;
  totalMarks?: number;
  markingScheme?: Partial<MarkingScheme>;
  scoringConfig?: ExamScoringConfig;
  instructions?: string[];
  paperId?: string;
}

/**
 * Transforms Canonical Questions and Paper Identity into a fully testable
 * Mock.AI ExamPaper directly playable in CompetitiveExamPlayerScreen.
 * 
 * Implements the core principle: PAPER -> MOCK.
 * Works seamlessly whether answers are available (Scored Mock)
 * or unavailable (Unscored / Practice Mock with answerKeyStatus = 'UNAVAILABLE').
 */
export function generateMockPaperFromQuestions(
  questions: CanonicalQuestion[],
  identity: PaperIdentity,
  options?: MockPaperGenerationOptions
): ExamPaper {
  const examId = (identity.exam || 'custom').toLowerCase().replace(/\s+/g, '-');
  const year = identity.year || new Date().getFullYear();
  const paperCode = identity.paperCode || 'GENERAL';
  const paperId =
    options?.paperId ||
    `mock-${examId}-${year}-${paperCode.toLowerCase()}-${Date.now().toString(36)}`;

  const examDef = universalExamRegistry.get(examId) || universalExamRegistry.get('custom')!;
  const title =
    options?.paperTitle ||
    `${identity.exam || 'Competitive Exam'} ${identity.year || ''} — ${identity.subject || paperCode} Mock Paper`.replace(
      /\s+/g,
      ' '
    );

  // 1. Check whether answers are resolved
  let resolvedAnswerCount = 0;
  for (const q of questions) {
    const ans: any = q.answer || (q as any).canonicalAnswer;
    const isResolved =
      ans &&
      ans.answerStatus !== 'UNRESOLVED' &&
      (ans.correctOptionId !== undefined ||
        ans.normalizedOption !== undefined ||
        ans.correctAnswer !== undefined ||
        (ans.correctOptionIds && ans.correctOptionIds.length > 0) ||
        (ans.normalizedOptions && ans.normalizedOptions.length > 0) ||
        (ans.correctAnswerSet && ans.correctAnswerSet.length > 0) ||
        ans.natRange !== undefined ||
        ans.natValue !== undefined ||
        ans.isMta === true ||
        (typeof ans.correctOptionIndex === 'number' && ans.correctOptionIndex >= 0));
    if (isResolved) resolvedAnswerCount++;
  }

  const hasAnswers = resolvedAnswerCount > 0;
  const answerKeyStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'PARTIAL' =
    resolvedAnswerCount === questions.length
      ? 'AVAILABLE'
      : resolvedAnswerCount > 0
      ? 'PARTIAL'
      : 'UNAVAILABLE';

  // 2. Partition into Sections
  const sectionMap = new Map<string, CanonicalQuestion[]>();
  for (const q of questions) {
    const secName = q.sectionName?.trim() || 'General Section';
    const existing = sectionMap.get(secName) || [];
    existing.push(q);
    sectionMap.set(secName, existing);
  }

  const sections: ExamSection[] = [];
  let runningIndex = 0;
  let totalPaperMarks = 0;

  for (const [secName, secQuestions] of sectionMap.entries()) {
    const secId = `sec_${secName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    let secMarks = 0;

    for (const q of secQuestions) {
      secMarks += q.scoring?.marks ?? q.marks ?? 1;
    }

    sections.push({
      id: secId,
      name: secName,
      questionCount: secQuestions.length,
      maxMarks: secMarks,
      startIndex: runningIndex,
      endIndex: runningIndex + secQuestions.length - 1,
    });

    runningIndex += secQuestions.length;
    totalPaperMarks += secMarks;
  }

  // 3. Map Canonical Questions to Competitive Questions
  const competitiveQuestions: CompetitiveQuestion[] = questions.map((q, idx) => {
    const secName = q.sectionName?.trim() || 'General Section';
    const secId = `sec_${secName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const qType = (q.questionType as 'MCQ' | 'MSQ' | 'NAT') || 'MCQ';

    // Map dynamic options
    const optionStrings = (q.options || []).map((o) => o.text || '');
    const optionImages = (q.options || []).map((o) => o.imageUrl || null);
    const richOptions = (q.options || []).map((o) => ({
      id: o.id,
      text: o.text,
      imageUrl: o.imageUrl,
      displayMode: o.displayMode,
      altText: o.altText,
      ocrText: o.ocrText,
      contentBlocks: o.contentBlocks as any,
    }));

    // Reconcile answers safely
    let correctAnswer = '';
    let correctAnswerIndex = -1;
    let correctAnswerSet: string[] | undefined;
    let answerRange: { min: number; max: number } | undefined;

    const ans: any = q.answer || (q as any).canonicalAnswer;

    if (hasAnswers && ans && ans.answerStatus !== 'UNRESOLVED') {
      if (qType === 'MCQ') {
        correctAnswer = ans.correctOptionId || ans.normalizedOption || ans.correctAnswer || '';
        if (typeof ans.correctOptionIndex === 'number' && ans.correctOptionIndex >= 0) {
          correctAnswerIndex = ans.correctOptionIndex;
        } else if (correctAnswer) {
          correctAnswerIndex = (q.options || []).findIndex(
            (o) => o.id.toUpperCase() === correctAnswer.toUpperCase()
          );
        }
      } else if (qType === 'MSQ') {
        const set = ans.correctOptionIds || ans.normalizedOptions || ans.correctAnswerSet;
        if (set && set.length > 0) {
          correctAnswerSet = set;
          correctAnswer = set.join(';');
        }
      } else if (qType === 'NAT') {
        if (ans.natRange) {
          answerRange = ans.natRange;
          correctAnswer = `${ans.natRange.min} to ${ans.natRange.max}`;
        } else if (typeof ans.natValue === 'number') {
          answerRange = { min: ans.natValue, max: ans.natValue };
          correctAnswer = String(ans.natValue);
        }
      }
    }

    return {
      id: q.questionId || `${paperId}-q${q.questionNumber || idx + 1}`,
      questionNumber: q.questionNumber || idx + 1,
      sectionId: secId,
      sectionName: secName,
      questionText: q.questionText,
      contentBlocks: q.contentBlocks as any,
      questionType: qType,
      options: optionStrings,
      optionImages: optionImages.some(Boolean) ? optionImages : undefined,
      richOptions: richOptions.length > 0 ? richOptions : undefined,
      correctAnswer,
      correctAnswerIndex,
      correctAnswerSet,
      correctAnswerSets: ans?.correctOptionSets,
      answerRange,
      answerRanges: ans?.natRanges,
      isMta: ans?.isMta,
      explanation: q.explanation || 'Extracted from official source paper.',
      diagramUrl:
        q.diagramUrl ||
        (q.assets && q.assets.filter((a: any) => (!a.ownership || a.ownership === 'QUESTION') && !a.assetId?.includes('_opt_')).length > 0
          ? q.assets.filter((a: any) => (!a.ownership || a.ownership === 'QUESTION') && !a.assetId?.includes('_opt_'))[0]?.assetUrl
          : null) ||
        null,
      diagramUrls:
        (q.assets && q.assets.filter((a: any) => (!a.ownership || a.ownership === 'QUESTION') && !a.assetId?.includes('_opt_')).length > 0
          ? q.assets
              .filter((a: any) => (!a.ownership || a.ownership === 'QUESTION') && !a.assetId?.includes('_opt_'))
              .map((a: any) => a.assetUrl)
              .filter(Boolean)
          : q.diagramUrls) || (q.diagramUrl ? [q.diagramUrl] : []),
      questionAssets: q.assets
        ?.filter((a: any) => (!a.ownership || a.ownership === 'QUESTION') && !a.assetId?.includes('_opt_'))
        .map((a: any) => ({
          type: a.assetType as any,
          url: a.assetUrl,
          caption: a.caption,
        })),
      marks: q.scoring?.marks ?? q.marks ?? 1,
      negativeMarks: q.scoring?.negativeMarks ?? q.negativeMarks ?? 0,
      examId,
      year,
      date: new Date().toISOString().split('T')[0],
      shift: identity.session || identity.shift || 'General Shift',
      tier: identity.tier || 'Standard',
      language: 'English',
      paperCode,
      discipline: identity.subject || paperCode,
    };
  });

  // 4. Default duration: 60 minutes or derived
  const durationMinutes =
    options?.durationMinutes ||
    (questions.length > 50 ? 180 : questions.length > 25 ? 120 : 60);

  const markingScheme: MarkingScheme = {
    marksPerCorrect: options?.markingScheme?.marksPerCorrect ?? 1.0,
    negativeMarks: options?.markingScheme?.negativeMarks ?? 0.0,
    unansweredMarks: 0.0,
  };

  const paper: ExamPaper = {
    id: paperId,
    examId,
    examName: identity.exam || 'Competitive Exam',
    editionYear: year,
    title,
    subTitle: `Universal Mock Paper (${questions.length} Questions)`,
    date: new Date().toISOString().split('T')[0],
    shift: identity.session || 'Shift 1',
    tier: identity.tier || 'Stage 1',
    paperType: 'CBE_OBJECTIVE',
    paperCode,
    discipline: identity.subject || paperCode,
    language: 'English',
    durationMinutes,
    totalMarks: options?.totalMarks || totalPaperMarks,
    totalQuestions: questions.length,
    isComplete: true,
    markingScheme,
    sections,
    questions: competitiveQuestions,
    answerKeyStatus,
    isScored: hasAnswers,
  };

  // Register in central catalog so test player and session services immediately resolve it
  registerExamPaper(paper);

  return paper;
}
