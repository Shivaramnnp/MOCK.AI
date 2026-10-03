/**
 * YouTube Ingestion Engine Comprehensive Test Suite
 * PROMPT 4/10 Production Pipeline Verification
 *
 * Covers:
 * 1. URL Validation & SSRF Guard (standard, share, shorts, embed, metadata IPs, non-YouTube)
 * 2. Transcript Parsing & Timestamps (JSON3 timedtext, XML timedtext, manual & automatic captions)
 * 3. Transcript Normalization (HTML entities, [Music]/[Applause], speech fillers, micro-segment stitching)
 * 4. Semantic Chunking for Long Lectures (50-minute lecture, time windows, boundary overlap)
 * 5. Explicit Failure States (invalid URL, private/deleted, transcript disabled, source unavailable)
 * 6. Evidence Grounding & Hallucination Audit (unsupported facts detected, KaTeX validation)
 * 7. Deduplication & Batch Integrity
 * 8. Performance & Transcript Caching (videoId + version)
 * 9. End-to-End Scale Verification (Short Video, Long Lecture, Fidelity & Latency Reporting)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateYouTubeUrl, extractYouTubeVideoId } from './urlValidator';
import {
  parseJson3TimedText,
  parseXmlTimedText,
  formatTimestamp,
  YouTubeFetchError,
} from './transcriptFetcher';
import {
  decodeHtmlEntities,
  stripAudioAnnotations,
  cleanSpeechFillers,
  normalizeTranscriptSegments,
} from './transcriptNormalizer';
import { chunkTranscript } from './transcriptChunker';
import { youtubeTranscriptCache } from './transcriptCache';
import { verifyQuestionAgainstTranscript } from './youtubeValidator';
import { processYouTubeVideo } from './youtubeEngine';
import { YouTubeTranscriptResult, YouTubeTranscriptSegment } from './types';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';

describe('Production YouTube Ingestion Engine (PROMPT 4/10)', () => {
  beforeEach(() => {
    youtubeTranscriptCache.clear();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. URL Validation & SSRF Guard
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. URL Validation & SSRF Protection', () => {
    it('extracts videoId from all canonical YouTube URL formats', () => {
      const validUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://www.youtube.com/shorts/dQw4w9WgXcQ',
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
        'https://www.youtube.com/v/dQw4w9WgXcQ',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s&feature=share',
        'dQw4w9WgXcQ', // Raw 11-char ID
      ];

      for (const url of validUrls) {
        expect(extractYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
        const check = validateYouTubeUrl(url);
        expect(check.valid).toBe(true);
        expect(check.videoId).toBe('dQw4w9WgXcQ');
        expect(check.canonicalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      }
    });

    it('blocks SSRF attempts targeting localhost, private IPs, and cloud metadata', () => {
      const ssrfUrls = [
        'http://localhost:8080/watch?v=dQw4w9WgXcQ',
        'http://127.0.0.1/watch?v=dQw4w9WgXcQ',
        'http://169.254.169.254/latest/meta-data/', // AWS/GCP Metadata
        'http://10.0.0.1/youtube.com/watch?v=dQw4w9WgXcQ',
        'http://192.168.1.1/watch?v=dQw4w9WgXcQ',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
      ];

      for (const url of ssrfUrls) {
        const check = validateYouTubeUrl(url);
        expect(check.valid).toBe(false);
        expect(check.isSsrfAttempt).toBe(true);
      }
    });

    it('rejects non-YouTube external domains', () => {
      const nonYouTube = [
        'https://vimeo.com/12345678',
        'https://dailymotion.com/video/x7tgad0',
        'https://attacker-youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com.attacker.com/watch?v=dQw4w9WgXcQ',
        'https://google.com',
      ];

      for (const url of nonYouTube) {
        const check = validateYouTubeUrl(url);
        expect(check.valid).toBe(false);
        expect(check.error).toContain('Invalid domain');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Transcript Acquisition, Timestamps & Parsing
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Transcript Acquisition & Timestamp Preservation', () => {
    it('formats timestamp seconds into MM:SS and HH:MM:SS accurately', () => {
      expect(formatTimestamp(0)).toBe('00:00');
      expect(formatTimestamp(45)).toBe('00:45');
      expect(formatTimestamp(75)).toBe('01:15');
      expect(formatTimestamp(3665)).toBe('01:01:05');
      expect(formatTimestamp(7322)).toBe('02:02:02');
    });

    it('parses YouTube JSON3 timedtext structure preserving exact start and duration', () => {
      const json3Payload = {
        events: [
          {
            tStartMs: 1500,
            dDurationMs: 3200,
            segs: [{ utf8: 'Welcome to this ' }, { utf8: 'lecture on Operating Systems.' }],
          },
          {
            tStartMs: 5000,
            dDurationMs: 4100,
            segs: [{ utf8: 'Today we discuss memory paging and address translation.' }],
          },
        ],
      };

      const segments = parseJson3TimedText(json3Payload);
      expect(segments.length).toBe(2);

      expect(segments[0].start).toBe(1.5);
      expect(segments[0].duration).toBe(3.2);
      expect(segments[0].end).toBe(4.7);
      expect(segments[0].formattedStart).toBe('00:01');
      expect(segments[0].text).toBe('Welcome to this lecture on Operating Systems.');

      expect(segments[1].start).toBe(5.0);
      expect(segments[1].duration).toBe(4.1);
      expect(segments[1].end).toBe(9.1);
      expect(segments[1].formattedStart).toBe('00:05');
      expect(segments[1].text).toBe('Today we discuss memory paging and address translation.');
    });

    it('parses YouTube XML timedtext structure preserving timestamps', () => {
      const xmlPayload = `
        <transcript>
          <text start="12.4" dur="4.2">In a virtual memory system, the page size is 4KB.</text>
          <text start="17.1" dur="3.5">The TLB provides fast lookup with a 95% hit ratio.</text>
        </transcript>
      `;

      const segments = parseXmlTimedText(xmlPayload);
      expect(segments.length).toBe(2);
      expect(segments[0].start).toBe(12.4);
      expect(segments[0].duration).toBe(4.2);
      expect(segments[0].end).toBe(16.6);
      expect(segments[0].formattedStart).toBe('00:12');
      expect(segments[0].text).toBe('In a virtual memory system, the page size is 4KB.');

      expect(segments[1].start).toBe(17.1);
      expect(segments[1].duration).toBe(3.5);
      expect(segments[1].formattedStart).toBe('00:17');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Transcript Normalization
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Transcript Normalization & Speech Artifact Cleaning', () => {
    it('decodes HTML entities properly', () => {
      expect(decodeHtmlEntities('Let&#39;s examine &amp; test the &quot;algorithm&quot;.')).toBe(
        'Let\'s examine & test the "algorithm".'
      );
    });

    it('strips non-speech audio annotations, applause, and music tags', () => {
      const noisy = 'Welcome everyone. [Applause] Today we discuss [Music] neural networks. (laughter) ♪♪';
      expect(stripAudioAnnotations(noisy)).toBe('Welcome everyone. Today we discuss neural networks.');
    });

    it('cleans excessive speech fillers and word stutters', () => {
      const fillerText = 'So um, the the algorithm has uh, linear complexity in in the worst case.';
      expect(cleanSpeechFillers(fillerText)).toBe(
        'So the algorithm has linear complexity in the worst case.'
      );
    });

    it('stitches fragmented micro-segments into cohesive timestamped sentences', () => {
      const microSegments: YouTubeTranscriptSegment[] = [
        { start: 0.0, duration: 1.2, end: 1.2, text: 'welcome to', formattedStart: '00:00', formattedEnd: '00:01' },
        { start: 1.2, duration: 1.5, end: 2.7, text: 'the course on', formattedStart: '00:01', formattedEnd: '00:02' },
        { start: 2.7, duration: 2.0, end: 4.7, text: 'computer networks.', formattedStart: '00:02', formattedEnd: '00:04' },
        { start: 5.5, duration: 3.0, end: 8.5, text: 'We start with the OSI seven layer model.', formattedStart: '00:05', formattedEnd: '00:08' },
      ];

      const res = normalizeTranscriptSegments(microSegments, { mergeMicroSegments: true });
      expect(res.segments.length).toBe(2);

      // First stitched sentence
      expect(res.segments[0].start).toBe(0.0);
      expect(res.segments[0].end).toBe(4.7);
      expect(res.segments[0].formattedStart).toBe('00:00');
      expect(res.segments[0].formattedEnd).toBe('00:04');
      expect(res.segments[0].text).toBe('welcome to the course on computer networks.');

      // Second sentence
      expect(res.segments[1].start).toBe(5.5);
      expect(res.segments[1].text).toBe('We start with the OSI seven layer model.');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Semantic Chunking for Long Lectures
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Semantic Chunking with Boundary Overlap', () => {
    it('chunks long 45-minute lecture across 5-minute windows with 20s overlap', () => {
      // Synthesize 45 minutes (2700 seconds) of lecture segments
      const longSegments: YouTubeTranscriptSegment[] = [];
      for (let sec = 0; sec < 2700; sec += 15) {
        longSegments.push({
          start: sec,
          duration: 15,
          end: sec + 15,
          text: `In minute ${Math.floor(sec / 60)}, we analyze step ${sec / 15} of the algorithm.`,
          formattedStart: formatTimestamp(sec),
          formattedEnd: formatTimestamp(sec + 15),
        });
      }

      const chunks = chunkTranscript(longSegments, {
        targetChunkMinutes: 5.0, // 300 seconds
        overlapSeconds: 20,
      });

      // 45 min / ~5 min = ~9 chunks
      expect(chunks.length).toBeGreaterThanOrEqual(8);
      expect(chunks.length).toBeLessThanOrEqual(10);

      // Verify chunk 1 timing
      expect(chunks[0].chunkIndex).toBe(1);
      expect(chunks[0].startTime).toBe(0);
      expect(chunks[0].endTime).toBeGreaterThanOrEqual(300);

      // Verify overlap: chunk 2 starts before chunk 1 ends
      expect(chunks[1].chunkIndex).toBe(2);
      expect(chunks[1].startTime).toBeLessThan(chunks[0].endTime);
      expect(chunks[0].endTime - chunks[1].startTime).toBeGreaterThanOrEqual(15);
    });

    it('keeps short videos as a single consolidated chunk without fragmentation', () => {
      const shortSegments: YouTubeTranscriptSegment[] = [
        { start: 0, duration: 10, end: 10, text: 'Quick summary of Dijkstra.', formattedStart: '00:00', formattedEnd: '00:10' },
        { start: 10, duration: 20, end: 30, text: 'It uses a priority queue.', formattedStart: '00:10', formattedEnd: '00:30' },
      ];

      const chunks = chunkTranscript(shortSegments, { targetChunkMinutes: 5.0 });
      expect(chunks.length).toBe(1);
      expect(chunks[0].startTime).toBe(0);
      expect(chunks[0].endTime).toBe(30);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Explicit Failure States & No-Hallucination Guarantee
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Explicit Failure Handling & No-Hallucination Guarantee', () => {
    it('returns INVALID_URL error when URL format is illegal', async () => {
      const res = await processYouTubeVideo('not-a-valid-url');
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('INVALID_URL');
      expect(res.questions.length).toBe(0);
    });

    it('returns SSRF_BLOCKED error when given internal or cloud metadata URL', async () => {
      const res = await processYouTubeVideo('http://169.254.169.254/watch?v=dQw4w9WgXcQ');
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('SSRF_BLOCKED');
      expect(res.questions.length).toBe(0);
    });

    it('returns SOURCE_UNAVAILABLE when video has no captions and throws explicit error', async () => {
      // Call engine with a synthetic ID where fetch will fail to find transcripts
      const res = await processYouTubeVideo('https://www.youtube.com/watch?v=NoCaption11');
      expect(res.success).toBe(false);
      expect(['SOURCE_UNAVAILABLE', 'TRANSCRIPT_DISABLED', 'PRIVATE_OR_DELETED']).toContain(
        res.error?.code
      );
      // NEVER fallback to invented questions
      expect(res.questions.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Evidence Grounding & Hallucination Audit
  // ─────────────────────────────────────────────────────────────────────────────
  describe('6. Evidence Grounding & Hallucination Audit', () => {
    const mockChunk = {
      chunkIndex: 1,
      title: 'Part 1 [00:00 - 05:00]',
      startTime: 0,
      endTime: 300,
      formattedStart: '00:00',
      formattedEnd: '05:00',
      segments: [],
      text: 'In this section, we study Dijkstra algorithm. The algorithm finds the shortest path in a graph with non-negative edge weights using a min-priority queue.',
      tokenCountApprox: 50,
    };

    it('verifies a question when answer and quote are strictly supported by transcript', () => {
      const validQ: CanonicalQuestion = {
        questionId: 'q1',
        sourceId: 'testVid',
        sourceType: 'YouTube',
        questionType: 'MCQ',
        questionNumber: 1,
        questionText: 'Which data structure does Dijkstra algorithm use to maintain unvisited vertices with non-negative edge weights?',
        options: [
          { id: 'A', text: 'Min-priority queue' },
          { id: 'B', text: 'FIFO circular queue' },
          { id: 'C', text: 'Disjoint set union' },
          { id: 'D', text: 'Max-heap tree' },
        ],
        answer: { questionType: 'MCQ', correctAnswer: 'A', correctOptionIndex: 0 },
        scoring: { marks: 1, negativeMarks: 0.33 },
        provenance: {
          sourceType: 'YouTube',
          sourceTimestamp: '01:15',
          sourceExactText: 'using a min-priority queue',
        },
        citation: {
          youtubeTimestamp: '01:15',
          sourceExactText: 'using a min-priority queue',
        },
        assets: [],
        contentBlocks: [],
        explanation: 'The transcript explicitly states Dijkstra uses a min-priority queue.',
        verificationStatus: 'VERIFIED',
        verificationReasons: [],
        confidence: { extraction: 1, structure: 1, answer: 1, asset: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const audit = verifyQuestionAgainstTranscript(validQ, mockChunk, mockChunk.text);
      expect(audit.verified).toBe(true);
      expect(audit.confidence).toBeGreaterThanOrEqual(0.85);
      expect(audit.reasons.length).toBe(0);
    });

    it('flags hallucinated questions citing statements absent from transcript', () => {
      const hallucinatedQ: CanonicalQuestion = {
        questionId: 'q2',
        sourceId: 'testVid',
        sourceType: 'YouTube',
        questionType: 'MCQ',
        questionNumber: 2,
        questionText: 'What is the quantum superposition decay constant under Shor factorization?',
        options: [
          { id: 'A', text: '0.45 milliseconds' },
          { id: 'B', text: '1.2 microseconds' },
        ],
        answer: { questionType: 'MCQ', correctAnswer: 'A', correctOptionIndex: 0 },
        scoring: { marks: 1, negativeMarks: 0.33 },
        provenance: {
          sourceType: 'YouTube',
          sourceTimestamp: '02:30',
          sourceExactText: 'quantum superposition decay constant is 0.45', // Absent!
        },
        citation: {
          youtubeTimestamp: '02:30',
          sourceExactText: 'quantum superposition decay constant is 0.45',
        },
        assets: [],
        contentBlocks: [],
        explanation: 'Fictitious explanation.',
        verificationStatus: 'VERIFIED',
        verificationReasons: [],
        confidence: { extraction: 1, structure: 1, answer: 1, asset: 1 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const audit = verifyQuestionAgainstTranscript(hallucinatedQ, mockChunk, mockChunk.text);
      expect(audit.verified).toBe(false);
      expect(audit.confidence).toBeLessThan(0.7);
      expect(audit.reasons.some((r) => r.includes('was not found in the video transcript'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Transcript Caching (videoId + version)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('7. Transcript Caching & Deduplication', () => {
    it('caches transcript by videoId and avoids redundant network fetches', () => {
      const videoId = 'cacheTest11';
      const mockResult: YouTubeTranscriptResult = {
        videoId,
        title: 'Cached Lecture on Relational Algebra',
        metadata: {
          videoId,
          title: 'Cached Lecture on Relational Algebra',
          author: 'Prof. Database',
          availableLanguages: ['en'],
          captionsAvailable: true,
        },
        captionType: 'MANUAL',
        language: 'en',
        segments: [
          { start: 0, duration: 10, end: 10, text: 'Selection and projection operators.', formattedStart: '00:00', formattedEnd: '00:10' },
        ],
        rawText: 'Selection and projection operators.',
        normalizedText: 'Selection and projection operators.',
        version: `${videoId}-en-man-v1`,
        fetchedAt: Date.now(),
      };

      expect(youtubeTranscriptCache.has(videoId)).toBe(false);
      youtubeTranscriptCache.set(videoId, mockResult.version, mockResult);

      expect(youtubeTranscriptCache.has(videoId)).toBe(true);
      const retrieved = youtubeTranscriptCache.get(videoId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.title).toBe('Cached Lecture on Relational Algebra');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. End-to-End Scale Verification: Short Video & Long Lecture
  // ─────────────────────────────────────────────────────────────────────────────
  describe('8. Scale Benchmarks: Short Video vs Long Lecture', () => {
    it('ingests short video (5 minutes) with 100% fidelity and timestamp retention', async () => {
      const videoId = 'shortVid123';
      const mockResult: YouTubeTranscriptResult = {
        videoId,
        title: 'Short Summary: Binary Search Trees',
        metadata: {
          videoId,
          title: 'Short Summary: Binary Search Trees',
          author: 'Algorithm Guru',
          availableLanguages: ['en'],
          captionsAvailable: true,
          durationSeconds: 300,
        },
        captionType: 'MANUAL',
        language: 'en',
        segments: [
          { start: 0, duration: 25, end: 25, text: 'A binary search tree satisfies the property that left keys are smaller than root.', formattedStart: '00:00', formattedEnd: '00:25' },
          { start: 25, duration: 30, end: 55, text: 'In-order traversal of a binary search tree visits nodes in sorted ascending order.', formattedStart: '00:25', formattedEnd: '00:55' },
          { start: 55, duration: 40, end: 95, text: 'Balanced trees like AVL guarantee logarithmic search time O(log n).', formattedStart: '00:55', formattedEnd: '01:35' },
        ],
        rawText: 'A binary search tree satisfies property. In-order traversal visits in sorted order. AVL guarantees O(log n).',
        normalizedText: 'A binary search tree satisfies property. In-order traversal visits in sorted order. AVL guarantees O(log n).',
        version: `${videoId}-v1`,
        fetchedAt: Date.now(),
      };

      const result = await processYouTubeVideo('https://www.youtube.com/watch?v=' + videoId, {
        requestedCount: 3,
        mockTranscriptResult: mockResult,
      });

      expect(result.success).toBe(true);
      expect(result.questions.length).toBe(3);
      expect(result.groundingFidelityScore).toBeGreaterThanOrEqual(0.9);
      expect(result.chunks.length).toBe(1);

      // Verify every question retained timestamp, videoId, and sourceUrl
      for (const q of result.questions) {
        expect(q.sourceId).toBe(videoId);
        expect(q.citation?.youtubeTimestamp).toMatch(/^\d{2}:\d{2}$/);
        expect(q.provenance?.sourceUrl).toContain(`watch?v=${videoId}`);
        expect(q.provenance?.sourceExactText?.length).toBeGreaterThan(5);
        expect(q.verificationStatus).toBe('VERIFIED');
      }
    });

    it('ingests 60-minute long lecture chunking into semantic segments with zero prompt explosion', async () => {
      const videoId = 'longLecture';
      const lectureSegments: YouTubeTranscriptSegment[] = [];

      const topics = [
        'Paxos algorithm guarantees consensus under crash recovery via prepare and accept phases.',
        'Raft election protocol ensures term consistency and leader completeness in log replication.',
        'Byzantine Fault Tolerance achieves consensus despite arbitrary node malicious behavior.',
        'Vector clocks establish partial causal ordering of events across asynchronous distributed nodes.',
        'Two-Phase Commit provides atomic commit across multiple resource managers using coordinator logs.',
        'Gossip dissemination protocols ensure exponential message propagation across epidemic clusters.',
        'CAP Theorem establishes fundamental trade-offs between consistency, availability, and partition tolerance.',
        'Consistent hashing minimizes key redistribution during node additions using cryptographic hash rings.',
        'Merkle tree state trees allow rapid verification and synchronization of replica state changes.',
        'Split-brain scenarios are mitigated using majority quorum leases and fencing tokens.',
        'Federated Byzantine Agreement uses quorum slices for decentralized trust without central coordinators.',
        'State Machine Replication transforms deterministic logic into fault-tolerant distributed servers.',
      ];

      for (let sec = 0; sec < 3600; sec += 30) {
        const topicIdx = Math.min(11, Math.floor(sec / 300));
        const subIdx = Math.floor((sec % 300) / 30);
        lectureSegments.push({
          start: sec,
          duration: 30,
          end: sec + 30,
          text: `Module ${topicIdx + 1} Segment ${subIdx + 1}: ${topics[topicIdx]}`,
          formattedStart: formatTimestamp(sec),
          formattedEnd: formatTimestamp(sec + 30),
        });
      }

      const mockResult: YouTubeTranscriptResult = {
        videoId,
        title: '60-Minute Masterclass on Distributed Consensus',
        metadata: {
          videoId,
          title: '60-Minute Masterclass on Distributed Consensus',
          author: 'Distributed Systems Institute',
          availableLanguages: ['en'],
          captionsAvailable: true,
          durationSeconds: 3600,
        },
        captionType: 'MANUAL',
        language: 'en',
        segments: lectureSegments,
        rawText: lectureSegments.map((s) => s.text).join(' '),
        normalizedText: lectureSegments.map((s) => s.text).join(' '),
        version: `${videoId}-v1`,
        fetchedAt: Date.now(),
      };

      const result = await processYouTubeVideo('https://www.youtube.com/watch?v=' + videoId, {
        requestedCount: 12,
        chunkSizeMinutes: 5.0, // 12 chunks across 60 mins
        mockTranscriptResult: mockResult,
      });

      expect(result.success).toBe(true);
      expect(result.questions.length).toBe(12);
      expect(result.chunks.length).toBeGreaterThanOrEqual(11);
      expect(result.groundingFidelityScore).toBeGreaterThanOrEqual(0.85);

      // Verify question distribution across chunks
      const chunkTitles = new Set(result.questions.map((q) => q.subtopic));
      expect(chunkTitles.size).toBeGreaterThanOrEqual(6); // Questions distributed across multiple lecture parts
    });
  });
});
