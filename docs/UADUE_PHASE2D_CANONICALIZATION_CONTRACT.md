# UADUE Phase 2D — Canonicalization Contract & Transformation Rules
**Universal Assessment Document Understanding Engine (UADUE)**
**Document Version:** 3.0.0-TOPOLOGY-HARDENED
**Classification:** Stage A Design Specification — Canonical Question IR Transformation
**Implementation Status:** **NOT AUTHORIZED (Stage B Implementation Gate Locked)**

---

## 1. Canonicalization Charter & Boundaries

Canonicalization is the process of synthesizing a clean, pedagogically actionable `CanonicalQuestionIR` from an underlying `LogicalQuestionFamily` and its physical `QuestionCandidate` components.

### 1.1 Inviolable Rules of Canonicalization [DESIGN-SPECIFIED]
1. **Zero Text Mutation:** Stem and option texts must preserve exact wording, capitalization, punctuation, and mathematical notation. No automated "grammar correction" or silent normalization is allowed.
2. **Dual Option Key Representation:** Both the **Authentic Printed Key** (e.g. `(a)`, `(1)`, `(i)`, `(क)`) and the **Normalized Index Key** (`A`, `B`, `C`, `D`) are preserved side-by-side.
3. **Lossless Math & Formula Preservation:** Mathematical formulas are preserved as structured AST / KaTeX blocks linked directly to the underlying physical glyph runs and vector bounding boxes.
4. **Visual Asset Anchoring:** Visual diagrams, graphs, and visual options reference unique `AssetGraphNode` identifiers with crisp vector paths and raster bounding crops.
5. **Decoupled Answer Keys:** Answer bindings are strictly separate from question identity. Canonicalization supports provisional, final revised, language-specific, and cancelled (MTA) answer states.
6. **Traceability Completeness:** Every canonical element that claims source-derived content contains explicit provenance mappings $\mathbf{\Pi}(e)$ pointing to all contributing physical source nodes.
7. **Direct Pairwise Family Proof:** A canonical question representing multiple physical candidates is authorized IF AND ONLY IF every contributing candidate possesses verified `CandidateFamilyMembership` with direct pairwise proof edges and script disjointness.

---

## 2. Canonical Data Structures & Schemas

