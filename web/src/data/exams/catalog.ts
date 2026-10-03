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
    syllabus: {
      officialNoticeRef: 'SSC CHSL Official Examination Notice',
      sections: [
        {
          title: 'English Language',
          description: 'Tests candidate comprehension and fundamental command over English language.',
          topics: [
            {
              name: 'Grammar & Usage',
              subtopics: [
                'Spot the Error',
                'Fill in the Blanks',
                'Sentence Improvement',
                'Active/Passive Voice of Verbs',
                'Direct / Indirect Narration conversion',
              ],
            },
            {
              name: 'Vocabulary',
              subtopics: [
                'Synonyms & Homonyms',
                'Antonyms',
                'Spellings / Detecting misspelled words',
                'Idioms & Phrases',
                'One Word Substitution',
              ],
            },
            {
              name: 'Reading & Sentence Arrangement',
              subtopics: [
                'Shuffling of Sentence parts',
                'Shuffling of Sentences in a passage',
                'Cloze Passage',
                'Comprehension Passage',
              ],
            },
          ],
        },
        {
          title: 'General Intelligence & Reasoning',
          description: 'Both verbal and non-verbal reasoning, visual spatial skills, and logical deduction.',
          topics: [
            {
              name: 'Analogies & Classification',
              subtopics: [
                'Semantic Analogy',
                'Symbolic & Number Analogy',
                'Figural Analogy',
                'Semantic Classification',
                'Symbolic & Number Classification',
                'Figural Classification',
              ],
            },
            {
              name: 'Series & Coding',
              subtopics: [
                'Semantic Series',
                'Number Series',
                'Figural Series',
                'Coding and De-coding',
                'Numerical & Symbolic Operations',
              ],
            },
            {
              name: 'Spatial & Logical Reasoning',
              subtopics: [
                'Space Orientation & Visualization',
                'Venn Diagrams',
                'Drawing Inferences',
                'Punched hole / pattern-folding & unfolding',
                'Figural Pattern folding and completion',
                'Critical Thinking & Problem Solving',
              ],
            },
          ],
        },
        {
          title: 'Quantitative Aptitude',
          description: 'Mathematical concepts, computational efficiency, and geometric/statistical awareness.',
          topics: [
            {
              name: 'Number Systems & Arithmetic',
              subtopics: [
                'Computation of Whole Numbers, Decimals & Fractions',
                'Percentages, Ratio & Proportion, Square Roots',
                'Averages, Simple & Compound Interest',
                'Profit & Loss, Discount, Partnership Business',
                'Mixture and Alligation, Time & Distance, Time & Work',
              ],
            },
            {
              name: 'Algebra',
              subtopics: [
                'Basic algebraic identities of School Algebra',
                'Elementary Surds & Factorization',
                'Graphs of Linear Equations',
              ],
            },
            {
              name: 'Geometry & Mensuration',
              subtopics: [
                'Triangles and centres of congruence/similarity',
                'Circles, chords, tangents, and angles',
                'Quadrilaterals & Regular Polygons',
                'Right Prism, Cone, Cylinder, Sphere, Hemispheres',
              ],
            },
            {
              name: 'Trigonometry & Statistics',
              subtopics: [
                'Trigonometric ratios & Standard Identities',
                'Heights and Distances',
                'Histograms, Frequency Polygons, Bar Diagrams & Pie Charts',
              ],
            },
          ],
        },
        {
          title: 'General Awareness',
          description: 'Environment around the candidate, scientific observation, and national heritage.',
          topics: [
            {
              name: 'Static General Knowledge',
              subtopics: [
                'History and Indian Freedom Struggle',
                'Culture and Heritage',
                'Physical & Political Geography',
                'Economic Scene & Policies',
                'Indian Polity & Constitution',
              ],
            },
            {
              name: 'Current Affairs & Science',
              subtopics: [
                'National & International Events',
                'Scientific Research & Technology',
                'India and its Neighboring Countries',
                'Environmental Awareness & Sports',
              ],
            },
          ],
        },
      ],
    },
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
    syllabus: {
      officialNoticeRef: 'GATE Official Information Brochure (IISc / IITs)',
      sections: [
        {
          title: 'General Aptitude (GA)',
          description: 'Common to all GATE papers (15 Marks total: 5 x 1-mark and 5 x 2-mark questions).',
          topics: [
            {
              name: 'Verbal Aptitude',
              subtopics: [
                'Basic English Grammar: tenses, articles, prepositions, concord',
                'Vocabulary: words, idioms and phrases in context',
                'Reading Comprehension and narrative sequencing',
              ],
            },
            {
              name: 'Quantitative Aptitude',
              subtopics: [
                'Data Interpretation: data graphs, charts, tables',
                'Numerical Computation and Estimation: ratios, percentages, powers, logarithms',
                'Permutations, Combinations & Elementary Probability',
              ],
            },
            {
              name: 'Analytical & Spatial Aptitude',
              subtopics: [
                'Logic: deduction, induction, analogy, numerical reasoning',
                'Spatial Aptitude: transformation of shapes, paper folding and cutting, patterns in 2D and 3D',
              ],
            },
          ],
        },
        {
          title: 'Engineering Mathematics',
          description: 'Fundamental mathematical formulations for engineering analysis and algorithm rigor.',
          topics: [
            {
              name: 'Discrete Mathematics',
              subtopics: [
                'Propositional and First-Order Logic',
                'Sets, Relations, Functions, Partial Orders and Lattices',
                'Monoids, Groups, Graphs: connectivity, matching, coloring',
                'Combinatorics: counting, recurrence relations, generating functions',
              ],
            },
            {
              name: 'Linear Algebra & Calculus',
              subtopics: [
                'Matrices, Determinants, Systems of Linear Equations',
                'Eigenvalues, Eigenvectors, LU Decomposition',
                'Limits, Continuity and Differentiability, Maxima and Minima',
                'Mean Value Theorem, Integration, Vector Calculus',
              ],
            },
            {
              name: 'Probability and Statistics',
              subtopics: [
                'Random Variables, Uniform, Normal, Exponential, Poisson distributions',
                'Mean, Median, Mode, Standard Deviation, Conditional Probability, Bayes Theorem',
              ],
            },
          ],
        },
        {
          title: 'Core Technical Subjects (CS & Engineering)',
          description: 'Discipline-specific subject modules evaluated through MCQ, MSQ, and NAT questions.',
          topics: [
            {
              name: 'Digital Logic & Computer Architecture',
              subtopics: [
                'Boolean Algebra, Combinational & Sequential Circuits, Minimization',
                'Machine Instructions & Addressing Modes, ALU, Data-Path & Control Unit',
                'Instruction Pipelining & Hazards, Memory Hierarchy, Cache & I/O Interface',
              ],
            },
            {
              name: 'Programming, Data Structures & Algorithms',
              subtopics: [
                'Programming in C, Recursion, Arrays, Stacks, Queues, Linked Lists, Trees, Heaps, Graphs',
                'Searching, Sorting, Hashing, Asymptotic Analysis (Worst, Average, Best Case)',
                'Greedy Algorithms, Dynamic Programming, Divide-and-Conquer, Graph Algorithms',
              ],
            },
            {
              name: 'Theory of Computation & Compiler Design',
              subtopics: [
                'Regular Expressions, Finite Automata, Context-Free Grammars, Push-Down Automata',
                'Pumping Lemma, Turing Machines, Undecidability',
                'Lexical Analysis, Parsing, Syntax-Directed Translation, Runtime Environments',
              ],
            },
            {
              name: 'Operating Systems & Databases',
              subtopics: [
                'Processes, Threads, IPC, Concurrency, Synchronization, Deadlocks, CPU Scheduling',
                'Memory Management, Virtual Memory, File Systems, Disk Scheduling',
                'ER-Model, Relational Model, Relational Algebra, SQL, Normal Forms, Transactions & ACID',
              ],
            },
            {
              name: 'Computer Networks',
              subtopics: [
                'OSI and TCP/IP Layering, Framing, Error Detection & Correction',
                'Routing Algorithms, IP Addressing, IPv4/IPv6, CIDR, Subnetting',
                'TCP/UDP, Flow Control, Congestion Control, Sockets, HTTP, DNS, SMTP',
              ],
            },
          ],
        },
      ],
    },
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
    syllabus: {
      officialNoticeRef: 'UPSC CSE Official Notification',
      sections: [
        {
          title: 'Paper I — General Studies (Prelims)',
          description: '100 Objective Multiple Choice Questions carrying 200 marks (2 hours duration).',
          topics: [
            {
              name: 'History of India & Indian National Movement',
              subtopics: [
                'Ancient, Medieval, and Modern Indian History',
                'Indian National Movement, Freedom Fighters & Constitutional milestones',
                'Indian Art, Literature, Architecture & Cultural heritage',
              ],
            },
            {
              name: 'Indian & World Geography',
              subtopics: [
                'Physical Geography: geomorphology, climatology, oceanography',
                'Social Geography: demographics, urbanization, migration patterns',
                'Economic Geography: natural resources, agriculture, industrial locations',
              ],
            },
            {
              name: 'Indian Polity & Governance',
              subtopics: [
                'Constitution of India, Preamble, Fundamental Rights & Duties',
                'Parliament, Union & State Executive, Judiciary & Constitutional bodies',
                'Panchayati Raj, Public Policy, Governance, and Rights issues',
              ],
            },
            {
              name: 'Economic & Social Development',
              subtopics: [
                'Sustainable Development, Poverty alleviation, Demographics, Inclusion',
                'Macroeconomic indicators, Fiscal & Monetary policies, Banking sector',
                'Social sector initiatives, government welfare programs',
              ],
            },
            {
              name: 'Environment, Ecology & General Science',
              subtopics: [
                'Biodiversity, Conservation, Climate Change & International Treaties',
                'Space technology, Biotechnology, IT & AI advancements',
                'Everyday science and health awareness',
              ],
            },
          ],
        },
        {
          title: 'Paper II — CSAT (Aptitude Test)',
          description: '80 Objective Multiple Choice Questions carrying 200 marks (Qualifying minimum 33%).',
          topics: [
            {
              name: 'Comprehension & Interpersonal Skills',
              subtopics: [
                'Reading Comprehension & Critical inference',
                'Interpersonal skills including communication',
              ],
            },
            {
              name: 'Reasoning & Mental Ability',
              subtopics: [
                'Logical reasoning and analytical ability',
                'Decision making and problem solving',
                'General mental ability',
              ],
            },
            {
              name: 'Basic Numeracy & Data Interpretation',
              subtopics: [
                'Numbers and their relations, orders of magnitude (Class X level)',
                'Data Interpretation: charts, graphs, tables, data sufficiency (Class X level)',
              ],
            },
          ],
        },
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

// Dynamically register an ExamPaper / MockPaper into the runtime catalog
export function registerExamPaper(paper: ExamPaper): void {
  if (paper && paper.id) {
    EXAM_PAPERS_MAP[paper.id] = paper;
  }
}

