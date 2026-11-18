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

console.log(`Loaded ${items.length} workbench items.`);

interface EvaluationStats {
  total: number;
  evaluated: number;
  indeterminable: number;
  correct: number;
  falsePositives: number;
  falseNegatives: number;
  accuracy: number;
  topicStats: Record<string, { tp: number; fp: number; fn: number; support: number }>;
  sectionStats: Record<string, { total: number; correct: number; fp: number; fn: number; indet: number }>;
  strataStats: Record<string, { total: number; correct: number; corpusN: number }>;
  weightedAccuracy: number;
}

function evaluatePredictions(
  predictor: (item: WorkbenchItem) => { topicId: string; status: string; confidence: number }
): EvaluationStats {
  const stats: EvaluationStats = {
    total: items.length,
    evaluated: 0,
    indeterminable: 0,
    correct: 0,
    falsePositives: 0,
    falseNegatives: 0,
    accuracy: 0,
    topicStats: {},
    sectionStats: {
      quant: { total: 0, correct: 0, fp: 0, fn: 0, indet: 0 },
      ga: { total: 0, correct: 0, fp: 0, fn: 0, indet: 0 },
      reasoning: { total: 0, correct: 0, fp: 0, fn: 0, indet: 0 },
      english: { total: 0, correct: 0, fp: 0, fn: 0, indet: 0 },
    },
    strataStats: {
      VERIFIED: { total: 0, correct: 0, corpusN: 14118 },
      REVIEW_REQUIRED: { total: 0, correct: 0, corpusN: 612 },
      UNCLASSIFIED: { total: 0, correct: 0, corpusN: 5578 },
    },
    weightedAccuracy: 0,
  };

  for (const item of items) {
    const sec = item.sectionCategory;
    stats.sectionStats[sec].total++;

    if (item.cannotDetermineFromAvailableSource || !item.humanGroundTruthTopic) {
      stats.indeterminable++;
      stats.sectionStats[sec].indet++;
      continue;
    }

    stats.evaluated++;
    const truth = item.humanGroundTruthTopic;
    const pred = predictor(item);

    if (!stats.topicStats[truth]) {
      stats.topicStats[truth] = { tp: 0, fp: 0, fn: 0, support: 0 };
    }
    stats.topicStats[truth].support++;

    // Strata tracking uses baseline item.classificationStatus
    const stratum = item.classificationStatus;
    if (stats.strataStats[stratum]) {
      stats.strataStats[stratum].total++;
    }

    if (pred.topicId === truth) {
      stats.correct++;
      stats.sectionStats[sec].correct++;
      stats.topicStats[truth].tp++;
      if (stats.strataStats[stratum]) {
        stats.strataStats[stratum].correct++;
      }
    } else if (pred.topicId === 'uncategorized') {
      stats.falseNegatives++;
      stats.sectionStats[sec].fn++;
      stats.topicStats[truth].fn++;
    } else {
      stats.falsePositives++;
      stats.sectionStats[sec].fp++;
      stats.topicStats[truth].fn++;
      if (!stats.topicStats[pred.topicId]) {
        stats.topicStats[pred.topicId] = { tp: 0, fp: 0, fn: 0, support: 0 };
      }
      stats.topicStats[pred.topicId].fp++;
    }
  }

  stats.accuracy = Number(((stats.correct / stats.evaluated) * 100).toFixed(2));

  // Stratified corpus reweighting
  let weightedSum = 0;
  const totalCorpus = 20308;
  for (const [st, d] of Object.entries(stats.strataStats)) {
    const rate = d.total > 0 ? d.correct / d.total : 0;
    const weight = d.corpusN / totalCorpus;
    weightedSum += rate * weight;
  }
  stats.weightedAccuracy = Number(((weightedSum) * 100).toFixed(2));

  return stats;
}

// 1. Baseline Evaluator (uses persisted predictedTopicId)
const baselineStats = evaluatePredictions((item) => ({
  topicId: item.predictedTopicId,
  status: item.classificationStatus,
  confidence: item.confidence,
}));

// 2. Phase G Current Evaluator (runs live getQuestionTopicMetadata)
const phaseGStats = evaluatePredictions((item) => {
  const meta = getQuestionTopicMetadata({
    id: item.questionId,
    questionText: item.questionText,
    options: item.options,
    sectionName: item.section,
    examId: 'ssc-chsl',
  });
  return {
    topicId: meta.primaryTopicId,
    status: meta.classificationStatus,
    confidence: meta.confidence,
  };
});

