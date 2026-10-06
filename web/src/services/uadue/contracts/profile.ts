/**
 * UADUE — Universal Assessment Document Understanding Engine
 * Contract: Assessment Profiles & Adapter RuleSets
 *
 * Removes exam-specific regexes and character-length constants from the universal core.
 * Formally encapsulates authority-specific grammars (UPSC, SSC, GATE, Banking) as versioned,
 * traceable configuration profiles.
 */

import { QuestionType } from '../../../types/canonicalQuestion';

export interface NumberingGrammarRule {
  ruleId: string;
  pattern: string; // Serialized regex pattern
  description: string;
  isPrefix: boolean;
  captureIndex: number;
}

export interface OptionMarkerGrammarRule {
  ruleId: string;
  markerType: 'ALPHA' | 'NUMERIC' | 'ROMAN' | 'SYMBOL';
  pattern: string;
  formatDescription: string;
}

export interface ProfileScoringConfig {
  defaultMarks: number;
  defaultNegativeMarks: number;
  natNegativeMarks: number;
  allowsPartialScoring: boolean;
}

export interface AssessmentProfile {
  profileId: string;
  profileVersion: string;
  targetAuthority: string; // e.g. 'STAFF_SELECTION_COMMISSION', 'GATE_IIT', 'UPSC', 'UNIVERSAL'
  numberingGrammar: NumberingGrammarRule[];
  optionMarkerGrammar: OptionMarkerGrammarRule[];
  scoringDefaults: ProfileScoringConfig;
  boundaryThresholds: {
    maxOptionCharWarning: number;
    minOptionsCount: number;
    maxOptionsCount: number;
    embeddedHeaderWarningLength: number;
  };
  supportedQuestionTypes: QuestionType[];
  provenance: {
    author: string;
    createdAt: number;
    changeLog: string;
  };
}

export interface AdapterRuleSet {
  ruleSetId: string;
  adapterId: string;
  ruleSetVersion: string;
  headerCutoffPt: number;
  footerCutoffPt: number;
  columnSplitThresholdPt: number;
  vectorDeduplicationTolerancePt: number;
  provenance: {
    author: string;
    createdAt: number;
  };
}

/**
 * Universal Default Assessment Profile:
 * Baseline format-agnostic ruleset that operates purely on structural invariants.
 */
export const UNIVERSAL_DEFAULT_PROFILE: AssessmentProfile = {
  profileId: 'uadue_profile_universal_v1',
  profileVersion: '1.0.0',
  targetAuthority: 'UNIVERSAL',
  numberingGrammar: [
    { ruleId: 'q_num_dot', pattern: '^(?:Q(?:uestion)?\\.?\\s*(\\d+)[:.)\\s]|(\\d+)\\.\\s+)', description: 'Standard Question Prefix', isPrefix: true, captureIndex: 1 },
    { ruleId: 'q_num_paren', pattern: '^\\((\\d+)\\)\\s+', description: 'Parenthesized Question Number', isPrefix: true, captureIndex: 1 },
    { ruleId: 'item_num', pattern: '^Item\\s+(\\d+)[:.)\\s]', description: 'Item Number Format', isPrefix: true, captureIndex: 1 },
  ],
  optionMarkerGrammar: [
    { ruleId: 'opt_alpha_paren', markerType: 'ALPHA', pattern: '^(?:\\(([A-Fa-f])\\)|\\b([A-Fa-f])\\.\\s*)', formatDescription: '(A) or A.' },
    { ruleId: 'opt_numeric_paren', markerType: 'NUMERIC', pattern: '^(?:\\(([1-6])\\)|\\b([1-6])\\.\\s*)', formatDescription: '(1) or 1.' },
    { ruleId: 'opt_roman', markerType: 'ROMAN', pattern: '^(?:\\((i|ii|iii|iv|v|vi)\\)|\\b(i|ii|iii|iv|v|vi)\\.\\s*)', formatDescription: '(i) or i.' },
  ],
  scoringDefaults: {
    defaultMarks: 1.0,
    defaultNegativeMarks: 0.0,
    natNegativeMarks: 0.0,
    allowsPartialScoring: false,
  },
  boundaryThresholds: {
    maxOptionCharWarning: 400,
    minOptionsCount: 2,
    maxOptionsCount: 6,
    embeddedHeaderWarningLength: 40,
  },
  supportedQuestionTypes: ['MCQ', 'MSQ', 'NAT', 'MATCHING', 'ASSERTION_REASON', 'TRUE_FALSE', 'DESCRIPTIVE'],
  provenance: {
    author: 'UADUE Core Architect',
    createdAt: 0,
    changeLog: 'Initial universal assessment baseline profile',
  },
};
