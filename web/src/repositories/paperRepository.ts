/**
 * Paper Repository — Project 2
 *
 * Fetches exam paper metadata (exam_papers table) from Supabase Project 2.
 * Falls back to local JSON data when Project 2 is unavailable.
 */

import { ExamPaper } from '../types';
import { getContentClient, isContentBackendAvailable } from '../lib/supabaseContent';
import { getPapersForExam, getPaperById } from '../data/exams/catalog';

export interface RemotePaperRow {
  id: string;
  exam_id: string;
  edition_year: number;
  title: string;
  sub_title: string | null;
  date: string | null;
  shift: string;
  tier: string;
  paper_type: string;
  paper_code: string | null;
  discipline: string | null;
  language: string;
  duration_minutes: number;
  total_marks: number;
  total_questions: number;
  is_complete: boolean;
  marking_scheme: {
    marksPerCorrect: number;
    negativeMarks: number;
    unansweredMarks?: number;
  };
  exam_sections?: RemoteSectionRow[];
}

export interface RemoteSectionRow {
  id: string;
  paper_id: string;
  section_order: number;
  name: string;
  section_key: string;
  question_count: number;
  max_marks: number;
  start_index: number;
  end_index: number;
}

function mapRowToPaper(row: RemotePaperRow, examName: string): Omit<ExamPaper, 'questions'> {
  const sections = (row.exam_sections ?? [])
    .sort((a, b) => a.section_order - b.section_order)
    .map((s) => ({
      id: s.section_key,
      name: s.name,
      questionCount: s.question_count,
      maxMarks: s.max_marks,
      startIndex: s.start_index,
      endIndex: s.end_index,
    }));

  return {
    id: row.id,
    examId: row.exam_id,
    examName,
    editionYear: row.edition_year,
    title: row.title,
    subTitle: row.sub_title ?? '',
    date: row.date ?? '',
    shift: row.shift,
    tier: row.tier,
    paperType: (row.paper_type as 'CBE_OBJECTIVE' | 'DESCRIPTIVE') ?? 'CBE_OBJECTIVE',
    paperCode: row.paper_code ?? undefined,
    discipline: row.discipline ?? undefined,
    language: row.language,
    durationMinutes: row.duration_minutes,
    totalMarks: row.total_marks,
    totalQuestions: row.total_questions,
    isComplete: row.is_complete,
    markingScheme: {
      marksPerCorrect: row.marking_scheme.marksPerCorrect,
      negativeMarks: row.marking_scheme.negativeMarks,
      unansweredMarks: row.marking_scheme.unansweredMarks ?? 0,
    },
    sections,
  };
}

export const paperRepository = {
  /**
   * Get all papers for an exam, optionally filtered by year.
   * Returns local data as fallback.
   */
  async getPapers(examId: string, year?: number): Promise<Omit<ExamPaper, 'questions'>[]> {
    if (!isContentBackendAvailable()) {
      const local = getPapersForExam(examId);
      if (year) return local.filter((p) => p.editionYear === year);
      return local;
    }

    const client = getContentClient();
    if (!client) {
      const local = getPapersForExam(examId);
      return year ? local.filter((p) => p.editionYear === year) : local;
    }

    try {
      let query = client
        .from('exam_papers')
        .select(`
          *,
          exam_sections (
            id, paper_id, section_order, name, section_key,
            question_count, max_marks, start_index, end_index
          )
        `)
        .eq('exam_id', examId)
        .order('edition_year', { ascending: false })
        .order('date', { ascending: true, nullsFirst: false })
        .order('shift');

      if (year) {
        query = query.eq('edition_year', year);
      }

      const { data, error } = await query;

      if (error || !data || data.length === 0) {
        console.warn('[paperRepository] Falling back to local:', error?.message);
        const local = getPapersForExam(examId);
        return year ? local.filter((p) => p.editionYear === year) : local;
      }

      const examName = data[0]?.exam_id ?? examId;
      return (data as RemotePaperRow[]).map((row) => mapRowToPaper(row, examName));
    } catch (err) {
      console.warn('[paperRepository] Remote fetch failed, using local:', err);
      const local = getPapersForExam(examId);
      return year ? local.filter((p) => p.editionYear === year) : local;
    }
  },

  /**
   * Get paper metadata (without questions) by paper ID.
   */
  async getPaperMeta(paperId: string): Promise<Omit<ExamPaper, 'questions'> | undefined> {
    if (!isContentBackendAvailable()) {
      const local = getPaperById(paperId);
      if (!local) return undefined;
      const { questions: _q, ...meta } = local;
      void _q;
      return meta;
    }

    const client = getContentClient();
    if (!client) {
      const local = getPaperById(paperId);
      if (!local) return undefined;
      const { questions: _q, ...meta } = local;
      void _q;
      return meta;
    }

    try {
      const { data, error } = await client
        .from('exam_papers')
        .select(`
          *,
          exam_sections (
            id, paper_id, section_order, name, section_key,
            question_count, max_marks, start_index, end_index
          )
        `)
        .eq('id', paperId)
        .maybeSingle();

      if (error || !data) {
        const local = getPaperById(paperId);
        if (!local) return undefined;
        const { questions: _q, ...meta } = local;
        void _q;
        return meta;
      }

      return mapRowToPaper(data as RemotePaperRow, data.exam_id);
    } catch (err) {
      console.warn('[paperRepository] getPaperMeta fallback:', err);
      const local = getPaperById(paperId);
      if (!local) return undefined;
      const { questions: _q, ...meta } = local;
      void _q;
      return meta;
    }
  },
};
