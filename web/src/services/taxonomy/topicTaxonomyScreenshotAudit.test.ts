import { describe, it, expect } from 'vitest';
import { getQuestionTopicMetadata } from './topicClassifier';

describe('Topic Taxonomy — Screenshot-Driven Classification Audit Regression Tests', () => {
  describe('Reasoning: Ranking, Position & Row Arrangement Classification', () => {
    it('classifies "students standing in a row" between-positions question (ssc-chsl-2025-21nov-s1-q27) as logical_reasoning', () => {
      const q = {
        id: 'ssc-chsl-2025-21nov-s1-q27',
        sectionName: 'General Intelligence & Reasoning',
        questionText: 'A is 10th from the left, B is 18th from the right and 9 students are between them. Find maximum students.',
        options: ['35', '36', '37', '38'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      expect(res.primaryTopicId).toBe('logical_reasoning');
      expect(res.primaryTopicName).toBe('Logical Reasoning');
      expect(res.classificationStatus).toBe('VERIFIED');
    });

    it('classifies vertical ranking top/bottom question (ssc-chsl-2025-21nov-s1-q31) as logical_reasoning', () => {
      const q = {
        id: 'ssc-chsl-2025-21nov-s1-q31',
        sectionName: 'General Intelligence & Reasoning',
        questionText: 'Amit ranks 12th from top and 29th from bottom. Total students?',
        options: ['40', '41', '39', '42'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      expect(res.primaryTopicId).toBe('logical_reasoning');
      expect(res.classificationStatus).toBe('VERIFIED');
    });

    it('classifies row rank from bottom (ssc-chsl-2025-21nov-s1-q34) as logical_reasoning', () => {
      const q = {
        id: 'ssc-chsl-2025-21nov-s1-q34',
        sectionName: 'General Intelligence & Reasoning',
        questionText: 'In a row of 32 girls, Neha is 11th from the top. What is her rank from bottom?',
        options: ['21', '22', '23', '20'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      expect(res.primaryTopicId).toBe('logical_reasoning');
    });

    it('classifies position swapping in a row (ssc-chsl-2025-21nov-s1-q44) as logical_reasoning', () => {
      const q = {
        id: 'ssc-chsl-2025-21nov-s1-q44',
        sectionName: 'General Intelligence & Reasoning',
        questionText: 'In a row, R is 9th from the left and S is 14th from the right. After swapping their positions...',
        options: ['25', '26', '27', '28'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      expect(res.primaryTopicId).toBe('logical_reasoning');
    });

    it('classifies rank in class from top and bottom (ssc-chsl-2022-02nov-s1-tier2-q46) as logical_reasoning', () => {
      const q = {
        id: 'ssc-chsl-2022-02nov-s1-tier2-q46',
        sectionName: 'General Intelligence & Reasoning',
        questionText: 'Sunita is ranked 10th from the top and 18th from the bottom in her class. How many students are there in the class?',
        options: ['27', '28', '26', '29'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      expect(res.primaryTopicId).toBe('logical_reasoning');
    });
  });

  describe('Reasoning: Syllogism Word Boundary Fix & Analogy Templates', () => {
    it('classifies syllogisms with "Statements: ... Conclusions: \\n" (ssc-chsl-2025-21nov-s1-q49) as logical_reasoning', () => {
      const q = {
        id: 'ssc-chsl-2025-21nov-s1-q49',
        sectionName: 'General Intelligence & Reasoning',
        questionText: 'Statements: \n1. All books are pens. \n2. All pens are papers. \nConclusions: \nI. All books are papers. \nII. All papers are books.',
        options: ['Only I', 'Only II', 'Either I or II', 'Neither'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      expect(res.primaryTopicId).toBe('logical_reasoning');
      expect(res.classificationStatus).toBe('VERIFIED');
    });

    it('classifies standard letter analogy (ssc-chsl-2025-21nov-s1-q41) as analogy', () => {
      const q = {
        id: 'ssc-chsl-2025-21nov-s1-q41',
        sectionName: 'General Intelligence & Reasoning',
        questionText: 'Select the related letter from the given alternatives. \nMARCH : OCTEJ :: APRIL : ?',
        options: ['CQTKP', 'CQTPL', 'CRTPJ', 'CRTKN'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      expect(res.primaryTopicId).toBe('analogy');
      expect(res.classificationStatus).toBe('VERIFIED');
    });

    it('classifies standard word analogy (ssc-chsl-2025-21nov-s1-q46) as analogy', () => {
      const q = {
        id: 'ssc-chsl-2025-21nov-s1-q46',
        sectionName: 'General Intelligence & Reasoning',
        questionText: 'Choose the related word from the given alternatives. \nCAT : KITTEN :: DOG : ?',
        options: ['PUPPY', 'CALF', 'CUB', 'FOAL'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      expect(res.primaryTopicId).toBe('analogy');
      expect(res.classificationStatus).toBe('VERIFIED');
    });
  });

  describe('Spatial & Visual Reasoning & Image-Based Edge Cases', () => {
    it('classifies mirror-image questions (ssc-chsl-2023-03aug-s2-q28) as spatial_visual', () => {
      const q = {
        id: 'ssc-chsl-2023-03aug-s2-q28',
        sectionName: 'General Intelligence & Reasoning',
        questionText: 'Select the correct mirror image of the given figure when the mirror is placed at MIN as shown below.',
        options: ['A', 'B', 'C', 'D'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      expect(res.primaryTopicId).toBe('spatial_visual');
      expect(res.primaryTopicName).toBe('Spatial & Visual Reasoning');
    });

    it('handles image-only questions with empty text stem safely as uncategorized without crashing', () => {
      const q = {
        id: 'ssc-chsl-2023-03aug-s2-q41',
        sectionName: 'General Intelligence & Reasoning',
        questionText: '',
        options: ['Only I', 'Only II', 'Both', 'Neither'],
        diagramUrl: '/exam-assets/ssc/chsl/2023/ssc-chsl-2023-03aug-s2/q41_diag.jpeg',
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      expect(res.primaryTopicId).toBe('uncategorized');
      expect(res.classificationStatus).toBe('UNCLASSIFIED');
      expect(res.confidence).toBe(0);
    });

    it('leaves cross-subject arithmetic questions in reasoning section as uncategorized for human review', () => {
      const q = {
        id: 'ssc-chsl-2025-21nov-s1-q28',
        sectionName: 'General Intelligence & Reasoning',
        questionText: 'A train passes through a 300 m tunnel in 12 seconds. If the train is 180 m long, find its speed.',
        options: ['35 m/s', '40 m/s', '45 m/s', '50 m/s'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      // Should NOT hallucinate a reasoning topic like analogy or spatial_visual
      expect(res.primaryTopicId).toBe('uncategorized');
      expect(res.classificationStatus).toBe('UNCLASSIFIED');
    });
  });

  describe('Mathematical Content Robustness', () => {
    it('does not crash when classifying trigonometry questions with corrupted OCR tokens (ssc-chsl-2023-03aug-s2-q73)', () => {
      const q = {
        id: 'ssc-chsl-2023-03aug-s2-q73',
        sectionName: 'Quantitative Aptitude',
        questionText: 'If cot B = = . where B is an acute angle, what is the value of sec B + tan B?',
        options: ['$\\frac{4}{5}$', '$\\frac{5}{3}$', '$\\pm \\frac{5}{4}$', '$\\frac{3}{5}$'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      expect(res.primaryTopicId).toBe('trigonometry');
      expect(res.classificationStatus).toBe('VERIFIED');
    });

    it('safely handles ratio question with corrupted OCR mathematical fractions (ssc-chsl-2024-03jul-s3-q51)', () => {
      const q = {
        id: 'ssc-chsl-2024-03jul-s3-q51',
        sectionName: 'Quantitative Aptitude',
        questionText: 'Which is the greatest ratio among the following? 841 1 —,-, > and — 115° 2 11',
        options: ['$\\frac{4}{5}$', '$\\frac{8}{11}\\text{ 3}$', '$\\frac{1}{2}$', '$\\frac{1}{11}\\text{ ¢\n2}$'],
      };
      const res = getQuestionTopicMetadata(q, 'ssc-chsl');
      // Demonstrates that with corrupted numbers/symbols, classifier safely marks as uncategorized or review
      expect(['uncategorized', 'arithmetic']).toContain(res.primaryTopicId);
    });
  });
});
