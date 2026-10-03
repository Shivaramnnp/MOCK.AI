import { QuestionType } from '../../../types/canonicalQuestion';
import { RawAnswerEntry } from './types';

/**
 * Normalizes single MCQ answer tokens:
 * 'A', 'a', '(A)', 'Option A', 'Ans: A' -> 'A'
 */
export function normalizeMcqOption(token: string): string | null {
  const trimmed = token.trim();
  const match = trimmed.match(/^(?:Option\s*|Ans(?:wer)?\s*[:\-]?\s*|\(?)([A-H])\)?$/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return null;
}

/**
 * Normalizes MSQ answer tokens:
 * 'A,C,D', 'A C D', 'ACD', 'A, C, D', 'A; C; D' -> ['A', 'C', 'D']
 */
export function normalizeMsqOptions(token: string): string[] | null {
  const trimmed = token.trim();

  // If separated by commas, semicolons, or spaces: e.g. "A, C, D" or "A C D"
  if (/[,\s;]/.test(trimmed)) {
    const parts = trimmed.split(/[,\s;]+/).filter(Boolean);
    const validLetters = parts.map((p) => normalizeMcqOption(p)).filter((p): p is string => p !== null);
    if (validLetters.length >= 1 && validLetters.length === parts.length) {
      return Array.from(new Set(validLetters)).sort();
    }
  }

  // If concatenated uppercase letters e.g. "ACD" or "BC"
  if (/^[A-H]{2,6}$/i.test(trimmed)) {
    const letters = trimmed.toUpperCase().split('');
    return Array.from(new Set(letters)).sort();
  }

  return null;
}

/**
 * Normalizes NAT numerical values or ranges:
 * '3.14 to 3.15', '3.14 - 3.15', '3.14 – 3.15', '42', '-0.5 to 0.5'
 */
export function normalizeNatAnswer(token: string): {
  natValue?: number;
  natRange?: { min: number; max: number };
} | null {
  const trimmed = token.trim();

  // Check Range: e.g. "3.14 to 3.15" or "3.14 - 3.15" or "3.14 -- 3.15"
  // Note: support negative numbers carefully
  const rangeMatch = trimmed.match(/^([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*(?:to|–|—|--|-)\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)$/i);
  if (rangeMatch) {
    const minVal = parseFloat(rangeMatch[1]);
    const maxVal = parseFloat(rangeMatch[2]);
    if (!isNaN(minVal) && !isNaN(maxVal)) {
      return {
        natRange: {
          min: Math.min(minVal, maxVal),
          max: Math.max(minVal, maxVal),
        },
      };
    }
  }

  // Check Single Number: e.g. "42", "3.14", "-15.8"
  const singleMatch = trimmed.match(/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?$/);
  if (singleMatch) {
    const val = parseFloat(singleMatch[0]);
    if (!isNaN(val)) {
      return {
        natValue: val,
        natRange: { min: val, max: val },
      };
    }
  }

  return null;
}

/**
 * Checks if the answer key specifies Marks To All (MTA).
 */
export function isMtaToken(token: string): boolean {
  const trimmed = token.trim().toUpperCase();
  return (
    trimmed === 'MTA' ||
    trimmed === 'MARKS TO ALL' ||
    trimmed === 'ALL' ||
    trimmed.includes('MARKS TO ALL')
  );
}

/**
 * Parses raw text lines from an official Answer Key document
 * (e.g. GATE Master Answer Key PDF) into structured RawAnswerEntry items.
 */
export function extractAnswerKeyFromLines(lines: string[]): RawAnswerEntry[] {
  const entries: RawAnswerEntry[] = [];
  const seenQNums = new Set<number>();

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;

    // Skip common header lines
    if (
      /^(?:Q\.?\s*No|Question\s*Number|GATE\s*20\d\d|Master\s*Answer\s*Key|Session|Subject|Page\s*\d)/i.test(
        line
      )
    ) {
      continue;
    }

    // Pattern 1: Tabular row from GATE Master Answer Key:
    // e.g. "1 | 1 | MCQ | GA | C | 1" or tab-delimited "1   1   MCQ   GA   C   1"
    // Columns: [QNum] [Session] [Type] [Section] [Key/Range] [Mark]
    const tablePattern = /^(\d+)\s*[\t|]\s*(\d+)?\s*[\t|]?\s*(MCQ|MSQ|NAT)?\s*[\t|]?\s*([A-Za-z\s]+)?\s*[\t|]?\s*([^|\t\n]+?)\s*[\t|]?\s*([12](?:\.0)?)?$/i;
    const tableMatch = line.match(tablePattern);

    if (tableMatch) {
      const qNum = parseInt(tableMatch[1], 10);
      const explicitType = (tableMatch[3] ? tableMatch[3].toUpperCase() : undefined) as QuestionType | undefined;
      const sectionName = tableMatch[4]?.trim();
      const rawAns = tableMatch[5]?.trim() || '';
      const marks = tableMatch[6] ? parseFloat(tableMatch[6]) : undefined;

      const parsed = parseRawAnswer(rawAns, explicitType);
      entries.push({
        questionNumber: qNum,
        sectionName,
        rawAnswerText: rawAns,
        detectedType: parsed.detectedType,
        mcqOption: parsed.mcqOption,
        msqOptions: parsed.msqOptions,
        natRange: parsed.natRange,
        natValue: parsed.natValue,
        isMta: parsed.isMta,
        marks,
        negativeMarks: calculateNegativeMarks(explicitType || parsed.detectedType, marks),
        rawLine: line,
      });
      seenQNums.add(qNum);
      continue;
    }

    // Pattern 2: Key-value lines: "Q.1 : A", "Q16 - A, C, D", "25. 3.14 to 3.15", "Q42. 12"
    const kvPattern = /^(?:Q(?:uestion)?\.?\s*)?(\d+)[\.\s:\-–—\)]+\s*(?:Ans(?:wer)?\s*[:\-]?\s*)?([^\n\r]+)$/i;
    const kvMatch = line.match(kvPattern);

    if (kvMatch) {
      const qNum = parseInt(kvMatch[1], 10);
      let rawAns = kvMatch[2].trim();

      // Don't treat random paragraphs or page footers as answers
      if (rawAns.length > 50) continue;

      let marks: number | undefined;
      let negativeMarks: number | undefined;

      const marksMatch = rawAns.match(/\((?:Marks?:\s*([0-9\.]+))?(?:,?\s*Negative:\s*([0-9\.]+))?\)/i);
      if (marksMatch) {
        if (marksMatch[1]) marks = parseFloat(marksMatch[1]);
        if (marksMatch[2]) negativeMarks = parseFloat(marksMatch[2]);
        rawAns = rawAns.replace(marksMatch[0], '').trim();
      }

      const parsed = parseRawAnswer(rawAns);
      entries.push({
        questionNumber: qNum,
        rawAnswerText: rawAns,
        detectedType: parsed.detectedType,
        mcqOption: parsed.mcqOption,
        msqOptions: parsed.msqOptions,
        natRange: parsed.natRange,
        natValue: parsed.natValue,
        isMta: parsed.isMta,
        marks: marks ?? 1,
        negativeMarks: negativeMarks ?? calculateNegativeMarks(parsed.detectedType, marks ?? 1),
        rawLine: line,
      });
      seenQNums.add(qNum);
      continue;
    }
  }

  // Sort entries deterministically by question number
  entries.sort((a, b) => a.questionNumber - b.questionNumber);
  return entries;
}

