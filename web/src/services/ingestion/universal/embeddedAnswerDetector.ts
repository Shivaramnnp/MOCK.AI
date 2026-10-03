import { RawAnswerEntry } from '../pairing/types';
import { extractAnswerKeyFromLines } from '../pairing/answerKeyExtractor';

export interface EmbeddedAnswerDetectionResult {
  hasEmbeddedAnswers: boolean;
  entries: RawAnswerEntry[];
  sourceLocation: 'END_OF_DOCUMENT' | 'PER_QUESTION_INLINE' | 'NONE';
  rawHeader?: string;
}

/**
 * Auto-detects and extracts embedded answer keys from the question paper text.
 * Covers:
 * 1. End-of-document Answer Key tables or lists (e.g. "ANSWER KEY", "SOLUTIONS")
 * 2. Per-question inline answer lines (e.g. "Ans: (B)" immediately following options)
 */
export function detectEmbeddedAnswers(lines: string[]): EmbeddedAnswerDetectionResult {
  if (!lines || lines.length === 0) {
    return { hasEmbeddedAnswers: false, entries: [], sourceLocation: 'NONE' };
  }

  // 1. Check for End-of-Document Answer Key Section
  // Typically appears in the last 30% of the document lines
  let answerKeyStartIndex = -1;
  let rawHeader = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      /^(?:ANSWERS?(?:\s*[\/\-&]\s*KEY)?|ANSWER\s*KEY|FINAL\s*ANSWERS?|SOLUTIONS?|KEY\s*AND\s*SOLUTIONS?|ANSWER\s*SHEET|KEYS?)\b/i.test(
        line
      ) &&
      line.length < 50
    ) {
      answerKeyStartIndex = i;
      rawHeader = line;
      break;
    }
  }

  if (answerKeyStartIndex >= 0) {
    const keyLines = lines.slice(answerKeyStartIndex);
    const entries = extractAnswerKeyFromLines(keyLines);
    if (entries.length > 0) {
      return {
        hasEmbeddedAnswers: true,
        entries,
        sourceLocation: 'END_OF_DOCUMENT',
        rawHeader,
      };
    }
  }

  // 2. Check for Per-Question Inline Answers:
  // e.g. "Ans: B", "Answer: (C)", "Correct Answer: A", "Ans. 42"
  const inlineEntries: RawAnswerEntry[] = [];
  const inlinePattern = /^(?:Ans(?:wer)?\.?|Correct\s*(?:Option|Ans(?:wer)?))\s*[:\-–—]?\s*(?:\(?([A-H])\)?|([0-9\.\-]+(?:\s*to\s*[0-9\.\-]+)?))/i;

  let currentQNum = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const qMatch = line.match(/^(?:Q(?:uestion)?\.?\s*(\d+)|\((\d+)\)|(\d+)\.)/i);
    if (qMatch) {
      currentQNum = parseInt(qMatch[1] || qMatch[2] || qMatch[3], 10);
    }

    const ansMatch = line.match(inlinePattern);
    if (ansMatch && currentQNum > 0) {
      const rawAns = (ansMatch[1] || ansMatch[2] || '').trim();
      const parsed = extractAnswerKeyFromLines([`Q${currentQNum}: ${rawAns}`]);
      if (parsed.length > 0) {
        inlineEntries.push(parsed[0]);
      }
    }
  }

  if (inlineEntries.length >= 1) {
    return {
      hasEmbeddedAnswers: true,
      entries: inlineEntries,
      sourceLocation: 'PER_QUESTION_INLINE',
    };
  }

  return {
    hasEmbeddedAnswers: false,
    entries: [],
    sourceLocation: 'NONE',
  };
}
