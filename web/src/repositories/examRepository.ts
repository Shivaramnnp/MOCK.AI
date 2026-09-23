/**
 * Exam Repository — Project 2
 *
 * Fetches the exam catalog (competitive_exams table) from Supabase Project 2.
 * Falls back to local catalog.ts data when Project 2 is unavailable.
 */

import { CompetitiveExam } from '../types';
import { getContentClient, isContentBackendAvailable } from '../lib/supabaseContent';
import { COMPETITIVE_EXAMS_CATALOG } from '../data/exams/catalog';

export interface RemoteExamRow {
  id: string;
  name: string;
  full_name: string;
  organization: string;
  category: string;
  description: string;
  status: 'AVAILABLE' | 'COMING_SOON';
  available_years: number[];
  paper_count: number;
  tier: string | null;
  default_pattern: Record<string, unknown>;
  highlights: string[];
}

function mapRowToExam(row: RemoteExamRow): CompetitiveExam {
  const pattern = row.default_pattern as {
    durationMinutes?: number;
    totalQuestions?: number;
    totalMarks?: number;
    markingScheme?: { marksPerCorrect: number; negativeMarks: number; unansweredMarks?: number };
    sections?: string[];
  };
  return {
    id: row.id,
    name: row.name,
    fullName: row.full_name,
    organization: row.organization,
    category: row.category,
    description: row.description,
    status: row.status,
    availableYears: row.available_years ?? [],
    paperCount: row.paper_count ?? 0,
    tier: row.tier ?? undefined,
    defaultPattern: {
      durationMinutes: pattern.durationMinutes ?? 60,
      totalQuestions: pattern.totalQuestions ?? 100,
      totalMarks: pattern.totalMarks ?? 200,
      markingScheme: pattern.markingScheme ?? { marksPerCorrect: 1, negativeMarks: 0 },
      sections: pattern.sections ?? [],
    },
    highlights: row.highlights ?? [],
  };
}

export const examRepository = {
  /**
   * Get all exams from Project 2, falling back to local catalog.
   */
  async getExams(): Promise<CompetitiveExam[]> {
    if (!isContentBackendAvailable()) {
      return COMPETITIVE_EXAMS_CATALOG;
    }

    const client = getContentClient();
    if (!client) return COMPETITIVE_EXAMS_CATALOG;

    try {
      const { data, error } = await client
        .from('competitive_exams')
        .select('*')
        .order('name');

      if (error || !data || data.length === 0) {
        console.warn('[examRepository] Falling back to local catalog:', error?.message);
        return COMPETITIVE_EXAMS_CATALOG;
      }

      return (data as RemoteExamRow[]).map(mapRowToExam);
    } catch (err) {
      console.warn('[examRepository] Remote fetch failed, using local:', err);
      return COMPETITIVE_EXAMS_CATALOG;
    }
  },

  /**
   * Get a single exam by ID.
   */
  async getExamById(examId: string): Promise<CompetitiveExam | undefined> {
    if (!isContentBackendAvailable()) {
      return COMPETITIVE_EXAMS_CATALOG.find((e) => e.id === examId);
    }

    const client = getContentClient();
    if (!client) return COMPETITIVE_EXAMS_CATALOG.find((e) => e.id === examId);

    try {
      const { data, error } = await client
        .from('competitive_exams')
        .select('*')
        .eq('id', examId)
        .maybeSingle();

      if (error || !data) {
        return COMPETITIVE_EXAMS_CATALOG.find((e) => e.id === examId);
      }

      return mapRowToExam(data as RemoteExamRow);
    } catch (err) {
      console.warn('[examRepository] getExamById fallback:', err);
      return COMPETITIVE_EXAMS_CATALOG.find((e) => e.id === examId);
    }
  },
};
