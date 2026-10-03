import {
  CanonicalQuestion,
  CanonicalContentBlock,
  CanonicalOption,
  CanonicalAnswer,
  CanonicalScoring,
  CanonicalProvenance,
  CanonicalAsset,
  QuestionType,
  VerificationStatus,
} from '../../types/canonicalQuestion';
import { Question, CompetitiveQuestion, ContentBlock } from '../../types';
import { evaluateQualityGate } from './qualityGate';

/**
 * Maps ContentBlock to CanonicalContentBlock safely.
 */
export function toCanonicalContentBlock(block: ContentBlock): CanonicalContentBlock {
  return {
    type: block.type,
    content: block.content,
    latex: block.latex,
    language: block.language,
    headers: block.headers,
    rows: block.rows,
    assetUrl: block.assetUrl,
    caption: block.caption,
    confidence: block.confidence,
    blocks: block.blocks ? block.blocks.map(toCanonicalContentBlock) : undefined,
  };
}

/**
 * Maps CanonicalContentBlock to ContentBlock.
 */
export function fromCanonicalContentBlock(block: CanonicalContentBlock): ContentBlock {
  return {
    type: block.type,
    content: block.content,
    latex: block.latex,
    language: block.language,
    headers: block.headers,
    rows: block.rows,
    assetUrl: block.assetUrl,
    caption: block.caption,
    confidence: block.confidence,
    blocks: block.blocks ? block.blocks.map(fromCanonicalContentBlock) : undefined,
  };
}

/**
 * Converts a legacy `Question` or `CompetitiveQuestion` into a unified `CanonicalQuestion`.
 * Evaluates the quality gate so that missing answers or fabricated VERIFIED flags are
 * honestly demoted to REVIEW_REQUIRED or UNVERIFIED.
 */
