import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getQuestionTopicMetadata } from './topicClassifier';

/**
 * Phase G.6D: Targeted English Spelling Classification Fix Test Suite
 *
 * Validates that all 25 identified spelling questions in the CHSL corpus
 * are correctly and deterministically classified under 'vocabulary' with
 * VERIFIED status (confidence >= 0.85), while ensuring genuine grammar questions
 * (sentence improvement, substitution, fill-in-the-blank, error detection, voice, narration)
 * strictly retain their verified 'grammar' classification.
 */

describe('Phase G.6D — Targeted English Spelling Classification Fix', () => {
  describe('1. Individual Verification of All 25 Target Spelling Records', () => {
    // Template B: Sentence Substitution / Replacement Spelling Questions
    it('[#1] ssc-chsl-2021-02jun-s1-q7: classifies spelling substitution as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2021-02jun-s1-q7',
        sectionName: 'English Language',
        questionText:
          'Select the most appropriate spelling that can substitute the underlined word in the\ngiven sentence.\nHe had to prepare for his competation',
        options: ['competetion', 'compitition', 'competion', 'competition'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.primaryTopicName).toBe('Vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#2] ssc-chsl-2021-07jun-s2-q6: classifies "fill in the blank with correctly spelt word" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2021-07jun-s2-q6',
        sectionName: 'English Language',
        questionText:
          'Fill in the blank with the correctly spelt word.\nThere was a feeling of __________ in his eyes.',
        options: ['vengaence', 'vengense', 'vengence', 'vengeance'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#3] ssc-chsl-2021-09jun-s1-q1: classifies spelling substitution as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2021-09jun-s1-q1',
        sectionName: 'English Language',
        questionText:
          'Select the most appropriate spelling that can substitute the underlined word in the\ngiven sentence.\nCompparision with others is not always good.',
        options: ['Comparisson', 'Compasison', 'Comparison', 'Comparision'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#4] ssc-chsl-2021-10jun-s1-q14: classifies "correctly spelt word to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2021-10jun-s1-q14',
        sectionName: 'English Language',
        questionText:
          'Select the correctly spelt word to fill in the blank.\nI really admire his ___________ to fulfil his dream to join navy.',
        options: ['persistance', 'parsistance', 'persistence', 'parcistanse'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#5] ssc-chsl-2021-24may-s2-q4: classifies "correctly spelt word to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2021-24may-s2-q4',
        sectionName: 'English Language',
        questionText:
          'Select the correctly spelt word to fill in the blank.\nThe people from sub-continent are very _____________.',
        options: ['superstitios', 'superstitious', 'supersticious', 'supersctitious'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#6] ssc-chsl-2021-26may-s1-q16: classifies "correctly spelt word to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2021-26may-s1-q16',
        sectionName: 'English Language',
        questionText:
          'Select the correctly spelt word to fill in the blank.\nThe ________________ of the worksheets is not an easy job.',
        options: ['reconcilation', 'reconsiliation', 'reconsilation', 'reconciliation'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#7] ssc-chsl-2021-30may-s1-q7: classifies spelling substitution as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2021-30may-s1-q7',
        sectionName: 'English Language',
        questionText:
          'Select the most appropriate spelling that can substitute the underlined word in the\ngiven sentence.\nWe love to play with our neighboar’s children',
        options: ['neighbours', 'naighbour’s', 'neighboars', 'neighbour’s'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#8] ssc-chsl-2022-02nov-s1-tier2-q73: classifies "correct spelling ... to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2022-02nov-s1-tier2-q73',
        sectionName: 'English Language',
        questionText:
          'Select the correct spelling from the given options to fill in the blank.\nHe was _________ going abroad for his further studies.',
        options: ['contemplating', 'cuntempltaing', 'cuntemplating', 'contempltaing'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#9] ssc-chsl-2023-02aug-s1-q8: classifies "correct spelling that can replace the underlined" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-02aug-s1-q8',
        sectionName: 'English Language',
        questionText:
          'Select the option with the correct spelling that can replace the underlined word in the\ngiven sentence.\nKasturi acts as a liason between patients and staff.',
        options: ['liaision', 'laision', 'liaison', 'liaisan'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#10] ssc-chsl-2023-02aug-s3-q16: classifies "correct spelling ... to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-02aug-s3-q16',
        sectionName: 'English Language',
        questionText:
          'Select the correct spelling from the given options to fill in the blank.\nJaysmita is one of the most ______________ persons I have ever met as she has many\ntalents.',
        options: ['versataile', 'versatele', 'versateile', 'versatile'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#11] ssc-chsl-2023-02aug-s3-q19: classifies "correct spelling ... to replace the underlined" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-02aug-s3-q19',
        sectionName: 'English Language',
        questionText:
          'Select the correct spelling from the given options to replace the underlined word in the\nfollowing sentence.\nThe new policy will supplant the old one and introduce stricter measures for\nworkplace safety.',
        options: ['overide', 'supersede', 'suceed', 'superseed'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#12] ssc-chsl-2023-02aug-s4-q13: classifies "correct spelling ... to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-02aug-s4-q13',
        sectionName: 'English Language',
        questionText:
          'Select the correct spelling from the given options to fill in the blank.\nThe civil engineers are trying to __________ the bridge using the new technology.',
        options: ['elevate', 'ilivate', 'alivate', 'elivait'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#13] ssc-chsl-2023-02nov-s1-tier2-q73: classifies "correct spelling ... to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-02nov-s1-tier2-q73',
        sectionName: 'English Language',
        questionText:
          'Select the correct spelling from the given options to fill in the blank.\nHe was _________ going abroad for his further studies.',
        options: ['contemplating', 'cuntempltaing', 'cuntemplating', 'contempltaing'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#14] ssc-chsl-2023-03aug-s1-q2: classifies "meaningful and correctly spelt word ... to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-03aug-s1-q2',
        sectionName: 'English Language',
        questionText:
          'Select the meaningful and correctly spelt word from the given options to fill in the\nblank.\nThe chief guest is ___________ to arrive at the venue within half an hour.',
        options: ['accepted', 'expieted', 'expected', 'espected'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#15] ssc-chsl-2023-07aug-s1-q8: classifies "correct spelling that can replace the underlined" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-07aug-s1-q8',
        sectionName: 'English Language',
        questionText:
          'Select the option with the correct spelling that can replace the underlined word in the\ngiven sentence.\nThe old building was damolished to make way for a new building.',
        options: ['demolished', 'demoleished', 'demonlished', 'demolaished'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#16] ssc-chsl-2023-07aug-s2-q13: classifies "meaningful and correctly spelt word ... to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-07aug-s2-q13',
        sectionName: 'English Language',
        questionText:
          'Select the meaningful and correctly spelt word from the given options to fill in the\nblank.\nThe most ___________ creature, as far as Amit is concerned, is a walrus.',
        options: ['dispecable', 'despicable', 'deliberate', 'desietful'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#17] ssc-chsl-2023-08aug-s1-q8: classifies "meaningful and correctly spelt word ... to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-08aug-s1-q8',
        sectionName: 'English Language',
        questionText:
          'Select the meaningful and correctly spelt word from the options to fill in the blank.\nThe song composed by the choir for the special programme was an _________ one.',
        options: ['imiteitted', 'emittated', 'eradicated', 'imitated'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#18] ssc-chsl-2023-10aug-s3-q16: classifies "meaningful and correctly spelt word ... to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-10aug-s3-q16',
        sectionName: 'English Language',
        questionText:
          'Select the meaningful and correctly spelt word from the given options to fill in the\nblank.\nThe colourful procession was the last item to be performed in the ___________.',
        options: ['peasantry', 'pegentry', 'pageantry', 'pegeantri'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#19] ssc-chsl-2023-11aug-s2-q17: classifies "meaningful and correctly spelt word ... to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-11aug-s2-q17',
        sectionName: 'English Language',
        questionText:
          'Select the meaningful and correctly spelt word from the given options to fill in the\nblank.\nWhenever Susan received letters from the police, she __________ ignored them.',
        options: ['intantienally', 'intoningly', 'indentionally', 'intentionally'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#20] ssc-chsl-2023-14aug-s3-q16: classifies "correct spelling that can replace the underlined" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-14aug-s3-q16',
        sectionName: 'English Language',
        questionText:
          'Select the option with the correct spelling that can replace the underlined word in the\ngiven sentence.\nEmployees were lay of from work due to the recession.',
        options: ['laid off', 'laid of', 'lay off', 'layed off'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#21] ssc-chsl-2023-17aug-s2-q8: classifies "correct spelling ... to fill in the blank" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-17aug-s2-q8',
        sectionName: 'English Language',
        questionText:
          'Select the correct spelling from the given options to fill in the blank.\nMihika was one of the _______________ in the Master Chef competition held in our\nsociety last year.',
        options: ['contextants', 'contestents', 'contestants', 'kontestants'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#22] ssc-chsl-2024-09jul-s4-q20: classifies "correct spelling to replace the underlined" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2024-09jul-s4-q20',
        sectionName: 'English Language',
        questionText:
          'Select the option with the correct spelling to replace the underlined word in the given\nsentence.\nA natural clamity causing huge destruction and loss of life and property.',
        options: ['calamity', 'calamitey', 'climanity', 'clamanity'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#23] ssc-chsl-2024-18nov-s1-tier2-q86: classifies "replace ... with its correctly spelt version" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2024-18nov-s1-tier2-q86',
        sectionName: 'English Language',
        questionText:
          'Replace the underlined word in the given sentence with its correctly spelt version.\nI have been morning the death of my pet dog.',
        options: ['merning', 'moruning', 'mourning', 'murning'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#24] ssc-chsl-2025-21nov-s1-q3: classifies "fill in the blank with correctly spelt word" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2025-21nov-s1-q3',
        sectionName: 'English Language',
        questionText:
          'Fill in the blank with the correctly spelt word:\n“Regular ___________ of the company’s complex machinery is essential to improve efficiency, reduce energy waste, and\nmaintain consistent product quality across all shifts.”',
        options: ['maintainance', 'maintanence', 'maintanance', 'maintenance'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('[#25] ssc-chsl-2025-21nov-s3-q14: classifies "fill in the blank with correctly spelled word that means" as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2025-21nov-s3-q14',
        sectionName: 'English Language',
        questionText:
          'Fill in the blank with the correctly spelled word that means “excessively talkative, especially about trivial\nmatters.”\nThe ____ colleague turned every meeting into a long discussion of small, unimportant details.',
        options: ['garulous', 'garralous', 'garrulous', 'garrolous'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('2. Negative Controls: Genuine Grammar Questions Strictly Retain Grammar Classification', () => {
    it('preserves genuine "fill in the blank" testing preposition / grammatical agreement as Grammar', () => {
      const q = {
        id: 'control-grammar-fitb-preposition',
        sectionName: 'English Language',
        questionText:
          'Select the most appropriate option to fill in the blank.\nThe manager was not satisfied ________ the explanation given by the employee.',
        options: ['with', 'at', 'on', 'about'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('preserves genuine "fill in the blank" testing tenses as Grammar', () => {
      const q = {
        id: 'control-grammar-fitb-tense',
        sectionName: 'English Language',
        questionText:
          'Select the most appropriate option to fill in the blank.\nBy the time the ambulance arrived, the patient ________ already passed away.',
        options: ['had', 'has', 'have', 'is'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('preserves genuine sentence improvement "substitute the underlined segment" as Grammar', () => {
      const q = {
        id: 'control-grammar-substitute-underlined',
        sectionName: 'English Language',
        questionText:
          'Select the option that will substitute the underlined segment in the given sentence. If no substitution is required, select ‘No substitution required’.\nNeither the coach nor the players was ready for the match.',
        options: ['were ready', 'is ready', 'are ready', 'No substitution required'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('preserves genuine "replace the underlined word" testing grammatical forms as Grammar', () => {
      const q = {
        id: 'control-grammar-replace-underlined',
        sectionName: 'English Language',
        questionText:
          'Select the most suitable option to replace the highlighted part in the following sentence.\nShe has been working in this organization since five years.',
        options: ['for five years', 'from five years', 'by five years', 'No improvement required'],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('preserves genuine error detection with split segments as Grammar', () => {
      const q = {
        id: 'control-grammar-error-segments',
        sectionName: 'English Language',
        questionText:
          'The following sentence has been split into four segments. Identify the segment that contains a grammatical error.\nEach of the participants / were given / a certificate of appreciation / by the chief guest.',
        options: [
          'were given',
          'a certificate of appreciation',
          'Each of the participants',
          'by the chief guest.',
        ],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('preserves genuine active to passive voice transformation as Grammar', () => {
      const q = {
        id: 'control-grammar-active-passive',
        sectionName: 'English Language',
        questionText:
          'Select the correct passive form of the given sentence.\nThe government has launched a new health scheme for rural families.',
        options: [
          'A new health scheme has been launched by the government for rural families.',
          'A new health scheme was launched by the government for rural families.',
          'A new health scheme had been launched by the government for rural families.',
          'A new health scheme is launched by the government for rural families.',
        ],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('preserves genuine direct to indirect speech transformation as Grammar', () => {
      const q = {
        id: 'control-grammar-direct-indirect',
        sectionName: 'English Language',
        questionText:
          'Select the correct indirect form of the given sentence.\nRohan said to me, "Can you help me solve this puzzle?"',
        options: [
          'Rohan asked me if I could help him solve that puzzle.',
          'Rohan told me if I can help him solve that puzzle.',
          'Rohan asked me that whether I could help him solve this puzzle.',
          'Rohan requested me can I help him solve that puzzle.',
        ],
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('3. Corpus Regression: Live Re-Evaluation of the 25 Exam Records from Disk', () => {
    const examDir = path.resolve(__dirname, '../../data/exams');
    const targetFileMap: Record<string, string> = {
      'ssc-chsl-2021-02jun-s1-q7': 'ssc-chsl-2021-02jun-s1.json',
      'ssc-chsl-2021-07jun-s2-q6': 'ssc-chsl-2021-07jun-s2.json',
      'ssc-chsl-2021-09jun-s1-q1': 'ssc-chsl-2021-09jun-s1.json',
      'ssc-chsl-2021-10jun-s1-q14': 'ssc-chsl-2021-10jun-s1.json',
      'ssc-chsl-2021-24may-s2-q4': 'ssc-chsl-2021-24may-s2.json',
      'ssc-chsl-2021-26may-s1-q16': 'ssc-chsl-2021-26may-s1.json',
      'ssc-chsl-2021-30may-s1-q7': 'ssc-chsl-2021-30may-s1.json',
      'ssc-chsl-2022-02nov-s1-tier2-q73': 'ssc-chsl-2022-02nov-s1-tier2.json',
      'ssc-chsl-2023-02aug-s1-q8': 'ssc-chsl-2023-02aug-s1.json',
      'ssc-chsl-2023-02aug-s3-q16': 'ssc-chsl-2023-02aug-s3.json',
      'ssc-chsl-2023-02aug-s3-q19': 'ssc-chsl-2023-02aug-s3.json',
      'ssc-chsl-2023-02aug-s4-q13': 'ssc-chsl-2023-02aug-s4.json',
      'ssc-chsl-2023-02nov-s1-tier2-q73': 'ssc-chsl-2023-02nov-s1-tier2.json',
      'ssc-chsl-2023-03aug-s1-q2': 'ssc-chsl-2023-03aug-s1.json',
      'ssc-chsl-2023-07aug-s1-q8': 'ssc-chsl-2023-07aug-s1.json',
      'ssc-chsl-2023-07aug-s2-q13': 'ssc-chsl-2023-07aug-s2.json',
      'ssc-chsl-2023-08aug-s1-q8': 'ssc-chsl-2023-08aug-s1.json',
      'ssc-chsl-2023-10aug-s3-q16': 'ssc-chsl-2023-10aug-s3.json',
      'ssc-chsl-2023-11aug-s2-q17': 'ssc-chsl-2023-11aug-s2.json',
      'ssc-chsl-2023-14aug-s3-q16': 'ssc-chsl-2023-14aug-s3.json',
      'ssc-chsl-2023-17aug-s2-q8': 'ssc-chsl-2023-17aug-s2.json',
      'ssc-chsl-2024-09jul-s4-q20': 'ssc-chsl-2024-09jul-s4.json',
      'ssc-chsl-2024-18nov-s1-tier2-q86': 'ssc-chsl-2024-18nov-s1-tier2.json',
      'ssc-chsl-2025-21nov-s1-q3': 'ssc-chsl-2025-21nov-s1.json',
      'ssc-chsl-2025-21nov-s3-q14': 'ssc-chsl-2025-21nov-s3.json',
    };

    for (const [qId, fileName] of Object.entries(targetFileMap)) {
      it(`re-evaluates ${qId} from ${fileName} as Vocabulary (VERIFIED)`, () => {
        const filePath = path.join(examDir, fileName);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const rawQ = data.questions.find((x: any) => x.id === qId);
        expect(rawQ).toBeDefined();

        const meta = getQuestionTopicMetadata({
          id: rawQ.id,
          questionText: rawQ.questionText,
          stem: rawQ.stem,
          prompt: rawQ.prompt,
          options: rawQ.options,
          sectionName: rawQ.sectionName || rawQ.sectionId,
          examId: 'ssc-chsl',
        });

        expect(meta.primaryTopicId).toBe('vocabulary');
        expect(meta.primaryTopicName).toBe('Vocabulary');
        expect(meta.classificationStatus).toBe('VERIFIED');
        expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
      });
    }
  });
});
