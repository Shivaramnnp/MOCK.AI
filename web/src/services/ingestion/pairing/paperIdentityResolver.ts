import { PaperIdentity } from './types';

/**
 * Standard GATE Paper Code to Subject Map
 */
const GATE_PAPER_CODES: Record<string, string> = {
  DA: 'Data Science & Artificial Intelligence',
  CS: 'Computer Science & Information Technology',
  EC: 'Electronics & Communication Engineering',
  EE: 'Electrical Engineering',
  ME: 'Mechanical Engineering',
  CE: 'Civil Engineering',
  IN: 'Instrumentation Engineering',
  CH: 'Chemical Engineering',
  BT: 'Biotechnology',
  AE: 'Aerospace Engineering',
  AG: 'Agricultural Engineering',
  AR: 'Architecture and Planning',
  BM: 'Biomedical Engineering',
  CY: 'Chemistry',
  EY: 'Ecology and Evolution',
  ES: 'Environmental Science and Engineering',
  GG: 'Geology and Geophysics',
  MA: 'Mathematics',
  MN: 'Mining Engineering',
  MT: 'Metallurgical Engineering',
  NM: 'Naval Architecture and Marine Engineering',
  PE: 'Petroleum Engineering',
  PH: 'Physics',
  PI: 'Production and Industrial Engineering',
  ST: 'Statistics',
  TF: 'Textile Engineering and Fibre Science',
  XE: 'Engineering Sciences',
  XH: 'Humanities and Social Sciences',
  XL: 'Life Sciences',
};

/**
 * Resolves Paper Identity (Exam, Year, Paper Code, Subject, Session/Shift)
 * from extracted document text lines and file metadata.
 */
export function resolvePaperIdentity(
  lines: string[],
  fileName: string = '',
  manualHints?: Partial<PaperIdentity>
): PaperIdentity {
  const sampleText = [
    fileName,
    ...lines.slice(0, 80), // First ~2-3 pages of header text
  ].join('\n');

  let exam: string | undefined = manualHints?.exam;
  let year: number | undefined = manualHints?.year;
  let paperCode: string | undefined = manualHints?.paperCode;
  let subject: string | undefined = manualHints?.subject;
  let session: string | undefined = manualHints?.session || manualHints?.shift;

  // 1. Detect Exam Name
  if (!exam) {
    if (/\bGATE\b/i.test(sampleText)) {
      exam = 'GATE';
    } else if (/\bSSC\s*CHSL\b/i.test(sampleText)) {
      exam = 'SSC CHSL';
    } else if (/\bSSC\s*CGL\b/i.test(sampleText)) {
      exam = 'SSC CGL';
    } else if (/\bSSC\b/i.test(sampleText)) {
      exam = 'SSC';
    } else if (/\bUPSC\b/i.test(sampleText)) {
      exam = 'UPSC';
    } else if (/\bRRB\b/i.test(sampleText) || /\bNTPC\b/i.test(sampleText)) {
      exam = 'RRB';
    } else if (/\bIBPS\b/i.test(sampleText) || /\bSBI\b/i.test(sampleText)) {
      exam = 'IBPS';
    } else if (/\bJEE\b/i.test(sampleText)) {
      exam = 'JEE';
    } else if (/\bNEET\b/i.test(sampleText)) {
      exam = 'NEET';
    } else if (/\b(?:University|College|Semester|Midterm|Department\s*of)\b/i.test(sampleText)) {
      exam = 'Academic';
    } else {
      exam = 'Custom';
    }
  }

  // 2. Detect Exam Year (2015 - 2030)
  if (!year) {
    const yearMatch = sampleText.match(/\b(20[1-3][0-9])\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
    }
  }

  // 3. Detect Paper Code (e.g., DA, CS, ME)
  if (!paperCode) {
    // Check known codes with delimiters
    for (const [code, sub] of Object.entries(GATE_PAPER_CODES)) {
      const codeRegex = new RegExp(`\\b(${code})\\s*[:\\-–—]\\s*|\\bPaper\\s*[:\\-–—]?\\s*(${code})\\b|\\bGATE\\s*\\d{4}\\s*(${code})\\b|_(${code})_`, 'i');
      if (codeRegex.test(sampleText)) {
        paperCode = code.toUpperCase();
        if (!subject) subject = sub;
        break;
      }
    }

    // Direct filename search e.g. "GATE_2024_DA.pdf" or "gate-2025-cs-1"
    if (!paperCode && fileName) {
      const fnUpper = fileName.toUpperCase();
      for (const [code, sub] of Object.entries(GATE_PAPER_CODES)) {
        if (fnUpper.includes(`_${code}`) || fnUpper.includes(`-${code}`) || fnUpper.includes(` ${code}`) || fnUpper.includes(`(${code})`)) {
          paperCode = code;
          if (!subject) subject = sub;
          break;
        }
      }
    }
  }

  // 4. Detect Subject if code exists and subject is empty
  if (paperCode && !subject && GATE_PAPER_CODES[paperCode]) {
    subject = GATE_PAPER_CODES[paperCode];
  }

  // 5. Detect Session / Shift
  if (!session) {
    const shiftMatch = sampleText.match(/\b(Shift\s*[1-4]|Session\s*[1-4]|Set\s*[A-D1-4])\b/i);
    if (shiftMatch) {
      session = shiftMatch[1];
    }
  }

  let confidence = 0.5;
  if (exam) confidence += 0.15;
  if (year) confidence += 0.15;
  if (paperCode) confidence += 0.2;

  return {
    exam,
    year,
    paperCode,
    subject,
    session,
    shift: session,
    confidence: Math.min(1.0, confidence),
    rawHeader: lines.slice(0, 5).join(' | '),
  };
}

