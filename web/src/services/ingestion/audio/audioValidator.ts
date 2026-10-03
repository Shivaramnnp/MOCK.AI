/**
 * Audio File Validation & Security Verification
 * Mock.AI Production Ingestion Engine - Prompt 8/10
 *
 * Validates audio file headers, magic bytes, MIME types, and file size limits
 * without executing or trusting arbitrary user payloads.
 */

import { AudioFileInput, AudioFormat, AudioValidationResult } from './types';

const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100MB maximum
const MIN_AUDIO_BYTES = 12; // Minimum size for a valid audio header stub

const SUPPORTED_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac', 'webm']);

/**
 * Sanitizes file names to prevent path traversal and script injection.
 */
export function sanitizeAudioFileName(rawName: string): string {
  if (!rawName) return 'audio_recording.mp3';
  return rawName
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\.\./g, '_')
    .trim()
    .slice(0, 120);
}

/**
 * Detects audio format from byte signature (magic numbers).
 */
export function detectAudioFormatFromBytes(bytes: Uint8Array): AudioFormat | null {
  if (bytes.length < 4) return null;

  // 1. WAV: 'RIFF' .... 'WAVE'
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return 'wav';
  }

  // 2. MP3: 'ID3' or MPEG sync frame [0xFF, 0xFB/F3/F2]
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'mp3';
  }
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    // MPEG frame sync
    return 'mp3';
  }

  // 3. M4A / MP4 / AAC: 'ftyp' at offset 4 or ADTS sync [0xFF, 0xF1/F9]
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return 'm4a';
  }
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) {
    return 'aac';
  }

  // 4. OGG: 'OggS'
  if (
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return 'ogg';
  }

  // 5. FLAC: 'fLaC'
  if (
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    return 'flac';
  }

  // 6. WEBM: EBML ID [0x1A, 0x45, 0xDF, 0xA3]
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return 'webm';
  }

  return null;
}

/**
 * Detects format from filename extension.
 */
export function getFormatFromExtension(fileName: string): AudioFormat | null {
  const parts = fileName.toLowerCase().split('.');
  if (parts.length < 2) return null;
  const ext = parts[parts.length - 1];
  if (SUPPORTED_EXTENSIONS.has(ext)) {
    return ext as AudioFormat;
  }
  return null;
}

/**
 * Validates an AudioFileInput structure before ingestion.
 */
export async function validateAudioInput(
  input: AudioFileInput
): Promise<AudioValidationResult> {
  if (!input) {
    return {
      valid: false,
      sizeBytes: 0,
      error: 'Audio input payload is missing.',
      errorCode: 'INVALID_FILE',
    };
  }

  const fileName = sanitizeAudioFileName(input.fileName || 'recording.mp3');
  const extFormat = getFormatFromExtension(fileName);

  // Determine byte length
  let sizeBytes = input.sizeBytes || 0;
  let sampleBytes: Uint8Array | null = null;

  if (input.file) {
    sizeBytes = input.file.size;
  } else if (input.arrayBuffer) {
    sizeBytes = input.arrayBuffer.byteLength;
    sampleBytes = new Uint8Array(input.arrayBuffer.slice(0, 64));
  } else if (input.base64Data) {
    const clean = input.base64Data.includes(',')
      ? input.base64Data.split(',')[1]
      : input.base64Data;
    sizeBytes = Math.round((clean.length * 3) / 4);

    try {
      // Decode the first 64 bytes for magic number verification with safe padding
      let slice = clean.slice(0, 88);
      const rem = slice.length % 4;
      if (rem === 1) {
        slice = slice.slice(0, -1);
      } else if (rem === 2) {
        slice += '==';
      } else if (rem === 3) {
        slice += '=';
      }
      const head = atob(slice);
      sampleBytes = new Uint8Array(head.length);
      for (let i = 0; i < head.length; i++) {
        sampleBytes[i] = head.charCodeAt(i);
      }
    } catch {
      return {
        valid: false,
        sizeBytes,
        error: 'Audio payload contains invalid or corrupted Base64 encoding.',
        errorCode: 'INVALID_FILE',
      };
    }
  }

  // 1. Empty Audio Check
  if (sizeBytes < MIN_AUDIO_BYTES) {
    return {
      valid: false,
      sizeBytes,
      error: 'Audio file is empty or corrupted (under 12 bytes).',
      errorCode: 'INVALID_FILE',
    };
  }

  // 2. Maximum Size Limit (100MB)
  if (sizeBytes > MAX_AUDIO_BYTES) {
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      sizeBytes,
      error: `Audio file size (${sizeMb} MB) exceeds the maximum limit of 100 MB. Please trim or split the recording.`,
      errorCode: 'FILE_TOO_LARGE',
    };
  }

  // 3. Magic Byte & Format Verification
  let detectedFormat: AudioFormat | null = null;
  if (sampleBytes && sampleBytes.length >= 4) {
    // Reject executable binaries masquerading as audio (e.g. Windows PE 'MZ' or Linux ELF)
    if (sampleBytes[0] === 0x4d && sampleBytes[1] === 0x5a) {
      return {
        valid: false,
        sizeBytes,
        error: 'Uploaded file is an executable binary masquerading as an audio file.',
        errorCode: 'INVALID_FILE',
      };
    }
    if (sampleBytes[0] === 0x7f && sampleBytes[1] === 0x45 && sampleBytes[2] === 0x4c && sampleBytes[3] === 0x46) {
      return {
        valid: false,
        sizeBytes,
        error: 'Uploaded file is an executable binary masquerading as an audio file.',
        errorCode: 'INVALID_FILE',
      };
    }

    detectedFormat = detectAudioFormatFromBytes(sampleBytes);
  }

  const finalFormat = detectedFormat || extFormat;

  if (!finalFormat) {
    return {
      valid: false,
      sizeBytes,
      error: `Unsupported audio format for "${fileName}". Supported formats: MP3, WAV, M4A, OGG, AAC, FLAC, WEBM.`,
      errorCode: 'UNSUPPORTED_FORMAT',
    };
  }

  return {
    valid: true,
    format: finalFormat,
    sizeBytes,
  };
}
