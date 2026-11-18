import { describe, it, expect } from 'vitest';
import { getQuestionTopicMetadata } from './topicClassifier';

describe('Phase G.6C — Empty-Stem Classification Safety Invariants', () => {
  describe('Safety Guard: Empty or Whitespace-Only Stems Must Remain Unclassified', () => {
    it('returns canonical UNCLASSIFIED with confidence 0 for empty stem with trigonometry options', () => {
      const q = {
        id: 'mock-empty-trig',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['$\\cos^2 A$', '$\\operatorname{cosec}^2 A$', '$\\sec^2 A$', '$\\tan^2 A$'],
        diagramUrl: '/exam-assets/ssc/chsl/2022/ssc-chsl-2022-09mar-s1/q56_diag.jpeg',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('uncategorized');
      expect(meta.primaryTopicName).toBe('Uncategorized');
      expect(meta.classificationStatus).toBe('UNCLASSIFIED');
      expect(meta.confidence).toBe(0);
      expect(meta.secondaryTopicIds).toEqual([]);
    });

    it('returns canonical UNCLASSIFIED with confidence 0 for empty stem with speed options containing "km/h"', () => {
      const q = {
        id: 'mock-empty-speed',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['12 km/h', '16 km/h', '10 km/h', '15 km/h'],
        diagramUrl: '/exam-assets/ssc/chsl/2022/ssc-chsl-2022-09mar-s1/q67_diag.jpeg',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('uncategorized');
      expect(meta.primaryTopicName).toBe('Uncategorized');
      expect(meta.classificationStatus).toBe('UNCLASSIFIED');
      expect(meta.confidence).toBe(0);
      expect(meta.secondaryTopicIds).toEqual([]);
    });

    it('returns canonical UNCLASSIFIED with confidence 0 for empty stem with algebra-like option fragments', () => {
      const q = {
        id: 'mock-empty-algebra',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['\\frac{br", 2}{1 + 2x^2}', '\\frac{=x}{1 + x}', 'mee', '\\frac{- x}{1 + x^2}'],
        diagramUrl: '/exam-assets/ssc/chsl/2022/ssc-chsl-2022-09mar-s1/q74_diag.jpeg',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('uncategorized');
      expect(meta.primaryTopicName).toBe('Uncategorized');
      expect(meta.classificationStatus).toBe('UNCLASSIFIED');
      expect(meta.confidence).toBe(0);
      expect(meta.secondaryTopicIds).toEqual([]);
    });

    it('returns canonical UNCLASSIFIED with confidence 0 for empty stem with "Savings" options and a pie-chart asset', () => {
      const q = {
        id: 'mock-empty-pie-chart',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: [
          'Education, Others, Savings',
          'Transport, Others, Education',
          'Savings, Housing, Education',
          'Savings, Clothing, Education',
        ],
        diagramUrl: '/exam-assets/ssc/chsl/2022/ssc-chsl-2022-13mar-s1/q73_diag.jpeg',
      };
      const meta = getQuestionTopicMetadata(q);
      // Crucial: Must NOT classify as 'arithmetic' because of the word "Savings" in options!
      expect(meta.primaryTopicId).toBe('uncategorized');
      expect(meta.primaryTopicName).toBe('Uncategorized');
      expect(meta.classificationStatus).toBe('UNCLASSIFIED');
      expect(meta.confidence).toBe(0);
      expect(meta.secondaryTopicIds).toEqual([]);
    });

    it('returns canonical UNCLASSIFIED with confidence 0 for whitespace-only stems', () => {
      const qSpaces = {
        id: 'mock-whitespace-spaces',
        sectionName: 'Quantitative Aptitude',
        questionText: '     ',
        options: ['12 km/h', '16 km/h', '10 km/h', '15 km/h'],
      };
      const metaSpaces = getQuestionTopicMetadata(qSpaces);
      expect(metaSpaces.primaryTopicId).toBe('uncategorized');
      expect(metaSpaces.classificationStatus).toBe('UNCLASSIFIED');
      expect(metaSpaces.confidence).toBe(0);

      const qTabsNewlines = {
        id: 'mock-whitespace-mixed',
        sectionName: 'Quantitative Aptitude',
        questionText: ' \t\n\r  \n ',
        options: ['$\\cos^2 A$', '$\\sin^2 A$'],
      };
      const metaMixed = getQuestionTopicMetadata(qTabsNewlines);
      expect(metaMixed.primaryTopicId).toBe('uncategorized');
      expect(metaMixed.classificationStatus).toBe('UNCLASSIFIED');
      expect(metaMixed.confidence).toBe(0);
    });

    it('returns canonical UNCLASSIFIED with confidence 0 even if stale topic or topicMetadata is attached', () => {
      const qStale = {
        id: 'mock-empty-with-stale-meta',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['12 km/h', '16 km/h', '10 km/h', '15 km/h'],
        topic: 'Arithmetic',
        topicMetadata: {
          primaryTopicId: 'arithmetic',
          primaryTopicName: 'Arithmetic',
          secondaryTopicIds: [],
          secondaryTopicNames: [],
          classificationStatus: 'VERIFIED' as const,
          classificationSource: 'RULE_BASED',
          confidence: 0.89,
        },
      };
      const meta = getQuestionTopicMetadata(qStale as any);
      expect(meta.primaryTopicId).toBe('uncategorized');
      expect(meta.classificationStatus).toBe('UNCLASSIFIED');
      expect(meta.confidence).toBe(0);
    });
  });

  describe('Non-Empty Stem Positive Controls: Normal Questions Still Classify Accurately', () => {
    it('correctly classifies non-empty trigonometry stem with ordinary options', () => {
      const q = {
        id: 'mock-valid-trig',
        sectionName: 'Quantitative Aptitude',
        questionText: 'If sin θ + cos θ = 1, then find the value of sin 2θ.',
        options: ['0', '1', '2', '-1'],
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('trigonometry');
      expect(meta.primaryTopicName).toBe('Trigonometry');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('correctly classifies non-empty arithmetic stem with speed options', () => {
      const q = {
        id: 'mock-valid-arithmetic',
        sectionName: 'Quantitative Aptitude',
        questionText: 'A car travels a distance of 60 km at uniform speed. What is the original speed of the car?',
        options: ['12 km/h', '16 km/h', '10 km/h', '15 km/h'],
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('arithmetic');
      expect(meta.primaryTopicName).toBe('Arithmetic');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('correctly classifies non-empty data-interpretation stem with a chart', () => {
      const q = {
        id: 'mock-valid-di',
        sectionName: 'Quantitative Aptitude',
        questionText:
          'The given pie chart represents the percentage distribution of 1200 employees across five departments A, B, C, D, and E. Study the given pie chart and answer the question.',
        options: ['240', '360', '180', '420'],
        diagramUrl: '/exam-assets/ssc/chsl/2022/ssc-chsl-2022-13mar-s1/q73_diag.jpeg',
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('data_interpretation');
      expect(meta.primaryTopicName).toBe('Data Interpretation');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('Corpus Forensic Regression: Seven Previously Identified Empty-Stem Records', () => {
    const realEmptyRecords = [
      {
        id: 'ssc-chsl-2022-09mar-s1-q56',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['$\\cos^2 A$', '$\\operatorname{cosec}^2 A$', '$\\sec^2 A$', '$\\tan^2 A$'],
      },
      {
        id: 'ssc-chsl-2022-09mar-s1-q67',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['12 km/h', '16 km/h', '10 km/h', '15 km/h'],
      },
      {
        id: 'ssc-chsl-2022-09mar-s1-q74',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['\\frac{br", 2}{1 + 2x^2}', '\\frac{=x}{1 + x}', 'mee', '\\frac{- x}{1 + x^2}'],
      },
      {
        id: 'ssc-chsl-2022-13mar-s1-q73',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: [
          'Education, Others, Savings',
          'Transport, Others, Education',
          'Savings, Housing, Education',
          'Savings, Clothing, Education',
        ],
      },
      {
        id: 'ssc-chsl-2023-03aug-s3-q55',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['0', '1', '$2\\sin^3 5°$', '$2\\sin 55°$'],
      },
      {
        id: 'ssc-chsl-2023-14aug-s3-q63',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['$2\\sec A$', '$2\\cosec A$', '$\\sec A$', '$\\cosec A$'],
      },
      {
        id: 'ssc-chsl-2023-14aug-s3-q71',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: [
          '\\frac{1}{cos? A(1 + sin? A)}',
          '\\frac{1}{sin? A(1 - sin? A)}',
          '$\\frac{1}{2}$',
          '\\frac{1}{sin? A(1 + cos? A)}',
        ],
      },
    ];

    for (const record of realEmptyRecords) {
      it(`enforces unclassified status on corpus empty-stem record ${record.id}`, () => {
        const meta = getQuestionTopicMetadata(record);
        expect(meta.primaryTopicId).toBe('uncategorized');
        expect(meta.classificationStatus).toBe('UNCLASSIFIED');
        expect(meta.confidence).toBe(0);
      });
    }
  });

  describe('Corpus Forensic Regression: Four Additional Stored-Metadata Records on Disk', () => {
    const diskRecordsWithStaleMetadata = [
      {
        id: 'ssc-chsl-2019-03jul-s1-q57',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['', '', '', ''],
        topic: 'Arithmetic',
        topicMetadata: {
          primaryTopicId: 'arithmetic',
          primaryTopicName: 'Arithmetic',
          secondaryTopicIds: [],
          secondaryTopicNames: [],
          classificationStatus: 'VERIFIED',
          classificationSource: 'RULE_BASED',
          confidence: 0.85,
        },
      },
      {
        id: 'ssc-chsl-2019-03jul-s1-q62',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['', '', '', ''],
        topic: 'Trigonometry',
        topicMetadata: {
          primaryTopicId: 'trigonometry',
          primaryTopicName: 'Trigonometry',
          secondaryTopicIds: [],
          secondaryTopicNames: [],
          classificationStatus: 'VERIFIED',
          classificationSource: 'RULE_BASED',
          confidence: 0.98,
        },
      },
      {
        id: 'ssc-chsl-2019-04jul-s3-q72',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['', '', '', ''],
        topic: 'Geometry',
        topicMetadata: {
          primaryTopicId: 'geometry',
          primaryTopicName: 'Geometry',
          secondaryTopicIds: [],
          secondaryTopicNames: [],
          classificationStatus: 'VERIFIED' as const,
          classificationSource: 'RULE_BASED',
          confidence: 0.85,
        },
      },
      {
        id: 'ssc-chsl-2023-03aug-s3-q67',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        options: ['', '', '', ''],
        topic: 'Trigonometry',
        topicMetadata: {
          primaryTopicId: 'trigonometry',
          primaryTopicName: 'Trigonometry',
          secondaryTopicIds: [],
          secondaryTopicNames: [],
          classificationStatus: 'VERIFIED' as const,
          classificationSource: 'RULE_BASED',
          confidence: 0.93,
        },
      },
    ];

    for (const record of diskRecordsWithStaleMetadata) {
      it(`strips stale metadata and returns UNCLASSIFIED for empty-stem record ${record.id}`, () => {
        const meta = getQuestionTopicMetadata(record as any);
        expect(meta.primaryTopicId).toBe('uncategorized');
        expect(meta.classificationStatus).toBe('UNCLASSIFIED');
        expect(meta.confidence).toBe(0);
      });
    }
  });

  describe('Alternative Stem Aliases: Non-Empty stem or prompt when questionText is Empty', () => {
    it('correctly classifies when questionText is empty string but stem contains non-empty text', () => {
      const q = {
        id: 'mock-stem-fallback-empty-qt',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        stem: 'If sin θ + cos θ = 1, then find the value of sin 2θ.',
        options: ['0', '1', '2', '-1'],
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('trigonometry');
      expect(meta.primaryTopicName).toBe('Trigonometry');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('correctly classifies when questionText is empty string but prompt contains non-empty text', () => {
      const q = {
        id: 'mock-prompt-fallback-empty-qt',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        prompt: 'If sin θ + cos θ = 1, then find the value of sin 2θ.',
        options: ['0', '1', '2', '-1'],
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('trigonometry');
      expect(meta.primaryTopicName).toBe('Trigonometry');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('correctly classifies when questionText is whitespace-only but stem contains non-empty text', () => {
      const q = {
        id: 'mock-stem-fallback-whitespace-qt',
        sectionName: 'Quantitative Aptitude',
        questionText: '   \t  \n ',
        stem: 'If sin θ + cos θ = 1, then find the value of sin 2θ.',
        options: ['0', '1', '2', '-1'],
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('trigonometry');
      expect(meta.primaryTopicName).toBe('Trigonometry');
      expect(meta.classificationStatus).toBe('VERIFIED');
      expect(meta.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('returns UNCLASSIFIED when questionText, stem, and prompt are all empty or whitespace', () => {
      const q = {
        id: 'mock-all-aliases-empty',
        sectionName: 'Quantitative Aptitude',
        questionText: '',
        stem: '   ',
        prompt: '',
        options: ['12 km/h', '16 km/h', '10 km/h', '15 km/h'],
      };
      const meta = getQuestionTopicMetadata(q);
      expect(meta.primaryTopicId).toBe('uncategorized');
      expect(meta.classificationStatus).toBe('UNCLASSIFIED');
      expect(meta.confidence).toBe(0);
    });
  });
});

