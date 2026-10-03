/**
 * Syllabus Grounder
 * Maps topics to authoritative exam syllabi from catalog or constructs rich technical subtopic taxonomies.
 */

import { COMPETITIVE_EXAMS_CATALOG } from '../../../data/exams/catalog';
import { SyllabusTopic } from '../../../types';
import { CanonicalTopic } from './types';
import { normalizeTopic } from './topicNormalizer';

// Curated technical subtopics for standard subjects when no specific exam is targeted
const CURATED_TECHNICAL_TAXONOMY: Record<string, { domain: string; subtopics: string[] }> = {
  'Probability & Statistics': {
    domain: 'Mathematics',
    subtopics: [
      'Axioms of Probability & Conditional Probability',
      'Bayes Theorem & Total Probability Law',
      'Discrete Random Variables: Binomial & Poisson Distributions',
      'Continuous Random Variables: Normal, Uniform & Exponential',
      'Expectation, Variance, Covariance & Correlation',
      'Central Limit Theorem & Law of Large Numbers',
      'Hypothesis Testing, Confidence Intervals & p-values',
    ],
  },
  'Linear Algebra': {
    domain: 'Mathematics',
    subtopics: [
      'Matrices, Determinants & Elementary Row Operations',
      'Systems of Linear Equations, Consistency & Rank',
      'Vector Spaces, Linear Independence, Basis & Dimension',
      'Eigenvalues, Eigenvectors & Characteristic Polynomials',
      'Diagonalization & Cayley-Hamilton Theorem',
      'Inner Product Spaces, Orthogonality & Gram-Schmidt',
      'Singular Value Decomposition (SVD) & LU Decomposition',
    ],
  },
  Calculus: {
    domain: 'Mathematics',
    subtopics: [
      'Limits, Continuity & Differentiability',
      'Mean Value Theorems (Rolle, Lagrange, Cauchy)',
      'Maxima, Minima & Saddle Points',
      'Definite & Indefinite Integrals with Applications',
      'Partial Derivatives & Directional Derivatives',
      'Multiple Integrals (Double & Triple Integrals)',
      'Vector Calculus: Gradient, Divergence, Curl & Green/Stokes Theorems',
    ],
  },
  'Discrete Mathematics': {
    domain: 'Mathematics',
    subtopics: [
      'Propositional & First-Order Predicate Logic',
      'Sets, Relations, Equivalence Relations & Partial Orders',
      'Functions, Injections, Surjections & Bijections',
      'Mathematical Induction & Recurrence Relations',
      'Graph Theory: Connectivity, Euler/Hamilton Paths, Coloring',
      'Trees, Spanning Trees & Planar Graphs',
      'Combinatorics: Permutations, Combinations & Generating Functions',
    ],
  },
  'Operating Systems': {
    domain: 'Computer Science',
    subtopics: [
      'Processes, Threads, Concurrency & Inter-process Communication (IPC)',
      'CPU Scheduling Algorithms: FCFS, SJF, Round Robin, Priority',
      'Synchronization, Critical Section Problem & Semaphores',
      'Deadlocks: Necessary Conditions, Bankers Algorithm & Avoidance',
      'Memory Management: Paging, Segmentation & TLB',
      'Virtual Memory: Page Replacement (FIFO, LRU, Optimal) & Thrashing',
      'File Systems, Inodes, Directory Structures & Disk Scheduling',
    ],
  },
  'Data Structures & Algorithms': {
    domain: 'Computer Science',
    subtopics: [
      'Asymptotic Notations (Big-O, Omega, Theta) & Complexity Analysis',
      'Linear Structures: Arrays, Stacks, Queues & Linked Lists',
      'Non-Linear Structures: Binary Trees, BST, AVL & B-Trees',
      'Hashing: Hash Functions, Collision Resolution (Chaining, Probing)',
      'Graph Algorithms: BFS, DFS, Dijkstra, Bellman-Ford, Prim & Kruskal',
      'Divide and Conquer: Merge Sort, Quick Sort, Binary Search',
      'Dynamic Programming: Longest Common Subsequence, Knapsack & Matrix Chain',
    ],
  },
  'Database Management Systems': {
    domain: 'Computer Science',
    subtopics: [
      'ER Modeling, Relational Model & Relational Algebra',
      'SQL: DDL, DML, Joins, Subqueries & Grouping',
      'Schema Refinement: Functional Dependencies & Normal Forms (1NF, 2NF, 3NF, BCNF)',
      'Transaction Processing, ACID Properties & Serializability',
      'Concurrency Control: Two-Phase Locking (2PL) & Timestamp Ordering',
      'Database Indexing: B-Trees, B+ Trees & Hash Indices',
      'Recovery Systems: Log-based Recovery & Checkpoints',
    ],
  },
  'Computer Networks': {
    domain: 'Computer Science',
    subtopics: [
      'OSI and TCP/IP Protocol Architectures & Layer Responsibilities',
      'Data Link Layer: Framing, Error Detection (CRC) & Flow Control (Stop-and-Wait, Go-Back-N)',
      'Medium Access Control: CSMA/CD, CSMA/CA & Ethernet',
      'Network Layer: IPv4/IPv6 Addressing, Subnetting, CIDR & NAT',
      'Routing Algorithms: Distance Vector (RIP), Link State (OSPF) & BGP',
      'Transport Layer: TCP vs UDP, Flow Control, Sliding Window & Congestion Control',
      'Application Layer Protocols: DNS, HTTP/HTTPS, FTP, SMTP & DHCP',
    ],
  },
  'Theory of Computation': {
    domain: 'Computer Science',
    subtopics: [
      'Regular Languages: Deterministic & Nondeterministic Finite Automata (DFA, NFA)',
      'Regular Expressions, Equivalence & Pumping Lemma for Regular Languages',
      'Context-Free Grammars (CFG) & Pushdown Automata (PDA)',
      'Chomsky Hierarchy & Closure Properties of Language Families',
      'Turing Machines: Design, Configurations & Variants',
      'Decidability, Halting Problem & Reducibility',
      'Complexity Classes: P, NP, NP-Complete & NP-Hard',
    ],
  },
  'Compiler Design': {
    domain: 'Computer Science',
    subtopics: [
      'Phases of a Compiler & Lexical Analysis (Tokens, Lexemes)',
      'Syntax Analysis: Top-down (LL) and Bottom-up (LR, LALR, SLR) Parsing',
      'Syntax Directed Translation (SDT): S-attributed and L-attributed Definitions',
      'Intermediate Code Generation: Three-Address Code & Quadruples',
      'Runtime Environments: Activation Records & Stack Allocation',
      'Code Optimization: Dataflow Analysis, Common Subexpressions & Loop Invariants',
      'Target Code Generation & Register Allocation',
    ],
  },
  'Computer Organization & Architecture': {
    domain: 'Computer Science',
    subtopics: [
      'Machine Instructions, Addressing Modes & Instruction Formats',
      'Arithmetic Logic Unit (ALU): Integer & IEEE-754 Floating Point Representation',
      'Instruction Pipelining: Pipeline Hazards (Data, Structural, Control) & Stalls',
      'Memory Hierarchy: Cache Mapping (Direct, Set-Associative) & Cache Misses',
      'Main Memory, Virtual Memory & TLB Interaction',
      'I/O Organization: Interrupts, Polling & Direct Memory Access (DMA)',
    ],
  },
  'Machine Learning': {
    domain: 'Data Science & AI',
    subtopics: [
      'Supervised Learning: Linear Regression, Logistic Regression & Cost Functions',
      'Decision Trees, Random Forests & Ensemble Methods (Boosting, Bagging)',
      'Support Vector Machines (SVM), Kernels & Hyperplane Optimization',
      'Unsupervised Learning: K-Means, Hierarchical Clustering & PCA',
      'Model Evaluation: Cross-Validation, Precision, Recall, F1-Score & ROC-AUC',
      'Overfitting, Underfitting, Regularization (L1 Lasso, L2 Ridge)',
    ],
  },
  'Deep Learning': {
    domain: 'Data Science & AI',
    subtopics: [
      'Multilayer Perceptrons (MLP), Activation Functions & Backpropagation',
      'Optimization Algorithms: Gradient Descent, Adam, RMSprop & Learning Rate Schedules',
      'Convolutional Neural Networks (CNN): Convolutions, Pooling & Architectures',
      'Recurrent Neural Networks (RNN), LSTM & GRU for Sequences',
      'Transformers: Self-Attention Mechanism, Multi-Head Attention & Positional Encodings',
      'Generative Models: Autoencoders, GANs & Diffusion Models',
    ],
  },
  'Quantitative Aptitude': {
    domain: 'Aptitude',
    subtopics: [
      'Percentages, Profit, Loss & Discount',
      'Ratio, Proportion, Mixtures & Alligations',
      'Time, Speed, Distance & Relative Motion (Trains, Boats)',
      'Time, Work, Efficiency & Pipes and Cisterns',
      'Simple and Compound Interest & Installments',
      'Permutations, Combinations & Elementary Probability',
      'Data Interpretation: Bar Charts, Pie Charts & Line Graphs',
    ],
  },
  'General Intelligence & Reasoning': {
    domain: 'Aptitude',
    subtopics: [
      'Syllogisms & Logical Deductions',
      'Number, Letter & Symbol Series',
      'Coding-Decoding & Blood Relations',
      'Direction Sense & Spatial Orientation',
      'Seating Arrangement: Linear & Circular',
      'Statement & Assumptions, Cause and Effect',
    ],
  },
  'Verbal Ability & English': {
    domain: 'Language',
    subtopics: [
      'Reading Comprehension & Central Theme Identification',
      'Spotting Errors, Subject-Verb Agreement & Tenses',
      'Vocabulary: Synonyms, Antonyms & Contextual Usage',
      'Sentence Rearrangement & Para Jumbles',
      'Cloze Test & Fill in the Blanks',
      'Idioms, Phrases & One Word Substitutions',
    ],
  },
};

