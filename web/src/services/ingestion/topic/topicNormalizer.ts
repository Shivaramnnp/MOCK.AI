/**
 * Topic Normalizer & Prompt Injection Guard
 * Normalizes user input into canonical topics and protects against prompt injection.
 */

export interface NormalizedTopicResult {
  rawInput: string;
  sanitizedInput: string;
  canonicalName: string;
  domain: string;
  isCustomTopic: boolean;
}

// Canonical Aliases dictionary
const CANONICAL_ALIASES: Record<string, { canonical: string; domain: string }> = {
  // Mathematics & Aptitude
  prob: { canonical: 'Probability & Statistics', domain: 'Mathematics' },
  probability: { canonical: 'Probability & Statistics', domain: 'Mathematics' },
  'probability aptitude': { canonical: 'Probability & Statistics', domain: 'Aptitude' },
  'prob & stats': { canonical: 'Probability & Statistics', domain: 'Mathematics' },
  'probability and statistics': { canonical: 'Probability & Statistics', domain: 'Mathematics' },
  stats: { canonical: 'Probability & Statistics', domain: 'Mathematics' },
  statistics: { canonical: 'Probability & Statistics', domain: 'Mathematics' },
  'linear algebra': { canonical: 'Linear Algebra', domain: 'Mathematics' },
  matrices: { canonical: 'Linear Algebra', domain: 'Mathematics' },
  calculus: { canonical: 'Calculus', domain: 'Mathematics' },
  'differential calculus': { canonical: 'Calculus', domain: 'Mathematics' },
  'integral calculus': { canonical: 'Calculus', domain: 'Mathematics' },
  'discrete math': { canonical: 'Discrete Mathematics', domain: 'Mathematics' },
  'discrete mathematics': { canonical: 'Discrete Mathematics', domain: 'Mathematics' },
  combinatorics: { canonical: 'Discrete Mathematics', domain: 'Mathematics' },
  'graph theory': { canonical: 'Discrete Mathematics', domain: 'Mathematics' },

  // Computer Science & Engineering
  os: { canonical: 'Operating Systems', domain: 'Computer Science' },
  'operating system': { canonical: 'Operating Systems', domain: 'Computer Science' },
  'operating systems': { canonical: 'Operating Systems', domain: 'Computer Science' },
  ds: { canonical: 'Data Structures & Algorithms', domain: 'Computer Science' },
  dsa: { canonical: 'Data Structures & Algorithms', domain: 'Computer Science' },
  algo: { canonical: 'Data Structures & Algorithms', domain: 'Computer Science' },
  algorithm: { canonical: 'Data Structures & Algorithms', domain: 'Computer Science' },
  algorithms: { canonical: 'Data Structures & Algorithms', domain: 'Computer Science' },
  'data structures': { canonical: 'Data Structures & Algorithms', domain: 'Computer Science' },
  'data structures & algorithms': { canonical: 'Data Structures & Algorithms', domain: 'Computer Science' },
  'data structures and algorithms': { canonical: 'Data Structures & Algorithms', domain: 'Computer Science' },
  dbms: { canonical: 'Database Management Systems', domain: 'Computer Science' },
  database: { canonical: 'Database Management Systems', domain: 'Computer Science' },
  databases: { canonical: 'Database Management Systems', domain: 'Computer Science' },
  sql: { canonical: 'Database Management Systems', domain: 'Computer Science' },
  cn: { canonical: 'Computer Networks', domain: 'Computer Science' },
  network: { canonical: 'Computer Networks', domain: 'Computer Science' },
  networks: { canonical: 'Computer Networks', domain: 'Computer Science' },
  'computer network': { canonical: 'Computer Networks', domain: 'Computer Science' },
  'computer networks': { canonical: 'Computer Networks', domain: 'Computer Science' },
  toc: { canonical: 'Theory of Computation', domain: 'Computer Science' },
  'theory of computation': { canonical: 'Theory of Computation', domain: 'Computer Science' },
  automata: { canonical: 'Theory of Computation', domain: 'Computer Science' },
  cd: { canonical: 'Compiler Design', domain: 'Computer Science' },
  compiler: { canonical: 'Compiler Design', domain: 'Computer Science' },
  'compiler design': { canonical: 'Compiler Design', domain: 'Computer Science' },
  coa: { canonical: 'Computer Organization & Architecture', domain: 'Computer Science' },
  ca: { canonical: 'Computer Organization & Architecture', domain: 'Computer Science' },
  'computer organization': { canonical: 'Computer Organization & Architecture', domain: 'Computer Science' },
  'computer architecture': { canonical: 'Computer Organization & Architecture', domain: 'Computer Science' },
  'digital logic': { canonical: 'Digital Logic & Design', domain: 'Computer Science' },
  'digital design': { canonical: 'Digital Logic & Design', domain: 'Computer Science' },
  'software engineering': { canonical: 'Software Engineering', domain: 'Computer Science' },

  // AI & Data Science
  ai: { canonical: 'Artificial Intelligence', domain: 'Data Science & AI' },
  'artificial intelligence': { canonical: 'Artificial Intelligence', domain: 'Data Science & AI' },
  ml: { canonical: 'Machine Learning', domain: 'Data Science & AI' },
  'machine learning': { canonical: 'Machine Learning', domain: 'Data Science & AI' },
  dl: { canonical: 'Deep Learning', domain: 'Data Science & AI' },
  'deep learning': { canonical: 'Deep Learning', domain: 'Data Science & AI' },
  nlp: { canonical: 'Natural Language Processing', domain: 'Data Science & AI' },
  'computer vision': { canonical: 'Computer Vision', domain: 'Data Science & AI' },

  // Aptitude & Reasoning
  quant: { canonical: 'Quantitative Aptitude', domain: 'Aptitude' },
  'quantitative aptitude': { canonical: 'Quantitative Aptitude', domain: 'Aptitude' },
  reasoning: { canonical: 'General Intelligence & Reasoning', domain: 'Aptitude' },
  'general intelligence': { canonical: 'General Intelligence & Reasoning', domain: 'Aptitude' },
  'logical reasoning': { canonical: 'General Intelligence & Reasoning', domain: 'Aptitude' },
  verbal: { canonical: 'Verbal Ability & English', domain: 'Language' },
  english: { canonical: 'Verbal Ability & English', domain: 'Language' },
  'verbal ability': { canonical: 'Verbal Ability & English', domain: 'Language' },

  // Science & General Studies
  thermo: { canonical: 'Thermodynamics', domain: 'Mechanical / Physics' },
  thermodynamics: { canonical: 'Thermodynamics', domain: 'Mechanical / Physics' },
  'organic chem': { canonical: 'Organic Chemistry', domain: 'Chemistry' },
  'organic chemistry': { canonical: 'Organic Chemistry', domain: 'Chemistry' },
  polity: { canonical: 'Indian Polity & Constitution', domain: 'General Studies' },
  'indian polity': { canonical: 'Indian Polity & Constitution', domain: 'General Studies' },
  constitution: { canonical: 'Indian Polity & Constitution', domain: 'General Studies' },
};