/**
 * Validates whether Question Paper identity and Answer Key identity are compatible.
 * Returns true if matched, or false with an explanation if mismatched.
 */
export function validateSourceIdentityCompatibility(
  qpIdentity: PaperIdentity,
  akIdentity: PaperIdentity
): { isCompatible: boolean; mismatchReason?: string } {
  // 1. Exam Check
  if (qpIdentity.exam && akIdentity.exam) {
    const ex1 = qpIdentity.exam.trim().toUpperCase();
    const ex2 = akIdentity.exam.trim().toUpperCase();
    if (ex1 !== ex2) {
      return {
        isCompatible: false,
        mismatchReason: `Exam mismatch: Question paper belongs to ${qpIdentity.exam}, but Answer key belongs to ${akIdentity.exam}.`,
      };
    }
  }

  // 2. Year Check
  if (qpIdentity.year && akIdentity.year && qpIdentity.year !== akIdentity.year) {
    return {
      isCompatible: false,
      mismatchReason: `Year mismatch: Question paper is from ${qpIdentity.year}, but Answer key is from ${akIdentity.year}.`,
    };
  }

  // 3. Paper Code / Discipline Check
  if (qpIdentity.paperCode && akIdentity.paperCode) {
    const code1 = qpIdentity.paperCode.trim().toUpperCase();
    const code2 = akIdentity.paperCode.trim().toUpperCase();
    if (code1 !== code2) {
      return {
        isCompatible: false,
        mismatchReason: `Discipline mismatch: Question paper code is ${code1} (${qpIdentity.subject || 'Unknown'}), but Answer key is for ${code2} (${akIdentity.subject || 'Unknown'}). Matching aborted.`,
      };
    }
  }

  // 4. Session / Shift Check (e.g. Session 1 vs Session 2)
  if (qpIdentity.session && akIdentity.session) {
    const s1 = qpIdentity.session.replace(/\s+/g, '').toUpperCase();
    const s2 = akIdentity.session.replace(/\s+/g, '').toUpperCase();
    if (s1 !== s2 && (s1.includes('1') && s2.includes('2') || s1.includes('2') && s2.includes('1'))) {
      return {
        isCompatible: false,
        mismatchReason: `Session/Shift mismatch: Question paper is ${qpIdentity.session}, but Answer key is ${akIdentity.session}.`,
      };
    }
  }

  return { isCompatible: true };
}
