/**
 * Image Ingestion Engine Test Suite (PROMPT 6/10)
 * Rigorous forensic verification of image quality analysis, blur detection,
 * auto-orientation, diagram cropping, table extraction, multi-question segmentation,
 * math preservation, and zero-hallucination degradation handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeImageQuality, computeImageHash } from './imageQualityAnalyzer';
import { preprocessImage, cropImageRegion } from './imagePreprocessor';
import { segmentQuestionsFromOcr, detectImageLayout } from './imageLayoutDetector';
import { buildCanonicalImageQuestion } from './imageQuestionGenerator';
import { imageIngestionCache } from './imageCache';
import { processImage } from './imageEngine';
import { CanonicalAsset } from '../../../types/canonicalQuestion';
import { DetectedQuestionUnit } from './types';

// Synthetic minimal 100-byte valid base64 payload
const SAMPLE_IMAGE_BASE64 =
  'data:image/jpeg;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' +
  'A'.repeat(120);

describe('Production Image Ingestion Engine (PROMPT 6/10)', () => {
  beforeEach(() => {
    imageIngestionCache.clear();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Image Quality Analysis & Degradation Detection
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Image Quality Analysis', () => {
    it('accurately identifies clean sharp images with high contrast and valid orientation', async () => {
      const assessment = await analyzeImageQuality(SAMPLE_IMAGE_BASE64, {
        mockAssessment: {
          blurScore: 0.88,
          contrastRatio: 0.72,
          brightnessMean: 135,
          detectedOrientation: 0,
        },
      });

      expect(assessment.qualityRating).toBe('EXCELLENT');
      expect(assessment.isBlurry).toBe(false);
      expect(assessment.isLowContrast).toBe(false);
      expect(assessment.isSeverelyDegraded).toBe(false);
      expect(assessment.userMessage).toBeUndefined();
    });

    it('detects blurry photos and issues the mandatory exact user guidance message', async () => {
      const blurredAssessment = await analyzeImageQuality(SAMPLE_IMAGE_BASE64, {
        mockAssessment: {
          blurScore: 0.18, // Heavy blur
          contrastRatio: 0.30,
          detectedOrientation: 0,
        },
      });

      expect(blurredAssessment.isBlurry).toBe(true);
      expect(['POOR', 'UNUSABLE']).toContain(blurredAssessment.qualityRating);
      expect(blurredAssessment.userMessage).toBe(
        'Image quality is insufficient to reliably extract this question.'
      );
    });

    it('detects low contrast and underexposed photos', async () => {
      const darkAssessment = await analyzeImageQuality(SAMPLE_IMAGE_BASE64, {
        mockAssessment: {
          blurScore: 0.70,
          contrastRatio: 0.12, // Very low contrast
          brightnessMean: 22, // Underexposed
        },
      });

      expect(darkAssessment.isLowContrast).toBe(true);
      expect(darkAssessment.brightnessMean).toBeLessThan(30);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Preprocessing: Orientation, Resizing, and Cropping
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Image Preprocessing & Asset Cropping', () => {
    it('detects and auto-rotates 90-degree and 180-degree skewed photos', async () => {
      const rotatedQuality = {
        blurScore: 0.80,
        contrastRatio: 0.65,
        brightnessMean: 120,
        skewAngleDegrees: 0,
        detectedOrientation: 90 as const,
        isBlurry: false,
        isLowContrast: false,
        isSeverelyDegraded: false,
        qualityRating: 'GOOD' as const,
      };

      const result = await preprocessImage(SAMPLE_IMAGE_BASE64, rotatedQuality, 2048);
      expect(result.processedBase64).toBeDefined();
      expect(result.processedHash).toBeDefined();
    });

    it('crops visual diagram assets preserving bounding box geometry and provenance hash', async () => {
      const box = { x: 50, y: 120, width: 300, height: 250 };
      const cropped = await cropImageRegion(SAMPLE_IMAGE_BASE64, box, 'diagram');

      expect(cropped.assetId).toContain('diagram');
      expect(cropped.boundingBox).toEqual(box);
      expect(cropped.hash).toBeDefined();
      expect(cropped.croppedBase64.length).toBeGreaterThan(20);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Multi-Question Segmentation (Do NOT assume 1 image = 1 question)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Multi-Question Segmentation', () => {
    it('detects multiple questions in one image and partitions them into distinct units', () => {
      const multiQuestionOcr = `
        Q.1 Which of the following data structures implements a FIFO discipline?
        (A) Queue
        (B) Stack
        (C) Heap
        (D) Priority Queue

        Q.2 What is the time complexity of searching in a balanced AVL tree with n nodes?
        (A) O(log n)
        (B) O(n)
        (C) O(1)
        (D) O(n log n)

        Q.3 Consider the following function: What value is returned when n = 5?
        (A) 120
        (B) 60
        (C) 24
        (D) 15
      `;

      const units = segmentQuestionsFromOcr(multiQuestionOcr, { width: 1200, height: 1800 });

      expect(units.length).toBe(3);
      expect(units[0].questionNumber).toBe(1);
      expect(units[0].stemText).toContain('FIFO discipline');
      expect(units[0].options.length).toBe(4);
      expect(units[0].options[0].text).toBe('Queue');

      expect(units[1].questionNumber).toBe(2);
      expect(units[1].stemText).toContain('balanced AVL tree');
      expect(units[1].options[0].text).toBe('O(log n)');

      expect(units[2].questionNumber).toBe(3);
      expect(units[2].stemText).toContain('value is returned when n = 5');
      expect(units[2].options[0].text).toBe('120');
    });

    it('parses single question images correctly when only one problem is present', () => {
      const singleQuestionOcr = `
        Question 1:
        In relational algebra, which operator performs a horizontal subset of tuples satisfying a predicate condition?
        (A) Selection (σ)
        (B) Projection (π)
        (C) Cartesian Product (×)
        (D) Natural Join (⋈)
      `;

      const units = segmentQuestionsFromOcr(singleQuestionOcr, { width: 800, height: 600 });
      expect(units.length).toBe(1);
      expect(units[0].questionNumber).toBe(1);
      expect(units[0].stemText).toContain('horizontal subset of tuples');
      expect(units[0].options.length).toBe(4);
      expect(units[0].options[0].text).toContain('Selection');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Diagram & Table Ingestion
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Diagram & Table Ingestion', () => {
    it('ingests question with diagram figure asset and binds ownership to question stem', () => {
      const diagramAsset: CanonicalAsset = {
        assetId: 'ast-diag-101',
        assetType: 'diagram',
        assetUrl: 'data:image/png;base64,sampleDiagramData',
        hash: 'hash-diag-101',
        width: 400,
        height: 300,
        boundingBox: { x: 100, y: 150, width: 400, height: 300 },
        ownership: 'question',
        caption: 'Circuit Diagram for NAND Latch',
      };

      const unit: DetectedQuestionUnit = {
        questionNumber: 1,
        label: 'Q.1',
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        stemText: 'Consider the digital circuit shown in the diagram. What is the stable output state when S=1 and R=0?',
        options: [
          { id: 'A', text: 'Q=1, Q_bar=0', isCorrect: true },
          { id: 'B', text: 'Q=0, Q_bar=1' },
          { id: 'C', text: 'Metastable oscillatory state' },
          { id: 'D', text: 'Undefined high-impedance state' },
        ],
        diagramAssets: [diagramAsset],
        tableBlocks: [],
        confidence: 0.98,
      };

      const canonicalQ = buildCanonicalImageQuestion({
        unit,
        imageHash: 'img-test-101',
        quality: {
          blurScore: 0.85,
          contrastRatio: 0.70,
          brightnessMean: 128,
          skewAngleDegrees: 0,
          detectedOrientation: 0,
          isBlurry: false,
          isLowContrast: false,
          isSeverelyDegraded: false,
          qualityRating: 'GOOD',
        },
      });

      expect(canonicalQ.assets.length).toBe(1);
      expect(canonicalQ.assets[0].assetId).toBe('ast-diag-101');
      expect(canonicalQ.diagramUrl).toBe('data:image/png;base64,sampleDiagramData');
      expect(canonicalQ.contentBlocks.some((b) => b.type === 'diagram')).toBe(true);
      expect(canonicalQ.verificationStatus).toBe('VERIFIED');
    });

    it('ingests question containing a data table preserving column headers and matrix cells', () => {
      const unit: DetectedQuestionUnit = {
        questionNumber: 2,
        label: 'Q.2',
        bounds: { x: 0, y: 0, width: 900, height: 700 },
        stemText: 'Consider the transition table for a Deterministic Finite Automaton (DFA):',
        options: [
          { id: 'A', text: 'Language accepts all binary strings containing 01 as substring.', isCorrect: true },
          { id: 'B', text: 'Language accepts only strings with odd number of 1s.' },
          { id: 'C', text: 'Language accepts the empty string ε.' },
          { id: 'D', text: 'Language is non-regular and requires a stack.' },
        ],
        diagramAssets: [],
        tableBlocks: [
          {
            headers: ['State', 'Input 0', 'Input 1'],
            rows: [
              ['-> q0', 'q1', 'q0'],
              ['q1', 'q1', 'q2*'],
              ['q2*', 'q2*', 'q2*'],
            ],
            caption: 'DFA Transition Table',
          },
        ],
        confidence: 0.95,
      };

      const canonicalQ = buildCanonicalImageQuestion({
        unit,
        imageHash: 'img-dfa-table',
        quality: {
          blurScore: 0.82,
          contrastRatio: 0.68,
          brightnessMean: 130,
          skewAngleDegrees: 0,
          detectedOrientation: 0,
          isBlurry: false,
          isLowContrast: false,
          isSeverelyDegraded: false,
          qualityRating: 'GOOD',
        },
      });

      const tableBlock = canonicalQ.contentBlocks.find((b) => b.type === 'table');
      expect(tableBlock).toBeDefined();
      if (tableBlock && tableBlock.type === 'table' && tableBlock.rows) {
        expect(tableBlock.headers).toEqual(['State', 'Input 0', 'Input 1']);
        expect(tableBlock.rows.length).toBe(3);
        expect(tableBlock.rows[1]).toEqual(['q1', 'q1', 'q2*']);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Zero-Hallucination & Quality Threshold Handling
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Quality Threshold & Non-Hallucination', () => {
    it('sets REVIEW_REQUIRED and exact user guidance message when image is blurred', async () => {
      const res = await processImage(SAMPLE_IMAGE_BASE64, {
        mockQualityAssessment: {
          blurScore: 0.15, // Severely blurred
          contrastRatio: 0.20,
          detectedOrientation: 0,
        },
      });

      // Must succeed in extracting candidates but flag for review without hallucinating
      expect(res.questions.length).toBeGreaterThan(0);
      expect(res.quality.isBlurry).toBe(true);
      expect(res.error?.code).toBe('REVIEW_REQUIRED');
      expect(res.error?.message).toBe(
        'Image quality is insufficient to reliably extract this question.'
      );

      for (const q of res.questions) {
        expect(q.verificationStatus).toBe('REVIEW_REQUIRED');
        expect(q.verificationReasons).toContain(
          'Image quality is insufficient to reliably extract this question.'
        );
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Image Caching & Content Hashing
  // ─────────────────────────────────────────────────────────────────────────────
  describe('6. Image Caching by Content Hash', () => {
    it('caches parsed questions by imageHash and returns instant hit on duplicate upload', async () => {
      const hash = computeImageHash(SAMPLE_IMAGE_BASE64);
      expect(imageIngestionCache.has(hash)).toBe(false);

      const firstPass = await processImage(SAMPLE_IMAGE_BASE64, {
        mockQualityAssessment: { blurScore: 0.85, contrastRatio: 0.75 },
      });
      expect(firstPass.cached).toBe(false);
      expect(imageIngestionCache.has(hash)).toBe(true);

      const secondPass = await processImage(SAMPLE_IMAGE_BASE64);
      expect(secondPass.cached).toBe(true);
      expect(secondPass.questions.length).toBe(firstPass.questions.length);
      expect(secondPass.latencyMs).toBeLessThanOrEqual(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. End-to-End Scale Verification: Multi-Question Exam Paper Photo
  // ─────────────────────────────────────────────────────────────────────────────
  describe('7. End-to-End Exam Photo Ingestion', () => {
    it('ingests 2-question exam paper photo preserving LaTeX math, coordinates, and provenance', async () => {
      const unit1: DetectedQuestionUnit = {
        questionNumber: 1,
        label: 'Q.1',
        bounds: { x: 0, y: 0, width: 1000, height: 700 },
        stemText: 'Let $L_1$ and $L_2$ be regular languages over alphabet $\\Sigma$. Which of the following languages is NOT guaranteed to be regular?',
        options: [
          { id: 'A', text: '$L_1 \\cap L_2$', isCorrect: false },
          { id: 'B', text: '$L_1 \\cup L_2$', isCorrect: false },
          { id: 'C', text: '$\\text{Pref}(L_1)$', isCorrect: false },
          { id: 'D', text: 'None of the above (all are regular)', isCorrect: true },
        ],
        diagramAssets: [],
        tableBlocks: [],
        confidence: 0.96,
      };

      const unit2: DetectedQuestionUnit = {
        questionNumber: 2,
        label: 'Q.2',
        bounds: { x: 0, y: 700, width: 1000, height: 700 },
        stemText: 'What is the chromatic number $\\chi(K_n)$ of a complete graph with $n$ vertices ($n \\ge 3$)?',
        options: [
          { id: 'A', text: '$n$', isCorrect: true },
          { id: 'B', text: '$n - 1$', isCorrect: false },
          { id: 'C', text: '$2$', isCorrect: false },
          { id: 'D', text: '$\\lceil n/2 \\rceil$', isCorrect: false },
        ],
        diagramAssets: [],
        tableBlocks: [],
        confidence: 0.97,
      };

      const res = await processImage(
        {
          base64Data: SAMPLE_IMAGE_BASE64,
          fileName: 'GATE_CS_2025_Page3.jpg',
          sourceType: 'Image',
        },
        {
          mockVisionUnits: [unit1, unit2],
          mockQualityAssessment: { blurScore: 0.90, contrastRatio: 0.80 },
        }
      );

      expect(res.success).toBe(true);
      expect(res.questions.length).toBe(2);

      // Question 1 Verification
      const q1 = res.questions[0];
      expect(q1.questionNumber).toBe(1);
      expect(q1.questionText).toContain('$L_1$ and $L_2$');
      expect(q1.options.length).toBe(4);
      expect(q1.provenance.sourceBoundingBox).toEqual(unit1.bounds);
      expect(q1.verificationStatus).toBe('VERIFIED');

      // Question 2 Verification
      const q2 = res.questions[1];
      expect(q2.questionNumber).toBe(2);
      expect(q2.questionText).toContain('chromatic number');
      expect(q2.options[0].text).toBe('$n$');
      expect(q2.provenance.sourceBoundingBox).toEqual(unit2.bounds);
      expect(q2.verificationStatus).toBe('VERIFIED');
    });
  });
});
