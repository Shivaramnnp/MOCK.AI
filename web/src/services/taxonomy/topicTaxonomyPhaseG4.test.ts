import { describe, it, expect } from 'vitest';
import { getQuestionTopicMetadata } from './topicClassifier';

describe('CHSL Phase G.4 Spelling-Error vs Grammar Disambiguation Tests', () => {
  describe('1. Question #151 & Explicit Spelling Segmentation Tests', () => {
    it('classifies Question #151 (split into four segments with spelling error) as Vocabulary', () => {
      const q = {
        id: 'ssc-chsl-2023-14aug-s1-q14',
        questionText:
          'The following sentence has been split into four segments. Identify the segment that\ncontains a spelling error.\nAccording to a report / every day / thousands of animals / are slautered.',
        options: ['thousands of animals', 'are slautered', 'every day', 'According to a report'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('classifies split-segment question with "INCORRECTLY spelt word" as Vocabulary', () => {
      const q = {
        questionText:
          'The following sentence has been split into four segments. Identify the segment that contains an INCORRECTLY spelt word.\nSubsequent to the delegation’s visit to the villages, / a new working commitee and a task force / have been formed to carry out / all the developmental works as promised to the people.',
        options: [
          'have been formed to carry out',
          'Subsequent to the delegation’s visit to the villages,',
          'all the developmental works as promised to the people.',
          'a new working commitee and a task force',
        ],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies divided-into-segments with "spelling error" as Vocabulary', () => {
      const q = {
        questionText:
          'The given sentence is divided into four segments. Identify the segment that contains a spelling error.\nHer unparalelled dedication / to the conservation of wildlife / has inspired many young / environmentalists across the globe.',
        options: [
          'to the conservation of wildlife',
          'environmentalists across the globe.',
          'has inspired many young',
          'Her unparalelled dedication',
        ],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });
  });

  describe('2. Existing Grammar Error-Detection & Segmentation (Negative Controls)', () => {
    it('classifies split-into-four-segments with "grammatical error" as Grammar', () => {
      const q = {
        questionText:
          'The following sentence has been split into four segments. Identify the segment that contains a grammatical error.\nYou and I / am going / to make / a great team.',
        options: ['am going', 'to make', 'You and I', 'a great team.'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies split-into-four-segments with generic "error" as Grammar', () => {
      const q = {
        questionText:
          'The following sentence has been split into four segments. Identify the segment that contains an error.\nInvesting on real estate / can earn you quick profit / but it comes with / a certain amount of risk attached to it.',
        options: [
          'but it comes with',
          'can earn you quick profit',
          'a certain amount of risk attached to it.',
          'Investing on real estate',
        ],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies split-into-four-segments with "INCORRECT preposition" as Grammar', () => {
      const q = {
        questionText:
          'The following sentence has been split into four segments. Identify the segment that contains an INCORRECT preposition.\nPlease remember to take / your notice to the reception area / if you want it to be displayed / upon the bulletin board.',
        options: [
          'upon the bulletin board',
          'if you want it to be displayed',
          'your notice to the reception area',
          'Please remember to take',
        ],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies divided-into-parts with "may contain an error" as Grammar', () => {
      const q = {
        questionText:
          'The following sentence has been divided into parts. One of them may contain an error. Select the part that contains the error from the given options.\nNeither the principal nor the teachers was aware of the change in schedule.',
        options: [
          'was aware of the change',
          'Neither the principal',
          'nor the teachers',
          'in schedule',
        ],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });
  });

  describe('3. Spelling Wording Variants (All Classified as Vocabulary)', () => {
    it('classifies standard "INCORRECTLY spelt word" as Vocabulary', () => {
      const q = {
        questionText: 'Select the INCORRECTLY spelt word from the given options.',
        options: ['Occasion', 'Accomodate', 'Necessary', 'Separate'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies "correctly spelled word" (with -ed) as Vocabulary', () => {
      const q = {
        questionText: 'Select the correctly spelled word.',
        options: ['Privilege', 'Priviledge', 'Privilage', 'Privelige'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies "sentence with no spelling error" as Vocabulary', () => {
      const q = {
        questionText: 'Select the sentence which has no spelling error.',
        options: [
          'The committee reached a consensus on the matter.',
          'The comitee reached a consensus on the matter.',
          'The committee reached a concensus on the matter.',
          'The commitee reached a consensus on the matter.',
        ],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies "wrongly spelled word" as Vocabulary', () => {
      const q = {
        questionText: 'Select the wrongly spelled word in the following context.',
        options: ['Bureaucracy', 'Embarrass', 'Harrass', 'Millennium'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });
  });

  describe('4. Preservation of Phase G Regressions', () => {
    it('preserves sentence improvement "substitute the underlined phrase" as Grammar', () => {
      const q = {
        questionText:
          'Select the appropriate option that can substitute the underlined phrase in the following sentence.\nEven though she’s a celebrity, she doesn’t draw any attention towards herself .',
        options: ['keeps a low profile', 'keeps up with the Joneses', 'keeps hot under the collar', 'is hard to come by'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
    });

    it('preserves active/passive voice as Grammar', () => {
      const q = {
        questionText: 'Select the correct passive form of the given sentence.\nThe chef prepared a magnificent feast.',
        options: [
          'A magnificent feast was prepared by the chef.',
          'A magnificent feast had been prepared by the chef.',
          'A magnificent feast is prepared by the chef.',
          'A magnificent feast was being prepared by the chef.',
        ],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
    });

    it('preserves direct/indirect speech narration as Grammar', () => {
      const q = {
        questionText: 'Select the option that expresses the given sentence in indirect speech.\nHe said, "I have finished my homework."',
        options: [
          'He said that he had finished his homework.',
          'He said that he has finished his homework.',
          'He said that he finished his homework.',
          'He said that he was finishing his homework.',
        ],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
    });

    it('preserves one-word substitution as Vocabulary', () => {
      const q = {
        questionText:
          'Select the most appropriate one-word substitute for the given group of words.\nA person who compiles dictionaries',
        options: ['Lexicographer', 'Calligrapher', 'Cartographer', 'Choreographer'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
    });
  });
});