/**
 * Parses raw answer string and infers question type and normalized answers.
 */
function parseRawAnswer(
  raw: string,
  hintType?: QuestionType
): {
  detectedType: QuestionType;
  mcqOption?: string;
  msqOptions?: string[];
  natRange?: { min: number; max: number };
  natValue?: number;
  isMta?: boolean;
} {
  const isMta = isMtaToken(raw);
  if (isMta) {
    return {
      detectedType: hintType || 'MCQ',
      isMta: true,
    };
  }

  // If hint says NAT or text looks like NAT:
  const natResult = normalizeNatAnswer(raw);
  if (hintType === 'NAT' || (natResult && hintType !== 'MCQ' && hintType !== 'MSQ')) {
    if (natResult) {
      return {
        detectedType: 'NAT',
        natRange: natResult.natRange,
        natValue: natResult.natValue,
      };
    }
  }

  // If hint says MSQ or multiple letters:
  const msqResult = normalizeMsqOptions(raw);
  if (hintType === 'MSQ' || (msqResult && msqResult.length > 1 && hintType !== 'MCQ')) {
    if (msqResult) {
      return {
        detectedType: 'MSQ',
        msqOptions: msqResult,
      };
    }
  }

  // Check single MCQ option:
  const mcqOpt = normalizeMcqOption(raw);
  if (mcqOpt) {
    return {
      detectedType: hintType === 'MSQ' ? 'MSQ' : 'MCQ',
      mcqOption: mcqOpt,
      msqOptions: hintType === 'MSQ' ? [mcqOpt] : undefined,
    };
  }

  // Fallback if hint was provided
  return {
    detectedType: hintType || 'MCQ',
  };
}

/**
 * Calculates negative marks per GATE rules:
 * MCQ 1-mark: -1/3 (-0.33)
 * MCQ 2-mark: -2/3 (-0.66)
 * MSQ: 0 (No negative marking)
 * NAT: 0 (No negative marking)
 */
export function calculateNegativeMarks(type?: QuestionType, marks: number = 1): number {
  if (type === 'MSQ' || type === 'NAT') {
    return 0;
  }
  if (marks === 2) {
    return 0.66;
  }
  return 0.33;
}
