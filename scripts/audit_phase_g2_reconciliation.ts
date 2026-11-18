import fs from 'fs';
import path from 'path';
import { getQuestionTopicMetadata } from '../web/src/services/taxonomy/topicClassifier';

interface WorkbenchItem {
  sampleIndex: number;
  questionId: string;
  file: string;
  year: number;
  shift: string;
  section: string;
  sectionCategory: 'quant' | 'ga' | 'reasoning' | 'english';
  questionNumber: number;
  questionText: string;
  options: string[];
  diagramUrl: string | null;
  optionImages: string[] | null;
  hasDiagram: boolean;
  hasOptionImages: boolean;
  isDiagramDependent: boolean;
  isBilingualOrHindi: boolean;
  isShortStem: boolean;
  predictedTopicId: string;
  predictedTopicName: string;
  classificationStatus: string;
  confidence: number;
  humanGroundTruthTopic: string | null;
  cannotDetermineFromAvailableSource: boolean;
  annotationNotes: string;
  annotatorId: string | null;
  reviewedAt: string | null;
}

const wbPath = path.resolve(__dirname, '../chsl_phase_f_human_annotation_workbench_200.json');
const items: WorkbenchItem[] = JSON.parse(fs.readFileSync(wbPath, 'utf8'));

// Population sizes
const CORPUS_TOTAL = 20308;
const STRATA_N: Record<string, number> = {
  VERIFIED: 14118,
  REVIEW_REQUIRED: 612,
  UNCLASSIFIED: 5578,
};

interface ScenarioConfig {
  name: string;
  description: string;
  excludeIndices: number[]; // e.g. [21] or [21, 106, 108, 110, 111, 112]
  reconciledLabels?: Record<number, string>; // e.g. 106 -> logical_reasoning
}

const scenarios: ScenarioConfig[] = [
  {
    name: 'Scenario A: Original Workbench Labels (Unmodified, Only OCR Excluded)',
    description: 'Uses the frozen human workbench ground truth exactly as recorded. Only question #21 is excluded due to corrupted OCR.',
    excludeIndices: [21],
  },
  {
    name: 'Scenario B: Documented Forensic Exclusions (Conservative Ground Truth)',
    description: 'Excludes the 5 misaligned reasoning questions (#106, #108, #110, #111, #112) in addition to #21, restricting evaluation strictly to verified, uncompromised human ground-truth labels (N=194).',
    excludeIndices: [21, 106, 108, 110, 111, 112],
  },
  {
    name: 'Scenario C1: Reconciled Reasoning Labels (#151 as Grammar)',
    description: 'Reconciles the 5 misaligned reasoning items to the topics of their actual stems (#106->logical_reasoning, #108->logical_reasoning, #110->coding_decoding, #111->coding_decoding, #112->logical_reasoning). #151 kept as grammar (matching annotator label).',
    excludeIndices: [21],
    reconciledLabels: {
      106: 'logical_reasoning',
      108: 'logical_reasoning',
      110: 'coding_decoding',
      111: 'coding_decoding',
      112: 'logical_reasoning',
    },
  },
  {
    name: 'Scenario C2: Reconciled Reasoning Labels AND Corrected #151 (Vocabulary)',
    description: 'Reconciles 5 reasoning items to actual stem topics AND corrects #151 to vocabulary (spelling error stem). Highlights impact if classifier segment-split rule misclassifies #151 as grammar.',
    excludeIndices: [21],
    reconciledLabels: {
      106: 'logical_reasoning',
      108: 'logical_reasoning',
      110: 'coding_decoding',
      111: 'coding_decoding',
      112: 'logical_reasoning',
      151: 'vocabulary',
    },
  },
];

interface StratumStat {
  n: number;
  correct: number;
  p: number;
  N: number;
  W: number;
  fpc: number;
  variance: number;
}

interface ScenarioResult {
  name: string;
  description: string;
  totalSample: number;
  evaluatedN: number;
  excludedN: number;
  exactMatches: number;
  sampleAccuracy: number;
  falsePositives: number;
  falseNegatives: number;
  precisionAssigned: number;
  coverage: number;
  strata: Record<string, StratumStat>;
  weightedAccuracy: number;
  standardError: number;
  ci95Lower: number;
  ci95Upper: number;
  sectionBreakdown: Record<string, { total: number; evaluated: number; correct: number; fp: number; fn: number; acc: number }>;
}

