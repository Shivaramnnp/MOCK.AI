/**
 * Audio & Voice Ingestion Engine Type Definitions
 * Mock.AI Production Ingestion Engine - Prompt 8/10
 *
 * Strict Architectural Separation:
 * A. Live Voice Dictation (Microphone -> Speech Recognition -> Normalized Text -> User Confirmation -> Questions)
 * B. Audio File Ingestion (Upload -> Validation -> Transcription -> Timestamps -> Semantic Chunking -> Questions)
 */

import { CanonicalAsset, CanonicalQuestion } from '../../../types/canonicalQuestion';
import { IngestionErrorCode } from '../../../types/ingestionErrors';

export type AudioFormat = 'mp3' | 'wav' | 'm4a' | 'ogg' | 'aac' | 'flac' | 'webm';

export interface AudioSegment {
  id: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  startTimestamp: string; // e.g. "04:15"
  endTimestamp: string; // e.g. "05:30"
  speaker?: string; // e.g. "Speaker 1" or "Lecturer"
  text: string;
  confidence?: number; // 0.0 - 1.0
}

export interface AudioTranscriptIR {
  audioHash: string;
  fileName: string;
  format: AudioFormat;
  durationSeconds: number;
  totalSegments: number;
  segments: AudioSegment[];
  fullText: string;
  speakers: string[];
  isSilenceOnly?: boolean;
}

export interface AudioSemanticChunk {
  chunkIndex: number;
  title?: string;
  startTime: number;
  endTime: number;
  timeRangeFormatted: string; // e.g. "05:00 - 12:30"
  segments: AudioSegment[];
  mergedText: string;
}

export interface AudioValidationResult {
  valid: boolean;
  format?: AudioFormat;
  durationSeconds?: number;
  sizeBytes: number;
  error?: string;
  errorCode?: IngestionErrorCode;
}

export type AudioProgressStage =
  | 'Uploading'
  | 'Uploaded'
  | 'Transcribing'
  | 'Structuring'
  | 'Generating'
  | 'Validating'
  | 'Completed';

export interface AudioProgress {
  stage: AudioProgressStage;
  message: string;
  percentage: number;
  currentChunk?: number;
  totalChunks?: number;
}

export interface AudioFileInput {
  file?: File;
  arrayBuffer?: ArrayBuffer;
  base64Data?: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface LiveVoiceInput {
  rawTranscript: string;
  confirmedTranscript: string;
  speakerNotes?: string;
  timestamp?: number;
}

export interface AudioIngestionOptions {
  onProgress?: (progress: AudioProgress) => void;
  requestedCount?: number;
  mockTranscript?: AudioTranscriptIR;
  mockQuestions?: CanonicalQuestion[];
  chunkDurationSeconds?: number; // default 300 to 900 seconds (5-15 mins)
  chunkOverlapSeconds?: number; // default 30 seconds
}

export interface AudioIngestionResult {
  success: boolean;
  sourceType: 'Audio';
  sourceTitle: string;
  questions: CanonicalQuestion[];
  transcriptIR?: AudioTranscriptIR;
  chunks?: AudioSemanticChunk[];
  groundingFidelityScore: number;
  latencyMs: number;
  warnings: string[];
  error?: {
    code: IngestionErrorCode;
    message: string;
    userGuidance?: string;
  };
}
