import {
  TestHistory,
  UserProfile,
  StudyStreak,
  DailyTask,
  DailyInsight,
  ClassModel,
  AssignmentModel,
  PublishedExam,
  UserRole,
  Question,
} from '../types';

const STORAGE_KEYS = {
  TESTS: 'mockai_tests',
  PROFILE: 'mockai_profile',
  STREAK: 'mockai_streak',
  TASKS: 'mockai_tasks',
  INSIGHT: 'mockai_insight',
  CLASSES: 'mockai_classes',
  ASSIGNMENTS: 'mockai_assignments',
  MARKETPLACE: 'mockai_marketplace',
  SETTINGS: 'mockai_settings',
};

export interface AppSettings {
  theme: 'dark' | 'light';
  timerSeconds: number;
  shuffleQuestions: boolean;
  questionsPerTest: number;
  geminiApiKey: string;
  groqApiKey: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  timerSeconds: 60, // default seconds per question
  shuffleQuestions: false,
  questionsPerTest: 0, // 0 = all
  geminiApiKey:
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) || '',
  groqApiKey:
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GROQ_API_KEY) || '',
};

const SEED_TESTS: TestHistory[] = [
  {
    id: 'seed-physics-01',
    title: 'Kinematics & Newtonian Mechanics',
    category: 'Physics',
    createdAt: Date.now() - 86400000 * 2,
    lastTakenAt: Date.now() - 86400000,
    bestScore: 4,
    bestScorePercent: 80,
    bestTotal: 5,
    lastTimeSpentSeconds: 145,
    wrongCount: 1,
    questions: [
      {
        questionText: 'An object is thrown vertically upwards with initial velocity $v_0$. What is the maximum height $H$ reached in terms of gravitational acceleration $g$?',
        options: [
          '$H = \\frac{v_0^2}{2g}$',
          '$H = \\frac{v_0}{g}$',
          '$H = \\frac{2v_0^2}{g}$',
          '$H = \\frac{v_0^2}{g}$',
        ],
        correctAnswerIndex: 0,
        topic: 'Kinematics',
        explanation: 'Using the third equation of motion $v^2 = u^2 - 2gH$, at peak height $v = 0$, giving $0 = v_0^2 - 2gH \\implies H = \\frac{v_0^2}{2g}$.',
        verificationStatus: 'VERIFIED',
        trustScore: 0.98,
      },
      {
        questionText: 'A particle moves in a circle of radius $r$ at constant speed $v$. What is the magnitude of its centripetal acceleration?',
        options: [
          '$a_c = \\frac{v^2}{r}$',
          '$a_c = \\frac{v}{r^2}$',
          '$a_c = v \\cdot r$',
          '$a_c = \\frac{r}{v^2}$',
        ],
        correctAnswerIndex: 0,
        topic: 'Circular Motion',
        explanation: 'Centripetal acceleration is directed radially inward and its magnitude is $a_c = \\frac{v^2}{r} = \\omega^2 r$.',
        verificationStatus: 'VERIFIED',
        trustScore: 0.99,
      },
      {
        questionText: 'If kinetic energy of a body becomes 4 times its initial value, how does its momentum $p$ change?',
        options: [
          'Momentum doubles ($2p$)',
          'Momentum quadruples ($4p$)',
          'Momentum stays constant',
          'Momentum increases by $\\sqrt{2}$ times',
        ],
        correctAnswerIndex: 0,
        topic: 'Work, Energy & Power',
        explanation: 'Since $KE = \\frac{p^2}{2m}$, $p = \\sqrt{2m \\cdot KE}$. If $KE$ is quadrupled, $p$ increases by $\\sqrt{4} = 2$ times.',
        verificationStatus: 'VERIFIED',
        trustScore: 0.97,
      },
      {
        questionText: 'What is the work done by a conservative force along a closed path?',
        options: [
          'Zero',
          'Always positive',
          'Depends on path length',
          'Infinite',
        ],
        correctAnswerIndex: 0,
        topic: 'Work, Energy & Power',
        explanation: 'By definition of conservative forces (like gravity or electrostatic forces), the work done around any closed loop is identically zero: $\\oint \\vec{F} \\cdot d\\vec{r} = 0$.',
        verificationStatus: 'VERIFIED',
        trustScore: 1.0,
      },
      {
        questionText: 'Two bodies of mass $m$ and $4m$ have equal kinetic energy. What is the ratio of their de Broglie wavelengths $\\lambda_1 : \\lambda_2$?',
        options: [
          '$2 : 1$',
          '$1 : 2$',
          '$4 : 1$',
          '$1 : 4$',
        ],
        correctAnswerIndex: 0,
        topic: 'Dual Nature of Matter',
        explanation: 'Since $\\lambda = \\frac{h}{p} = \\frac{h}{\\sqrt{2mE}}$. With equal $E$, $\\lambda \\propto \\frac{1}{\\sqrt{m}}$. Therefore $\\frac{\\lambda_1}{\\lambda_2} = \\sqrt{\\frac{4m}{m}} = 2:1$.',
        verificationStatus: 'VERIFIED',
        trustScore: 0.96,
      },
    ],
  },
  {
    id: 'seed-cs-01',
    title: 'Data Structures & Algorithms Mastery',
    category: 'Computer Science',
    createdAt: Date.now() - 86400000 * 3,
    lastTakenAt: null,
    bestScore: null,
    bestScorePercent: null,
    bestTotal: 4,
    questions: [
      {
        questionText: 'What is the worst-case time complexity of QuickSort when the pivot is chosen as the first element on a sorted array?',
        options: [
          '$O(n^2)$',
          '$O(n \\log n)$',
          '$O(n)$',
          '$O(\\log n)$',
        ],
        correctAnswerIndex: 0,
        topic: 'Sorting Algorithms',
        explanation: 'When the array is already sorted and the first element is selected as the pivot, partitions become maximally unbalanced ($1$ and $n-1$), degrading performance to $O(n^2)$.',
        verificationStatus: 'VERIFIED',
        trustScore: 0.99,
      },
      {
        questionText: 'Which data structure is primarily used for implementing Breadth-First Search (BFS) in a graph?',
        options: [
          'Queue (FIFO)',
          'Stack (LIFO)',
          'Priority Queue',
          'Binary Search Tree',
        ],
        correctAnswerIndex: 0,
        topic: 'Graph Traversal',
        explanation: 'BFS explores vertices level by level, requiring a First-In-First-Out (FIFO) queue.',
        verificationStatus: 'VERIFIED',
        trustScore: 1.0,
      },
      {
        questionText: 'In a min-heap with $n$ elements, what is the time complexity to extract the minimum element?',
        options: [
          '$O(\\log n)$',
          '$O(1)$',
          '$O(n)$',
          '$O(n \\log n)$',
        ],
        correctAnswerIndex: 0,
        topic: 'Heaps',
        explanation: 'Finding min is $O(1)$, but extracting it requires replacing the root with the last leaf and calling sift-down/heapify, which takes $O(\\log n)$.',
        verificationStatus: 'VERIFIED',
        trustScore: 0.98,
      },
      {
        questionText: 'Which problem cannot be solved using Dijkstra’s algorithm?',
        options: [
          'Graphs with negative edge weights',
          'Directed acyclic graphs',
          'Unweighted graphs',
          'Graphs with non-negative cycles',
        ],
        correctAnswerIndex: 0,
        topic: 'Shortest Path',
        explanation: 'Dijkstra greedy logic assumes visiting a node means its shortest path is permanently found. Negative edges violate this invariant; Bellman-Ford must be used instead.',
        verificationStatus: 'VERIFIED',
        trustScore: 0.99,
      },
    ],
  },
];