function runScenario(scen: ScenarioConfig): ScenarioResult {
  let evaluatedN = 0;
  let exactMatches = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let totalAssigned = 0;
  let truePositivesAssigned = 0;

  const strataCounts: Record<string, { n: number; correct: number }> = {
    VERIFIED: { n: 0, correct: 0 },
    REVIEW_REQUIRED: { n: 0, correct: 0 },
    UNCLASSIFIED: { n: 0, correct: 0 },
  };

  const sectionBreakdown: Record<string, { total: number; evaluated: number; correct: number; fp: number; fn: number; acc: number }> = {
    quant: { total: 0, evaluated: 0, correct: 0, fp: 0, fn: 0, acc: 0 },
    ga: { total: 0, evaluated: 0, correct: 0, fp: 0, fn: 0, acc: 0 },
    reasoning: { total: 0, evaluated: 0, correct: 0, fp: 0, fn: 0, acc: 0 },
    english: { total: 0, evaluated: 0, correct: 0, fp: 0, fn: 0, acc: 0 },
  };

  for (const item of items) {
    const sec = item.sectionCategory;
    sectionBreakdown[sec].total++;

    if (scen.excludeIndices.includes(item.sampleIndex) || item.cannotDetermineFromAvailableSource) {
      continue;
    }

    evaluatedN++;
    sectionBreakdown[sec].evaluated++;

    const stratum = item.classificationStatus;
    strataCounts[stratum].n++;

    // Determine target truth
    let truth = item.humanGroundTruthTopic;
    if (scen.reconciledLabels && scen.reconciledLabels[item.sampleIndex]) {
      truth = scen.reconciledLabels[item.sampleIndex];
    }

    // Predict with Phase G classifier
    const meta = getQuestionTopicMetadata({
      id: item.questionId,
      questionText: item.questionText,
      options: item.options,
      sectionName: item.section,
      examId: 'ssc-chsl',
    });
    const predTopic = meta.primaryTopicId;

    if (predTopic !== 'uncategorized') {
      totalAssigned++;
    }

    if (predTopic === truth) {
      exactMatches++;
      sectionBreakdown[sec].correct++;
      strataCounts[stratum].correct++;
      if (predTopic !== 'uncategorized') {
        truePositivesAssigned++;
      }
    } else if (predTopic === 'uncategorized') {
      falseNegatives++;
      sectionBreakdown[sec].fn++;
    } else {
      falsePositives++;
      sectionBreakdown[sec].fp++;
    }
  }

  for (const sec of Object.keys(sectionBreakdown)) {
    const s = sectionBreakdown[sec];
    s.acc = s.evaluated > 0 ? (s.correct / s.evaluated) * 100 : 0;
  }

  // Compute stratified statistics
  const strata: Record<string, StratumStat> = {};
  let weightedSum = 0;
  let totalVar = 0;

  for (const st of ['VERIFIED', 'REVIEW_REQUIRED', 'UNCLASSIFIED']) {
    const d = strataCounts[st];
    const n = d.n;
    const c = d.correct;
    const p = n > 0 ? c / n : 0;
    const N = STRATA_N[st];
    const W = N / CORPUS_TOTAL;
    const fpc = N > n ? (N - n) / N : 1;
    // Stratum sample variance s_h^2 / n_h = [p(1-p)/(n-1)]
    const s2 = n > 1 ? (p * (1 - p)) / (n - 1) : 0;
    const v_h = (W * W) * fpc * s2;

    strata[st] = {
      n,
      correct: c,
      p,
      N,
      W,
      fpc,
      variance: v_h,
    };

    weightedSum += W * p;
    totalVar += v_h;
  }

  const weightedAccuracy = weightedSum * 100;
  const standardError = Math.sqrt(totalVar) * 100;
  const ci95Lower = Math.max(0, weightedAccuracy - 1.95996 * standardError);
  const ci95Upper = Math.min(100, weightedAccuracy + 1.95996 * standardError);

  return {
    name: scen.name,
    description: scen.description,
    totalSample: items.length,
    evaluatedN,
    excludedN: items.length - evaluatedN,
    exactMatches,
    sampleAccuracy: (exactMatches / evaluatedN) * 100,
    falsePositives,
    falseNegatives,
    precisionAssigned: totalAssigned > 0 ? (truePositivesAssigned / totalAssigned) * 100 : 0,
    coverage: (totalAssigned / evaluatedN) * 100,
    strata,
    weightedAccuracy,
    standardError,
    ci95Lower,
    ci95Upper,
    sectionBreakdown,
  };
}

console.log('Running Audit Scenarios...');
const results = scenarios.map(runScenario);

for (const res of results) {
  console.log('\n' + '='.repeat(85));
  console.log(`SCENARIO: ${res.name}`);
  console.log(`Description: ${res.description}`);
  console.log('-'.repeat(85));
  console.log(`Evaluated Sample:            ${res.exactMatches} / ${res.evaluatedN} (${res.sampleAccuracy.toFixed(2)}%) [Excluded: ${res.excludedN}]`);
  console.log(`Cross-Topic False Positives: ${res.falsePositives} (${((res.falsePositives / res.evaluatedN) * 100).toFixed(2)}%)`);
  console.log(`Uncategorized False Negatives: ${res.falseNegatives} (${((res.falseNegatives / res.evaluatedN) * 100).toFixed(2)}%)`);
  console.log(`Precision among Assigned:    ${res.precisionAssigned.toFixed(2)}%`);
  console.log(`Classifier Coverage:         ${res.coverage.toFixed(2)}%`);
  console.log(`Corpus-Weighted Accuracy:    ${res.weightedAccuracy.toFixed(2)}%`);
  console.log(`Standard Error (SE):         ${res.standardError.toFixed(2)}%`);
  console.log(`95% Confidence Interval:     [${res.ci95Lower.toFixed(2)}%, ${res.ci95Upper.toFixed(2)}%]`);
  
  console.log('\n--- STRATA BREAKDOWN ---');
  for (const [st, d] of Object.entries(res.strata)) {
    console.log(`  ${st.padEnd(16)}: n=${d.n.toString().padStart(3)} | Correct=${d.correct.toString().padStart(3)} | Acc=${(d.p * 100).toFixed(2).padStart(6)}% | N=${d.N.toString().padStart(5)} | W=${(d.W * 100).toFixed(2)}% | FPC=${d.fpc.toFixed(4)}`);
  }

  console.log('\n--- SECTION BREAKDOWN ---');
  for (const [sec, s] of Object.entries(res.sectionBreakdown)) {
    console.log(`  ${sec.toUpperCase().padEnd(10)}: Evaluated=${s.evaluated.toString().padStart(2)} | Correct=${s.correct.toString().padStart(2)} (${s.acc.toFixed(1)}%) | FP=${s.fp} | FN=${s.fn}`);
  }
}
