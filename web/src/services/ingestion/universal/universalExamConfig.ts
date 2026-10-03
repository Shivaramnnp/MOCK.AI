import { QuestionType } from '../../../types/canonicalQuestion';

export interface ExamScoringRule {
  marks: number;
  negativeMarks: number;
  partialMarking?: boolean;
  scoringRuleName: string;
}

export interface ExamScoringConfig {
  examId: string;
  paperId?: string;
  scoringStatus: 'CONFIGURED' | 'UNCONFIGURED';
  defaultMarks: number;
  defaultNegativeMarks: number;
  typeRules: Partial<Record<QuestionType, ExamScoringRule[]>>;
  sectionRules?: Record<string, Partial<Record<QuestionType, ExamScoringRule>>>;
}

export interface ExamDefinition {
  id: string; // e.g. 'gate', 'ssc-chsl', 'upsc-cse', 'rrb-ntpc', 'ibps-po', 'custom'
  name: string; // e.g. 'GATE', 'SSC CHSL', 'UPSC CSE', 'Custom Coaching Mock'
  category: 'ENGINEERING' | 'GOVERNMENT' | 'CIVIL_SERVICES' | 'BANKING' | 'ACADEMIC' | 'CUSTOM';
  supportedQuestionTypes: QuestionType[];
  defaultDurationMinutes: number;
  defaultTotalQuestions?: number;
  defaultTotalMarks?: number;
  scoringConfig: ExamScoringConfig;
  paperCodeMap?: Record<string, string>;
  headerPatterns: RegExp[];
}

/**
 * Universal Registry of Exam Definitions and Scoring Configurations.
 * Core engine is 100% exam-agnostic; all exam-specific rules live here.
 */
class UniversalExamRegistry {
  private registry: Map<string, ExamDefinition> = new Map();

  constructor() {
    this.registerDefaults();
  }

  register(def: ExamDefinition) {
    this.registry.set(def.id.toLowerCase(), def);
  }

  get(examId: string): ExamDefinition | undefined {
    return this.registry.get(examId.toLowerCase());
  }

  getAll(): ExamDefinition[] {
    return Array.from(this.registry.values());
  }

  /**
   * Resolves appropriate scoring rule for a given question type and section.
   */
  resolveScoring(
    examId: string,
    questionType: QuestionType,
    marksHint?: number,
    sectionId?: string
  ): ExamScoringRule {
    const def = this.get(examId) || this.get('custom')!;
    const cfg = def.scoringConfig;

    // Check section-specific override
    if (sectionId && cfg.sectionRules?.[sectionId]?.[questionType]) {
      return cfg.sectionRules[sectionId]![questionType]!;
    }

    // Check question-type rules
    const rules = cfg.typeRules[questionType];
    if (rules && rules.length > 0) {
      if (marksHint !== undefined) {
        const matched = rules.find((r) => r.marks === marksHint);
        if (matched) return matched;
      }
      return rules[0];
    }

    // Fallback to exam defaults
    return {
      marks: marksHint || cfg.defaultMarks,
      negativeMarks: cfg.defaultNegativeMarks,
      scoringRuleName: `${def.name.toUpperCase()}_STANDARD`,
    };
  }

