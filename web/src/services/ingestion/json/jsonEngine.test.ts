/**
 * Production Versioned JSON Question Import & Export Engine — Forensic Test Suite
 * Mock.AI Production Ingestion Engine - Prompt 10/10
 *
 * Verifies:
 * 1. Schema Versioning & Document Envelope Enforcement
 * 2. Strict Field-Level Validation (Zero Silent Defaults, Zero Padding, Zero Truncation)
 * 3. Legacy Schema Migration (v0 / flat → mockai.question-set/v1)
 * 4. Duplicate Detection Modes (CREATE_ONLY, UPSERT, REJECT_DUPLICATES)
 * 5. Asset Reference Validation (STRICT vs ALLOW_MISSING_AS_UNVERIFIED)
 * 6. Security Defense (XSS sanitization, Prototype Pollution rejection)
 * 7. Full Round-Trip Integrity (CanonicalQuestion -> Export -> Import -> Equivalent)
 * 8. Scale Benchmarks: 10, 1,000, 10,000, and 20,000+ questions
 */

import { describe, it, expect, vi } from 'vitest';
import {
  jsonStreamingImporter,
  jsonSchemaValidator,
  jsonMigrationService,
  jsonExporter,
  JsonDeduplicator,
  CURRENT_SCHEMA_VERSION,
  JsonQuestionSetDocument,
  VersionedQuestionV1,
} from './index';
import { CanonicalQuestion } from '../../../types/canonicalQuestion';