const SEED_PROFILE: UserProfile = {
  uid: 'user-default-1',
  fullName: 'Shivaram Patel',
  email: 'shivaram@mock.ai',
  role: 'LEARNER',
  createdAt: Date.now() - 86400000 * 10,
};

const SEED_TASKS: DailyTask[] = [
  {
    id: 'task-1',
    title: 'Solve 10 Physics Practice MCQs',
    description: 'Target Kinematics and Work-Energy',
    targetCount: 10,
    completedCount: 5,
    isDone: false,
    type: 'PRACTICE',
  },
  {
    id: 'task-2',
    title: 'Review Weak Topics: Sorting Algorithms',
    description: 'Re-attempt 3 questions from missed tests',
    targetCount: 3,
    completedCount: 3,
    isDone: true,
    type: 'REVISION',
  },
  {
    id: 'task-3',
    title: 'Keep Study Streak Alive',
    description: 'Complete at least one mock test today',
    targetCount: 1,
    completedCount: 1,
    isDone: true,
    type: 'STREAK',
  },
];

const SEED_INSIGHT: DailyInsight = {
  title: 'Focus on Rotational Dynamics today 🎯',
  summary: 'Based on your recent 80% score in Mechanics, focusing on torque and angular momentum will push your accuracy above 90%!',
  focusArea: 'Rotational Motion',
  dateStr: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
};

