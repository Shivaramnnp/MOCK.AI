// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { ExamPaper } from '../types';
import sscChsl01JulS1 from '../data/exams/ssc-chsl-2024-01jul-s1.json';

describe('SSC CHSL 2024 Visual & Mathematical Fidelity Suite', () => {
  let paper: ExamPaper;

  beforeEach(() => {
    localStorage.clear();
    paper = sscChsl01JulS1 as unknown as ExamPaper;
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Mathematical Expressions & Fraction Promotion', () => {
    it('verifies Q66 sphere volume fractions are promoted to clean LaTeX math', () => {
      const q66 = paper.questions.find((q) => q.questionNumber === 66);
      expect(q66).toBeDefined();
      expect(q66!.optionImages).toBeNull();
      expect(q66!.options).toEqual([
        '$205\\frac{1}{3}$',
        '$1707\\frac{1}{3}$',
        '$1437\\frac{1}{3}$',
        '$1600\\frac{1}{3}$',
      ]);
      expect(q66!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q67 cube volume options are promoted to clean unit measurements without division by zero', () => {
      const q67 = paper.questions.find((q) => q.questionNumber === 67);
      expect(q67).toBeDefined();
      expect(q67!.optionImages).toBeNull();
      expect(q67!.options).toEqual(['625 cm³', '512 cm³', '729 cm³', '486 cm³']);
      // Absolutely no division by zero artifact
      expect(q67!.options?.some((o) => o.includes('\\frac{1}{0}'))).toBe(false);
      expect(q67!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q68 speed options are promoted to clean LaTeX mixed fractions', () => {
      const q68 = paper.questions.find((q) => q.questionNumber === 68);
      expect(q68).toBeDefined();
      expect(q68!.optionImages).toBeNull();
      expect(q68!.options).toEqual([
        '$7\\frac{16}{26}$',
        '$8\\frac{17}{26}$',
        '$5\\frac{11}{26}$',
        '$9\\frac{11}{26}$',
      ]);
      expect(q68!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q64 trigonometry options have 1 instead of pipe symbol | and clean angle notation', () => {
      const q64 = paper.questions.find((q) => q.questionNumber === 64);
      expect(q64).toBeDefined();
      expect(q64!.options).toEqual(['\\sqrt{2}', '1', '0', '2\\sqrt{2}']);
      expect(q64!.options?.[1]).toBe('1');
      expect(q64!.options?.[1]).not.toBe('|');
      expect(q64!.correctAnswer).toBe('B');
      expect(q64!.questionText).toContain('∠B = 90°');
      expect(q64!.questionText).not.toContain('ZB = 90°');
      expect(q64!.questionText).toContain('cosecA = 2\\sqrt{2}');
    });

    it('verifies Q47 dice problem stem and options are restored without Z artifact', () => {
      const q47 = paper.questions.find((q) => q.questionNumber === 47);
      expect(q47).toBeDefined();
      expect(q47!.options).toEqual(['5', '3', '7', '8']);
      expect(q47!.options?.includes('Z')).toBe(false);
      expect(q47!.questionText).toContain('Six numbers 1, 3, 5, 6, 7 and 8 are written on different faces of a dice');
    });
  });

  describe('2. Prompt-Figure Separation & Deduplication', () => {
    it('verifies Q30 cube net separates top prompt text from visual net figure', () => {
      const q30 = paper.questions.find((q) => q.questionNumber === 30);
      expect(q30).toBeDefined();
      // Stem text contains the question prompt
      expect(q30!.questionText).toBe(
        "What would be the symbol on the opposite side of '=' if the given sheet is folded to form a cube?"
      );
      // Diagram asset is present
      expect(q30!.diagramUrls).toEqual(['/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q30_diag.png']);
      // Option choices are authentic visual symbol figures
      expect(q30!.optionImages).toHaveLength(4);
    });

    it('verifies Q34 mirror image separates prompt text from RTYZXC57 figure', () => {
      const q34 = paper.questions.find((q) => q.questionNumber === 34);
      expect(q34).toBeDefined();
      // Clean prompt text without figure content leakage
      expect(q34!.questionText).toBe(
        'Select the correct mirror image of the given figure when the mirror is placed at MN as shown below.'
      );
      expect(q34!.diagramUrls).toEqual(['/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q34_diag.png']);
      expect(q34!.optionImages).toHaveLength(4);
    });

    it('verifies Q62 dual pie-chart card preserves pure visual card without prompt text duplication', () => {
      const q62 = paper.questions.find((q) => q.questionNumber === 62);
      expect(q62).toBeDefined();
      expect(q62!.diagramUrls).toEqual(['/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q62_diag.png']);
      // Stem text does not duplicate full OCR prompt
      expect(q62!.questionText).toBe('');
      // Options are promoted to clean percentage text
      expect(q62!.options).toEqual(['6.82%', '7.11%', '5.82%', '5.81%']);
      expect(q62!.optionImages).toBeNull();
    });

    it('verifies Q72 pie-chart does not leak garbled OCR slice labels into question stem', () => {
      const q72 = paper.questions.find((q) => q.questionNumber === 72);
      expect(q72).toBeDefined();
      expect(q72!.diagramUrls).toEqual(['/exam-assets/ssc/chsl/2024/ssc-chsl-2024-01jul-s1/q72_diag.png']);
      // No garbled slice labels like "sel - 'Othert" or "ee Entreprene" in questionText
      expect(q72!.questionText || '').not.toContain('Othert');
      expect(q72!.questionText || '').not.toContain('Entreprene');
      // Options are clean text
      expect(q72!.options).toEqual(['P.G. + M.Phil.', 'P.G. + Ph.D.', 'Entrepreneur + Ph.D.', 'Entrepreneur + P.G.']);
      expect(q72!.optionImages).toBeNull();
    });
  });

  describe('3. Referential Asset Integrity & Zero Broken Links', () => {
    it('verifies 100% of referenced image assets exist on disk with valid file sizes', () => {
      const publicDir = path.resolve(__dirname, '../../public');
      const referencedUrls: string[] = [];

      for (const q of paper.questions) {
        if (q.diagramUrl) referencedUrls.push(q.diagramUrl);
        if (q.diagramUrls) {
          for (const u of q.diagramUrls) {
            if (u) referencedUrls.push(u);
          }
        }
        if (q.optionImages) {
          for (const u of q.optionImages) {
            if (u) referencedUrls.push(u);
          }
        }
      }

      expect(referencedUrls.length).toBeGreaterThan(0);

      for (const url of referencedUrls) {
        const diskPath = path.join(publicDir, url.replace(/^\//, ''));
        const exists = fs.existsSync(diskPath);
        expect(exists).toBe(true);
        if (exists) {
          const stats = fs.statSync(diskPath);
          expect(stats.size).toBeGreaterThan(50); // Valid image, not 0-byte corrupt file
        }
      }
    });
  });
});
