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

const CORPUS_TOTAL = 20308;
const STRATA_N: Record<string, number> = {
  VERIFIED: 14118,
  REVIEW_REQUIRED: 612,
  UNCLASSIFIED: 5578,
};

// 1. Detailed Inspection of Sample #151
const item151 = items.find(x => x.sampleIndex === 151)!;
const rawPath151 = path.resolve(__dirname, '../web/src/data/exams', item151.file);
const rawExam151 = JSON.parse(fs.readFileSync(rawPath151, 'utf8'));
const rawQ151 = rawExam151.questions.find((q: any) => q.id === item151.questionId);

const meta151 = getQuestionTopicMetadata({
  id: item151.questionId,
  questionText: item151.questionText,
  options: item151.options,
  sectionName: item151.section,
  examId: 'ssc-chsl',
});

console.log('='.repeat(85));
console.log('RECORD AUDIT: SAMPLE #151');
console.log('='.repeat(85));
console.log(`Question ID:              ${item151.questionId}`);
console.log(`Exam File:                ${item151.file}`);
console.log(`Saved Workbench Status:   ${item151.classificationStatus}`);
console.log(`Raw Exam JSON Status:     ${rawQ151.topicMetadata?.classificationStatus}`);
console.log(`Saved Workbench Topic:    ${item151.predictedTopicId} (conf=${item151.confidence})`);
console.log(`Annotator Truth Label:    ${item151.humanGroundTruthTopic}`);
console.log(`Annotator Notes:          ${item151.annotationNotes}`);
console.log(`Live Classifier Pred:     ${meta151.primaryTopicId} (conf=${meta151.confidence}, status=${meta151.classificationStatus})`);
console.log(`Scenario C2 Label:        vocabulary (Spelling Error)`);
console.log(`Scenario C2 Result:       MISCLASSIFICATION (Classifier predicts 'grammar' vs Truth 'vocabulary')`);

// 2. Compute Strata Data for Scenario C2
interface RecordEvaluation {
  sampleIndex: number;
  questionId: string;
  savedStratum: string;
  truth: string | null;
  pred: string;
  isCorrect: boolean;
  isIncorrectAssigned: boolean;
  isUncategorized: boolean;
  isExcluded: boolean;
  exclusionReason?: string;
}

const c2Records: RecordEvaluation[] = items.map(item => {
  if (item.sampleIndex === 21) {
    return {
      sampleIndex: item.sampleIndex,
      questionId: item.questionId,
      savedStratum: item.classificationStatus,
      truth: null,
      pred: 'uncategorized',
      isCorrect: false,
      isIncorrectAssigned: false,
      isUncategorized: true,
      isExcluded: true,
      exclusionReason: 'Corrupted OCR text',
    };
  }

  // Target truth under Scenario C2
  let truth = item.humanGroundTruthTopic;
  if (item.sampleIndex === 106) truth = 'logical_reasoning';
  if (item.sampleIndex === 108) truth = 'logical_reasoning';
  if (item.sampleIndex === 110) truth = 'coding_decoding';
  if (item.sampleIndex === 111) truth = 'coding_decoding';
  if (item.sampleIndex === 112) truth = 'logical_reasoning';
  if (item.sampleIndex === 151) truth = 'vocabulary';

  const meta = getQuestionTopicMetadata({
    id: item.questionId,
    questionText: item.questionText,
    options: item.options,
    sectionName: item.section,
    examId: 'ssc-chsl',
  });
  const pred = meta.primaryTopicId;

  const isCorrect = pred === truth;
  const isUncategorized = pred === 'uncategorized' && !isCorrect;
  const isIncorrectAssigned = !isCorrect && pred !== 'uncategorized';

  return {
    sampleIndex: item.sampleIndex,
    questionId: item.questionId,
    savedStratum: item.classificationStatus,
    truth,
    pred,
    isCorrect,
    isIncorrectAssigned,
    isUncategorized,
    isExcluded: false,
  };
});

console.log('\n' + '='.repeat(85));
console.log('SCENARIO C2: STRATUM-BY-STRATUM BREAKDOWN (BY SAVED CLASSIFICATION STATUS)');
console.log('='.repeat(85));

for (const st of ['VERIFIED', 'REVIEW_REQUIRED', 'UNCLASSIFIED']) {
  const recs = c2Records.filter(r => r.savedStratum === st);
  const N_h = STRATA_N[st];
  const W_h = N_h / CORPUS_TOTAL;
  const eligible = recs.filter(r => !r.isExcluded);
  const excluded = recs.filter(r => r.isExcluded);
  const n_h = eligible.length;

  const correct = eligible.filter(r => r.isCorrect).length;
  const incorrectAssigned = eligible.filter(r => r.isIncorrectAssigned).length;
  const uncategorized = eligible.filter(r => r.isUncategorized).length;
  const p_h = correct / n_h;
  const fpc = (N_h - n_h) / N_h;
  const s2 = (p_h * (1 - p_h)) / (n_h - 1);
  const var_h = (W_h * W_h) * fpc * s2;

  console.log(`Stratum: ${st}`);
  console.log(`  Population size (N_h):            ${N_h} (${(W_h * 100).toFixed(2)}% of corpus)`);
  console.log(`  Eligible sample size (n_h):       ${n_h} (Total sampled: ${recs.length})`);
  console.log(`  Correct predictions:              ${correct} (${(p_h * 100).toFixed(2)}%)`);
  console.log(`  Incorrect assigned (FP):          ${incorrectAssigned}`);
  console.log(`  Uncategorized predictions (FN):   ${uncategorized}`);
  console.log(`  Exclusions:                       ${excluded.length === 0 ? 'None' : excluded.map(e => `#${e.sampleIndex} (${e.questionId}: ${e.exclusionReason})`).join(', ')}`);
  console.log(`  Estimated Stratum Accuracy (p_h): ${(p_h * 100).toFixed(2)}%`);
  console.log(`  FPC Factor:                       ${fpc.toFixed(4)}`);
  console.log(`  Variance Contribution:            ${var_h.toExponential(6)}`);
  console.log('-'.repeat(50));
}
