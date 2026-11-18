import { describe, it, expect } from 'vitest';
import paper2024S1 from '../data/exams/ssc-chsl-2024-01jul-s1.json';
import paper2024S2 from '../data/exams/ssc-chsl-2024-01jul-s2.json';
import { ExamPaper } from '../types';

describe('SSC CHSL 2024 Browser & UI Forensic Fidelity Suite', () => {
  const p1 = paper2024S1 as unknown as ExamPaper;
  const p2 = paper2024S2 as unknown as ExamPaper;

  describe('1. Universal Math & LaTeX Fraction Promotion (2024 01-Jul S1)', () => {
    it('verifies Q52 speed mixed fractions with units are promoted to LaTeX/text without option images', () => {
      const q52 = p1.questions.find((q) => q.questionNumber === 52);
      expect(q52).toBeDefined();
      expect(q52!.optionImages).toBeNull();
      expect(q52!.options).toEqual([
        '$42\\frac{1}{2}\\text{ km/h}$',
        '$42\\frac{1}{7}\\text{ km/h}$',
        '42 km/h',
        '$42\\frac{6}{7}\\text{ km/h}$',
      ]);
      const uniqueOpts = new Set(q52!.options);
      expect(uniqueOpts.size).toBe(4);
      expect(q52!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q73 percentage mixed fractions are promoted to clean KaTeX LaTeX math without option images', () => {
      const q73 = p1.questions.find((q) => q.questionNumber === 73);
      expect(q73).toBeDefined();
      expect(q73!.optionImages).toBeNull();
      expect(q73!.options).toEqual([
        '$28\\frac{4}{7}\\%$',
        '$31\\frac{2}{7}\\%$',
        '$24\\frac{3}{7}\\%$',
        '$26\\frac{3}{7}\\%$',
      ]);
      const uniqueOpts = new Set(q73!.options);
      expect(uniqueOpts.size).toBe(4);
      expect(q73!.verificationStatus).toBe('VERIFIED');
    });
  });

  describe('2. Reasoning Codes, Pure Fractions & Natural Sentences (2024 01-Jul S2)', () => {
    it('verifies Q26 reasoning code options are promoted to clean native text without option images', () => {
      const q26 = p2.questions.find((q) => q.questionNumber === 26);
      expect(q26).toBeDefined();
      expect(q26!.optionImages).toBeNull();
      expect(q26!.options).toEqual(['ge', 'fp', 'mz', 'ze']);
      const uniqueOpts = new Set(q26!.options);
      expect(uniqueOpts.size).toBe(4);
      expect(q26!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q67 pure mixed fractions are promoted to clean KaTeX LaTeX math without option images', () => {
      const q67 = p2.questions.find((q) => q.questionNumber === 67);
      expect(q67).toBeDefined();
      expect(q67!.optionImages).toBeNull();
      expect(q67!.options).toEqual([
        '$1\\frac{81}{217}$',
        '$2\\frac{61}{217}$',
        '$3\\frac{27}{217}$',
        '$1\\frac{31}{217}$',
      ]);
      const uniqueOpts = new Set(q67!.options);
      expect(uniqueOpts.size).toBe(4);
      expect(q67!.verificationStatus).toBe('VERIFIED');
    });

    it('verifies Q92 country sentences are promoted to clean native text without option images', () => {
      const q92 = p2.questions.find((q) => q.questionNumber === 92);
      expect(q92).toBeDefined();
      expect(q92!.optionImages).toBeNull();
      expect(q92!.options).toEqual([
        'India and Bangladesh',
        'India',
        'India and Sri Lanka',
        'India, Sri Lanka and Bangladesh',
      ]);
      const uniqueOpts = new Set(q92!.options);
      expect(uniqueOpts.size).toBe(4);
      expect(q92!.verificationStatus).toBe('VERIFIED');
    });
  });

  describe('3. Visual Reasoning Preservation Invariant', () => {
    it('verifies Q27 mirror image question retains genuine visual options and stem diagram', () => {
      const q27 = p1.questions.find((q) => q.questionNumber === 27);
      expect(q27).toBeDefined();
      expect(q27!.diagramUrl).toBeDefined();
      expect(q27!.diagramUrl).toContain('q27_diag');
      expect(q27!.optionImages?.length).toBe(4);
      expect(q27!.optionImages?.includes(q27!.diagramUrl!)).toBe(false);
    });

    it('verifies Q30 cube opposite face question retains genuine visual options and stem diagram', () => {
      const q30 = p1.questions.find((q) => q.questionNumber === 30);
      expect(q30).toBeDefined();
      expect(q30!.diagramUrl).toBeDefined();
      expect(q30!.diagramUrl).toContain('q30_diag');
      expect(q30!.optionImages?.length).toBe(4);
      expect(q30!.optionImages?.includes(q30!.diagramUrl!)).toBe(false);
    });

    it('verifies Q34 mirror image question retains genuine visual options and stem diagram', () => {
      const q34 = p1.questions.find((q) => q.questionNumber === 34);
      expect(q34).toBeDefined();
      expect(q34!.diagramUrl).toBeDefined();
      expect(q34!.diagramUrl).toContain('q34_diag');
      expect(q34!.optionImages?.length).toBe(4);
      expect(q34!.optionImages?.includes(q34!.diagramUrl!)).toBe(false);
    });
  });
});