```typescript
import { BoundingBox2D, SourceEvidence } from './evidence';
import { QuestionIdentity, CandidateFamilyMembership } from './identity';
import { ForensicConfidenceVector } from './certification';

export type QuestionType =
  | 'SINGLE_CORRECT_MCQ'
  | 'MULTIPLE_CORRECT_MSQ'
  | 'NUMERICAL_ANSWER_TYPE'
  | 'ASSERTION_REASON'
  | 'MATRIX_MATCH'
  | 'ORDERED_SEQUENCE'
  | 'DESCRIPTIVE'
  | 'READING_COMPREHENSION_CHILD';

export interface CanonicalContentBlock {
  type: 'TEXT' | 'LATEX' | 'INLINE_MATH' | 'IMAGE' | 'TABLE' | 'CODE';
  text?: string;
  latex?: string;
  assetId?: string;
  tableData?: {
    rows: number;
    cols: number;
    cells: { text: string; rowSpan: number; colSpan: number }[][];
  };
  language?: string;
  provenanceMappingIds?: string[];
}

export interface CanonicalOptionIR {
  key: string;              // Normalized pedagogical key: 'A', 'B', 'C', 'D'
  authenticKey: string;     // Authentic printed key: '(a)', '1.', '(i)', '(क)'
  index: number;            // 0-based sequence
  text: string;
  contentBlocks: CanonicalContentBlock[];
  assetId?: string;         // AssetGraphNode reference if visual option
  sourceOptionCandidateIds: string[]; // 1 or more contributing physical option IDs
}

export interface DiscrepancyRecord {
  anomalyType:
    | 'NUMBERING_MISMATCH'
    | 'OPTION_CARDINALITY_MISMATCH'
    | 'TRANSLATION_DEFECT'
    | 'MISSING_DIAGRAM_IN_VARIANT'
    | 'OFFICIAL_ERRATA_NOTICED';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  description: string;
  sourceInstanceId: string;
  printedValue: string;
  expectedValue: string;
  resolutionStrategy: 'PRESERVE_AND_FLAG' | 'AUTHORITATIVE_OVERRIDE';
}

export interface ProvenanceMapping {
  mappingId: string;
  canonicalElementId: string;
  sourceInstanceId: string;
  sourceCandidateId: string;
  sourceNodeIds: string[];
  evidenceIds: string[];
  byteRange?: { startByte: number; endByte: number };
  compositionModality: 'SINGLE_SOURCE' | 'MULTILINGUAL_COMPOSITION' | 'CROSS_PAGE_COMPOSITION' | 'UNRESOLVED_PROVENANCE';
}

export interface CanonicalQuestionIR {
  id: string;                     // Deterministic canonical ID
  identity: QuestionIdentity;     // Full 5-layer decoupled identity
  sourceDocumentId: string;
  sourceQuestionNumber: number;   // Pedagogical integer sequence
  officialQuestionId?: string;    // e.g. TCS Master Question ID
  sectionKey: string;
  sectionName: string;
  questionType: QuestionType;

  stimulus?: {
    stimulusId: string;
    type: 'PASSAGE' | 'CASELET' | 'CODE_SNIPPET' | 'SHARED_DIAGRAM';
    contentBlocks: CanonicalContentBlock[];
  };

  prompt: {
    text: string;
    contentBlocks: CanonicalContentBlock[];
    languageScript: string;
  };

  options: CanonicalOptionIR[];
  multilingualRepresentations?: Record<string, {
    prompt: { text: string; contentBlocks: CanonicalContentBlock[] };
    options: CanonicalOptionIR[];
  }>;

  discrepancies: DiscrepancyRecord[];
  provenanceMappings: ProvenanceMapping[];

  answer?: {
    type: QuestionType;
    correctKeys?: string[];
    numericValue?: number;
    numericRange?: { min: number; max: number };
    isMta?: boolean;
    provenance: string;
    disputedStatus?: 'PROVISIONAL' | 'FINAL_CONFIRMED' | 'CHALLENGED';
  };

  scoring: {
    marks: number;
    negativeMarks: number;
    unansweredMarks: number;
    isConfigured: boolean;
    ruleName?: string;
  };

  evidenceChain: SourceEvidence[];
  associatedAssetIds: string[];
  verification: {
    status: 'DESIGN-SPECIFIED' | 'CERTIFIED' | 'REVIEW_REQUIRED' | 'FAILED' | 'UNVERIFIED';
    reasons: string[];
    confidenceScore: number;
    confidenceVector: ForensicConfidenceVector;
    invariantsPassed: string[];
    invariantsFailed: string[];
    sealedAt: number;
  };
}
```

---

## 3. Discrepancy & Errata Handling Protocol

Real-world assessment documents frequently contain official printing errors. Phase 2D enforces strict **Discrepancy Honesty**:

### Example: UPSC CSE Prelims 2023 Paper 1 — Page 6 Question 15
- **English Recto (Page 7):** Printed as `15.` with 4 options `(a), (b), (c), (d)`.
- **Hindi Verso (Page 6):** Printed with numeral `१६.` due to an official government booklet typographical typo, while preceding question was `14.`.
- **Phase 2D Protocol:**
  1. `QuestionCandidate` for Hindi Verso preserves `detectedNumber = 16` and `sourcePrintedLabel = "१६."`.
  2. `QuestionCandidate` for English Recto preserves `detectedNumber = 15` and `sourcePrintedLabel = "15."`.
  3. Relational evidence (`FACING_PAGE_SPREAD_PAIR`, `DISTINCT_SCRIPT_DETECTION`, `IDENTICAL_OPTION_CARDINALITY`) proves identity (`RELATIONSHIP_PROVEN`).
  4. Explicit `CandidateFamilyMembership` is established linking both candidates to `fam_upsc_2023_gs1_q15`.
  5. `LogicalQuestionFamily` establishes canonical sequence `15`.
  6. An explicit `DiscrepancyRecord` is appended to the canonical IR:
     ```json
     {
       "anomalyType": "NUMBERING_MISMATCH",
       "severity": "WARNING",
       "description": "Official Hindi booklet prints question 15 as numeral 16 on Page 6.",
       "sourceInstanceId": "phys_inst_upsc_p6_q16",
       "printedValue": "16.",
       "expectedValue": "15.",
       "resolutionStrategy": "PRESERVE_AND_FLAG"
     }
     ```
  7. **Zero Silent Mutation:** Both representations remain completely intact with full forensic traceability.