// Patterns indicative of prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+|the\s+)?(previous|prior|above)\s+instructions/gi,
  /disregard\s+(all\s+)?instructions/gi,
  /system\s*prompt\s*:/gi,
  /\bhuman\s*:\s*/gi,
  /\bassistant\s*:\s*/gi,
  /\bAI\s*:\s*/gi,
  /you\s+are\s+now\s+an?\s+unrestricted/gi,
  /override\s+(all\s+)?rules/gi,
  /print\s+api\s*key/gi,
  /reveal\s+(system\s+)?prompt/gi,
  /jailbreak/gi,
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /```json\s*\{/gi,
];

/**
 * Sanitizes raw user input, stripping control chars and prompt injection attempts.
 */
export function sanitizeTopicInput(raw: string): string {
  if (!raw) return '';

  let sanitized = raw;

  // 1. Strip injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, ' ');
  }

  // 2. Strip dangerous characters / delimiters
  sanitized = sanitized
    .replace(/[<>{}\\]/g, ' ') // strip raw braces and brackets used in formatting attacks
    .replace(/[\x00-\x1F\x7F]/g, ' ') // control characters
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .trim();

  // 3. Limit length to sensible bounds (max 120 chars for a topic title)
  if (sanitized.length > 120) {
    sanitized = sanitized.slice(0, 120).trim();
  }

  return sanitized;
}

/**
 * Converts a string to Title Case safely.
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) =>
      word
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('-')
    )
    .join(' ');
}

/**
 * Normalizes user topic input into a canonical topic name and domain.
 * Guards against over-normalizing domain-specific topics.
 */
export function normalizeTopic(rawInput: string): NormalizedTopicResult {
  const sanitized = sanitizeTopicInput(rawInput);
  if (!sanitized) {
    return {
      rawInput,
      sanitizedInput: '',
      canonicalName: 'General Practice',
      domain: 'General',
      isCustomTopic: true,
    };
  }

  const lookupKey = sanitized.toLowerCase().trim();

  // 1. Direct alias match
  if (CANONICAL_ALIASES[lookupKey]) {
    const entry = CANONICAL_ALIASES[lookupKey];
    return {
      rawInput,
      sanitizedInput: sanitized,
      canonicalName: entry.canonical,
      domain: entry.domain,
      isCustomTopic: false,
    };
  }

  // 2. Prefixed match (e.g. "GATE Operating Systems" or "UPSC Indian Polity")
  const examPrefixes = ['gate', 'ssc', 'upsc', 'jee', 'neet', 'cat', 'chsl', 'cgl'];
  const words = lookupKey.split(' ');
  if (words.length > 1 && examPrefixes.includes(words[0])) {
    const remainder = words.slice(1).join(' ');
    if (CANONICAL_ALIASES[remainder]) {
      const entry = CANONICAL_ALIASES[remainder];
      return {
        rawInput,
        sanitizedInput: sanitized,
        canonicalName: entry.canonical,
        domain: entry.domain,
        isCustomTopic: false,
      };
    }
  }

  // 3. Substring match for common core subjects (if word count is small, e.g. "operating systems intro")
  for (const [key, entry] of Object.entries(CANONICAL_ALIASES)) {
    if (key.length >= 4 && (lookupKey.startsWith(key + ' ') || lookupKey.endsWith(' ' + key))) {
      return {
        rawInput,
        sanitizedInput: sanitized,
        canonicalName: entry.canonical,
        domain: entry.domain,
        isCustomTopic: false,
      };
    }
  }

  // 4. Do NOT over-normalize: preserve user's authentic custom topic title cleanly
  const titleCased = toTitleCase(sanitized);

  // Infer domain loosely from keywords
  let domain = 'General Knowledge';
  const lower = sanitized.toLowerCase();
  if (lower.includes('code') || lower.includes('algorithm') || lower.includes('software') || lower.includes('data')) {
    domain = 'Computer Science';
  } else if (lower.includes('math') || lower.includes('equation') || lower.includes('theorem') || lower.includes('integral')) {
    domain = 'Mathematics';
  } else if (
    lower.includes('physics') ||
    lower.includes('spectroscopy') ||
    lower.includes('optics') ||
    lower.includes('quantum') ||
    lower.includes('motion') ||
    lower.includes('energy') ||
    lower.includes('wave')
  ) {
    domain = 'Physics';
  } else if (lower.includes('chem') || lower.includes('reaction') || lower.includes('molecule') || lower.includes('acid')) {
    domain = 'Chemistry';
  } else if (lower.includes('bio') || lower.includes('cell') || lower.includes('organ') || lower.includes('gene')) {
    domain = 'Biology / Medicine';
  } else if (lower.includes('law') || lower.includes('court') || lower.includes('history') || lower.includes('economy')) {
    domain = 'Social Studies';
  }

  return {
    rawInput,
    sanitizedInput: sanitized,
    canonicalName: titleCased,
    domain,
    isCustomTopic: true,
  };
}
