import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getQuestionTopicMetadata } from '../web/src/services/taxonomy/topicClassifier';

interface PhaseFItem {
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

interface PhaseG3ReconciledItem extends PhaseFItem {
  reconciliationStatus: 'UNMODIFIED_PHASE_F' | 'PROPOSED_CORRECTION';
  humanApproved: boolean;
  originalPhaseFLabel: string | null;
  originalPhaseFNotes: string;
  reconciliationReason?: string;
  reconciledAt?: string;
}

const phaseFPath = path.resolve(__dirname, '../chsl_phase_f_human_annotation_workbench_200.json');
const phaseFContent = fs.readFileSync(phaseFPath, 'utf8');
const initialPhaseFHash = crypto.createHash('sha256').update(phaseFContent).digest('hex');
const phaseFItems: PhaseFItem[] = JSON.parse(phaseFContent);

console.log(`Loaded ${phaseFItems.length} items from Phase F workbench.`);
console.log(`Phase F SHA256: ${initialPhaseFHash}`);

const REASONING_CORRECTIONS: Record<number, {
  reconciledTopic: string;
  reconciledNotes: string;
  reason: string;
}> = {
  106: {
    reconciledTopic: 'logical_reasoning',
    reconciledNotes: "Forensic stem alignment: Question is a 3-statement, 2-conclusion syllogism ('All fire is water. Some water is earth. No earth is air.'). Note shifted from an unincluded number analogy. Reconciled to logical_reasoning. Proposed correction pending human sign-off.",
    reason: "Annotator note described 'Number analogy: 14 : 450 :: 19 : ?', but actual stem is a standard syllogism. Reconciled to logical_reasoning.",
  },
  108: {
    reconciledTopic: 'logical_reasoning',
    reconciledNotes: "Forensic stem alignment: Question is a deductive statement and conclusion problem ('Private school teachers are hard-working...'). Note shifted from an unincluded odd-pair classification. Reconciled to logical_reasoning. Proposed correction pending human sign-off.",
    reason: "Annotator note described 'Four number pairs, find odd one out', but actual stem is statement & conclusion deduction. Reconciled to logical_reasoning.",
  },
  110: {
    reconciledTopic: 'coding_decoding',
    reconciledNotes: "Forensic stem alignment: Question is a letter substitution cipher ('BURMUD' -> 'RKHCKT', find code for 'ANGLE'). Note shifted from an unincluded cube dice problem. Reconciled to coding_decoding. Proposed correction pending human sign-off.",
    reason: "Annotator note described 'Opposite faces of folded cube dice', but actual stem is a letter substitution cipher. Reconciled to coding_decoding.",
  },
  111: {
    reconciledTopic: 'coding_decoding',
    reconciledNotes: "Forensic stem alignment: Question is a fictitious language / word substitution code ('he will go to marker' -> 'xi ui hi ni ji' ... find code for 'come'). Note shifted from an unincluded embedded figure problem. Reconciled to coding_decoding. Proposed correction pending human sign-off.",
    reason: "Annotator note described 'Identify which figure is embedded in the main pattern', but actual stem is word substitution coding. Reconciled to coding_decoding.",
  },
  112: {
    reconciledTopic: 'logical_reasoning',
    reconciledNotes: "Forensic stem alignment: Question is a 3-statement, 2-conclusion syllogism ('Some bottles are pens. All pens are tables. All tables are glasses.'). Note shifted from an unincluded paper folding problem. Reconciled to logical_reasoning. Proposed correction pending human sign-off.",
    reason: "Annotator note described 'Paper folding and triangular cutout pattern', but actual stem is a standard syllogism. Reconciled to logical_reasoning.",
  },
};

const reconciledItems: PhaseG3ReconciledItem[] = phaseFItems.map((item) => {
  const correction = REASONING_CORRECTIONS[item.sampleIndex];

  if (correction) {
    return {
      ...item,
      humanGroundTruthTopic: correction.reconciledTopic,
      annotationNotes: correction.reconciledNotes,
      reconciliationStatus: 'PROPOSED_CORRECTION',
      humanApproved: false,
      originalPhaseFLabel: item.humanGroundTruthTopic,
      originalPhaseFNotes: item.annotationNotes,
      reconciliationReason: correction.reason,
      reconciledAt: '2026-10-14T11:37:00Z',
    };
  }

  return {
    ...item,
    reconciliationStatus: 'UNMODIFIED_PHASE_F',
    humanApproved: !item.cannotDetermineFromAvailableSource,
    originalPhaseFLabel: item.humanGroundTruthTopic,
    originalPhaseFNotes: item.annotationNotes,
  };
});

const targetPath = path.resolve(__dirname, '../chsl_phase_g3_reconciled_workbench_200.json');
fs.writeFileSync(targetPath, JSON.stringify(reconciledItems, null, 2), 'utf8');

console.log(`Saved ${reconciledItems.length} items to ${targetPath}`);

// Verify Phase F file was NOT modified
const postPhaseFContent = fs.readFileSync(phaseFPath, 'utf8');
const postPhaseFHash = crypto.createHash('sha256').update(postPhaseFContent).digest('hex');
console.log(`Phase F SHA256 post-generation: ${postPhaseFHash}`);
if (initialPhaseFHash !== postPhaseFHash) {
  console.error('ERROR: Phase F workbench was modified!');
  process.exit(1);
} else {
  console.log('PASS: Phase F workbench preserved byte-for-byte.');
}

// Verification of Reconciled Workbench
const unmodCount = reconciledItems.filter(x => x.reconciliationStatus === 'UNMODIFIED_PHASE_F').length;
const propCount = reconciledItems.filter(x => x.reconciliationStatus === 'PROPOSED_CORRECTION').length;
const approvedCount = reconciledItems.filter(x => x.humanApproved).length;

console.log(`\nReconciliation Counts:`);
console.log(`  Total Records:          ${reconciledItems.length}`);
console.log(`  Unmodified Phase F:     ${unmodCount}`);
console.log(`  Proposed Corrections:   ${propCount} (Indices: ${Object.keys(REASONING_CORRECTIONS).join(', ')})`);
console.log(`  Human Approved:         ${approvedCount}`);
console.log(`  Proposed (Pending):     ${propCount}`);
console.log(`  Unusable OCR Excluded:  ${reconciledItems.filter(x => x.cannotDetermineFromAvailableSource).length}`);

// Re-evaluation against Phase G classifier
let matches = 0;
let fp = 0;
let fn = 0;
let evaluated = 0;

for (const it of reconciledItems) {
  if (it.cannotDetermineFromAvailableSource || !it.humanGroundTruthTopic) continue;
  evaluated++;

  const meta = getQuestionTopicMetadata({
    id: it.questionId,
    questionText: it.questionText,
    options: it.options,
    sectionName: it.section,
    examId: 'ssc-chsl',
  });

  if (meta.primaryTopicId === it.humanGroundTruthTopic) {
    matches++;
  } else if (meta.primaryTopicId === 'uncategorized') {
    fn++;
  } else {
    fp++;
  }
}

console.log(`\nReconciled Workbench Evaluation Result:`);
console.log(`  Evaluated:              ${evaluated} (1 corrupted OCR excluded)`);
console.log(`  Matches:                ${matches} / ${evaluated} (${((matches / evaluated) * 100).toFixed(2)}%)`);
console.log(`  False Positives:        ${fp}`);
console.log(`  False Negatives:        ${fn}`);
console.log(`  Assigned Precision:     ${((matches / (matches + fp)) * 100).toFixed(2)}%`);
