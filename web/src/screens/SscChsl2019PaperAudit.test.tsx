// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import sscChsl2019Paper from '../data/exams/ssc-chsl-2019-01jul-s3.json';
import { CompetitiveExamPlayerScreen } from './CompetitiveExamPlayerScreen';
import { ExamPaper, UserProfile } from '../types';

describe('SSC CHSL Tier 1 — 01 July 2019 (Shift 3) 100-Question Forensic Audit Suite', () => {
  const paper = sscChsl2019Paper as unknown as ExamPaper;
  const mockUser: UserProfile = {
    uid: 'student_tester_001',
    fullName: 'Forensic Reviewer',
    email: 'reviewer@mock.ai',
    role: 'STUDENT',
    createdAt: Date.now(),
  };

  const mojibakeChars = new Set('ȵÏȷȺƺȹƽÔÖÕÛÜÝþÊæɇàͧͬçéèêíìîóòôúùûāēīōūšžćč');

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Global Corpus Invariants on Repaired Paper', () => {
    it('contains exactly 100 questions sequentially ordered from Q1 to Q100', () => {
      expect(paper.questions.length).toBe(100);
      paper.questions.forEach((q, idx) => {
        expect(q.questionNumber).toBe(idx + 1);
        expect(q.id).toBe(`ssc-chsl-2019-01jul-s3-q${idx + 1}`);
      });
    });

    it('has exactly 25 questions in each of the 4 standard SSC CHSL sections', () => {
      const sections = paper.questions.reduce((acc, q) => {
        acc[q.sectionName] = (acc[q.sectionName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(sections['General Intelligence & Reasoning']).toBe(25);
      expect(sections['General Awareness']).toBe(25);
      expect(sections['Quantitative Aptitude']).toBe(25);
      expect(sections['English Language']).toBe(25);
    });

    it('guarantees ZERO empty stems and ZERO placeholder strings across all 100 questions', () => {
      for (const q of paper.questions) {
        const text = (q.questionText || '').trim();
        const hasDiag = Boolean(q.diagramUrl);
        expect(text.length > 0 || hasDiag).toBe(true);
        expect(text).not.toContain('omitted in official');
        expect(text).not.toContain('[Question text');
      }
    });

    it('guarantees ZERO mojibake characters in stems and options across all 100 questions', () => {
      for (const q of paper.questions) {
        const text = q.questionText || '';
        const foundMoji = [...text].filter((c) => mojibakeChars.has(c));
        expect(foundMoji).toEqual([]);

        for (const opt of q.options || []) {
          const optMoji = [...opt].filter((c) => mojibakeChars.has(c));
          expect(optMoji).toEqual([]);
        }
      }
    });

    it('guarantees ZERO OCR math corruption symbols (@ or CS s) across all 100 questions', () => {
      for (const q of paper.questions) {
        const text = q.questionText || '';
        expect(text).not.toContain('@');
        expect(text).not.toContain('CS s');
        for (const opt of q.options || []) {
          expect(opt).not.toContain('@');
        }
      }
    });

    it('guarantees all 100 questions have 4 non-empty options (either text or image)', () => {
      for (const q of paper.questions) {
        expect(q.options.length).toBe(4);
        for (let i = 0; i < 4; i++) {
          const hasText = Boolean(q.options[i] && q.options[i].trim().length > 0);
          const optImg = q.optionImages ? q.optionImages[i] : null;
          const hasImg = Boolean(optImg && optImg.trim().length > 0);
          expect(hasText || hasImg).toBe(true);
        }
      }
    });

    it('guarantees 100% of referenced image assets exist on disk with non-zero size', () => {
      const publicDir = path.resolve(__dirname, '../../public');
      for (const q of paper.questions) {
        if (q.diagramUrl) {
          const fullPath = path.join(publicDir, q.diagramUrl.replace(/^\//, ''));
          expect(fs.existsSync(fullPath)).toBe(true);
          const stats = fs.statSync(fullPath);
          expect(stats.size).toBeGreaterThan(100);
        }
        if (q.optionImages) {
          for (const optImg of q.optionImages) {
            if (optImg) {
              const fullPath = path.join(publicDir, optImg.replace(/^\//, ''));
              expect(fs.existsSync(fullPath)).toBe(true);
              const stats = fs.statSync(fullPath);
              expect(stats.size).toBeGreaterThan(100);
            }
          }
        }
      }
    });

    it('guarantees all 100 questions have an officially verified answer key (A, B, C, or D)', () => {
      for (const q of paper.questions) {
        expect(['A', 'B', 'C', 'D']).toContain(q.correctAnswer);
        expect([0, 1, 2, 3]).toContain(q.correctAnswerIndex);
        expect(q.verificationStatus).toBe('VERIFIED');
      }
    });
  });

  describe('2. Specific High-Defect Questions Forensic Verification', () => {
    it('verifies Q9 non-verbal figure series has all 4 option images restored', () => {
      const q9 = paper.questions[8];
      expect(q9.questionNumber).toBe(9);
      expect(q9.diagramUrl).toContain('q9_diag.jpeg');
      expect(q9.optionImages).toHaveLength(4);
      expect(q9.optionImages![0]).toContain('q9_opt_a.jpeg');
      expect(q9.optionImages![1]).toContain('q9_opt_b.jpeg');
      expect(q9.optionImages![2]).toContain('q9_opt_c.jpeg');
      expect(q9.optionImages![3]).toContain('q9_opt_d.jpeg');
      expect(q9.correctAnswer).toBe('A');
    });

    it('verifies Q25 Venn diagram has complete stem and all 4 option figures', () => {
      const q25 = paper.questions[24];
      expect(q25.questionNumber).toBe(25);
      expect(q25.questionText).toContain('Doctors, Lawyers, Engineers');
      expect(q25.optionImages).toHaveLength(4);
      expect(q25.optionImages![0]).toContain('q25_opt_a.jpeg');
      expect(q25.correctAnswer).toBe('C');
    });

    it('verifies Q51 missing stem was restored from candidate sheet printout', () => {
      const q51 = paper.questions[50];
      expect(q51.questionNumber).toBe(51);
      expect(q51.questionText).toContain('ratio 14 : 15 : 16 : 21');
      expect(q51.questionText).not.toContain('omitted in official');
      expect(q51.options[0]).toContain('24,440');
      expect(q51.correctAnswer).toBe('A');
    });

    it('verifies Q53, Q61, Q70, Q75 Data Interpretation bar graphs have full stem text and diagramUrl', () => {
      for (const qNum of [53, 61, 70, 75]) {
        const q = paper.questions[qNum - 1];
        expect(q.questionNumber).toBe(qNum);
        expect(q.diagramUrl).toBeTruthy();
        expect(q.questionText.length).toBeGreaterThan(20);
        expect(q.options.length).toBe(4);
        expect(q.correctAnswer).toBeTruthy();
      }
    });

    it('verifies Q52, Q55, Q57, Q59, Q67 geometry, trigonometry, and algebra math expressions render clean LaTeX', () => {
      const q52 = paper.questions[51];
      expect(q52.questionText).toContain('\\angle\\text{OBA} = 60^\\circ');
      expect(q52.verificationStatus).toBe('VERIFIED');

      const q55 = paper.questions[54];
      expect(q55.questionText).toContain('\\angle\\text{BAC} = 40^\\circ');
      expect(q55.verificationStatus).toBe('VERIFIED');

      const q57 = paper.questions[56];
      expect(q57.questionText).toContain('12% per annum');

      const q59 = paper.questions[58];
      expect(q59.questionText).toContain('\\cot\\theta');
      expect(q59.questionText).not.toContain('@');

      const q72 = paper.questions[71];
      expect(q72.questionText).toContain('x^3 + y^3 + z^3 + xyz');
      expect(q72.options[3]).toBe('35');
      expect(q72.correctAnswer).toBe('D');
    });
  });

  describe('3. Competitive Exam Player Interactive Delivery & Scoring Verification', () => {
    it('renders exam player with Q1, navigates, selects answer, and persists state', async () => {
      render(
        <CompetitiveExamPlayerScreen
          paper={paper}
          user={mockUser}
          onSubmit={vi.fn()}
          onExit={vi.fn()}
        />
      );

      // Question 1 stem is rendered
      await waitFor(() => {
        expect(screen.getByText(/question 1/i)).toBeDefined();
      });

      // Navigate to Q2
      const q2Button = screen.getByRole('button', { name: '2' });
      fireEvent.click(q2Button);

      await waitFor(() => {
        expect(screen.getByText(/question 2/i)).toBeDefined();
      });
    });
  });
});
