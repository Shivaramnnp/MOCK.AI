/**
 * Live Voice Dictation Normalizer
 * Mock.AI Production Ingestion Engine - Prompt 8/10 (Feature A)
 *
 * Transforms raw spoken speech recognition transcripts into structured,
 * normalized text:
 * - Strips speech disfluency filler words (uh, um, you know, etc.)
 * - Converts spoken mathematical expressions into LaTeX notation
 * - Preserves question structure for candidate review & confirmation
 */

export interface VoiceNormalizationOptions {
  stripFillerWords?: boolean;
  convertSpokenMath?: boolean;
}

/**
 * Normalizes speech recognition text into clean, formal question text.
 */
export function normalizeVoiceTranscript(
  rawTranscript: string,
  options: VoiceNormalizationOptions = { stripFillerWords: true, convertSpokenMath: true }
): string {
  if (!rawTranscript || typeof rawTranscript !== 'string') return '';

  let text = rawTranscript.trim();

  // 1. Strip speech disfluencies and fillers
  if (options.stripFillerWords !== false) {
    // Matches standalone hesitation tokens: \b(uh|um|er|ah)\b
    text = text.replace(/\b(uh+|um+|erm+|ah+)\b\s*/gi, '');
    // Matches conversational fillers at beginning or set off by commas
    text = text.replace(/(^|,\s*)(you know|like|i mean|sort of|kind of)\s*,?/gi, '$1');
  }

  // 2. Convert spoken mathematics to LaTeX
  if (options.convertSpokenMath !== false) {
    text = convertSpokenMathToLatex(text);
  }

  // 3. Normalize spacing and punctuation
  text = text.replace(/\s{2,}/g, ' ').trim();

  // Ensure first character is capitalized
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // If question starts with interrogative word and lacks ending punctuation, append '?'
  if (
    /^(what|which|calculate|find|explain|determine|how|why|is|can|state|define)\b/i.test(text) &&
    !/[?.!]$/.test(text)
  ) {
    text += '?';
  }

  return text;
}

/**
 * Converts spoken mathematical phrases into KaTeX/LaTeX formatting.
 */
export function convertSpokenMathToLatex(input: string): string {
  let s = input;

  // Powers: "x squared" -> "$x^2$", "y cubed" -> "$y^3$"
  s = s.replace(/\b([a-zA-Z])\s+squared\b/gi, '$$$1^2$$');
  s = s.replace(/\b([a-zA-Z])\s+cubed\b/gi, '$$$1^3$$');
  s = s.replace(/\b([a-zA-Z])\s+to\s+the\s+power\s+of\s+([0-9a-zA-Z]+)\b/gi, '$$$1^{$2}$$');

  // Subscripts: "x sub i" -> "$x_i$", "a sub 12" -> "$a_{12}$"
  s = s.replace(/\b([a-zA-Z])\s+sub\s+([0-9a-zA-Z])\b/gi, '$$$1_$2$$');
  s = s.replace(/\b([a-zA-Z])\s+sub\s+([0-9a-zA-Z]{2,})\b/gi, '$$$1_{$2}$$');

  // Roots: "square root of x" -> "$\sqrt{x}$", "cube root of x" -> "$\sqrt[3]{x}$"
  s = s.replace(/\bsquare\s+root\s+of\s+([0-9a-zA-Z]+)\b/gi, '$$\\sqrt{$1}$$');
  s = s.replace(/\bcube\s+root\s+of\s+([0-9a-zA-Z]+)\b/gi, '$$\\sqrt[3]{$1}$$');

  // Integrals: "integral of f of x dx" -> "$\int f(x) \, dx$"
  s = s.replace(/\bintegral\s+of\s+([0-9a-zA-Z_]+)\s+dx\b/gi, '$$\\int $1 \\, dx$$');

  // Sums: "sum from i equals 1 to n" -> "$\sum_{i=1}^{n}$"
  s = s.replace(/\bsum\s+from\s+([a-zA-Z])\s+equals\s+([0-9]+)\s+to\s+([0-9a-zA-Z]+)\b/gi, '$$\\sum_{$1=$2}^{$3}$$');

  // Greek letters: "alpha", "beta", "theta", "pi", "sigma", "lambda"
  s = s.replace(/\b(alpha|beta|gamma|theta|pi|sigma|lambda|omega|delta)\b/gi, (match) => {
    return `$\\${match.toLowerCase()}$`;
  });

  // Comparisons and operators
  s = s.replace(/\bplus\s+or\s+minus\b/gi, '$\\pm$');
  s = s.replace(/\bis\s+greater\s+than\s+or\s+equal\s+to\b/gi, '$\\ge$');
  s = s.replace(/\bis\s+less\s+than\s+or\s+equal\s+to\b/gi, '$\\le$');
  s = s.replace(/\bis\s+not\s+equal\s+to\b/gi, '$\\ne$');

  return s;
}