export function toCanonicalQuestion(
  input: Question | CompetitiveQuestion,
  defaultProvenance?: Partial<CanonicalProvenance>
): CanonicalQuestion {
  const isCompetitive =
    'questionNumber' in input &&
    ('correctAnswer' in input || 'answerRange' in input || 'marks' in input || 'contentBlocks' in input || 'diagramUrl' in input);

  if (isCompetitive) {
    const cq = input as CompetitiveQuestion;

    const qType: QuestionType = cq.questionType || (cq.answerRange ? 'NAT' : cq.correctAnswerSet ? 'MSQ' : 'MCQ');

    const options: CanonicalOption[] = (cq.options || []).map((optText, idx) => {
      const optId = String.fromCharCode(65 + idx);
      const richOpt = cq.richOptions?.find((r) => r.id === optId);
      const optImg = cq.optionImages?.[idx] || richOpt?.imageUrl || null;

      const rawOptText = richOpt?.text ?? optText;
      const normalizedText = typeof rawOptText === 'string' && rawOptText.trim() === '|' ? '1' : rawOptText;

      return {
        id: optId,
        text: normalizedText,
        imageUrl: optImg,
        displayMode: richOpt?.displayMode,
        altText: richOpt?.altText,
        ocrText: richOpt?.ocrText,
        contentBlocks: richOpt?.contentBlocks?.map(toCanonicalContentBlock),
      };
    });

    const correctIdx =
      typeof cq.correctAnswerIndex === 'number' && cq.correctAnswerIndex >= 0
        ? cq.correctAnswerIndex
        : cq.correctAnswer && cq.correctAnswer.length === 1 && cq.correctAnswer >= 'A' && cq.correctAnswer <= 'Z'
        ? cq.correctAnswer.charCodeAt(0) - 65
        : undefined;

    const correctId =
      cq.correctAnswer ||
      (correctIdx !== undefined && options[correctIdx] ? options[correctIdx].id : undefined);

    const answer: CanonicalAnswer = {
      questionType: qType,
      correctOptionId: correctId,
      correctOptionIndex: correctIdx,
      correctOptionIds: cq.correctAnswerSet,
      correctOptionIndices: cq.correctAnswerIndices,
      correctOptionSets: cq.correctAnswerSets,
      natRange: cq.answerRange,
      natRanges: cq.answerRanges,
      isMta: cq.isMta,
      modelSolution: cq.modelSolution,
      rubrics: cq.rubrics,
    };

    const scoring: CanonicalScoring = {
      marks: typeof cq.marks === 'number' && cq.marks > 0 ? cq.marks : 1,
      negativeMarks: typeof cq.negativeMarks === 'number' && cq.negativeMarks >= 0 ? cq.negativeMarks : 0,
      partialMarking: qType === 'MSQ',
      scoringRule: qType === 'MSQ' ? 'GATE_MSQ' : qType === 'NAT' ? 'GATE_NAT' : 'STANDARD',
    };

    const provenance: CanonicalProvenance = {
      sourceType: defaultProvenance?.sourceType || 'PDF',
      sourceFile: cq.examId ? `${cq.examId}-${cq.year}.pdf` : defaultProvenance?.sourceFile,
      sourceUrl: defaultProvenance?.sourceUrl,
      sourcePage: defaultProvenance?.sourcePage,
      sourceExactText: cq.questionText,
      extractorVersion: 'forensic-pipeline-v2',
      ...defaultProvenance,
    };

    const assets: CanonicalAsset[] = [];
    if (cq.diagramUrl) {
      assets.push({
        assetId: `asset-${cq.id}-diag`,
        assetType: 'diagram',
        assetUrl: cq.diagramUrl,
        ownership: 'question',
      });
    }
    if (Array.isArray(cq.diagramUrls)) {
      cq.diagramUrls.forEach((url, i) => {
        if (url !== cq.diagramUrl) {
          assets.push({
            assetId: `asset-${cq.id}-diag-${i}`,
            assetType: 'diagram',
            assetUrl: url,
            ownership: 'question',
          });
        }
      });
    }
    if (Array.isArray(cq.questionAssets)) {
      cq.questionAssets.forEach((qa, i) => {
        assets.push({
          assetId: `asset-${cq.id}-qa-${i}`,
          assetType: qa.type as any,
          assetUrl: qa.url,
          ownership: 'question',
          caption: qa.caption,
          width: qa.width,
          height: qa.height,
        });
      });
    }

    const contentBlocks: CanonicalContentBlock[] = cq.contentBlocks
      ? cq.contentBlocks.map(toCanonicalContentBlock)
      : [
          {
            type: 'text',
            content: cq.questionText,
          },
        ];

    const canonical: CanonicalQuestion = {
      questionId: cq.id,
      sourceId: cq.examId || 'official-corpus',
      sourceType: provenance.sourceType,
      sourceVersion: `${cq.year || 2025}`,
      questionNumber: cq.questionNumber,
      sectionId: cq.sectionId,
      sectionName: cq.sectionName,
      questionText: cq.questionText,
      contentBlocks,
      questionType: qType,
      options,
      answer,
      scoring,
      provenance,
      assets,
      diagramUrl: cq.diagramUrl,
      diagramUrls: cq.diagramUrls,
      explanation: cq.explanation || '',
      topic: cq.discipline || cq.sectionName || 'General',
      difficulty: 'COMPETITIVE',
      verificationStatus: cq.confidence === 'VERIFIED' ? 'VERIFIED' : 'PARTIAL',
      verificationReasons: [],
      confidence: {
        extraction: cq.confidence === 'VERIFIED' ? 1.0 : 0.85,
        structure: 1.0,
        answer: 1.0,
        asset: cq.diagramUrl ? 1.0 : 0.9,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Re-evaluate quality gate to ensure truthfulness
    const evalResult = evaluateQualityGate(canonical);
    canonical.verificationStatus = evalResult.status;
    canonical.verificationReasons = evalResult.reasons;
    canonical.confidence = evalResult.confidence;

    return canonical;
  }

  // Otherwise, it's a legacy flat `Question`
  const lq = input as Question;
  const qId = lq.id || `q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const options: CanonicalOption[] = (lq.options || []).map((txt, idx) => ({
    id: String.fromCharCode(65 + idx),
    text: txt,
  }));

  const answer: CanonicalAnswer = {
    questionType: 'MCQ',
    correctOptionIndex: typeof lq.correctAnswerIndex === 'number' && lq.correctAnswerIndex >= 0 ? lq.correctAnswerIndex : undefined,
    correctOptionId:
      typeof lq.correctAnswerIndex === 'number' && lq.correctAnswerIndex >= 0 && lq.correctAnswerIndex < options.length
        ? options[lq.correctAnswerIndex].id
        : undefined,
  };

  const provenance: CanonicalProvenance = {
    sourceType: defaultProvenance?.sourceType || 'Topic',
    sourcePage: lq.citation?.pageNumber,
    sourceTimestamp: lq.citation?.youtubeTimestamp,
    sourceExactText: lq.citation?.sourceExactText,
    ...defaultProvenance,
  };

  const canonical: CanonicalQuestion = {
    questionId: qId,
    sourceId: defaultProvenance?.sourceId || 'user-generated',
    sourceType: provenance.sourceType,
    questionNumber: 1,
    questionText: lq.questionText,
    contentBlocks: [
      {
        type: 'text',
        content: lq.questionText,
      },
    ],
    questionType: 'MCQ',
    options,
    answer,
    scoring: {
      marks: 1,
      negativeMarks: 0,
      scoringRule: 'STANDARD',
    },
    provenance,
    assets: [],
    explanation: lq.explanation || '',
    topic: lq.topic || 'General',
    verificationStatus: 'UNVERIFIED', // Do NOT trust fake legacy VERIFIED / 0.95 flags!
    verificationReasons: [],
    confidence: {
      extraction: 0.8,
      structure: 0.8,
      answer: answer.correctOptionIndex !== undefined ? 0.85 : 0.0,
      asset: 1.0,
    },
    createdAt: lq.verifiedAt || Date.now(),
    updatedAt: Date.now(),
  };

  const evalResult = evaluateQualityGate(canonical);
  canonical.verificationStatus = evalResult.status;
  canonical.verificationReasons = evalResult.reasons;
  canonical.confidence = evalResult.confidence;

  return canonical;
}

/**
 * Converts a `CanonicalQuestion` back to the legacy flat `Question` model for backwards compatibility.
 */
export function toLegacyQuestion(cq: CanonicalQuestion): Question {
  const options = cq.options.map((o) => o.text || `Option ${o.id}`);

  let correctIndex = -1;
  if (typeof cq.answer.correctOptionIndex === 'number' && cq.answer.correctOptionIndex >= 0) {
    correctIndex = cq.answer.correctOptionIndex;
  } else if (cq.answer.correctOptionId) {
    const foundIdx = cq.options.findIndex((o) => o.id === cq.answer.correctOptionId);
    if (foundIdx >= 0) correctIndex = foundIdx;
  }

  // Convert status honestly
  let legacyStatus: Question['verificationStatus'] = 'UNVERIFIED';
  if (cq.verificationStatus === 'VERIFIED') legacyStatus = 'VERIFIED';
  else if (cq.verificationStatus === 'PARTIAL') legacyStatus = 'PARTIAL';
  else if (cq.verificationStatus === 'FAILED') legacyStatus = 'FAILED';

  return {
    id: cq.questionId,
    questionText: cq.questionText,
    options,
    correctAnswerIndex: correctIndex,
    topic: cq.topic || 'General',
    explanation: cq.explanation,
    citation: {
      pageNumber: cq.provenance.sourcePage,
      youtubeTimestamp: cq.provenance.sourceTimestamp,
      sourceExactText: cq.provenance.sourceExactText || '',
    },
    verificationStatus: legacyStatus,
    trustScore: Math.round(
      ((cq.confidence.extraction + cq.confidence.structure + cq.confidence.answer) / 3) * 100
    ) / 100,
    verifiedAt: cq.updatedAt,
  };
}

/**
 * Converts a `CanonicalQuestion` to a `CompetitiveQuestion`.
 */
export function toCompetitiveQuestion(cq: CanonicalQuestion): CompetitiveQuestion {
  return {
    id: cq.questionId,
    questionNumber: cq.questionNumber,
    sectionId: cq.sectionId || 'section_1',
    sectionName: cq.sectionName || 'General',
    questionText: cq.questionText,
    contentBlocks: cq.contentBlocks.map(fromCanonicalContentBlock),
    questionType: cq.questionType as any,
    options: cq.options.map((o) => o.text),
    optionImages: cq.options.map((o) => o.imageUrl || null),
    richOptions: cq.options.map((o) => ({
      id: o.id,
      text: o.text,
      imageUrl: o.imageUrl,
      displayMode: o.displayMode,
      altText: o.altText,
      ocrText: o.ocrText,
      contentBlocks: o.contentBlocks?.map(fromCanonicalContentBlock),
    })),
    correctAnswer: cq.answer.correctOptionId || (cq.answer.correctOptionIndex !== undefined ? String.fromCharCode(65 + cq.answer.correctOptionIndex) : ''),
    correctAnswerIndex: cq.answer.correctOptionIndex !== undefined ? cq.answer.correctOptionIndex : -1,
    correctAnswerSet: cq.answer.correctOptionIds,
    correctAnswerSets: cq.answer.correctOptionSets,
    correctAnswerIndices: cq.answer.correctOptionIndices,
    answerRange: cq.answer.natRange,
    answerRanges: cq.answer.natRanges,
    isMta: cq.answer.isMta,
    explanation: cq.explanation,
    diagramUrl: cq.diagramUrl,
    diagramUrls: cq.diagramUrls,
    marks: cq.scoring.marks,
    negativeMarks: cq.scoring.negativeMarks,
    examId: cq.sourceId,
    year: parseInt(cq.sourceVersion || '2025', 10) || 2025,
    date: '',
    shift: '',
    tier: '',
    language: 'English',
    modelSolution: cq.answer.modelSolution,
    rubrics: cq.answer.rubrics,
  };
}
