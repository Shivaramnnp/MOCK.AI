import { describe, it, expect } from 'vitest';
import { getQuestionTopicMetadata } from './topicClassifier';
import fs from 'fs';
import path from 'path';

describe('CHSL Phase D: Targeted Defect Fix & Control Tests', () => {
  describe('Issue 1: False-Positive History Classification on Modern Names', () => {
    it('classifies NDIAC arbitration chairperson question as Polity, not History', () => {
      const q = {
        questionText:
          'In 2022, Former Supreme Court Justice ___________ was appointed chairperson of the New Delhi International Arbitration Centre (NDIAC) .',
        options: ['Sanjay Kishan Kaul', 'Hemant Gupta', 'Pankaj Mithal', 'Ajay Rastogi'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('polity');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('correctly classifies genuine Gupta dynasty/empire questions as History', () => {
      const qFounder = {
        questionText:
          'Who among the following was the founder of the Gupta dynasty in ancient India?',
        options: ['Sri Gupta', 'Chandragupta I', 'Samudragupta', 'Kumaragupta'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qFounder).primaryTopicId).toBe('history');

      const qRuler = {
        questionText:
          'Which Gupta ruler was known as the Napoleon of India according to historian V. A. Smith?',
        options: ['Samudragupta', 'Chandragupta II', 'Skandagupta', 'Kumaragupta'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qRuler).primaryTopicId).toBe('history');

      const qPeriod = {
        questionText:
          'Gold coins issued during the Gupta period were referred to by which of the following names?',
        options: ['Dinaras', 'Dramma', 'Nishka', 'Karshapana'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qPeriod).primaryTopicId).toBe('history');

      const qPillar = {
        questionText:
          'The Mehrauli iron pillar inscription records the achievements of King Chandra, identified as Chandragupta II.',
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qPillar).primaryTopicId).toBe('history');
    });

    it('correctly separates historical governance from modern constitutional polity', () => {
      const qViceroy = {
        questionText:
          'Who was the Viceroy of India when the partition of Bengal was announced in 1905?',
        options: ['Lord Curzon', 'Lord Minto', 'Lord Hardinge', 'Lord Chelmsford'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qViceroy).primaryTopicId).toBe('history');

      const qConst = {
        questionText:
          'Which Article of the Constitution of India provides for the establishment of the Supreme Court of India?',
        options: ['Article 124', 'Article 136', 'Article 142', 'Article 214'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qConst).primaryTopicId).toBe('polity');
    });
  });

  describe('Issue 2: Triangle Area Question and Geometry/Mensuration Controls', () => {
    it('classifies triangle area from three side lengths as Mensuration', () => {
      const q = {
        questionText:
          'The three sides of a triangle are 7 cm, 9 cm and 8 cm. What is the area of the triangle ?',
        options: ['', '', '', ''],
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('mensuration');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves genuine triangle geometry questions as Geometry', () => {
      const qSimilar = {
        questionText:
          'In ΔABC, D and E are points on sides AB and AC respectively such that DE is parallel to BC. If AD = 3 cm, BD = 5 cm and BC = 12 cm, find the length of DE.',
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qSimilar).primaryTopicId).toBe('geometry');

      const qBisector = {
        questionText:
          'The internal angle bisector of ∠A in triangle ABC meets BC at D. If AB = 8 cm, AC = 6 cm and BC = 7 cm, find the length of BD.',
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qBisector).primaryTopicId).toBe('geometry');

      const qCircum = {
        questionText:
          'In an equilateral triangle ABC, O is the circumcentre and G is the centroid. What is the distance between circumcentre and incentre?',
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qCircum).primaryTopicId).toBe('geometry');
    });

    it('preserves genuine mensuration questions for 2D and 3D figures', () => {
      const qCone = {
        questionText:
          'A solid metallic right circular cylinder of base radius 6 cm and height 10 cm is melted and recast into small spheres of radius 2 cm. How many spheres can be formed?',
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qCone).primaryTopicId).toBe('mensuration');

      const qTrapezium = {
        questionText:
          'The parallel sides of a trapezium are 14 cm and 20 cm and the perpendicular distance between them is 8 cm. What is the area of the trapezium?',
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      expect(getQuestionTopicMetadata(qTrapezium).primaryTopicId).toBe('mensuration');
    });
  });
});