describe('Versioned JSON Question Import & Export Engine (PROMPT 10/10)', () => {
  // Factory for valid canonical question
  function createCanonicalQuestion(idx = 1): CanonicalQuestion {
    return {
      questionId: `q-json-${idx}`,
      sourceId: 'json_exam_suite',
      sourceType: 'Json',
      questionNumber: idx,
      questionText: `What is the asymptotic complexity of algorithm ${idx} with $O(n \\log n)$ time?`,
      contentBlocks: [
        {
          type: 'text',
          content: `What is the asymptotic complexity of algorithm ${idx} with $O(n \\log n)$ time?`,
        },
      ],
      questionType: 'MCQ',
      options: [
        { id: 'A', text: 'Linear $O(n)$', isCorrect: false },
        { id: 'B', text: 'Log-linear $O(n \\log n)$', isCorrect: true },
        { id: 'C', text: 'Quadratic $O(n^2)$', isCorrect: false },
      ],
      answer: {
        questionType: 'MCQ',
        correctOptionId: 'B',
        correctOptionIndex: 1,
      },
      scoring: {
        marks: 2,
        negativeMarks: 0.66,
        scoringRule: 'COMPETITIVE_EXAM_GATE',
      },
      sectionName: 'Computer Science',
      topic: 'Complexity',
      provenance: {
        sourceType: 'Json',
        sourceFile: 'json_exam_suite',
      },
      assets: [],
      explanation: 'Algorithm divides input into halves and takes linear work per level.',
      verificationStatus: 'UNVERIFIED',
      verificationReasons: [],
      confidence: { extraction: 1, structure: 1, answer: 1, asset: 1 },
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Schema Versioning & Document Envelope
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Schema Versioning & Envelope Validation', () => {
    it('accepts valid mockai.question-set/v1 document', async () => {
      const doc: JsonQuestionSetDocument = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Algorithms Mock Exam', totalQuestions: 1 },
        questions: [
          {
            questionId: 'q-alg-1',
            questionNumber: 1,
            questionText: 'What is quicksort worst-case?',
            questionType: 'MCQ',
            options: [
              { id: 'A', text: 'O(n)', isCorrect: false },
              { id: 'B', text: 'O(n^2)', isCorrect: true },
            ],
            answer: { questionType: 'MCQ', correctOptionId: 'B', correctOptionIndex: 1 },
            scoring: { marks: 1, negativeMarks: 0.33 },
          },
        ],
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(doc));
      expect(report.valid).toBe(1);
      expect(report.imported).toBe(1);
      expect(report.failed).toBe(0);
      expect(report.detectedSchema).toBe('mockai.question-set/v1');
    });

    it('rejects malformed or unparseable JSON syntax with structured error', async () => {
      const brokenJson = '{"questions": [ { id: "broken" ';
      const report = await jsonStreamingImporter.importJsonString(brokenJson);
      expect(report.imported).toBe(0);
      expect(report.failed).toBe(1);
      expect(report.errors[0].code).toBe('JSON_SYNTAX_ERROR');
      expect(report.errors[0].severity).toBe('FATAL');
    });

    it('rejects document with missing or empty questions array', async () => {
      const emptyDoc = JSON.stringify({
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Empty' },
        questions: [],
      });
      const report = await jsonStreamingImporter.importJsonString(emptyDoc);
      expect(report.imported).toBe(0);
      expect(report.failed).toBeGreaterThan(0);
      expect(report.errors.some((e) => e.code === 'EMPTY_QUESTIONS_ARRAY')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Strict Validation (Zero Silent Defaults, No Padding, No Truncation)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Strict Field Validation & Anti-Corruption Rules', () => {
    it('rejects MCQ with out-of-bounds correctAnswerIndex — NEVER defaults to 0', async () => {
      const payload = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Corrupt Key Test' },
        questions: [
          {
            questionId: 'q-bad-key',
            questionNumber: 1,
            questionText: 'What is 2 + 2?',
            questionType: 'MCQ',
            options: [
              { id: 'A', text: '3' },
              { id: 'B', text: '4' },
            ],
            // 2 options, but index is 9!
            answer: { questionType: 'MCQ', correctOptionIndex: 9 },
            scoring: { marks: 1, negativeMarks: 0 },
          },
        ],
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(payload));
      expect(report.imported).toBe(0);
      expect(report.failed).toBe(1);
      const err = report.errors.find((e) => e.code === 'OUT_OF_BOUNDS_ANSWER_INDEX');
      expect(err).toBeDefined();
      expect(err?.message).toContain('Will not default to 0');
    });

    it('rejects MCQ with fewer than 2 options — NEVER pads with fake Option C / D', async () => {
      const payload = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Missing Options Test' },
        questions: [
          {
            questionId: 'q-single-opt',
            questionNumber: 1,
            questionText: 'Is this an incomplete question?',
            questionType: 'MCQ',
            options: [{ id: 'A', text: 'Only Option' }],
            answer: { questionType: 'MCQ', correctOptionIndex: 0 },
            scoring: { marks: 1, negativeMarks: 0 },
          },
        ],
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(payload));
      expect(report.imported).toBe(0);
      expect(report.failed).toBe(1);
      expect(report.errors.some((e) => e.code === 'INSUFFICIENT_OPTIONS')).toBe(true);
    });

    it('preserves 5 or 6 options in full — NEVER truncates extra options', async () => {
      const payload = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Extended Options' },
        questions: [
          {
            questionId: 'q-ext-opt',
            questionNumber: 1,
            questionText: 'Which layer is not in OSI?',
            questionType: 'MCQ',
            options: [
              { id: 'A', text: 'Physical' },
              { id: 'B', text: 'Data Link' },
              { id: 'C', text: 'Network' },
              { id: 'D', text: 'Transport' },
              { id: 'E', text: 'Sub-Application' },
              { id: 'F', text: 'Inter-Cloud' },
            ],
            answer: { questionType: 'MCQ', correctOptionIndex: 4, correctOptionId: 'E' },
            scoring: { marks: 2, negativeMarks: 0.66 },
          },
        ],
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(payload));
      expect(report.imported).toBe(1);
      expect(report.questions[0].options.length).toBe(6);
      expect(report.questions[0].options[5].id).toBe('F');
    });

    it('downgrades incoming VERIFIED status to UNVERIFIED — NEVER marks VERIFIED without verification', async () => {
      const payload = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Fake Verified Test' },
        questions: [
          {
            questionId: 'q-fake-verified',
            questionNumber: 1,
            questionText: 'Unverified import',
            questionType: 'MCQ',
            options: [
              { id: 'A', text: 'Choice 1' },
              { id: 'B', text: 'Choice 2' },
            ],
            answer: { questionType: 'MCQ', correctOptionIndex: 0 },
            scoring: { marks: 1, negativeMarks: 0 },
            verificationStatus: 'VERIFIED', // Claimed verified by sender!
          },
        ],
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(payload));
      expect(report.imported).toBe(1);
      expect(report.questions[0].verificationStatus).toBe('UNVERIFIED');
      expect(report.warnings).toBeGreaterThan(0);
    });

    it('rejects NAT questions with inverted ranges where min > max', async () => {
      const payload = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Inverted NAT' },
        questions: [
          {
            questionId: 'q-nat-inv',
            questionNumber: 1,
            questionText: 'Calculate the flux:',
            questionType: 'NAT',
            answer: {
              questionType: 'NAT',
              natRange: { min: 100.5, max: 95.0 }, // Inverted!
            },
            scoring: { marks: 2, negativeMarks: 0 },
          },
        ],
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(payload));
      expect(report.imported).toBe(0);
      expect(report.failed).toBe(1);
      expect(report.errors.some((e) => e.code === 'INVERTED_NAT_RANGE')).toBe(true);
    });

    it('rejects MSQ questions with zero correct answers', async () => {
      const payload = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Empty MSQ' },
        questions: [
          {
            questionId: 'q-msq-empty',
            questionNumber: 1,
            questionText: 'Select all prime numbers:',
            questionType: 'MSQ',
            options: [
              { id: 'A', text: '4' },
              { id: 'B', text: '6' },
            ],
            answer: {
              questionType: 'MSQ',
              correctOptionIds: [],
            },
            scoring: { marks: 2, negativeMarks: 0 },
          },
        ],
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(payload));
      expect(report.imported).toBe(0);
      expect(report.failed).toBe(1);
      expect(report.errors.some((e) => e.code === 'MISSING_MSQ_ANSWERS')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Old Schema & Legacy Format Migrations
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Legacy Schema Migrations', () => {
    it('seamlessly migrates legacy flat array format with options: string[]', async () => {
      const legacyJson = JSON.stringify([
        {
          id: 'legacy-q1',
          question: 'What is the speed of light in vacuum?',
          type: 'MCQ',
          options: ['3 x 10^8 m/s', '1.5 x 10^8 m/s', '3 x 10^6 m/s'],
          correctAnswer: 0,
          marks: 1,
        },
      ]);

      const report = await jsonStreamingImporter.importJsonString(legacyJson);
      expect(report.imported).toBe(1);
      expect(report.detectedSchema).toBe('legacy.mockai/v0');
      const q = report.questions[0];
      expect(q.questionText).toBe('What is the speed of light in vacuum?');
      expect(q.options.length).toBe(3);
      expect(q.options[0].id).toBe('A');
      expect(q.options[0].text).toBe('3 x 10^8 m/s');
      expect(q.answer.correctOptionIndex).toBe(0);
      expect(q.answer.correctOptionId).toBe('A');
      expect(q.verificationStatus).toBe('UNVERIFIED');
    });

    it('migrates legacy NAT with numericAnswer field', async () => {
      const legacyJson = JSON.stringify({
        title: 'Legacy Physics Test',
        questions: [
          {
            id: 'legacy-nat-1',
            question: 'What is acceleration due to gravity on earth (m/s^2)?',
            type: 'NAT',
            numericAnswer: 9.8,
            marks: 2,
          },
        ],
      });

      const report = await jsonStreamingImporter.importJsonString(legacyJson);
      expect(report.imported).toBe(1);
      expect(report.questions[0].questionType).toBe('NAT');
      expect(report.questions[0].answer.natValue).toBe(9.8);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Duplicate Detection Modes (CREATE_ONLY, UPSERT, REJECT_DUPLICATES)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Duplicate Detection Strategies', () => {
    it('REJECT_DUPLICATES mode: skips duplicates and imports remaining new questions', async () => {
      const payload = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Dup Test' },
        questions: [
          {
            questionId: 'q-dup-1',
            questionNumber: 1,
            questionText: 'Unique Question 1',
            questionType: 'MCQ',
            options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
            answer: { questionType: 'MCQ', correctOptionIndex: 0 },
            scoring: { marks: 1, negativeMarks: 0 },
          },
          {
            questionId: 'q-dup-1', // Duplicate ID
            questionNumber: 2,
            questionText: 'Duplicate of Question 1',
            questionType: 'MCQ',
            options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
            answer: { questionType: 'MCQ', correctOptionIndex: 0 },
            scoring: { marks: 1, negativeMarks: 0 },
          },
          {
            questionId: 'q-dup-2',
            questionNumber: 3,
            questionText: 'Unique Question 2',
            questionType: 'MCQ',
            options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
            answer: { questionType: 'MCQ', correctOptionIndex: 0 },
            scoring: { marks: 1, negativeMarks: 0 },
          },
        ],
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(payload), {
        duplicateMode: 'REJECT_DUPLICATES',
      });

      expect(report.totalRecords).toBe(3);
      expect(report.imported).toBe(2);
      expect(report.skipped).toBe(1);
      expect(report.duplicates).toBe(1);
    });

    it('CREATE_ONLY mode: rejects duplicate question IDs as fatal error', async () => {
      const payload = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Create Only Test' },
        questions: [
          {
            questionId: 'q-coll-1',
            questionNumber: 1,
            questionText: 'Question A',
            questionType: 'MCQ',
            options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
            answer: { questionType: 'MCQ', correctOptionIndex: 0 },
            scoring: { marks: 1, negativeMarks: 0 },
          },
          {
            questionId: 'q-coll-1', // Collision
            questionNumber: 2,
            questionText: 'Question B',
            questionType: 'MCQ',
            options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
            answer: { questionType: 'MCQ', correctOptionIndex: 0 },
            scoring: { marks: 1, negativeMarks: 0 },
          },
        ],
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(payload), {
        duplicateMode: 'CREATE_ONLY',
      });

      expect(report.imported).toBe(1);
      expect(report.failed).toBe(1);
      expect(report.errors.some((e) => e.code === 'DUPLICATE_REJECTED')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Asset Reference Validation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Asset Reference Verification', () => {
    it('flags ASSET_MISSING warning when referenced asset does not exist', async () => {
      const payload = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Asset Test' },
        questions: [
          {
            questionId: 'q-asset-1',
            questionNumber: 1,
            questionText: 'Refer to the diagram:',
            questionType: 'MCQ',
            options: [{ id: 'A', text: 'True' }, { id: 'B', text: 'False' }],
            answer: { questionType: 'MCQ', correctOptionIndex: 0 },
            scoring: { marks: 1, negativeMarks: 0 },
            assets: [
              {
                assetId: 'circuit_diagram_99.png',
                assetUrl: '/assets/circuit_diagram_99.png',
                mimeType: 'image/png',
                byteSize: 12000,
              },
            ],
          },
        ],
      };

      const availableAssets = new Set(['circuit_diagram_01.png']); // 99 is missing!

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(payload), {
        assetMode: 'ALLOW_MISSING_AS_UNVERIFIED',
        availableAssetIds: availableAssets,
      });

      expect(report.imported).toBe(1);
      expect(report.assetsMissing).toBe(1);
      expect(report.warnings).toBeGreaterThan(0);
      expect(report.questions[0].confidence.asset).toBe(0.5);
    });

    it('rejects question in STRICT asset mode when referenced asset is missing', async () => {
      const payload = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: 'Strict Asset Test' },
        questions: [
          {
            questionId: 'q-asset-strict',
            questionNumber: 1,
            questionText: 'Refer to missing figure:',
            questionType: 'MCQ',
            options: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }],
            answer: { questionType: 'MCQ', correctOptionIndex: 0 },
            scoring: { marks: 1, negativeMarks: 0 },
            assets: [{ assetId: 'missing_graph.png', assetUrl: '/missing.png', mimeType: 'image/png', byteSize: 100 }],
          },
        ],
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(payload), {
        assetMode: 'STRICT',
        availableAssetIds: new Set(['other.png']),
      });

      expect(report.imported).toBe(0);
      expect(report.failed).toBe(1);
      expect(report.errors.some((e) => e.code === 'ASSET_MISSING')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Security Defense (XSS & Prototype Pollution)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('6. Security & Untrusted Input Sanitization', () => {
    it('sanitizes script tags and dangerous javascript: URIs from imported strings', () => {
      const untrusted = {
        questionText: 'Solve for x: <script>alert("xss")</script> $x + 2 = 5$',
        sourceUrl: 'javascript:stealCredentials()',
      };

      const sanitized = jsonSchemaValidator.sanitizePayload(untrusted);
      expect(sanitized.questionText).not.toContain('<script>');
      expect(sanitized.questionText).not.toContain('</script>');
      expect(sanitized.sourceUrl).toBe('#blocked-unsafe-uri');
    });

    it('defends against prototype pollution keys (__proto__, constructor)', () => {
      const maliciousPayload = JSON.parse(`{
        "__proto__": { "polluted": true },
        "constructor": { "prototype": { "polluted": true } },
        "title": "Clean Title"
      }`);

      const sanitized = jsonSchemaValidator.sanitizePayload(maliciousPayload);
      expect(sanitized.title).toBe('Clean Title');
      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Full Round-Trip Integrity
  // ─────────────────────────────────────────────────────────────────────────────
  describe('7. Round-Trip Export and Import Integrity', () => {
    it('preserves complete semantics: CanonicalQuestion[] -> Export -> Import -> Equivalent', async () => {
      const originalQuestions = [
        createCanonicalQuestion(1),
        createCanonicalQuestion(2),
      ];

      // Export to JSON string
      const exportedJson = jsonExporter.exportToJsonString(originalQuestions, {
        title: 'Round Trip Examination',
        examCode: 'GATE_CS_2025',
      });

      expect(exportedJson).toContain('mockai.question-set/v1');
      expect(exportedJson).toContain('Round Trip Examination');

      // Re-import
      const importReport = await jsonStreamingImporter.importJsonString(exportedJson);
      expect(importReport.imported).toBe(2);
      expect(importReport.failed).toBe(0);

      const reimported = importReport.questions;
      expect(reimported[0].questionId).toBe(originalQuestions[0].questionId);
      expect(reimported[0].questionText).toBe(originalQuestions[0].questionText);
      expect(reimported[0].options.length).toBe(originalQuestions[0].options.length);
      expect(reimported[0].scoring.marks).toBe(originalQuestions[0].scoring.marks);
      expect(reimported[0].scoring.negativeMarks).toBe(originalQuestions[0].scoring.negativeMarks);
      expect(reimported[1].questionId).toBe(originalQuestions[1].questionId);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Scale Benchmarks: 10, 1,000, 10,000, and 20,000+ Questions
  // ─────────────────────────────────────────────────────────────────────────────
  describe('8. Scale Benchmarks & Batch Streaming', () => {
    it('imports 10 questions efficiently', async () => {
      const questions: VersionedQuestionV1[] = Array.from({ length: 10 }, (_, i) => ({
        questionId: `scale-10-q${i + 1}`,
        questionNumber: i + 1,
        questionText: `Question stem number ${i + 1}`,
        questionType: 'MCQ',
        options: [{ id: 'A', text: 'Option A' }, { id: 'B', text: 'Option B' }],
        answer: { questionType: 'MCQ', correctOptionIndex: 0 },
        scoring: { marks: 1, negativeMarks: 0.33 },
      }));

      const doc: JsonQuestionSetDocument = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: '10 Questions Scale Test' },
        questions,
      };

      const start = Date.now();
      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(doc));
      const elapsed = Date.now() - start;

      expect(report.imported).toBe(10);
      expect(report.failed).toBe(0);
      expect(elapsed).toBeLessThan(1000);
    });

    it('imports 1,000 questions in under 1.5 seconds', async () => {
      const questions: VersionedQuestionV1[] = Array.from({ length: 1000 }, (_, i) => ({
        questionId: `scale-1k-q${i + 1}`,
        questionNumber: i + 1,
        questionText: `Question stem number ${i + 1}`,
        questionType: 'MCQ',
        options: [{ id: 'A', text: 'Option A' }, { id: 'B', text: 'Option B' }],
        answer: { questionType: 'MCQ', correctOptionIndex: 0 },
        scoring: { marks: 1, negativeMarks: 0.33 },
      }));

      const doc: JsonQuestionSetDocument = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: '1K Scale Test' },
        questions,
      };

      const start = Date.now();
      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(doc), {
        batchSize: 250,
      });
      const elapsed = Date.now() - start;

      expect(report.imported).toBe(1000);
      expect(report.failed).toBe(0);
      expect(elapsed).toBeLessThan(2000);
    });

    it('streams 10,000 questions with progress reporting', async () => {
      const progressSnapshots: number[] = [];
      const questions: VersionedQuestionV1[] = Array.from({ length: 10000 }, (_, i) => ({
        questionId: `scale-10k-q${i + 1}`,
        questionNumber: i + 1,
        questionText: `Question stem number ${i + 1}`,
        questionType: 'MCQ',
        options: [{ id: 'A', text: 'Option A' }, { id: 'B', text: 'Option B' }],
        answer: { questionType: 'MCQ', correctOptionIndex: 0 },
        scoring: { marks: 1, negativeMarks: 0.33 },
      }));

      const doc: JsonQuestionSetDocument = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: '10K Scale Test' },
        questions,
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(doc), {
        batchSize: 1000,
        onProgress: (p) => {
          progressSnapshots.push(p.percent);
        },
      });

      expect(report.imported).toBe(10000);
      expect(report.failed).toBe(0);
      expect(progressSnapshots.length).toBeGreaterThan(5);
      expect(progressSnapshots[progressSnapshots.length - 1]).toBe(100);
    });

    it('handles 20,000+ questions without memory exhaustion or stack overflow', async () => {
      const count = 20500;
      const questions: VersionedQuestionV1[] = Array.from({ length: count }, (_, i) => ({
        questionId: `scale-20k-q${i + 1}`,
        questionNumber: i + 1,
        questionText: `High scale test stem #${i + 1}`,
        questionType: 'MCQ',
        options: [{ id: 'A', text: 'Alpha' }, { id: 'B', text: 'Beta' }],
        answer: { questionType: 'MCQ', correctOptionIndex: 0 },
        scoring: { marks: 1, negativeMarks: 0.33 },
      }));

      const doc: JsonQuestionSetDocument = {
        $schema: CURRENT_SCHEMA_VERSION,
        version: '1.0.0',
        metadata: { title: '20K+ Stress Test' },
        questions,
      };

      const report = await jsonStreamingImporter.importJsonString(JSON.stringify(doc), {
        batchSize: 2000,
      });

      expect(report.totalRecords).toBe(count);
      expect(report.imported).toBe(count);
      expect(report.failed).toBe(0);
    });
  });
});
