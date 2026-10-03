/**
 * Reusable Exam, Subject, Topic, and Subtopic Taxonomy Architecture
 *
 * Provides hierarchical classification structures for national competitive exams
 * (SSC CHSL, SSC CGL, GATE, etc.), supporting primary and secondary topics,
 * configurable taxonomies, deterministic keywords/patterns, and unclassified fallbacks.
 */

export interface SubtopicDefinition {
  id: string;
  name: string;
  description?: string;
  keywords?: string[];
  patterns?: RegExp[];
}

export interface TopicDefinition {
  id: string;
  name: string;
  description?: string;
  subtopics?: SubtopicDefinition[];
  keywords?: string[];
  patterns?: RegExp[];
}

export interface SubjectTaxonomy {
  id: string;
  name: string;
  sectionAliases?: string[];
  topics: TopicDefinition[];
}

export interface ExamTaxonomy {
  examId: string;
  examName: string;
  subjects: SubjectTaxonomy[];
}

// ── Built-in SSC CHSL Taxonomy ──────────────────────────────────────────────

export const SSC_CHSL_TAXONOMY: ExamTaxonomy = {
  examId: 'ssc-chsl',
  examName: 'SSC CHSL',
  subjects: [
    {
      id: 'english_language',
      name: 'English Language',
      sectionAliases: ['english', 'english language', 'part-a', 'part a', 'sec-1', 'section 1'],
      topics: [
        {
          id: 'vocabulary',
          name: 'Vocabulary',
          description: 'Synonyms, antonyms, spelling, idioms, and one word substitution',
          keywords: [
            'synonym',
            'antonym',
            'idiom',
            'phrase',
            'one-word',
            'one word',
            'spelling',
            'spelt',
            'misspelt',
            'homonym',
            'similar in meaning',
            'opposite in meaning',
          ],
          patterns: [
            /\b(most appropriate synonym|most appropriate antonym)\b/i,
            /\b(select the meaning of the given idiom|select the most appropriate meaning)\b/i,
            /\b(substitute the underlined group of words|one-word substitute)\b/i,
            /\b(spelt incorrectly|incorrectly spelt|correctly spelt)\b/i,
          ],
          subtopics: [
            { id: 'synonyms', name: 'Synonyms', keywords: ['synonym', 'similar in meaning'] },
            { id: 'antonyms', name: 'Antonyms', keywords: ['antonym', 'opposite in meaning'] },
            { id: 'idioms_phrases', name: 'Idioms & Phrases', keywords: ['idiom', 'phrase'] },
            { id: 'one_word_substitution', name: 'One Word Substitution', keywords: ['one word', 'one-word substitute'] },
            { id: 'spellings', name: 'Spellings', keywords: ['spelt', 'spelling', 'misspelt'] },
          ],
        },
        {
          id: 'grammar',
          name: 'Grammar',
          description: 'Error detection, sentence improvement, fill in the blanks, voice and narration',
          keywords: [
            'error',
            'grammatical error',
            'spot the error',
            'sentence improvement',
            'substitute the underlined',
            'fill in the blank',
            'passive voice',
            'active voice',
            'indirect speech',
            'direct speech',
            'tense',
            'preposition',
            'concord',
          ],
          patterns: [
            /\b(contains a grammatical error|segment contains a grammatical error|spot the error)\b/i,
            /\b(no substitution required|substitute the underlined segment|sentence improvement)\b/i,
            /\b(fill in the blank|most appropriate option to fill in the blank)\b/i,
            /\b(active voice|passive voice|voice of the given sentence)\b/i,
            /\b(direct speech|indirect speech|narration)\b/i,
          ],
          subtopics: [
            { id: 'error_detection', name: 'Error Detection', keywords: ['grammatical error', 'spot the error'] },
            { id: 'sentence_improvement', name: 'Sentence Improvement', keywords: ['substitute the underlined', 'sentence improvement'] },
            { id: 'fill_in_the_blanks', name: 'Fill in the Blanks', keywords: ['fill in the blank'] },
            { id: 'active_passive_voice', name: 'Active / Passive Voice', keywords: ['active voice', 'passive voice'] },
            { id: 'direct_indirect_speech', name: 'Direct / Indirect Speech', keywords: ['direct speech', 'indirect speech'] },
          ],
        },
        {
          id: 'comprehension',
          name: 'Comprehension',
          description: 'Reading comprehension passages, cloze test, and para jumbles',
          keywords: [
            'passage',
            'cloze',
            'comprehension',
            'jumbled',
            'rearrange',
            'shuffling',
            'parajumble',
            'para jumble',
          ],
          patterns: [
            /\b(read the following passage|cloze test|cloze passage)\b/i,
            /\b(rearrange the given sentences|sentences numbered|jumbled sentences)\b/i,
            /\b(in the following passage some words have been deleted)\b/i,
          ],
          subtopics: [
            { id: 'reading_comprehension', name: 'Reading Comprehension', keywords: ['passage', 'comprehension'] },
            { id: 'cloze_test', name: 'Cloze Test', keywords: ['cloze', 'deleted', 'numbered blank'] },
            { id: 'para_jumbles', name: 'Para Jumbles', keywords: ['rearrange', 'jumbled', 'parts of a sentence'] },
          ],
        },
      ],
    },
    {
      id: 'general_intelligence_reasoning',
      name: 'General Intelligence & Reasoning',
      sectionAliases: [
        'reasoning',
        'general intelligence',
        'general intelligence & reasoning',
        'part-b',
        'part b',
        'sec-2',
        'section 2',
      ],
      topics: [
        {
          id: 'analogy',
          name: 'Analogy',
          description: 'Semantic, number, and figural analogies',
          keywords: ['analogy', 'related to the third', 'in the same way as', 'related to each other'],
          patterns: [
            /\b(related to the third letter-cluster|related to the fifth letter-cluster)\b/i,
            /\b(related to the third term|related to the fifth number)\b/i,
            /\b(in the same way as the second word is related to the first)\b/i,
            /\b(select the word-pair that best represents a similar relationship)\b/i,
          ],
        },
        {
          id: 'series',
          name: 'Series',
          description: 'Number, letter, and figural series completion',
          keywords: ['series', 'question mark', 'comes next', 'missing term'],
          patterns: [
            /\b(come in place of the question mark \(\?\)|replaces the question mark)\b/i,
            /\b(which of the following numbers will replace the question mark)\b/i,
            /\b(select the figure from among the given options that can replace the question mark)\b/i,
            /\b(series:|\bseries\b)/i,
          ],
        },
        {
          id: 'coding_decoding',
          name: 'Coding & Decoding',
          description: 'Letter coding, number coding, and substitution codes',
          keywords: ['coded as', 'written as', 'code', 'coding'],
          patterns: [
            /\b(is coded as|written as in a certain code language|coded language)\b/i,
            /\b(in a certain code language|how will .* be written in that code)\b/i,
          ],
        },
        {
          id: 'classification',
          name: 'Classification',
          description: 'Odd one out across words, letters, or numbers',
          keywords: ['odd', 'different', 'classification', 'does not belong'],
          patterns: [
            /\b(three of the following four are alike|odd one out)\b/i,
            /\b(select the odd letter-cluster|select the odd word|select the odd number)\b/i,
            /\b(one is different|does not belong to the group)\b/i,
          ],
        },
        {
          id: 'spatial_visual',
          name: 'Spatial & Visual Reasoning',
          description: 'Mirror images, water images, paper folding, cubes and dice, embedded figures',
          keywords: [
            'mirror image',
            'water image',
            'paper folding',
            'unfolded',
            'folded',
            'cube',
            'dice',
            'embedded figure',
            'hidden inside',
          ],
          patterns: [
            /\b(correct mirror image of the given figure|mirror is placed at)\b/i,
            /\b(paper is folded and cut|unfolded figure)\b/i,
            /\b(opposite face of the cube|opposite to the face showing|dice)\b/i,
            /\b(embedded in the given figure|rotation is not allowed)\b/i,
          ],
        },
        {
          id: 'logical_reasoning',
          name: 'Logical Reasoning',
          description: 'Syllogism, Venn diagrams, blood relations, direction sense, and mathematical operations',
          keywords: [
            'syllogism',
            'statement',
            'conclusion',
            'venn diagram',
            'blood relation',
            'direction',
            'mathematical signs',
            'interchange',
          ],
          patterns: [
            /\b(statements:[\s\S]*conclusions:|read the given statements and conclusions)\b/i,
            /\b(venn diagram best represents|classes shown in the following)\b/i,
            /\b(pointing to a photograph|how is .* related to|mother|father|brother|sister)\b/i,
            /\b(interchange of signs|mathematically correct|which two signs should be interchanged)\b/i,
          ],
        },
      ],
    },
    {
      id: 'quantitative_aptitude',
      name: 'Quantitative Aptitude',
      sectionAliases: [
        'quant',
        'quantitative aptitude',
        'mathematics',
        'maths',
        'part-c',
        'part c',
        'sec-3',
        'section 3',
      ],
      topics: [
        {
          id: 'arithmetic',
          name: 'Arithmetic',
          description: 'Percentage, profit & loss, ratio, average, interest, time & work, distance',
          keywords: [
            'percent',
            'percentage',
            'profit',
            'loss',
            'discount',
            'marked price',
            'cost price',
            'selling price',
            'ratio',
            'proportion',
            'average',
            'simple interest',
            'compound interest',
            'time and work',
            'pipes',
            'cistern',
            'speed',
            'distance',
            'train',
            'km/h',
            'mixture',
            'alligation',
          ],
          patterns: [
            /\b(profit of|loss of|discount of|marked price|selling price|cost price)\b/i,
            /\b(simple interest|compound interest|annual interest)\b/i,
            /\b(can complete a piece of work|pipes? and cistern)\b/i,
            /\b(speed of a train|distance between|average speed)\b/i,
            /\b(ratio of|in the ratio)\b/i,
          ],
        },
        {
          id: 'number_system',
          name: 'Number System',
          description: 'Divisibility, remainder, HCF, LCM, fractions, and surds',
          keywords: ['divisible', 'remainder', 'hcf', 'lcm', 'prime', 'unit digit', 'fractions', 'surds'],
          patterns: [
            /\b(divisible by|divided by .* leaves a remainder|remainder when)\b/i,
            /\b(hcf and lcm|greatest common divisor|least common multiple)\b/i,
            /\b(find the value of the expression|unit digit of)\b/i,
          ],
        },
        {
          id: 'algebra',
          name: 'Algebra',
          description: 'Linear equations, algebraic identities, and polynomials',
          keywords: ['algebra', 'polynomial', 'equation', 'identity'],
          patterns: [
            /\b(if x \+ 1\/x|x\^2|x\^3|value of x\^|find the value of \(a \+ b\))\b/i,
            /\b(algebraic expression|linear equation|quadratic)\b/i,
          ],
        },
        {
          id: 'geometry',
          name: 'Geometry',
          description: 'Triangles, circles, tangents, chords, and polygons',
          keywords: ['triangle', 'circle', 'tangent', 'chord', 'radius', 'diameter', 'angle', 'congruent'],
          patterns: [
            /\b(in a triangle|circumcentre|incentre|centroid|orthocentre)\b/i,
            /\b(tangent to a circle|chord of a circle|radius of a circle)\b/i,
            /\b(length of the chord|subtends an angle)\b/i,
          ],
        },
        {
          id: 'mensuration',
          name: 'Mensuration',
          description: 'Area, perimeter, surface area, and volume of 2D and 3D figures',
          keywords: ['volume', 'surface area', 'cylinder', 'cone', 'sphere', 'hemisphere', 'perimeter', 'cube', 'cuboid'],
          patterns: [
            /\b(total surface area|curved surface area|volume of a)\b/i,
            /\b(right circular cone|right circular cylinder|solid sphere|hemisphere)\b/i,
          ],
        },
        {
          id: 'trigonometry',
          name: 'Trigonometry',
          description: 'Trigonometric ratios, identities, and heights and distances',
          keywords: ['sin', 'cos', 'tan', 'cot', 'sec', 'cosec', 'trigonometry', 'height', 'elevation', 'depression'],
          patterns: [
            /\b(\\sin|\\cos|\\tan|\\cot|\\sec|\\csc|sin\s*\(?|cos\s*\(?|tan\s*\(?)\b/i,
            /\b(angle of elevation|angle of depression|height of a tower)\b/i,
          ],
        },
        {
          id: 'data_interpretation',
          name: 'Data Interpretation',
          description: 'Bar diagrams, pie charts, tables, and histograms',
          keywords: ['bar graph', 'pie chart', 'histogram', 'table', 'data interpretation'],
          patterns: [
            /\b(study the given table|study the given graph|pie chart represents)\b/i,
            /\b(bar diagram shows|bar graph represents|based on the table)\b/i,
          ],
        },
      ],
    },
    {
      id: 'general_awareness',
      name: 'General Awareness',
      sectionAliases: [
        'general awareness',
        'ga',
        'gk',
        'general knowledge',
        'part-d',
        'part d',
        'sec-4',
        'section 4',
      ],
      topics: [
        {
          id: 'history',
          name: 'History',
          description: 'Ancient, medieval, modern history and Indian freedom struggle',
          keywords: ['dynasty', 'emperor', 'battle', 'revolt', 'mughal', 'british', 'movement', 'harappa', 'vedic'],
          patterns: [
            /\b(battle of|dynasty|ruler|emperor|reign of|founded the|in the year)\b/i,
            /\b(indian national congress|freedom struggle|governor general|viceroy)\b/i,
          ],
        },
        {
          id: 'geography',
          name: 'Geography',
          description: 'Physical geography, rivers, mountains, plateaus, and climate',
          keywords: ['river', 'tributary', 'mountain', 'plateau', 'ocean', 'climate', 'monsoon', 'soil', 'strait'],
          patterns: [
            /\b(originates from|tributary of|located in which state|highest peak|national park)\b/i,
            /\b(passes through|climate of|black soil|western ghats)\b/i,
          ],
        },
        {
          id: 'polity',
          name: 'Polity & Constitution',
          description: 'Constitution of India, articles, amendments, fundamental rights, and parliament',
          keywords: ['article', 'constitution', 'amendment', 'fundamental rights', 'president', 'parliament', 'lok sabha'],
          patterns: [
            /\b(article \d+|which article of the constitution|constitutional amendment)\b/i,
            /\b(fundamental right|directive principles|president of india|supreme court)\b/i,
          ],
        },
        {
          id: 'economics',
          name: 'Economics',
          description: 'Indian economy, inflation, GDP, fiscal policy, and banking',
          keywords: ['gdp', 'inflation', 'rbi', 'budget', 'fiscal', 'monetary', 'five year plan', 'economy', 'tax'],
          patterns: [
            /\b(reserve bank of india|fiscal deficit|five year plan|gross domestic product)\b/i,
            /\b(monetary policy|repo rate|inflation|union budget)\b/i,
          ],
        },
        {
          id: 'general_science',
          name: 'General Science',
          description: 'Basic physics, chemistry, biology, and scientific phenomena',
          keywords: ['cell', 'atom', 'acid', 'base', 'vitamin', 'disease', 'newton', 'force', 'element', 'chemical formula'],
          patterns: [
            /\b(si unit of|chemical formula of|deficiency of vitamin|function of)\b/i,
            /\b(atomic number|ph value|photosynthesis|mitochondria|law of motion)\b/i,
          ],
        },
        {
          id: 'current_affairs_static_gk',
          name: 'Static GK & Current Affairs',
          description: 'Awards, sports, festivals, dance forms, books & authors, national symbols',
          keywords: ['festival', 'dance', 'folk dance', 'classical dance', 'award', 'olympics', 'book', 'author', 'stadium'],
          patterns: [
            /\b(classical dance of|folk dance of|celebrated in which state|recipient of)\b/i,
            /\b(padma shri|bharat ratna|author of the book|won the medal|olympic games)\b/i,
          ],
        },
      ],
    },
    {
      id: 'computer_knowledge',
      name: 'Computer Knowledge',
      sectionAliases: [
        'computer',
        'computer knowledge',
        'computer basics',
        'tier 2 computer',
        'module-i',
        'module 1',
      ],
      topics: [
        {
          id: 'computer_basics',
          name: 'Computer Basics',
          description: 'CPU, memory, input/output devices, and system software',
          keywords: ['cpu', 'ram', 'rom', 'cache', 'memory', 'hardware', 'motherboard', 'bus'],
        },
        {
          id: 'operating_systems',
          name: 'Operating Systems & Shortcuts',
          description: 'Windows, Linux, files, folders, and keyboard shortcuts',
          keywords: ['operating system', 'windows', 'shortcut', 'ctrl +', 'file system'],
        },
        {
          id: 'ms_office',
          name: 'MS Office',
          description: 'MS Word, MS Excel, MS PowerPoint features and functions',
          keywords: ['ms word', 'ms excel', 'powerpoint', 'worksheet', 'formula', 'cell', 'slides'],
        },
        {
          id: 'networking_internet',
          name: 'Networking & Internet',
          description: 'LAN, WAN, TCP/IP, browsers, search engines, and email protocols',
          keywords: ['lan', 'wan', 'ip address', 'http', 'https', 'browser', 'protocol', 'smtp', 'dns'],
        },
        {
          id: 'cybersecurity',
          name: 'Cybersecurity',
          description: 'Viruses, malware, firewalls, phishing, and security practices',
          keywords: ['virus', 'malware', 'trojan', 'phishing', 'firewall', 'ransomware', 'cyber attack'],
        },
      ],
    },
  ],
};

// ── Built-in GATE Taxonomy ──────────────────────────────────────────────────

export const GATE_TAXONOMY: ExamTaxonomy = {
  examId: 'gate',
  examName: 'GATE',
  subjects: [
    {
      id: 'general_aptitude',
      name: 'General Aptitude',
      sectionAliases: ['general aptitude', 'ga', 'part a'],
      topics: [
        {
          id: 'verbal_aptitude',
          name: 'Verbal Aptitude',
          description: 'English grammar, vocabulary, reading comprehension, narrative sequencing',
          keywords: ['grammar', 'vocabulary', 'idiom', 'comprehension', 'sentence', 'verbal'],
        },
        {
          id: 'quantitative_aptitude',
          name: 'Quantitative Aptitude',
          description: 'Data interpretation, numerical estimation, ratios, percentages, probability',
          keywords: ['percentage', 'ratio', 'graph', 'chart', 'probability', 'logarithm', 'numerical'],
        },
        {
          id: 'analytical_spatial',
          name: 'Analytical & Spatial Aptitude',
          description: 'Logic deduction, analogies, spatial transformations, paper folding',
          keywords: ['spatial', 'paper folding', 'deduction', 'analogy', 'shapes', 'pattern'],
        },
      ],
    },
    {
      id: 'engineering_mathematics',
      name: 'Engineering Mathematics',
      sectionAliases: ['engineering mathematics', 'maths', 'mathematics'],
      topics: [
        {
          id: 'linear_algebra_calculus',
          name: 'Linear Algebra & Calculus',
          description: 'Matrices, determinants, eigenvalues, limits, integration, vector calculus',
          keywords: ['matrix', 'eigenvalue', 'determinant', 'vector', 'derivative', 'integral', 'limit'],
        },
        {
          id: 'probability_statistics',
          name: 'Probability & Statistics',
          description: 'Random variables, distributions, mean, median, Bayes theorem',
          keywords: ['random variable', 'distribution', 'poisson', 'normal', 'variance', 'bayes'],
        },
        {
          id: 'discrete_mathematics',
          name: 'Discrete Mathematics',
          description: 'Logic, sets, relations, functions, graph theory, combinatorics',
          keywords: ['graph', 'vertex', 'edge', 'set', 'relation', 'propositional', 'combinatorics'],
        },
      ],
    },
    {
      id: 'technical_core',
      name: 'Technical Core',
      sectionAliases: ['core', 'technical', 'computer science', 'mechanical', 'electrical', 'civil', 'electronics'],
      topics: [
        {
          id: 'core_fundamentals',
          name: 'Core Fundamentals',
          description: 'Discipline-specific fundamental concepts and principles',
          keywords: ['algorithm', 'data structure', 'circuit', 'signal', 'structure', 'thermodynamics'],
        },
        {
          id: 'systems_analysis',
          name: 'Systems & Analysis',
          description: 'Architectures, protocols, operating systems, and dynamic simulations',
          keywords: ['system', 'pipeline', 'process', 'memory', 'network', 'control'],
        },
        {
          id: 'advanced_applications',
          name: 'Advanced Applications',
          description: 'Optimization, synthesis, design problems, and numerical solutions',
          keywords: ['optimization', 'design', 'synthesis', 'complexity', 'analysis'],
        },
      ],
    },
  ],
};

// ── Registry & Query Helpers ────────────────────────────────────────────────

const TAXONOMY_REGISTRY: Record<string, ExamTaxonomy> = {
  'ssc-chsl': SSC_CHSL_TAXONOMY,
  'ssc-cgl': SSC_CHSL_TAXONOMY, // Shares SSC structure
  gate: GATE_TAXONOMY,
};

/**
 * Register or override an exam taxonomy dynamically.
 */
export function registerExamTaxonomy(taxonomy: ExamTaxonomy): void {
  TAXONOMY_REGISTRY[taxonomy.examId.toLowerCase()] = taxonomy;
}

/**
 * Retrieve the taxonomy for a given exam identifier.
 */
export function getExamTaxonomy(examId?: string): ExamTaxonomy | null {
  if (!examId) return null;
  const normalized = examId.toLowerCase();
  if (TAXONOMY_REGISTRY[normalized]) return TAXONOMY_REGISTRY[normalized];

  // Prefix matching (e.g. 'gate-2024-cs' -> 'gate', 'ssc-chsl-2024' -> 'ssc-chsl')
  for (const key of Object.keys(TAXONOMY_REGISTRY)) {
    if (normalized.startsWith(key)) {
      return TAXONOMY_REGISTRY[key];
    }
  }

  return null;
}

/**
 * Normalize an identifier for fuzzy matching.
 */
function normalizeIdentifier(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Find the subject taxonomy matching a given section ID or section name.
 */
export function findSubjectTaxonomy(
  examTaxonomy: ExamTaxonomy,
  sectionIdentifier: string
): SubjectTaxonomy | null {
  if (!sectionIdentifier) return null;
  const targetNorm = normalizeIdentifier(sectionIdentifier);

  for (const subject of examTaxonomy.subjects) {
    if (normalizeIdentifier(subject.id) === targetNorm || normalizeIdentifier(subject.name) === targetNorm) {
      return subject;
    }

    if (subject.sectionAliases) {
      for (const alias of subject.sectionAliases) {
        const aliasNorm = normalizeIdentifier(alias);
        if (aliasNorm === targetNorm || targetNorm.includes(aliasNorm) || aliasNorm.includes(targetNorm)) {
          return subject;
        }
      }
    }
  }

  return null;
}

/**
 * Find a specific topic within a subject taxonomy.
 */
export function findTopicInSubject(
  subject: SubjectTaxonomy,
  topicId: string
): TopicDefinition | null {
  const targetNorm = normalizeIdentifier(topicId);
  for (const topic of subject.topics) {
    if (normalizeIdentifier(topic.id) === targetNorm || normalizeIdentifier(topic.name) === targetNorm) {
      return topic;
    }
  }
  return null;
}
