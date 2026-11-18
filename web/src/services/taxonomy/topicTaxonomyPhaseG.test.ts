import { describe, it, expect } from 'vitest';
import { getQuestionTopicMetadata } from './topicClassifier';

describe('CHSL Phase G Targeted Taxonomy Remediation Tests', () => {
  describe('1. English Grammar vs Vocabulary Disambiguation', () => {
    it('classifies sentence improvement questions with "substitute the underlined phrase" as Grammar', () => {
      const q = {
        questionText:
          'Select the appropriate option that can substitute the underlined phrase in the following sentence.\nEven though she’s a celebrity, she doesn’t draw any attention towards herself .',
        options: ['keeps a low profile', 'keeps up with the Joneses', 'keeps hot under the collar', 'is hard to come by'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies "replace the highlighted part" questions as Grammar', () => {
      const q = {
        questionText:
          'Choose the most suitable option to replace the highlighted part of the sentence: The fashion of oversized coats has gone into popular again.',
        options: ['has become popular again', 'is popular again', 'has gone to popular again', 'No substitution required'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
    });

    it('classifies split-into-four-segments error detection questions as Grammar', () => {
      const q = {
        questionText:
          'The following sentence has been split into four segments. Identify the segment that contains an INCORRECT preposition.\nPlease remember to take / your notice to the reception area / if you want it to be displayed / upon the bulletin board.',
        options: ['upon the bulletin board', 'if you want it to be displayed', 'your notice to the reception area', 'Please remember to take'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('grammar');
    });

    it('preserves genuine one-word substitution as Vocabulary (Negative Control)', () => {
      const q = {
        questionText:
          'Select the most appropriate one-word substitute for the given group of words.\nA person who compiles dictionaries',
        options: ['Lexicographer', 'Calligrapher', 'Cartographer', 'Choreographer'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves genuine idiom and phrase meaning as Vocabulary (Negative Control)', () => {
      const q = {
        questionText:
          'Select the most appropriate meaning of the given idiom.\nBite the bullet',
        options: ['To accept something difficult and unpleasant', 'To make a foolish choice', 'To celebrate a victory', 'To remain silent'],
        sectionName: 'English Language',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('vocabulary');
    });
  });

  describe('2. Spatial & Visual Reasoning vs Coding/Decoding & Logical Reasoning', () => {
    it('classifies mirror image with "mirror is placed on line AB" as Spatial & Visual Reasoning', () => {
      const q = {
        questionText:
          'If a mirror is placed on the line AB. then out of the option figures which figure will be the right image of the question',
        options: ['', '', '', ''],
        sectionName: 'General Intelligence & Reasoning',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('spatial_visual');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies cube folding and opposite faces as Spatial & Visual Reasoning', () => {
      const q = {
        questionText:
          'A cube is made by folding the given sheet along the lines. In the cube so formed, which number would be on the face opposite to the face showing 4?',
        options: ['1', '2', '5', '6'],
        sectionName: 'General Intelligence & Reasoning',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('spatial_visual');
    });

    it('classifies embedded figures as Spatial & Visual Reasoning', () => {
      const q = {
        questionText:
          'Select the option figure in which the given figure is embedded (rotation is NOT allowed).',
        options: ['', '', '', ''],
        sectionName: 'General Intelligence & Reasoning',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('spatial_visual');
    });

    it('classifies paper folding and cutting as Spatial & Visual Reasoning', () => {
      const q = {
        questionText:
          'A square sheet of paper is folded along the dotted line and cut as shown below. How will it appear when unfolded?',
        options: ['', '', '', ''],
        sectionName: 'General Intelligence & Reasoning',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('spatial_visual');
    });

    it('preserves valid coding/decoding questions without confusion (Negative Control)', () => {
      const q = {
        questionText:
          'In a certain code language, if BURMUD is written as RKHCKT, then how will ANGLE be written as in that language?',
        options: ['PCVAT', 'QDWBU', 'HOPLY', 'REXCV'],
        sectionName: 'General Intelligence & Reasoning',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('coding_decoding');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves valid syllogisms as Logical Reasoning (Negative Control)', () => {
      const q = {
        questionText:
          'Three statements are followed by conclusions numbered I, II. You have to consider these statements to be true:\nStatements:\nAll engineers are graduates.\nRohit is an engineer.\nConclusions:\nI. Rohit is a graduate.\nII. All graduates are engineers.',
        options: ['Only conclusion (I) follows.', 'Neither conclusion follows.', 'Only conclusion (II) follows.', 'Both follow.'],
        sectionName: 'General Intelligence & Reasoning',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('logical_reasoning');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });
  });

  describe('3. General Awareness Disambiguation', () => {
    it('classifies 1893 Parliament of Religions / Vivekananda as History, not Polity', () => {
      const q = {
        questionText:
          'Who among the following participated in the All-World Religious Conference (Parliament of Religions) held in 1893 in Chicago?',
        options: ['Swami Shahjananda', 'Swami Dayanand', 'Raja Ram Mohan Roy', 'Swami Vivekananda'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('history');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies Presidential assent to Constitutional Amendment Act as Polity, not General Science', () => {
      const q = {
        questionText:
          'In August 2021, Ram Nath Kovind granted assent to which Constitution Amendment Act empowering states and UTs to identify and specify Socially and Educationally Backward Classes?',
        options: ['105th', '104th', '103rd', '102nd'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('polity');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies Justice Sachar Committee as Polity, not Geography', () => {
      const q = {
        questionText:
          'Justice Rajinder Sachar Committee was set up to study ________.',
        options: [
          'the socio-economic status of Muslim community in India',
          'the impact of globalisation on India',
          'the standards maintained by government hospitals in India',
          'the environmental issues of the western ghats in India',
        ],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('polity');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies ministry publication / report trivia as Static GK, not Polity', () => {
      const q = {
        questionText:
          'Which of the following brought out the publication ‘Elderly in India 2021’?',
        options: [
          'Ministry of Tribal Affairs',
          'Ministry of Health and Family Welfare',
          'Ministry of Statistics and Programme Implementation',
          'Ministry of Planning',
        ],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('current_affairs_static_gk');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies ancient Sanskrit literature author questions (Meghdoot / Kalidasa) as History, not Static GK', () => {
      const q = {
        questionText: "Who is the author of the famous book 'Meghdoot'?",
        options: ['Kalidasa', 'Sudraka', 'Bhasa', 'Vatsyayana'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('history');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies foreign exchange reserves milestone questions as Economics, not Static GK', () => {
      const q = {
        questionText: 'The foreign exchange reserves in India crossed the landmark of ___________ in June 2021.',
        options: ['US$ 900 trillion', 'US$ 600 trillion', 'US$ 600 billion', 'US$ 900 billion'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('economics');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves genuine modern Parliamentary questions as Polity (Negative Control)', () => {
      const q = {
        questionText:
          'Who decides whether a bill is a Money Bill or not in the Parliament of India?',
        options: ['President of India', 'Speaker of the Lok Sabha', 'Prime Minister', 'Finance Minister'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('polity');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves modern best-seller autobiography questions as Static GK (Negative Control)', () => {
      const q = {
        questionText: 'Who wrote the book ‘Playing It My Way’?',
        options: ['Sachin Tendulkar', 'Rahul Dravid', 'Sourav Ganguly', 'Kapil Dev'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('current_affairs_static_gk');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves computer hardware RAM questions in General Science / Computer (Negative Control)', () => {
      const q = {
        questionText:
          'Which type of random access memory (RAM) needs to be periodically refreshed?',
        options: ['Dynamic RAM (DRAM)', 'Static RAM (SRAM)', 'ROM', 'Flash memory'],
        sectionName: 'General Awareness',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('general_science');
    });
  });

  describe('4. Mensuration versus Geometry (Circumference & Circle Boundary)', () => {
    it('classifies circle circumference formula question as Mensuration', () => {
      const q = {
        questionText:
          'What is the circumference of a circle whose radius is 10.5 cm?',
        options: ['21 cm', '66 cm', '30 cm', '110 cm'],
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('mensuration');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('classifies circular field area question as Mensuration', () => {
      const q = {
        questionText:
          'The radius of a circular field is 21 m. What is the area of the circle?',
        options: ['1386 sq m', '1400 sq m', '1250 sq m', '1520 sq m'],
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('mensuration');
    });

    it('preserves genuine circle geometry questions involving chords and intersections (Negative Control)', () => {
      const q = {
        questionText:
          'Two circles of radii 5 cm and 8 cm intersect at the points A and B. If AB = 8cm and the distance between the centres of two circles is x cm, then the value of x (to the closest integer) is:',
        options: ['10', '11', '12', '9'],
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('geometry');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });

    it('preserves circle tangent geometry theorems as Geometry (Negative Control)', () => {
      const q = {
        questionText:
          'From an external point P, tangents PA and PB are drawn to a circle with centre O. If angle APB is 70 degrees, find angle AOB.',
        options: ['110 degrees', '120 degrees', '130 degrees', '140 degrees'],
        sectionName: 'Quantitative Aptitude',
        examId: 'ssc-chsl',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('geometry');
      expect(meta.classificationStatus).toBe('VERIFIED');
    });
  });
});
