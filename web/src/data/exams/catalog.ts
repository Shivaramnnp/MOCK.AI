import { CompetitiveExam, ExamPaper } from '../../types';

export const COMPETITIVE_EXAMS_CATALOG: CompetitiveExam[] = [
  {
    id: 'ssc-chsl',
    name: 'SSC CHSL',
    fullName: 'Combined Higher Secondary (10+2) Level Examination',
    organization: 'Staff Selection Commission (SSC)',
    category: 'SSC / Government',
    description: 'Premier national competitive examination for recruitment to Lower Division Clerk (LDC), Junior Secretariat Assistant (JSA), and Data Entry Operator (DEO) positions.',
    status: 'AVAILABLE',
    availableYears: [2025, 2024, 2023, 2022, 2021, 2020, 2019],
    paperCount: 204,
    tier: 'Tier 1 & Tier 2',
    defaultPattern: {
      durationMinutes: 60,
      totalQuestions: 100,
      totalMarks: 200,
      markingScheme: {
        marksPerCorrect: 2.0,
        negativeMarks: 0.5,
        unansweredMarks: 0.0,
      },
      sections: [
        'English Language',
        'General Intelligence & Reasoning',
        'Quantitative Aptitude',
        'General Awareness',
      ],
    },
    highlights: [
      'Official 2019 to 2025 Tier 1 (196 Papers) & Tier 2 (8 Papers)',
      'Accurate +2/-0.5 (Tier 1) & +3/-1 (Tier 2) Scoring Engines',
      'Dedicated Tier 2 Descriptive Exam Simulation (Essay & Letter Writing)',
      'Complete Diagrams, Graphs, and Visual Option Choice Figures',
    ],
  },
  {
    id: 'ssc-cgl',
    name: 'SSC CGL',
    fullName: 'Combined Graduate Level Examination',
    organization: 'Staff Selection Commission (SSC)',
    category: 'SSC / Government',
    description: 'National level exam for recruitment into Group B and Group C Gazetted and Non-Gazetted positions in Ministries and Departments of the Government of India.',
    status: 'COMING_SOON',
    availableYears: [2025, 2024],
    paperCount: 0,
    tier: 'Tier 1 & Tier 2',
    defaultPattern: {
      durationMinutes: 60,
      totalQuestions: 100,
      totalMarks: 200,
      markingScheme: {
        marksPerCorrect: 2.0,
        negativeMarks: 0.5,
        unansweredMarks: 0.0,
      },
      sections: [
        'General Intelligence & Reasoning',
        'General Awareness',
        'Quantitative Aptitude',
        'English Comprehension',
      ],
    },
  },
  {
    id: 'gate',
    name: 'GATE',
    fullName: 'Graduate Aptitude Test in Engineering',
    organization: 'IISc & IITs (Joint Committee)',
    category: 'Engineering',
    description: 'High-stakes examination for admission to postgraduate engineering/technology programs (M.Tech/Ph.D.) and recruitment in premier Public Sector Undertakings (PSUs).',
    status: 'AVAILABLE',
    availableYears: [2025, 2024],
    paperCount: 76,
    tier: 'Single Stage',
    defaultPattern: {
      durationMinutes: 180,
      totalQuestions: 65,
      totalMarks: 100,
      markingScheme: {
        marksPerCorrect: 1.0, // 1 or 2 marks depending on question
        negativeMarks: 0.33,
        unansweredMarks: 0.0,
      },
      sections: [
        'General Aptitude',
        'Engineering Mathematics',
        'Core Technical Subject',
      ],
    },
    highlights: [
      '76 Official Papers across 2025 (IIT Roorkee) & 2024 (IISc Bangalore)',
      'Full Fidelity MCQ, MSQ (Multiple Select) & NAT (Numerical Answer Type)',
      'High-Resolution Vector Circuit Schematics, Diagrams & Mathematical Formulations',
      'Official Master Answer Keys, Multi-Session Separation & Range-Tolerance Verification',
    ],
  },
  {
    id: 'upsc-cse',
    name: 'UPSC CSE',
    fullName: 'Civil Services Examination',
    organization: 'Union Public Service Commission (UPSC)',
    category: 'Civil Services',
    description: 'India’s premier civil service recruitment exam for administrative positions including IAS, IPS, IFS, and Central Group A & B services.',
    status: 'COMING_SOON',
    availableYears: [2025, 2024],
    paperCount: 0,
    tier: 'Prelims (GS-1 & CSAT)',
    defaultPattern: {
      durationMinutes: 120,
      totalQuestions: 100,
      totalMarks: 200,
      markingScheme: {
        marksPerCorrect: 2.0,
        negativeMarks: 0.66,
        unansweredMarks: 0.0,
      },
      sections: [
        'History & Art & Culture',
        'Polity & Governance',
        'Economy & Social Development',
        'Environment & Ecology',
        'General Science & Tech',
        'Current Affairs',
      ],
    },
  },
  {
    id: 'ssc-mts',
    name: 'SSC MTS',
    fullName: 'Multi-Tasking (Non-Technical) Staff Examination',
    organization: 'Staff Selection Commission (SSC)',
    category: 'SSC / Government',
    description: 'Entry-level competitive examination for various central government ministries and constitutional offices across India.',
    status: 'COMING_SOON',
    availableYears: [2025],
    paperCount: 0,
    tier: 'Session 1 & Session 2',
    defaultPattern: {
      durationMinutes: 90,
      totalQuestions: 90,
      totalMarks: 270,
      markingScheme: {
        marksPerCorrect: 3.0,
        negativeMarks: 1.0,
        unansweredMarks: 0.0,
      },
      sections: [
        'Numerical & Mathematical Ability',
        'Reasoning Ability & Problem Solving',
        'General Awareness',
        'English Language & Comprehension',
      ],
    },
  },
  {
    id: 'rrb-ntpc',
    name: 'RRB NTPC',
    fullName: 'Non-Technical Popular Categories Examination',
    organization: 'Railway Recruitment Boards (Ministry of Railways)',
    category: 'Railways',
    description: 'Recruitment for commercial apprentices, station masters, goods guards, and traffic assistants across Indian Railways zones.',
    status: 'COMING_SOON',
    availableYears: [2025],
    paperCount: 0,
    tier: 'CBT-1',
    defaultPattern: {
      durationMinutes: 90,
      totalQuestions: 100,
      totalMarks: 100,
      markingScheme: {
        marksPerCorrect: 1.0,
        negativeMarks: 0.33,
        unansweredMarks: 0.0,
      },
      sections: [
        'General Awareness',
        'Mathematics',
        'General Intelligence & Reasoning',
      ],
    },
  },
  {
    id: 'banking-po',
    name: 'Banking (IBPS & SBI PO)',
    fullName: 'Probationary Officers / Management Trainees',
    organization: 'IBPS / State Bank of India',
    category: 'Banking',
    description: 'Nationwide recruitment for officer scale vacancies in public sector commercial banks across India.',
    status: 'COMING_SOON',
    availableYears: [2025],
    paperCount: 0,
    tier: 'Prelims',
    defaultPattern: {
      durationMinutes: 60,
      totalQuestions: 100,
      totalMarks: 100,
      markingScheme: {
        marksPerCorrect: 1.0,
        negativeMarks: 0.25,
        unansweredMarks: 0.0,
      },
      sections: [
        'English Language',
        'Quantitative Aptitude',
        'Reasoning Ability',
      ],
    },
  },
  {
    id: 'ecet',
    name: 'TS / AP ECET',
    fullName: 'Engineering Common Entrance Test (Diploma Holders)',
    organization: 'State Councils of Higher Education (TS & AP)',
    category: 'State Entrance',
    description: 'Lateral entry entrance examination for Diploma holders seeking direct admission into 2nd year B.Tech / B.E. degree programs.',
    status: 'COMING_SOON',
    availableYears: [2025],
    paperCount: 0,
    tier: 'Single Stage',
    defaultPattern: {
      durationMinutes: 180,
      totalQuestions: 200,
      totalMarks: 200,
      markingScheme: {
        marksPerCorrect: 1.0,
        negativeMarks: 0.0,
        unansweredMarks: 0.0,
      },
      sections: [
        'Mathematics',
        'Physics',
        'Chemistry',
        'Core Engineering Branch',
      ],
    },
  },
];

// Map of supported papers by paperId (automatically imports all SSC CHSL and GATE papers)
const paperModules = import.meta.glob<{ default: ExamPaper }>(['./ssc-chsl-*.json', './gate-*.json'], { eager: true });

export const EXAM_PAPERS_MAP: Record<string, ExamPaper> = {};

for (const module of Object.values(paperModules)) {
  const paper = (module.default || module) as unknown as ExamPaper;
  if (paper && paper.id) {
    EXAM_PAPERS_MAP[paper.id] = paper;
  }
}

// Return all papers for a specific exam
export function getPapersForExam(examId: string): ExamPaper[] {
  return Object.values(EXAM_PAPERS_MAP).filter((p) => p.examId === examId);
}

// Return a specific paper by its unique deterministic ID
export function getPaperById(paperId: string): ExamPaper | undefined {
  return EXAM_PAPERS_MAP[paperId];
}