  private registerDefaults() {
    // 1. GATE Exam Definition
    this.register({
      id: 'gate',
      name: 'GATE',
      category: 'ENGINEERING',
      supportedQuestionTypes: ['MCQ', 'MSQ', 'NAT'],
      defaultDurationMinutes: 180,
      defaultTotalQuestions: 65,
      defaultTotalMarks: 100,
      headerPatterns: [/\bGATE\b/i, /\bGraduate Aptitude Test in Engineering\b/i],
      paperCodeMap: {
        DA: 'Data Science & Artificial Intelligence',
        CS: 'Computer Science & Information Technology',
        EC: 'Electronics & Communication Engineering',
        EE: 'Electrical Engineering',
        ME: 'Mechanical Engineering',
        CE: 'Civil Engineering',
        IN: 'Instrumentation Engineering',
        CH: 'Chemical Engineering',
        BT: 'Biotechnology',
      },
      scoringConfig: {
        examId: 'gate',
        scoringStatus: 'CONFIGURED',
        defaultMarks: 1,
        defaultNegativeMarks: 0.33,
        typeRules: {
          MCQ: [
            { marks: 1, negativeMarks: 0.33, scoringRuleName: 'GATE_MCQ_1' },
            { marks: 2, negativeMarks: 0.66, scoringRuleName: 'GATE_MCQ_2' },
          ],
          MSQ: [
            { marks: 1, negativeMarks: 0.0, scoringRuleName: 'GATE_MSQ' },
            { marks: 2, negativeMarks: 0.0, scoringRuleName: 'GATE_MSQ' },
          ],
          NAT: [
            { marks: 1, negativeMarks: 0.0, scoringRuleName: 'GATE_NAT' },
            { marks: 2, negativeMarks: 0.0, scoringRuleName: 'GATE_NAT' },
          ],
        },
      },
    });

    // 2. SSC CHSL / CGL Exam Definition
    this.register({
      id: 'ssc',
      name: 'SSC',
      category: 'GOVERNMENT',
      supportedQuestionTypes: ['MCQ'],
      defaultDurationMinutes: 60,
      defaultTotalQuestions: 100,
      defaultTotalMarks: 200,
      headerPatterns: [/\bSSC\b/i, /\bStaff Selection Commission\b/i, /\bCHSL\b/i, /\bCGL\b/i],
      scoringConfig: {
        examId: 'ssc',
        scoringStatus: 'CONFIGURED',
        defaultMarks: 2,
        defaultNegativeMarks: 0.5,
        typeRules: {
          MCQ: [{ marks: 2, negativeMarks: 0.5, scoringRuleName: 'SSC_TIER1_MCQ' }],
        },
      },
    });

    // 3. UPSC Civil Services Prelims
    this.register({
      id: 'upsc',
      name: 'UPSC',
      category: 'CIVIL_SERVICES',
      supportedQuestionTypes: ['MCQ', 'DESCRIPTIVE', 'MATCHING', 'ASSERTION_REASON'],
      defaultDurationMinutes: 120,
      defaultTotalQuestions: 100,
      defaultTotalMarks: 200,
      headerPatterns: [/\bUPSC\b/i, /\bUnion Public Service Commission\b/i, /\bCivil Services\b/i],
      scoringConfig: {
        examId: 'upsc',
        scoringStatus: 'CONFIGURED',
        defaultMarks: 2,
        defaultNegativeMarks: 0.66,
        typeRules: {
          MCQ: [{ marks: 2, negativeMarks: 0.66, scoringRuleName: 'UPSC_PRELIMS_MCQ' }],
        },
      },
    });

    // 4. RRB Railways Recruitment
    this.register({
      id: 'rrb',
      name: 'RRB',
      category: 'GOVERNMENT',
      supportedQuestionTypes: ['MCQ'],
      defaultDurationMinutes: 90,
      defaultTotalQuestions: 100,
      defaultTotalMarks: 100,
      headerPatterns: [/\bRRB\b/i, /\bRailway Recruitment Board\b/i, /\bNTPC\b/i],
      scoringConfig: {
        examId: 'rrb',
        scoringStatus: 'CONFIGURED',
        defaultMarks: 1,
        defaultNegativeMarks: 0.33,
        typeRules: {
          MCQ: [{ marks: 1, negativeMarks: 0.33, scoringRuleName: 'RRB_STANDARD' }],
        },
      },
    });

    // 5. IBPS / Banking
    this.register({
      id: 'ibps',
      name: 'IBPS',
      category: 'BANKING',
      supportedQuestionTypes: ['MCQ'],
      defaultDurationMinutes: 60,
      defaultTotalQuestions: 100,
      defaultTotalMarks: 100,
      headerPatterns: [/\bIBPS\b/i, /\bSBI\s*PO\b/i, /\bInstitute of Banking Personnel Selection\b/i],
      scoringConfig: {
        examId: 'ibps',
        scoringStatus: 'CONFIGURED',
        defaultMarks: 1,
        defaultNegativeMarks: 0.25,
        typeRules: {
          MCQ: [{ marks: 1, negativeMarks: 0.25, scoringRuleName: 'BANKING_STANDARD' }],
        },
      },
    });

    // 6. University / College Academic Paper
    this.register({
      id: 'academic',
      name: 'Academic / University',
      category: 'ACADEMIC',
      supportedQuestionTypes: ['MCQ', 'DESCRIPTIVE', 'SUBJECTIVE', 'TRUE_FALSE', 'NAT'],
      defaultDurationMinutes: 180,
      headerPatterns: [/\bUniversity\b/i, /\bCollege\b/i, /\bSemester\b/i, /\bMidterm\b/i, /\bExamination\s*20\d\d\b/i],
      scoringConfig: {
        examId: 'academic',
        scoringStatus: 'CONFIGURED',
        defaultMarks: 5,
        defaultNegativeMarks: 0.0, // Academic papers typically have zero negative marks
        typeRules: {
          MCQ: [{ marks: 1, negativeMarks: 0.0, scoringRuleName: 'ACADEMIC_MCQ' }],
          DESCRIPTIVE: [{ marks: 5, negativeMarks: 0.0, scoringRuleName: 'ACADEMIC_DESCRIPTIVE' }],
          SUBJECTIVE: [{ marks: 10, negativeMarks: 0.0, scoringRuleName: 'ACADEMIC_LONG_ANSWER' }],
          TRUE_FALSE: [{ marks: 1, negativeMarks: 0.0, scoringRuleName: 'ACADEMIC_TF' }],
        },
      },
    });

    // 7. Custom Coaching Institute / Practice Paper
    this.register({
      id: 'custom',
      name: 'Custom Practice Paper',
      category: 'CUSTOM',
      supportedQuestionTypes: ['MCQ', 'MSQ', 'NAT', 'TRUE_FALSE', 'DESCRIPTIVE', 'MATCHING'],
      defaultDurationMinutes: 60,
      headerPatterns: [/\bMock\s*Test\b/i, /\bPractice\s*Paper\b/i, /\bSample\s*Paper\b/i],
      scoringConfig: {
        examId: 'custom',
        scoringStatus: 'UNCONFIGURED',
        defaultMarks: 1,
        defaultNegativeMarks: 0.0,
        typeRules: {
          MCQ: [{ marks: 1, negativeMarks: 0.0, scoringRuleName: 'CUSTOM_MCQ' }],
          MSQ: [{ marks: 1, negativeMarks: 0.0, scoringRuleName: 'CUSTOM_MSQ' }],
          NAT: [{ marks: 1, negativeMarks: 0.0, scoringRuleName: 'CUSTOM_NAT' }],
        },
      },
    });
  }
}

