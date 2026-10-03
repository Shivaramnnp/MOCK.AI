/**
 * YouTube Transcript Normalizer
 * Decodes HTML entities, removes audio annotations ([Music], [Applause]),
 * filters speech fillers, and stitches micro-segments into cohesive timestamped sentences.
 */

import { YouTubeTranscriptSegment } from './types';
import { formatTimestamp } from './transcriptFetcher';

export interface NormalizationOptions {
  removeSoundEffects?: boolean; // default true
  cleanFillerWords?: boolean; // default true
  mergeMicroSegments?: boolean; // default true
  maxMergeDurationSeconds?: number; // default 12.0
  maxMergeWordCount?: number; // default 30
}

/**
 * Decodes common HTML entities found in YouTube caption tracks.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, '-')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Strips bracketed sound effects, applause, music, and musical notes.
 */
export function stripAudioAnnotations(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[(?:music|applause|laughter|cheering|inaudible|screaming|snicker|crosstalk|gasp|sigh|chuckle|cough|clearing throat|groan|groans|silence)[^\]]*\]/gi, ' ')
    .replace(/\((?:music|applause|laughter|cheering|inaudible|crosstalk)\)/gi, ' ')
    .replace(/[♪♫♩♬]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans excessive repetitive speech fillers (e.g. "um, uh, you know") and duplicate stutters.
 */
export function cleanSpeechFillers(text: string): string {
  if (!text) return '';

  return text
    // Remove standalone um, uh, er, ah surrounded by commas or boundaries
    .replace(/\b(?:um|uh|er|ah)\b,?\s*/gi, '')
    // Remove immediate word stutters (e.g. "the the" -> "the", "in in" -> "in")
    .replace(/\b([a-zA-Z]{2,})\s+\1\b/gi, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes an individual string snippet of transcript text.
 */
export function normalizeTranscriptSnippet(
  text: string,
  options: NormalizationOptions = {}
): string {
  if (!text) return '';
  const { removeSoundEffects = true, cleanFillerWords = true } = options;

  let cleaned = decodeHtmlEntities(text);

  if (removeSoundEffects) {
    cleaned = stripAudioAnnotations(cleaned);
  }

  if (cleanFillerWords) {
    cleaned = cleanSpeechFillers(cleaned);
  }

  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Stitches short, fragmented micro-segments into coherent timestamped sentences.
 */
export function normalizeTranscriptSegments(
  rawSegments: YouTubeTranscriptSegment[],
  options: NormalizationOptions = {}
): {
  segments: YouTubeTranscriptSegment[];
  normalizedText: string;
  wordCount: number;
  durationSeconds: number;
} {
  if (!rawSegments || rawSegments.length === 0) {
    return { segments: [], normalizedText: '', wordCount: 0, durationSeconds: 0 };
  }

  const {
    mergeMicroSegments = true,
    maxMergeDurationSeconds = 12.0,
    maxMergeWordCount = 30,
  } = options;

  // 1. Clean individual segment text
  const cleaned: YouTubeTranscriptSegment[] = [];
  for (const seg of rawSegments) {
    const text = normalizeTranscriptSnippet(seg.text, options);
    if (text) {
      cleaned.push({
        ...seg,
        text,
        formattedStart: formatTimestamp(seg.start),
        formattedEnd: formatTimestamp(seg.end),
      });
    }
  }

  if (!mergeMicroSegments || cleaned.length <= 1) {
    const normalizedText = cleaned.map((s) => s.text).join(' ');
    const wordCount = normalizedText.split(/\s+/).filter(Boolean).length;
    const lastSeg = cleaned[cleaned.length - 1];
    return {
      segments: cleaned,
      normalizedText,
      wordCount,
      durationSeconds: lastSeg ? lastSeg.end : 0,
    };
  }

  // 2. Stitch micro-segments
  const merged: YouTubeTranscriptSegment[] = [];
  let curGroup: YouTubeTranscriptSegment[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const seg = cleaned[i];

    if (curGroup.length === 0) {
      curGroup.push(seg);
      continue;
    }

    const firstInGroup = curGroup[0];
    const prevInGroup = curGroup[curGroup.length - 1];

    const currentDuration = seg.end - firstInGroup.start;
    const currentWordCount = curGroup.reduce((acc, s) => acc + s.text.split(' ').length, 0);
    const gapToNext = seg.start - prevInGroup.end;

    // Conditions to break a segment group:
    // 1. Sentence terminator in previous segment (. ? !)
    // 2. Long silence gap between speech (> 2.0s)
    // 3. Exceeded max merge duration or word count
    const prevEndsSentence = /[.?!]$/.test(prevInGroup.text.trim());
    const isBigPause = gapToNext > 2.0;
    const isTooLong = currentDuration > maxMergeDurationSeconds || currentWordCount > maxMergeWordCount;

    if (prevEndsSentence || isBigPause || isTooLong) {
      // Finalize current group
      const start = firstInGroup.start;
      const end = prevInGroup.end;
      const duration = parseFloat((end - start).toFixed(2));
      const text = curGroup.map((s) => s.text).join(' ').trim();

      merged.push({
        start,
        end,
        duration,
        text,
        formattedStart: formatTimestamp(start),
        formattedEnd: formatTimestamp(end),
      });

      curGroup = [seg];
    } else {
      curGroup.push(seg);
    }
  }

  // Finalize lingering group
  if (curGroup.length > 0) {
    const firstInGroup = curGroup[0];
    const lastInGroup = curGroup[curGroup.length - 1];
    const start = firstInGroup.start;
    const end = lastInGroup.end;
    const duration = parseFloat((end - start).toFixed(2));
    const text = curGroup.map((s) => s.text).join(' ').trim();

    merged.push({
      start,
      end,
      duration,
      text,
      formattedStart: formatTimestamp(start),
      formattedEnd: formatTimestamp(end),
    });
  }

  const normalizedText = merged.map((s) => s.text).join(' ');
  const wordCount = normalizedText.split(/\s+/).filter(Boolean).length;
  const lastSeg = merged[merged.length - 1];

  return {
    segments: merged,
    normalizedText,
    wordCount,
    durationSeconds: lastSeg ? lastSeg.end : 0,
  };
}
