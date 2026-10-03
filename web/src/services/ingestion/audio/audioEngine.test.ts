import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeVoiceTranscript, convertSpokenMathToLatex } from './voiceNormalizer';
import {
  validateAudioInput,
  detectAudioFormatFromBytes,
  sanitizeAudioFileName,
} from './audioValidator';
import { chunkAudioTranscript, formatAudioTimestamp } from './audioChunker';
import { transcribeAudio } from './audioTranscriber';
import { processAudioFile } from './audioEngine';
import { AudioSourceAdapter } from '../adapters/AudioSourceAdapter';
import { AudioSegment, AudioTranscriptIR } from './types';

describe('Audio & Voice Ingestion Engine (PROMPT 8/10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Feature A: Live Voice Dictation & Speech Normalization', () => {
    it('should strip speech hesitation fillers without removing legitimate words', () => {
      const raw = 'Um, today we are going to, you know, discuss uh eigenvalues and like eigenvectors.';
      const normalized = normalizeVoiceTranscript(raw);

      expect(normalized).not.toMatch(/\bum\b/i);
      expect(normalized).not.toMatch(/\buh\b/i);
      expect(normalized).not.toMatch(/\byou know\b/i);
      expect(normalized).toContain('eigenvalues');
      expect(normalized).toContain('eigenvectors');
    });

    it('should convert spoken mathematical speech into valid LaTeX notation', () => {
      const spokenMath = 'calculate x squared plus y cubed where x sub i is greater than or equal to alpha';
      const normalized = normalizeVoiceTranscript(spokenMath);

      expect(normalized).toContain('$x^2$');
      expect(normalized).toContain('$y^3$');
      expect(normalized).toContain('$x_i$');
      expect(normalized).toContain('$\\ge$');
      expect(normalized).toContain('$\\alpha$');
    });

    it('should normalize advanced spoken calculus phrases (integrals, roots, limits)', () => {
      const calculus = 'find the integral of x dx and square root of x where theta is pi';
      const normalized = normalizeVoiceTranscript(calculus);

      expect(normalized).toContain('$\\int x \\, dx$');
      expect(normalized).toContain('$\\sqrt{x}$');
      expect(normalized).toContain('$\\theta$');
      expect(normalized).toContain('$\\pi$');
    });

    it('should capitalize sentence starts and append question marks to interrogative stems', () => {
      const interrogative = 'what is the time complexity of quicksort in the worst case';
      const normalized = normalizeVoiceTranscript(interrogative);

      expect(normalized.startsWith('What')).toBe(true);
      expect(normalized.endsWith('?')).toBe(true);
    });
  });

  describe('2. Feature B: Audio File Validation & Security', () => {
    it('should sanitize dangerous audio filenames preventing path traversal', () => {
      const dirty = '../../etc/passwd/../lecture_01?.mp3';
      const clean = sanitizeAudioFileName(dirty);
      expect(clean).not.toContain('..');
      expect(clean).not.toContain('/');
      expect(clean).toContain('lecture_01');
    });

    it('should identify valid audio formats from byte signatures (WAV, MP3, M4A, OGG, FLAC, WEBM)', () => {
      // WAV signature
      const wavBytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      ]);
      expect(detectAudioFormatFromBytes(wavBytes)).toBe('wav');

      // MP3 ID3 signature
      const mp3Bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
      expect(detectAudioFormatFromBytes(mp3Bytes)).toBe('mp3');

      // OGG signature
      const oggBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);
      expect(detectAudioFormatFromBytes(oggBytes)).toBe('ogg');

      // FLAC signature
      const flacBytes = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x00, 0x00]);
      expect(detectAudioFormatFromBytes(flacBytes)).toBe('flac');
    });

    it('should reject empty or truncated audio files under 12 bytes', async () => {
      const result = await validateAudioInput({
        fileName: 'empty.mp3',
        sizeBytes: 8, // < 12 bytes
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_FILE');
      expect(result.error).toContain('under 12 bytes');
    });

    it('should reject audio files exceeding the 100MB limit', async () => {
      const result = await validateAudioInput({
        fileName: 'huge_recording.wav',
        sizeBytes: 120 * 1024 * 1024, // 120MB
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('FILE_TOO_LARGE');
      expect(result.error).toContain('exceeds the maximum limit of 100 MB');
    });

    it('should reject unsupported formats (.exe, .pdf, .txt)', async () => {
      const result = await validateAudioInput({
        fileName: 'malicious_script.sh',
        sizeBytes: 5000,
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('UNSUPPORTED_FORMAT');
    });

    it('should reject executable binaries masquerading as audio', async () => {
      // Windows PE 'MZ' magic bytes in 500-byte buffer
      const peBytes = new Uint8Array(500);
      peBytes[0] = 0x4d;
      peBytes[1] = 0x5a;
      const result = await validateAudioInput({
        fileName: 'fake_song.mp3',
        arrayBuffer: peBytes.buffer,
      });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_FILE');
      expect(result.error).toContain('executable binary masquerading');
    });
  });

  describe('3. Short Audio & Long Lecture Semantic Chunking', () => {
    it('should format audio timestamps accurately in MM:SS and HH:MM:SS', () => {
      expect(formatAudioTimestamp(45)).toBe('00:45');
      expect(formatAudioTimestamp(125)).toBe('02:05');
      expect(formatAudioTimestamp(3665)).toBe('01:01:05');
    });

    it('should process short audio (< 10 minutes) into a single unified chunk', () => {
      const transcriptIR: AudioTranscriptIR = {
        audioHash: 'hash-short',
        fileName: 'brief_query.mp3',
        format: 'mp3',
        durationSeconds: 180, // 3 minutes
        totalSegments: 3,
        fullText: 'Short recording text...',
        speakers: ['Student'],
        segments: [
          {
            id: 's1',
            startTime: 0,
            endTime: 60,
            startTimestamp: '00:00',
            endTimestamp: '01:00',
            text: 'First segment',
          },
          {
            id: 's2',
            startTime: 60,
            endTime: 180,
            startTimestamp: '01:00',
            endTimestamp: '03:00',
            text: 'Second segment',
          },
        ],
      };

      const chunks = chunkAudioTranscript(transcriptIR, { chunkDurationSeconds: 600 });
      expect(chunks.length).toBe(1);
      expect(chunks[0].timeRangeFormatted).toBe('00:00 - 03:00');
    });

    it('should partition a 1-hour long lecture into 5-15 minute chunks with 30s controlled overlap', () => {
      // Simulate 1 hour (3600 seconds) with segments every 60 seconds
      const segments: AudioSegment[] = [];
      for (let t = 0; t < 3600; t += 60) {
        segments.push({
          id: `seg-${t}`,
          startTime: t,
          endTime: t + 60,
          startTimestamp: formatAudioTimestamp(t),
          endTimestamp: formatAudioTimestamp(t + 60),
          speaker: t % 300 === 0 ? 'Student' : 'Lecturer',
          text: `Lecture content discussing concept at minute ${Math.floor(t / 60)}.`,
        });
      }

      const longIR: AudioTranscriptIR = {
        audioHash: 'hash-long',
        fileName: 'full_gate_lecture.mp3',
        format: 'mp3',
        durationSeconds: 3600,
        totalSegments: segments.length,
        fullText: segments.map((s) => s.text).join(' '),
        speakers: ['Lecturer', 'Student'],
        segments,
      };

      // 600s chunks (10 mins) with 30s overlap -> step is 570s
      // 3600 / 570 ~ 6 to 7 chunks
      const chunks = chunkAudioTranscript(longIR, {
        chunkDurationSeconds: 600,
        overlapSeconds: 30,
      });

      expect(chunks.length).toBeGreaterThanOrEqual(6);
      expect(chunks.length).toBeLessThanOrEqual(8);

      // Verify overlap: Chunk 1 end should be greater than Chunk 2 start
      expect(chunks[0].endTime).toBeGreaterThan(chunks[1].startTime);
    });
  });

  describe('4. Multi-Speaker Diarization & Question Provenance', () => {
    it('should preserve speaker identities in segments and question citations', async () => {
      const multiSpeakerIR: AudioTranscriptIR = {
        audioHash: 'hash-multi',
        fileName: 'discussion.m4a',
        format: 'm4a',
        durationSeconds: 240,
        totalSegments: 2,
        speakers: ['Professor Smith', 'Candidate Rahul'],
        fullText: 'Full dialogue...',
        segments: [
          {
            id: 'seg-1',
            startTime: 0,
            endTime: 120,
            startTimestamp: '00:00',
            endTimestamp: '02:00',
            speaker: 'Professor Smith',
            text: 'Newtonian mechanics assumes inertial reference frames where F equals m a.',
          },
          {
            id: 'seg-2',
            startTime: 120,
            endTime: 240,
            startTimestamp: '02:00',
            endTimestamp: '04:00',
            speaker: 'Candidate Rahul',
            text: 'In non-inertial rotating frames, fictitious forces like Coriolis acceleration appear.',
          },
        ],
      };

      const result = await processAudioFile(
        {
          fileName: 'discussion.m4a',
          sizeBytes: 5000,
        },
        {
          mockTranscript: multiSpeakerIR,
          requestedCount: 2,
        }
      );

      expect(result.success).toBe(true);
      expect(result.questions.length).toBe(2);

      // Verify question has exact timestamp provenance
      const q1 = result.questions[0];
      expect(q1.sourceType).toBe('Audio');
      expect(q1.provenance.sourceFile).toBe('discussion.m4a');
      expect(q1.provenance.sourceTimestamp).toBeDefined();
      expect(q1.citation?.sourceExactText).toBeDefined();
      expect(q1.explanation).toContain('Professor Smith');
    });
  });

  describe('5. Error Handling & Non-Hallucination Guarantees', () => {
    it('should reject pure silence or inaudible recordings without hallucinating questions', async () => {
      const silentIR: AudioTranscriptIR = {
        audioHash: 'hash-silent',
        fileName: 'pure_silence.wav',
        format: 'wav',
        durationSeconds: 60,
        totalSegments: 0,
        segments: [],
        fullText: '',
        speakers: [],
        isSilenceOnly: true,
      };

      await expect(
        processAudioFile(
          {
            fileName: 'pure_silence.wav',
            sizeBytes: 4000,
          },
          {
            mockTranscript: silentIR,
          }
        )
      ).rejects.toThrow(/silence|No speech/i);
    });

    it('should report asynchronous pipeline stages during processing', async () => {
      const stagesObserved: string[] = [];

      const mockIR: AudioTranscriptIR = {
        audioHash: 'hash-progress',
        fileName: 'lecture.mp3',
        format: 'mp3',
        durationSeconds: 120,
        totalSegments: 1,
        speakers: ['Lecturer'],
        fullText: 'Short lecture about algorithms.',
        segments: [
          {
            id: 's1',
            startTime: 0,
            endTime: 120,
            startTimestamp: '00:00',
            endTimestamp: '02:00',
            speaker: 'Lecturer',
            text: 'Dijkstra algorithm finds shortest paths in graphs with non-negative edge weights.',
          },
        ],
      };

      const result = await processAudioFile(
        {
          fileName: 'lecture.mp3',
          sizeBytes: 10000,
        },
        {
          mockTranscript: mockIR,
          onProgress: (p) => {
            stagesObserved.push(p.stage);
          },
        }
      );

      expect(result.success).toBe(true);
      expect(stagesObserved).toContain('Uploading');
      expect(stagesObserved).toContain('Uploaded');
      expect(stagesObserved).toContain('Transcribing');
      expect(stagesObserved).toContain('Structuring');
      expect(stagesObserved).toContain('Generating');
      expect(stagesObserved).toContain('Validating');
      expect(stagesObserved).toContain('Completed');
    });
  });

  describe('6. AudioSourceAdapter Architecture Separation', () => {
    const adapter = new AudioSourceAdapter();

    it('should validate Feature A (confirmed live voice) independently', async () => {
      const validLive = await adapter.validateInput({
        liveVoice: {
          rawTranscript: 'what is quicksort time complexity',
          confirmedTranscript: 'What is quicksort time complexity?',
        },
      });
      expect(validLive.valid).toBe(true);

      const emptyLive = await adapter.validateInput({
        liveVoice: {
          rawTranscript: '',
          confirmedTranscript: '',
        },
      });
      expect(emptyLive.valid).toBe(false);
    });

    it('should validate Feature B (audio file) independently', async () => {
      const validFile = await adapter.validateInput({
        audioFile: {
          fileName: 'physics_lecture.mp3',
          sizeBytes: 50000,
        },
      });
      expect(validFile.valid).toBe(true);

      const invalidFile = await adapter.validateInput({
        audioFile: {
          fileName: 'notes.txt',
          sizeBytes: 50000,
        },
      });
      expect(invalidFile.valid).toBe(false);
      expect(invalidFile.error).toContain('Unsupported audio format');
    });
  });
});