console.log('\n======================================================');
console.log('       PHASE G BEFORE vs AFTER EVALUATION COMPARISON   ');
console.log('======================================================');
console.log(`Total sample items:         ${items.length}`);
console.log(`Evaluated questions:        ${baselineStats.evaluated} (1 corrupted OCR)`);
console.log(`Sample Matches (Accuracy):  Before: ${baselineStats.correct}/${baselineStats.evaluated} (${baselineStats.accuracy}%) -> After: ${phaseGStats.correct}/${phaseGStats.evaluated} (${phaseGStats.accuracy}%) [Delta: +${(phaseGStats.accuracy - baselineStats.accuracy).toFixed(2)}%]`);
console.log(`False Positives (Errors):   Before: ${baselineStats.falsePositives} -> After: ${phaseGStats.falsePositives} [Reduction: ${baselineStats.falsePositives - phaseGStats.falsePositives} fewer errors]`);
console.log(`False Negatives (Missed):   Before: ${baselineStats.falseNegatives} -> After: ${phaseGStats.falseNegatives} [Reduction: ${baselineStats.falseNegatives - phaseGStats.falseNegatives} recovered]`);
console.log(`Corpus-Weighted Accuracy:   Before: ${baselineStats.weightedAccuracy}% -> After: ${phaseGStats.weightedAccuracy}% [Delta: +${(phaseGStats.weightedAccuracy - baselineStats.weightedAccuracy).toFixed(2)}%]`);

console.log('\n=== SECTION BREAKDOWN COMPARISON ===');
for (const sec of ['quant', 'ga', 'reasoning', 'english']) {
  const b = baselineStats.sectionStats[sec];
  const g = phaseGStats.sectionStats[sec];
  const bAcc = ((b.correct / (b.total - b.indet)) * 100).toFixed(1);
  const gAcc = ((g.correct / (g.total - g.indet)) * 100).toFixed(1);
  console.log(`${sec.toUpperCase().padEnd(10)}: Before Correct=${b.correct} (${bAcc}%), FP=${b.fp}, FN=${b.fn} -> After Correct=${g.correct} (${gAcc}%), FP=${g.fp}, FN=${g.fn}`);
}

console.log('\n=== PER-TOPIC PERFORMANCE COMPARISON (F1 SCORES) ===');
console.log('Topic'.padEnd(28) + 'Support'.padStart(8) + 'Before F1'.padStart(12) + 'After F1'.padStart(12) + 'Delta'.padStart(10));
console.log('-'.repeat(70));
const allTopics = Array.from(new Set([...Object.keys(baselineStats.topicStats), ...Object.keys(phaseGStats.topicStats)])).sort();
for (const t of allTopics) {
  const b = baselineStats.topicStats[t] || { tp: 0, fp: 0, fn: 0, support: 0 };
  const g = phaseGStats.topicStats[t] || { tp: 0, fp: 0, fn: 0, support: 0 };
  const bPrec = b.tp + b.fp > 0 ? b.tp / (b.tp + b.fp) : 0;
  const bRec = b.tp + b.fn > 0 ? b.tp / (b.tp + b.fn) : 0;
  const bF1 = bPrec + bRec > 0 ? (2 * bPrec * bRec) / (bPrec + bRec) : 0;

  const gPrec = g.tp + g.fp > 0 ? g.tp / (g.tp + g.fp) : 0;
  const gRec = g.tp + g.fn > 0 ? g.tp / (g.tp + g.fn) : 0;
  const gF1 = gPrec + gRec > 0 ? (2 * gPrec * gRec) / (gPrec + gRec) : 0;

  const delta = (gF1 - bF1) * 100;
  const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%';
  console.log(
    `${t.padEnd(28)}${b.support.toString().padStart(8)}${((bF1 * 100).toFixed(1) + '%').padStart(12)}${((gF1 * 100).toFixed(1) + '%').padStart(12)}${deltaStr.padStart(10)}`
  );
}

console.log('\n=== STATUS OF SPECIFIC DEFECT QUESTIONS ===');
const defectIndices = [8, 75, 79, 89, 98, 114, 153, 162, 163, 167, 168, 169, 170];
for (const idx of defectIndices) {
  const item = items.find((x) => x.sampleIndex === idx);
  if (!item) continue;
  const meta = getQuestionTopicMetadata({
    id: item.questionId,
    questionText: item.questionText,
    options: item.options,
    sectionName: item.section,
    examId: 'ssc-chsl',
  });
  console.log(
    `#${idx.toString().padStart(3)} [${item.sectionCategory.padEnd(9)}] ${item.questionId}: Truth='${item.humanGroundTruthTopic}' | Before='${item.predictedTopicId}' -> After='${meta.primaryTopicId}' (${meta.classificationStatus}, conf=${meta.confidence})`
  );
}

console.log('\n=== REMAINING DISCREPANCIES IN PHASE G ===');
let remainingFP = 0;
let remainingFN = 0;
for (const item of items) {
  if (item.cannotDetermineFromAvailableSource || !item.humanGroundTruthTopic) continue;
  const meta = getQuestionTopicMetadata({
    id: item.questionId,
    questionText: item.questionText,
    options: item.options,
    sectionName: item.section,
    examId: 'ssc-chsl',
  });
  if (meta.primaryTopicId !== item.humanGroundTruthTopic) {
    if (meta.primaryTopicId === 'uncategorized') {
      remainingFN++;
    } else {
      remainingFP++;
      console.log(
        `[REMAINING FP] #${item.sampleIndex} (${item.sectionCategory}) ${item.questionId}: Pred='${meta.primaryTopicId}' vs Truth='${item.humanGroundTruthTopic}' | Notes: ${item.annotationNotes.slice(0, 60)}`
      );
    }
  }
}
console.log(`\nRemaining False Positives: ${remainingFP}`);
console.log(`Remaining False Negatives (Uncategorized): ${remainingFN}`);