const SEED_MARKETPLACE: PublishedExam[] = [
  {
    id: 'pub-jee-01',
    title: 'NEET / JEE Advanced Physics Challenger',
    subject: 'Physics',
    description: '25 challenging questions curated from top national engineering entrance exams with deep conceptual step-by-step explanations.',
    creatorId: 'creator-dr-raman',
    creatorName: 'Dr. Raman Academy',
    price: 0,
    rating: 4.9,
    totalSales: 342,
    publishedAt: Date.now() - 86400000 * 5,
    questions: SEED_TESTS[0].questions,
  },
  {
    id: 'pub-gate-cs',
    title: 'GATE CS & IT: Data Structures & Algorithms Core',
    subject: 'Computer Science',
    description: 'Comprehensive algorithmic concepts testing trees, graphs, dynamic programming, and complexity bounds.',
    creatorId: 'creator-algo-pro',
    creatorName: 'Prof. Ananya Roy',
    price: 0,
    rating: 4.8,
    totalSales: 512,
    publishedAt: Date.now() - 86400000 * 7,
    questions: SEED_TESTS[1].questions,
  },
  {
    id: 'pub-upsc-hist',
    title: 'UPSC Civil Services: Modern Indian History & Polity',
    subject: 'History',
    description: 'Standard syllabus questions covering Indian freedom struggle, constitutional milestones, and judicial review doctrines.',
    creatorId: 'creator-ias-prep',
    creatorName: 'Heritage IAS Mentors',
    price: 0,
    rating: 4.7,
    totalSales: 189,
    publishedAt: Date.now() - 86400000 * 3,
    questions: [
      {
        questionText: 'Under which article of the Indian Constitution is the doctrine of Judicial Review implicitly derived?',
        options: ['Article 13', 'Article 19', 'Article 21', 'Article 32'],
        correctAnswerIndex: 0,
        topic: 'Indian Polity',
        explanation: 'Article 13(2) states that the State shall not make any law which takes away or abridges the rights conferred by Part III, forming the bedrock of judicial review.',
        verificationStatus: 'VERIFIED',
      },
      {
        questionText: 'Who founded the Satyashodhak Samaj in 1873 in Maharashtra?',
        options: ['Jyotirao Phule', 'Dr. B.R. Ambedkar', 'Gopal Hari Deshmukh', 'Bal Gangadhar Tilak'],
        correctAnswerIndex: 0,
        topic: 'Modern History',
        explanation: 'Jyotirao Phule founded Satyashodhak Samaj to liberate the Shudra and Ati-Shudra communities from religious and social oppression.',
        verificationStatus: 'VERIFIED',
      },
    ],
  },
];

class StorageService {
  // --- Tests ---
  getTests(): TestHistory[] {
    const raw = localStorage.getItem(STORAGE_KEYS.TESTS);
    if (!raw) {
      this.saveTests(SEED_TESTS);
      return SEED_TESTS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return SEED_TESTS;
    }
  }

