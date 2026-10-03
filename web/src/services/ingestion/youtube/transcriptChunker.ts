/**
 * YouTube Transcript Semantic Chunker
 * Chunks long lectures by semantic time windows and natural pause boundaries
 * with configurable overlap to preserve continuity across topic transitions.
 */

import { YouTubeSemanticChunk, YouTubeTranscriptSegment } from './types';
import { formatTimestamp } from './transcriptFetcher';

export interface ChunkingOptions {
  targetChunkMinutes?: number; // default: 5.0 minutes (300 seconds)
  overlapSeconds?: number; // default: 20 seconds
  maxWordsPerChunk?: number; // default: 1500 words
}

/**
 * Derives a contextual segment title based on timing and initial text topics.
 */
function deriveChunkTitle(
  chunkIndex: number,
  startTime: number,
  endTime: number,
  text: string
): string {
  const timeSpan = `[${formatTimestamp(startTime)} - ${formatTimestamp(endTime)}]`;

  // Look for introductory words or key headings in the first 25 words
  const words = text.split(/\s+/).slice(0, 15).join(' ');
  const topicMatch = text.match(/(?:discuss|learn|focus on|look at|cover|chapter|section|part|today we)\s+([A-Za-z0-9\s-]{4,30})/i);

  if (topicMatch && topicMatch[1]) {
    const topic = topicMatch[1].trim();
    return `Part ${chunkIndex} ${timeSpan}: ${topic}`;
  }

  return `Part ${chunkIndex} ${timeSpan}`;
}

/**
 * Chunks normalized transcript segments into manageable semantic windows with overlap.
 */
export function chunkTranscript(
  segments: YouTubeTranscriptSegment[],
  options: ChunkingOptions = {}
): YouTubeSemanticChunk[] {
  if (!segments || segments.length === 0) return [];

  const {
    targetChunkMinutes = 5.0,
    overlapSeconds = 20,
    maxWordsPerChunk = 1500,
  } = options;

  const targetDurationSec = targetChunkMinutes * 60;
  const chunks: YouTubeSemanticChunk[] = [];

  let currentSegments: YouTubeTranscriptSegment[] = [];
  let chunkIndex = 1;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    currentSegments.push(seg);

    const chunkStart = currentSegments[0].start;
    const chunkEnd = seg.end;
    const duration = chunkEnd - chunkStart;
    const words = currentSegments.reduce((acc, s) => acc + s.text.split(' ').length, 0);

    const isLastSegment = i === segments.length - 1;
    const exceedsTarget = duration >= targetDurationSec || words >= maxWordsPerChunk;
    const isNaturalBreak = /[.?!]$/.test(seg.text.trim()) || (i < segments.length - 1 && segments[i + 1].start - seg.end > 1.5);

    if (isLastSegment || (exceedsTarget && isNaturalBreak)) {
      // Finalize this chunk
      const fullText = currentSegments.map((s) => s.text).join(' ').trim();
      const startTime = currentSegments[0].start;
      const endTime = currentSegments[currentSegments.length - 1].end;

      chunks.push({
        chunkIndex,
        title: deriveChunkTitle(chunkIndex, startTime, endTime, fullText),
        startTime,
        endTime,
        formattedStart: formatTimestamp(startTime),
        formattedEnd: formatTimestamp(endTime),
        segments: [...currentSegments],
        text: fullText,
        tokenCountApprox: Math.ceil(fullText.length / 4),
      });

      chunkIndex++;

      if (!isLastSegment) {
        // Collect overlap segments from tail for next chunk
        const overlapCutoff = endTime - overlapSeconds;
        const overlapSegments = currentSegments.filter((s) => s.start >= overlapCutoff);
        currentSegments = overlapSegments.length > 0 ? [...overlapSegments] : [];
      } else {
        currentSegments = [];
      }
    }
  }

  return chunks;
}
