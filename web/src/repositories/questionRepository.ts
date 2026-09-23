/**
 * Question Repository — Project 2
 *
 * Fetches all questions + options for a paper in a single batched query.
 * A 65-question GATE paper = 1 request (questions) + 1 request (options) = 2 total,
 * NOT 65+ individual requests.
 *
 * Falls back to local JSON data when Project 2 is unavailable.
 */

import { CompetitiveQuestion } from '../types';
import { getContentClient, isContentBackendAvailable, resolveAssetUrl } from '../lib/supabaseContent';
import { getPaperById } from '../data/exams/catalog';

interface RemoteQuestionRow {
  id: string;
  paper_id: string;
  section_id: string | null;
  question_number: number;
  question_text: string;
  question_type: 'MCQ' | 'MSQ' | 'NAT' | 'DESCRIPTIVE';
  marks: number;
  negative_marks: number;
  correct_answer: string | null;
  correct_answer_index: number | null;
  correct_answer_set: string[] | null;
  correct_answer_sets: string[][] | null;
  correct_answer_indices: number[] | null;
  answer_range: { min: number; max: number } | null;
  answer_ranges: { min: number; max: number }[] | null;
  is_mta: boolean;
  explanation: string;
  diagram_asset_id: string | null;
  diagram_asset_ids: string[] | null;
  word_limit: string | null;
  model_solution: string | null;
  rubrics: string[] | null;
  raw_data: Record<string, unknown> | null;
  // joined
  content_assets?: RemoteAssetRow | null;
  question_options?: RemoteOptionRow[];
  // from raw_data fallback
  exam_id?: string;
  year?: number;
  date?: string;
  shift?: string;
  tier?: string;
  language?: string;
  paper_code?: string;
  discipline?: string;
}

interface RemoteOptionRow {
  id: string;
  question_id: string;
  option_label: 'A' | 'B' | 'C' | 'D';
  option_index: number;
  option_text: string | null;
  asset_id: string | null;
  // joined
  content_assets?: RemoteAssetRow | null;
}

interface RemoteAssetRow {
  id: string;
  storage_path: string;
  public_url: string | null;
}

function assetToUrl(asset: RemoteAssetRow | null | undefined): string | null {
  if (!asset) return null;
  if (asset.public_url) return asset.public_url;
  return resolveAssetUrl(`/exam-assets/${asset.storage_path}`);
}

function mapRowToQuestion(
  row: RemoteQuestionRow,
  paperId: string,
  optionsMap: Map<string, RemoteOptionRow[]>
): CompetitiveQuestion {
  const options = (optionsMap.get(row.id) ?? []).sort((a, b) => a.option_index - b.option_index);

  const optionTexts = options.map((o) => o.option_text ?? '');
  const optionImages: (string | null)[] = options.map((o) =>
    assetToUrl(o.content_assets)
  );
  const hasOptionImages = optionImages.some((u) => u !== null);

  // Diagram URL(s)
  const diagramUrl = assetToUrl(row.content_assets) ?? undefined;
  const diagramUrls: string[] = diagramUrl ? [diagramUrl] : [];

  // Restore denormalized paper-level fields from raw_data if present
  const raw = row.raw_data ?? {};
  const paperCode = (raw.paperCode as string) ?? row.paper_code ?? undefined;

  return {
    id: row.id,
    questionNumber: row.question_number,
    sectionId: row.section_id ?? 'general',
    sectionName: (raw.sectionName as string) ?? row.section_id ?? '',
    questionText: row.question_text,
    questionType: (row.question_type === 'DESCRIPTIVE' ? undefined : row.question_type) as 'MCQ' | 'MSQ' | 'NAT' | undefined,
    options: optionTexts,
    optionImages: hasOptionImages ? optionImages : undefined,
    correctAnswer: row.correct_answer ?? '',
    correctAnswerIndex: row.correct_answer_index ?? -1,
    correctAnswerSet: row.correct_answer_set ?? undefined,
    correctAnswerSets: row.correct_answer_sets ?? undefined,
    correctAnswerIndices: row.correct_answer_indices ?? undefined,
    answerRange: row.answer_range ?? undefined,
    answerRanges: row.answer_ranges ?? undefined,
    isMta: row.is_mta,
    explanation: row.explanation,
    diagramUrl: diagramUrl ?? null,
    diagramUrls,
    marks: row.marks,
    negativeMarks: row.negative_marks,
    examId: (raw.examId as string) ?? paperId.split('-').slice(0, 2).join('-'),
    year: (raw.year as number) ?? 0,
    date: (raw.date as string) ?? '',
    shift: (raw.shift as string) ?? '',
    tier: (raw.tier as string) ?? '',
    language: (raw.language as string) ?? 'English',
    paperCode,
    discipline: (raw.discipline as string) ?? undefined,
    wordLimit: row.word_limit ?? undefined,
    modelSolution: row.model_solution ?? undefined,
    rubrics: row.rubrics ?? undefined,
  };
}

export const questionRepository = {
  /**
   * Get ALL questions + options for a paper in 2 batched queries.
   * Falls back to local JSON when Project 2 is unavailable.
   */
  async getQuestions(paperId: string): Promise<CompetitiveQuestion[]> {
    if (!isContentBackendAvailable()) {
      return getPaperById(paperId)?.questions ?? [];
    }

    const client = getContentClient();
    if (!client) return getPaperById(paperId)?.questions ?? [];

    try {
      // Query 1: All questions for this paper with their primary diagram asset
      const { data: qData, error: qError } = await client
        .from('questions')
        .select(`
          *,
          content_assets!diagram_asset_id (
            id, storage_path, public_url
          )
        `)
        .eq('paper_id', paperId)
        .order('question_number');

      if (qError) {
        console.warn('[questionRepository] questions query failed:', qError.message);
        return getPaperById(paperId)?.questions ?? [];
      }

      if (!qData || qData.length === 0) {
        // Paper exists in DB but has no questions — fall back to local
        return getPaperById(paperId)?.questions ?? [];
      }

      const questionIds = (qData as RemoteQuestionRow[]).map((q) => q.id);

      // Query 2: All options for all questions (single batch, not per-question)
      const { data: oData, error: oError } = await client
        .from('question_options')
        .select(`
          *,
          content_assets!asset_id (
            id, storage_path, public_url
          )
        `)
        .in('question_id', questionIds)
        .order('option_index');

      if (oError) {
        console.warn('[questionRepository] options query failed:', oError.message);
      }

      // Build question→options map
      const optionsMap = new Map<string, RemoteOptionRow[]>();
      for (const opt of (oData ?? []) as RemoteOptionRow[]) {
        const arr = optionsMap.get(opt.question_id) ?? [];
        arr.push(opt);
        optionsMap.set(opt.question_id, arr);
      }

      return (qData as RemoteQuestionRow[]).map((row) =>
        mapRowToQuestion(row, paperId, optionsMap)
      );
    } catch (err) {
      console.warn('[questionRepository] Remote fetch failed, using local:', err);
      return getPaperById(paperId)?.questions ?? [];
    }
  },
};