export const universalExamRegistry = new UniversalExamRegistry();

/**
 * Parses instructions from document text lines to infer paper configuration.
 */
export function extractPaperInstructions(lines: string[]): {
  instructions: string[];
  totalMarks?: number;
  detectedMarks?: number;
  detectedNegativeMarks?: number;
  negativeMarkingFraction?: number;
  durationMinutes?: number;
} {
  const instructions: string[] = [];
  let detectedMarks: number | undefined;
  let detectedNegativeMarks: number | undefined;
  let durationMinutes: number | undefined;

  for (const line of lines.slice(0, 50)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Time limit: e.g. "Time Allowed: 3 Hours (180 Minutes)", "Duration: 60 Minutes"
    const timeMatch = trimmed.match(/(?:Time(?:\s*Allowed)?|Duration)\s*[:\-]?\s*(\d+)\s*(Hours?|Mins?|Minutes?)/i);
    if (timeMatch) {
      const val = parseInt(timeMatch[1], 10);
      const unit = timeMatch[2].toLowerCase();
      durationMinutes = unit.startsWith('hour') ? val * 60 : val;
      instructions.push(trimmed);
      continue;
    }

    // Total marks: e.g. "Total Marks: 100", "Maximum Marks: 100"
    const marksMatch = trimmed.match(/(?:Total\s*Marks?|Maximum\s*Marks?|Max\s*Marks?)\s*[:=\-]?\s*(\d+)/i);
    if (marksMatch) {
      detectedMarks = parseInt(marksMatch[1], 10);
      instructions.push(trimmed);
      continue;
    }

    // Negative marking: e.g. "Negative marking of 0.25 for every incorrect response", "1/3 marks deducted", "1/3 mark will be deducted"
    const negMatch =
      trimmed.match(/([0-9]+(?:\/[0-9]+|\.[0-9]+)?)\s*mark(?:s)?\s*(?:will\s*be\s*)?deducted/i) ||
      trimmed.match(/(?:negative\s*marking|deduct(?:ed|ion)?|penalty)\s*(?:of|is|:)?\s*([0-9]+(?:\/[0-9]+|\.[0-9]+)?)/i);
    if (negMatch) {
      const raw = negMatch[1];
      if (raw.includes('/')) {
        const [num, den] = raw.split('/').map(Number);
        if (den) detectedNegativeMarks = num / den;
      } else {
        detectedNegativeMarks = parseFloat(raw);
      }
      instructions.push(trimmed);
      continue;
    }

    // General instruction lines
    if (/^(?:Instructions?|Note|General Instructions|Notice|Read carefully)[\s:\-]/i.test(trimmed)) {
      instructions.push(trimmed);
    }
  }

  return {
    instructions,
    totalMarks: detectedMarks,
    detectedMarks,
    detectedNegativeMarks,
    negativeMarkingFraction: detectedNegativeMarks,
    durationMinutes,
  };
}
