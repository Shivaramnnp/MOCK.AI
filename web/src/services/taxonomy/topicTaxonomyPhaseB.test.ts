import { describe, it, expect } from 'vitest';
import { getQuestionTopicMetadata } from './topicClassifier';
import fs from 'fs';
import path from 'path';

describe('CHSL Phase B Shared-Rule Remediation & Control Tests', () => {
  describe('Defect 1: Arithmetic vs Geometry (Distance between centres)', () => {
    it('correctly categorizes circle intersection with centre distance as geometry', () => {
      const q = {
        questionText:
          'Two circles of radii 5 cm and 8 cm intersect at the points A and B. If AB = 8cm and the distance between the centres of two circles is x cm, then the value of x (to the closest integer) is:',
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('geometry');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves genuine arithmetic questions involving distance between stations/cities', () => {
      const q = {
        questionText:
          'A train leaves town A at 60 km/h and another leaves town B at 80 km/h. If the distance between two stations is 280 km, how much time will they take to cross each other?',
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('arithmetic');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves genuine arithmetic questions involving average speed and distance travelled', () => {
      const q = {
        questionText:
          'Amit travelled from A to B at an average speed of 80 km/h. He travelled the first 75% of the distance in two-thirds of the time. What was his speed for the remaining journey?',
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('arithmetic');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });
  });

  describe('Defect 2: Economics vs Static GK (Summit location trivia)', () => {
    it('correctly categorizes summit location trivia as Static GK even when mentioning venture capital', () => {
      const q = {
        questionText:
          'In which of the following locations was the Global Venture Capital Summit 2018 held?',
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('current_affairs_static_gk');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves genuine economics questions involving venture capital funding and investment', () => {
      const q = {
        questionText:
          'A venture capital fund provides seed equity and financing to high-growth startup firms. Under SEBI regulations, how are Alternative Investment Funds classified?',
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('economics');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves genuine economics questions involving banking, monetary policy and taxes', () => {
      const qGst = {
        questionText:
          'Which of the following indirect taxes was subsumed under the Goods and Services Tax (GST) regime in India?',
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const metaGst = getQuestionTopicMetadata(qGst);
      expect(metaGst.primaryTopicId).toBe('economics');

      const qRbi = {
        questionText:
          'When the Reserve Bank of India increases the repo rate, what is the immediate impact on commercial bank borrowing costs and inflation?',
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const metaRbi = getQuestionTopicMetadata(qRbi);
      expect(metaRbi.primaryTopicId).toBe('economics');
    });

    it('preserves genuine static GK questions regarding summits and awards', () => {
      const qSummit = {
        questionText:
          'Where was the 14th G20 Summit held in June 2019?',
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const metaSummit = getQuestionTopicMetadata(qSummit);
      expect(metaSummit.primaryTopicId).toBe('current_affairs_static_gk');
    });
  });

  describe('Defect 3: Geography Boundary Superlatives', () => {
    it('correctly categorizes state boundary superlatives with definite article as geography', () => {
      const q = {
        questionText:
          'Which of the following states shares the longest boundary with China?',
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('geography');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves genuine geography controls for rivers, mountains, and parks', () => {
      const qRiver = {
        questionText:
          'Which of the following is a right-bank tributary of the Godavari river originating in Maharashtra?',
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qRiver).primaryTopicId).toBe('geography');

      const qPark = {
        questionText:
          'In which state of India is the Kaziranga National Park located?',
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qPark).primaryTopicId).toBe('geography');
    });
  });

  describe('15 Manually Verified Known Ground-Truth Cases', () => {
    const auditPath = '/Users/shivarampatel/.gemini/antigravity/brain/7fb5b141-45b8-4b11-9812-d8e420006e7a/scratch/chsl_evaluation_dataset_audit.json';
    const auditRecords = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    const verifiedCases = auditRecords.filter((r: any) => r.provenance === 'MANUALLY_VERIFIED_KNOWN_CASE');

    expect(verifiedCases.length).toBe(15);

    for (const testCase of verifiedCases) {
      it(`evaluates ${testCase.id} -> ${testCase.expectedTopic} (${testCase.section})`, () => {
        const examPath = path.resolve(__dirname, '../../data/exams', testCase.file);
        const exam = JSON.parse(fs.readFileSync(examPath, 'utf8'));
        const originalQ = exam.questions.find((x: any) => x.id === testCase.id);
        expect(originalQ).toBeDefined();

        // Strip pre-existing topic metadata to test from pure question content & options
        const cleanQuestion = {
          ...originalQ,
          topic: undefined,
          topicMetadata: undefined,
        };

        const meta = getQuestionTopicMetadata(cleanQuestion, 'ssc-chsl', testCase.section);
        expect(meta.primaryTopicId).toBe(testCase.expectedTopic);
        expect(['VERIFIED', 'REVIEW_REQUIRED']).toContain(meta.classificationStatus);
      });
    }
  });
});