/**
 * Splits comma-separated syllabus strings into fine-grained subtopics.
 */
function cleanSubtopicList(list: string[]): string[] {
  const result: string[] = [];
  for (const item of list) {
    if (item.includes(',')) {
      const parts = item
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 2);
      result.push(...parts);
    } else {
      result.push(item);
    }
  }
  return result;
}

function extractTopicName(topic: string | SyllabusTopic): string {
  return typeof topic === 'string' ? topic : topic.name;
}

function extractSubtopicsFromTopic(topic: string | SyllabusTopic): string[] {
  if (typeof topic === 'string') {
    return cleanSubtopicList([topic]);
  }
  const raw = topic.subtopics && topic.subtopics.length > 0 ? topic.subtopics : [topic.name];
  return cleanSubtopicList(raw);
}

/**
 * Grounds a topic against official exam syllabi or fallback taxonomies.
 */
export function groundTopic(rawTopic: string, selectedExamId?: string): CanonicalTopic {
  const normalized = normalizeTopic(rawTopic);

  // 1. If an exam is selected, ground strictly in the selected exam's syllabus
  if (selectedExamId) {
    const cleanExamId = selectedExamId.toLowerCase().trim();
    const exam = COMPETITIVE_EXAMS_CATALOG.find(
      (e) => e.id.toLowerCase() === cleanExamId || e.name.toLowerCase() === cleanExamId
    );

    if (exam && exam.syllabus?.sections) {
      // Find matching section / topic in this exam
      const target = normalized.canonicalName.toLowerCase();

      for (const section of exam.syllabus.sections) {
        // Direct section title match
        if (section.title.toLowerCase().includes(target)) {
          const allSubtopics = section.topics.flatMap(extractSubtopicsFromTopic);
          return {
            rawInput: rawTopic,
            normalizedTopic: normalized.sanitizedInput,
            canonicalName: section.title,
            domain: exam.name,
            matchedExamId: exam.id,
            matchedSection: section.title,
            subtopics: allSubtopics.length > 0 ? allSubtopics : [section.title],
            isCustomTopic: false,
          };
        }

        // Match within topic names
        for (const topic of section.topics) {
          const topicName = extractTopicName(topic);
          if (
            topicName.toLowerCase().includes(target) ||
            target.includes(topicName.toLowerCase())
          ) {
            const parsedSubtopics = extractSubtopicsFromTopic(topic);
            return {
              rawInput: rawTopic,
              normalizedTopic: normalized.sanitizedInput,
              canonicalName: topicName,
              domain: exam.name,
              matchedExamId: exam.id,
              matchedSection: section.title,
              matchedSyllabusTopic: topicName,
              subtopics: parsedSubtopics.length > 0 ? parsedSubtopics : [topicName],
              isCustomTopic: false,
            };
          }
        }
      }

      // If user specified an exam but topic is not a direct match, check if any section covers it
      const firstSection = exam.syllabus.sections[0];
      const fallbackSubtopics = firstSection.topics.flatMap(extractSubtopicsFromTopic).slice(0, 8);
      return {
        rawInput: rawTopic,
        normalizedTopic: normalized.sanitizedInput,
        canonicalName: `${exam.name}: ${normalized.canonicalName}`,
        domain: exam.name,
        matchedExamId: exam.id,
        matchedSection: firstSection.title,
        subtopics: fallbackSubtopics.length > 0 ? fallbackSubtopics : [normalized.canonicalName],
        isCustomTopic: normalized.isCustomTopic,
      };
    }
  }

  // 2. No exam specified: check curated technical taxonomy
  const canonicalKey = normalized.canonicalName;
  if (CURATED_TECHNICAL_TAXONOMY[canonicalKey]) {
    const entry = CURATED_TECHNICAL_TAXONOMY[canonicalKey];
    return {
      rawInput: rawTopic,
      normalizedTopic: normalized.sanitizedInput,
      canonicalName: canonicalKey,
      domain: entry.domain,
      subtopics: entry.subtopics,
      isCustomTopic: false,
    };
  }

  // 3. Check all catalog exams to see if it matches any official syllabus topic
  for (const exam of COMPETITIVE_EXAMS_CATALOG) {
    if (!exam.syllabus?.sections) continue;

    for (const section of exam.syllabus.sections) {
      for (const topic of section.topics) {
        const topicName = extractTopicName(topic);
        if (
          topicName.toLowerCase() === normalized.canonicalName.toLowerCase() ||
          topicName.toLowerCase().includes(normalized.canonicalName.toLowerCase())
        ) {
          const subtopics = extractSubtopicsFromTopic(topic);
          return {
            rawInput: rawTopic,
            normalizedTopic: normalized.sanitizedInput,
            canonicalName: topicName,
            domain: exam.name,
            matchedExamId: exam.id,
            matchedSection: section.title,
            matchedSyllabusTopic: topicName,
            subtopics: subtopics.length > 0 ? subtopics : [topicName],
            isCustomTopic: false,
          };
        }
      }
    }
  }

  // 4. Custom/Niche Topic: build coherent subtopic taxonomy dynamically
  const topicName = normalized.canonicalName;
  const dynamicSubtopics = [
    `Foundational Concepts and Definitions of ${topicName}`,
    `Core Mathematical Formulations & Governing Equations in ${topicName}`,
    `Standard Algorithms, Methods & Analytical Procedures in ${topicName}`,
    `Edge Cases, Complex Applications & Problem-Solving in ${topicName}`,
    `Comparative Analysis, Evaluation & Performance Metrics in ${topicName}`,
  ];

  return {
    rawInput: rawTopic,
    normalizedTopic: normalized.sanitizedInput,
    canonicalName: topicName,
    domain: normalized.domain,
    subtopics: dynamicSubtopics,
    isCustomTopic: true,
  };
}
