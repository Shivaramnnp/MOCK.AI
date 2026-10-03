/**
 * Long Audio Semantic & Temporal Chunker
 * Mock.AI Production Ingestion Engine - Prompt 8/10 (Feature B)
 *
 * Partitions long audio transcripts into 5–15 minute logical chunks
 * with controlled overlap (e.g. 30 seconds) so that concepts or formulas
 * spanning chunk boundaries are preserved.
 */

import { AudioSegment, AudioSemanticChunk, AudioTranscriptIR } from './types';

export interface ChunkerOptions {
  chunkDurationSeconds?: number; // Default: 600 seconds (10 minutes)
  overlapSeconds?: number; // Default: 30 seconds
}

/**
 * Formats a duration in seconds to "MM:SS" or "HH:MM:SS".
 */
export function formatAudioTimestamp(seconds: number): string {
  const totalSecs = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');

  if (hrs > 0) {
    const hh = hrs.toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Splits an AudioTranscriptIR into sequential semantic chunks.
 */
export function chunkAudioTranscript(
  transcriptIR: AudioTranscriptIR,
  options: ChunkerOptions = {}
): AudioSemanticChunk[] {
  const { segments, durationSeconds } = transcriptIR;

  if (!segments || segments.length === 0) {
    return [];
  }

  const chunkDuration = options.chunkDurationSeconds || 600; // 10 minutes default
  const overlap = options.overlapSeconds || 30; // 30 seconds overlap

  // If audio is shorter than or equal to one chunk, return single chunk
  if (durationSeconds <= chunkDuration || segments.length <= 4) {
    const firstSec = segments[0]?.startTime || 0;
    const lastSec = segments[segments.length - 1]?.endTime || durationSeconds;

    return [
      {
        chunkIndex: 0,
        title: `${transcriptIR.fileName} (Full Audio)`,
        startTime: firstSec,
        endTime: lastSec,
        timeRangeFormatted: `${formatAudioTimestamp(firstSec)} - ${formatAudioTimestamp(lastSec)}`,
        segments: [...segments],
        mergedText: buildMergedText(segments),
      },
    ];
  }

  const chunks: AudioSemanticChunk[] = [];
  let currentStart = 0;
  let chunkIdx = 0;

  while (currentStart < durationSeconds) {
    const currentEnd = Math.min(durationSeconds, currentStart + chunkDuration);

    // Filter segments that fall within or overlap [currentStart, currentEnd]
    const chunkSegments = segments.filter(
      (seg) => seg.endTime >= currentStart && seg.startTime <= currentEnd
    );

    if (chunkSegments.length > 0) {
      const segStart = chunkSegments[0].startTime;
      const segEnd = chunkSegments[chunkSegments.length - 1].endTime;

      chunks.push({
        chunkIndex: chunkIdx,
        title: `${transcriptIR.fileName} - Part ${chunkIdx + 1}`,
        startTime: segStart,
        endTime: segEnd,
        timeRangeFormatted: `${formatAudioTimestamp(segStart)} - ${formatAudioTimestamp(segEnd)}`,
        segments: chunkSegments,
        mergedText: buildMergedText(chunkSegments),
      });

      chunkIdx++;
    }

    // Step forward by (chunkDuration - overlap)
    const step = chunkDuration - overlap;
    currentStart += step;

    // Guard against infinite loop if step <= 0
    if (step <= 0 || currentStart >= durationSeconds) break;
  }

  return chunks;
}

/**
 * Builds formatted text with timestamps and speaker labels.
 */
function buildMergedText(segments: AudioSegment[]): string {
  return segments
    .map((seg) => {
      const speakerPrefix = seg.speaker ? `[${seg.speaker}] ` : '';
      return `[${seg.startTimestamp}] ${speakerPrefix}${seg.text}`;
    })
    .join('\n');
}