  saveTests(tests: TestHistory[]): void {
    localStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(tests));
  }

  getTestById(id: string): TestHistory | undefined {
    return this.getTests().find((t) => t.id === id);
  }

  saveTest(test: TestHistory): void {
    const tests = this.getTests();
    const index = tests.findIndex((t) => t.id === test.id);
    if (index >= 0) {
      tests[index] = test;
    } else {
      tests.unshift(test);
    }
    this.saveTests(tests);
  }

  deleteTest(id: string): void {
    const tests = this.getTests().filter((t) => t.id !== id);
    this.saveTests(tests);
  }

  updateTestScore(
    id: string,
    score: number,
    total: number,
    wrongCount: number,
    timeSpentSeconds: number
  ): void {
    const tests = this.getTests();
    const target = tests.find((t) => t.id === id);
    if (target) {
      target.lastTakenAt = Date.now();
      const percent = total > 0 ? Math.round((score * 100) / total) : 0;
      if (target.bestScore === null || score > target.bestScore) {
        target.bestScore = score;
        target.bestScorePercent = percent;
        target.bestTotal = total;
      }
      target.wrongCount = wrongCount;
      target.lastTimeSpentSeconds = timeSpentSeconds;
      this.saveTests(tests);
    }
    this.recordStreakActivity();
  }

  // --- Profile ---
  getProfile(): UserProfile {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (!raw) {
      this.saveProfile(SEED_PROFILE);
      return SEED_PROFILE;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return SEED_PROFILE;
    }
  }

  saveProfile(profile: UserProfile): void {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
  }

  setRole(role: UserRole): void {
    const profile = this.getProfile();
    profile.role = role;
    this.saveProfile(profile);
  }

  // --- Streak ---
  getStreak(): StudyStreak {
    const raw = localStorage.getItem(STORAGE_KEYS.STREAK);
    if (!raw) {
      const initial: StudyStreak = {
        currentStreak: 3,
        bestStreak: 7,
        lastStudyDate: new Date().toISOString().split('T')[0],
      };
      localStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(initial));
      return initial;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return { currentStreak: 1, bestStreak: 1, lastStudyDate: '' };
    }
  }

  recordStreakActivity(): StudyStreak {
    const streak = this.getStreak();
    const today = new Date().toISOString().split('T')[0];
    if (streak.lastStudyDate === today) {
      return streak; // already counted today
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (streak.lastStudyDate === yesterday) {
      streak.currentStreak += 1;
    } else {
      streak.currentStreak = 1;
    }
    if (streak.currentStreak > streak.bestStreak) {
      streak.bestStreak = streak.currentStreak;
    }
    streak.lastStudyDate = today;
    localStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(streak));
    return streak;
  }

  // --- Daily Tasks ---
  getDailyTasks(): DailyTask[] {
    const raw = localStorage.getItem(STORAGE_KEYS.TASKS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(SEED_TASKS));
      return SEED_TASKS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return SEED_TASKS;
    }
  }

  toggleTask(id: string): DailyTask[] {
    const tasks = this.getDailyTasks();
    const task = tasks.find((t) => t.id === id);
    if (task) {
      task.isDone = !task.isDone;
      if (task.isDone) task.completedCount = task.targetCount;
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    }
    return tasks;
  }

  // --- Daily Insight ---
  getDailyInsight(): DailyInsight {
    const raw = localStorage.getItem(STORAGE_KEYS.INSIGHT);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.INSIGHT, JSON.stringify(SEED_INSIGHT));
      return SEED_INSIGHT;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return SEED_INSIGHT;
    }
  }

  // --- Settings ---
  getSettings(): AppSettings {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  saveSettings(settings: AppSettings): void {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  // --- Classroom & Assignments ---
  getClasses(): ClassModel[] {
    const raw = localStorage.getItem(STORAGE_KEYS.CLASSES);
    if (!raw) {
      const seedClasses: ClassModel[] = [
        {
          classId: 'class-phy-101',
          name: 'Advanced Physics 101 (Section A)',
          teacherId: 'user-default-1',
          teacherName: 'Shivaram Patel',
          joinCode: 'PHY981',
          studentIds: ['stu-1', 'stu-2', 'stu-3'],
          studentNames: {
            'stu-1': 'Aarav Sharma',
            'stu-2': 'Priya Iyer',
            'stu-3': 'Rohan Das',
          },
          createdAt: Date.now() - 86400000 * 8,
        },
      ];
      localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(seedClasses));
      return seedClasses;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  createClass(name: string, teacherId: string, teacherName: string): ClassModel {
    const classes = this.getClasses();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newClass: ClassModel = {
      classId: 'class-' + Date.now(),
      name,
      teacherId,
      teacherName,
      joinCode: code,
      studentIds: [],
      studentNames: {},
      createdAt: Date.now(),
    };
    classes.unshift(newClass);
    localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(classes));
    return newClass;
  }

  joinClass(joinCode: string, studentId: string, studentName: string): { success: boolean; message: string } {
    const classes = this.getClasses();
    const target = classes.find((c) => c.joinCode.trim().toUpperCase() === joinCode.trim().toUpperCase());
    if (!target) {
      return { success: false, message: 'Class not found with this code.' };
    }
    if (target.studentIds.includes(studentId)) {
      return { success: true, message: 'You are already enrolled in this class.' };
    }
    target.studentIds.push(studentId);
    target.studentNames[studentId] = studentName;
    localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(classes));
    return { success: true, message: `Successfully enrolled in ${target.name}!` };
  }

  getAssignments(): AssignmentModel[] {
    const raw = localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS);
    if (!raw) {
      const seedAssignments: AssignmentModel[] = [
        {
          assignmentId: 'asg-01',
          classId: 'class-phy-101',
          className: 'Advanced Physics 101 (Section A)',
          testTitle: 'Kinematics & Newtonian Mechanics Test',
          assignedBy: 'user-default-1',
          assignedByName: 'Shivaram Patel',
          dueDate: Date.now() + 86400000 * 3,
          assignedAt: Date.now() - 86400000,
          questions: SEED_TESTS[0].questions,
          studentSubmissions: {
            'stu-1': {
              status: 'SUBMITTED',
              score: 4,
              total: 5,
              scorePercent: 80,
              submittedAt: Date.now() - 3600000 * 12,
            },
          },
        },
      ];
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(seedAssignments));
      return seedAssignments;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  createAssignment(
    classId: string,
    testTitle: string,
    questions: Question[],
    dueDate: number | null,
    teacherId: string,
    teacherName: string
  ): AssignmentModel {
    const assignments = this.getAssignments();
    const classes = this.getClasses();
    const targetClass = classes.find((c) => c.classId === classId);
    const newAsg: AssignmentModel = {
      assignmentId: 'asg-' + Date.now(),
      classId,
      className: targetClass ? targetClass.name : 'General Class',
      testTitle,
      assignedBy: teacherId,
      assignedByName: teacherName,
      dueDate,
      assignedAt: Date.now(),
      questions,
      studentSubmissions: {},
    };
    assignments.unshift(newAsg);
    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
    return newAsg;
  }

  submitAssignment(assignmentId: string, studentId: string, score: number, total: number): void {
    const assignments = this.getAssignments();
    const asg = assignments.find((a) => a.assignmentId === assignmentId);
    if (asg) {
      asg.studentSubmissions[studentId] = {
        status: 'SUBMITTED',
        score,
        total,
        scorePercent: total > 0 ? (score * 100) / total : 0,
        submittedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));
    }
  }

  // --- Marketplace ---
  getMarketplaceExams(): PublishedExam[] {
    const raw = localStorage.getItem(STORAGE_KEYS.MARKETPLACE);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.MARKETPLACE, JSON.stringify(SEED_MARKETPLACE));
      return SEED_MARKETPLACE;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return SEED_MARKETPLACE;
    }
  }

  publishExam(exam: PublishedExam): void {
    const exams = this.getMarketplaceExams();
    exams.unshift(exam);
    localStorage.setItem(STORAGE_KEYS.MARKETPLACE, JSON.stringify(exams));
  }

  resetAppData(): void {
    if (typeof localStorage === 'undefined') return;
    // Clear only MockAI content data, preserving authentication session tokens
    Object.values(STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
  }
}

export const storage = new StorageService();
