import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getQuestionTopicMetadata } from './topicClassifier';

describe('Phase G.7 — Isolated General Awareness Polity Pilot', () => {
  const frozenCandidatesPath = path.resolve(
    '/Users/shivarampatel/.gemini/antigravity/brain/7fb5b141-45b8-4b11-9812-d8e420006e7a/scratch/frozen_polity_candidates_55.json'
  );
  const examsDir = path.resolve(__dirname, '../../data/exams');

  const frozen55: Array<{
    id: string;
    file: string;
    sectionId: string;
    sectionName: string;
    stem: string;
    options: string[];
    trigger: string;
  }> = JSON.parse(fs.readFileSync(frozenCandidatesPath, 'utf8'));

  const expectedExcludedIds = new Set([
    'ssc-chsl-2023-03aug-s4-q87', // Central Universities (Amendment) Bill 2022
    'ssc-chsl-2023-07aug-s1-q83', // Prohibition of Online Gaming Bill approved by Governor
    'ssc-chsl-2023-07aug-s4-q79', // Horizontal reservation approved by Governor Gurmit Singh
    'ssc-chsl-2023-11aug-s2-q80', // Family Courts (Amendment) Act 2022
    'ssc-chsl-2025-15nov-s3-q98', // Permanent Settlement introduced during Governor-Generalship (History)
  ]);

  it('freezes exactly 55 candidate records from Phase G.6E.1 audit', () => {
    expect(frozen55).toHaveLength(55);
  });

  describe('Positive tests: Exactly 50 intended Polity records classify as polity with high confidence', () => {
    const intendedPolityCandidates = frozen55.filter((c) => !expectedExcludedIds.has(c.id));

    it('identifies exactly 50 intended Polity candidates', () => {
      expect(intendedPolityCandidates).toHaveLength(50);
    });

    for (const cand of intendedPolityCandidates) {
      it(`correctly classifies [${cand.id}] as polity (VERIFIED)`, () => {
        const filePath = path.join(examsDir, cand.file);
        const exam = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const qRecord = exam.questions.find((q: any) => q.id === cand.id);
        expect(qRecord).toBeDefined();

        const meta = getQuestionTopicMetadata(qRecord, 'ssc-chsl', cand.sectionName || cand.sectionId);
        expect(meta.primaryTopicId).toBe('polity');
        expect(meta.primaryTopicName).toBe('Polity & Constitution');
        expect(meta.classificationStatus).toBe('VERIFIED');
        expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
      });
    }
  });

  describe('Negative controls on the 5 candidate exclusions', () => {
    const excludedCandidates = frozen55.filter((c) => expectedExcludedIds.has(c.id));

    it('identifies exactly 5 excluded candidate records', () => {
      expect(excludedCandidates).toHaveLength(5);
    });

    for (const cand of excludedCandidates) {
      it(`does NOT misclassify candidate [${cand.id}] as polity`, () => {
        const filePath = path.join(examsDir, cand.file);
        const exam = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const qRecord = exam.questions.find((q: any) => q.id === cand.id);
        expect(qRecord).toBeDefined();

        const meta = getQuestionTopicMetadata(qRecord, 'ssc-chsl', cand.sectionName || cand.sectionId);
        expect(meta.primaryTopicId).not.toBe('polity');
      });
    }
  });

  describe('Adversarial History and Economics negative controls', () => {
    it('does NOT misclassify Permanent Settlement / Governor-General questions as polity', () => {
      const q = {
        id: 'test-history-governor-general',
        questionText: 'Who was the Governor General of Bengal when the Permanent Settlement was introduced there in 1793?',
        options: ['Lord Cornwallis', 'Warren Hastings', 'Lord Wellesley', 'Lord Dalhousie'],
      };
      const meta = getQuestionTopicMetadata(q, 'ssc-chsl', 'General Awareness');
      expect(meta.primaryTopicId).toBe('history');
      expect(meta.primaryTopicId).not.toBe('polity');
    });

    it('does NOT misclassify British Parliament partition acts as polity', () => {
      const q = {
        id: 'test-history-parliament-act',
        questionText: 'Indian Independence Act 1947 is an Act of the Parliament of the United Kingdom that partitioned British India into two new independent dominions.',
        options: ['Treaty of Versailles', 'Indian Independence Act', 'Government of India Act', 'Charter Act'],
      };
      const meta = getQuestionTopicMetadata(q, 'ssc-chsl', 'General Awareness');
      expect(meta.primaryTopicId).not.toBe('polity');
    });

    it('does NOT misclassify RBI governor questions as polity', () => {
      const q = {
        id: 'test-economics-rbi-governor',
        questionText: 'Who among the following was NOT a governor of Reserve Bank of India?',
        options: ['Manmohan Singh', 'Raghuram Rajan', 'Urjit Patel', 'Amartya Sen'],
      };
      const meta = getQuestionTopicMetadata(q, 'ssc-chsl', 'General Awareness');
      expect(meta.primaryTopicId).toBe('economics');
      expect(meta.primaryTopicId).not.toBe('polity');
    });

    it('does NOT misclassify reasoning coding-decoding questions containing CONSTITUTION as polity', () => {
      const q = {
        id: 'test-reasoning-constitution-code',
        questionText: 'If in a certain code language, SITUATION is written as 133 and RIGHT is written as 67, then how will CONSTITUTION be written in that code language?',
        options: ['184', '192', '178', '196'],
      };
      const meta = getQuestionTopicMetadata(q, 'ssc-chsl', 'General Intelligence');
      expect(meta.primaryTopicId).toBe('coding_decoding');
      expect(meta.primaryTopicId).not.toBe('polity');
    });
  });

  describe('Section Boundary Invariants', () => {
    it('never assigns polity to questions in English Language section even with constitutional text', () => {
      const q = {
        id: 'test-english-constitution',
        questionText: 'Identify the segment in the sentence which contains a grammatical error: The Indian Constitution have granted fundamental rights to all citizens.',
        options: ['The Indian Constitution', 'have granted', 'fundamental rights', 'to all citizens'],
      };
      const meta = getQuestionTopicMetadata(q, 'ssc-chsl', 'English Language');
      expect(meta.primaryTopicId).not.toBe('polity');
    });

    it('never assigns polity to questions in Quantitative Aptitude section', () => {
      const q = {
        id: 'test-quant-constitution-word',
        questionText: 'In an assembly of delegates discussing the Constitution of India, 40% were lawyers and 35% were economists...',
        options: ['120', '140', '150', '160'],
      };
      const meta = getQuestionTopicMetadata(q, 'ssc-chsl', 'Quantitative Aptitude');
      expect(meta.primaryTopicId).not.toBe('polity');
    });
  });
});
