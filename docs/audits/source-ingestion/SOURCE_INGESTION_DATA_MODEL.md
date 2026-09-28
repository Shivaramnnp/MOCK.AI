# MOCK.AI — SOURCE INGESTION DATA MODEL & CONTENT BLOCK ANALYSIS
**Forensic Technical Discovery & Analysis**  
**Date**: 2026-09-28  
**Scope**: Schema definitions, field attributes, data representations, and content block support across user-created and official exams.  
**Integrity Mode**: Read-Only Audit (Zero Production Code Changes).

---

## 1. The Canonical Question Models

The Mock.AI repository contains **two completely separate question data models**:

1. **`Question`** (`web/src/types/index.ts:9-20`):  
   Used exclusively by the **10 Create Mock Test ingestion sources**, the `EditorScreen`, `TestPlayerScreen`, and `storage.ts`.
2. **`CompetitiveQuestion`** (`web/src/types/index.ts:263-301`):  
   Used exclusively by official pre-generated exam papers (GATE 2024/2025, SSC CHSL), `CompetitiveExamPlayerScreen`, `scripts/gate_forensic_pipeline.py`, and `questionRepository.ts`.

---

## 2. Model 1: The User Ingestion Model (`Question`)

### 2.1 Interface Definition (`web/src/types/index.ts`)

```typescript
export type VerificationStatus = 'VERIFIED' | 'PARTIAL' | 'UNVERIFIED' | 'FAILED';

export interface Citation {
  pageNumber?: number | null;
  youtubeTimestamp?: string | null;
  sourceExactText: string;
}

export interface Question {
  id?: string;
  questionText: string;
  options: string[]; // exactly 4 items always
  correctAnswerIndex: number; // 0-3, or -1 if not set
  topic?: string;
  explanation?: string;
  citation?: Citation;
  verificationStatus?: VerificationStatus;
  trustScore?: number;
  verifiedAt?: number;
}
```

### 2.2 Field Attribute Breakdown

| Field | Type | Classification | Source / Populated By | Weakness / Defect Analysis |
|---|---|---|---|---|
| `id` | `string` | **GENERATED** | `q-${Date.now()}-${idx}` | Ephemeral timestamp-based ID. Non-deterministic across re-renders; collisions possible in batch generation. |
| `questionText` | `string` | **REQUIRED** / **GENERATED** | LLM output string or User manual entry | Monolithic markdown string. Must embed all formulas, code, and table text. Cannot embed diagrams or vector images natively. |
| `options` | `string[]` | **REQUIRED** / **GENERATED** | LLM output array or User manual entry | **Hardcoded to exactly 4 options**. System cannot support True/False (2 options), 5-option exams (e.g. GMAT/GRE), or open NAT. |
| `correctAnswerIndex` | `number` | **REQUIRED** / **GENERATED** | LLM output integer (0–3) | **Strictly single-choice (0=A, 1=B, 2=C, 3=D)**. Cannot represent MSQ (multiple correct options) or numerical answers. |
| `topic` | `string` | **OPTIONAL** / **GENERATED** | LLM prompt or category fallback | Arbitrary string. Not normalized against an official taxonomy or syllabus. |
| `explanation` | `string` | **OPTIONAL** / **GENERATED** | LLM output string | Pure text explanation. If empty, `parseQuestionsJson` injects a generic placeholder: `"Refer to fundamental principles for step-by-step verification."` |
| `citation` | `Citation` | **OPTIONAL** | **Never generated** | **Dead Schema Field**. None of the 10 ingestion pipelines currently populate `pageNumber` or `youtubeTimestamp`! |
| `verificationStatus` | `VerificationStatus` | **DERIVED** / **GENERATED** | Hardcoded to `'VERIFIED'` | **Fake Verification Metric**. In `parseQuestionsJson()`, `verificationStatus` is hardcoded to `'VERIFIED'` with 0 empirical verification! |
| `trustScore` | `number` | **DERIVED** / **GENERATED** | Hardcoded to `0.95` | **Fabricated Metric**. In `parseQuestionsJson()`, `trustScore` is hardcoded to `0.95` without mathematical or factual auditing. |
| `verifiedAt` | `number` | **GENERATED** | Hardcoded to `Date.now()` | Timestamp of string generation, not genuine verification. |

### 2.3 What the User Ingestion Model Completely Lacks
- **No Question Types**: No support for Multiple Select Questions (MSQ) or Numerical Answer Type (NAT).
- **No Scoring Metadata**: No `marks`, no `negativeMarks`, no sectional weighting. All questions are treated as 1 mark with zero negative marking.
- **No Sectioning**: No `sectionId`, `sectionName`, or multi-subject boundaries (e.g., General Aptitude vs Core Engineering).
- **No Asset References**: No `diagramUrl`, `optionImages`, or attachment handles.
- **No Structured Content**: No `ContentBlock[]`. Tables must be flattened or piped into raw strings.

---

## 3. Model 2: The Official Corpus Model (`CompetitiveQuestion`)

### 3.1 Interface Definition (`web/src/types/index.ts`)

```typescript
export interface CompetitiveQuestion {
  id: string;
  questionNumber: number;
  sectionId: string;
  sectionName: string;
  questionText: string;
  contentBlocks?: ContentBlock[];
  contentTypes?: ContentBlockType[];
  confidence?: BlockConfidence;
  questionType?: 'MCQ' | 'MSQ' | 'NAT';
  options: string[]; // options list (empty for NAT)
  optionImages?: (string | null)[]; // optional image URLs for visual options
  richOptions?: ExamQuestionOption[];
  correctAnswer: string; // 'A' | 'B' | 'C' | 'D' or multiple like 'A;B' or numeric range representation
  correctAnswerIndex: number; // 0-3 for MCQ (-1 if NAT/MSQ)
  correctAnswerSet?: string[]; // for MSQ: e.g. ['A', 'C']
  correctAnswerSets?: string[][]; // for MSQ with OR alternatives
  correctAnswerIndices?: number[]; // for MSQ: e.g. [0, 2]
  answerRange?: { min: number; max: number }; // for NAT: e.g. { min: 0.16, max: 0.17 }
  answerRanges?: { min: number; max: number }[]; // for NAT with OR alternatives
  isMta?: boolean; // Marks To All
  explanation: string;
  diagramUrl?: string | null;
  diagramUrls?: string[];
  questionAssets?: ExamQuestionAsset[];
  marks: number;
  negativeMarks: number;
  examId: string;
  year: number;
  date: string;
  shift: string;
  tier: string;
  language: string;
  paperCode?: string;
  discipline?: string;
  wordLimit?: string;
  modelSolution?: string;
  rubrics?: string[];
}
```

---

## 4. Content Block Type Analysis

`web/src/types/index.ts:221-253` defines the rich content block system:

```typescript
export type ContentBlockType =
  | 'text'
  | 'math'
  | 'code'
  | 'table'
  | 'image'
  | 'diagram'
  | 'graph'
  | 'mixed'
  | 'list'
  | 'equation'
  | 'matrix'
  | 'figure';

export interface ContentBlock {
  type: ContentBlockType;
  content?: string;
  latex?: string;
  language?: string;
  headers?: string[];
  rows?: string[][];
  assetUrl?: string;
  caption?: string;
  confidence?: BlockConfidence;
  blocks?: ContentBlock[];
}
```

### Forensic Audit of Content Block Support Across the Codebase

| Content Block Type | Supported in Official Pipeline? | Supported in 10 User Sources? | Where Created? | Where Stored? | Where Rendered? | Automated Test? |
|---|---|---|---|---|---|---|
| **TEXT** | **YES** | **YES** | `gate_forensic_pipeline.py` & `aiService.ts` | `web/src/data/exams/*.json` & `localStorage` | `StructuredContentRenderer.tsx` & `LatexRenderer.tsx` | YES (`LatexRenderer.test.tsx`) |
| **MATH** | **YES** | **PARTIAL** (via raw LaTeX `$..$`) | `gate_forensic_pipeline.py` & `aiService.ts` | `contentBlocks` (Official) / embedded in `questionText` (User) | `LatexRenderer.tsx` (via KaTeX) | YES (`LatexRenderer.test.tsx`) |
| **TABLE** | **YES** | **NO** (flattened to raw text) | `gate_forensic_pipeline.py:1200-1250` | `contentBlocks` with `headers[]`, `rows[][]` | `StructuredContentRenderer.tsx` (`TableRenderer`) | YES (`StructuredContentRenderer.test.tsx`) |
| **IMAGE** | **YES** | **NO** | `gate_forensic_pipeline.py` (PyMuPDF crop) | `web/public/exam-assets/...` | `StructuredContentRenderer.tsx` & `ExamAsset.tsx` | YES (`ExamAsset.test.tsx`) |
| **DIAGRAM** | **YES** | **NO** | `gate_forensic_pipeline.py:1260-1300` | `web/public/exam-assets/...` | `StructuredContentRenderer.tsx` (`DiagramRenderer`) | YES (`ExamAsset.test.tsx`) |
| **GRAPH** | **YES** (as diagram) | **NO** | `gate_forensic_pipeline.py` | `web/public/exam-assets/...` | `StructuredContentRenderer.tsx` | NO (treated as generic diagram) |
| **CHART** | **YES** (as diagram) | **NO** | `gate_forensic_pipeline.py` | `web/public/exam-assets/...` | `StructuredContentRenderer.tsx` | NO |
| **CODE** | **YES** | **NO** | `gate_forensic_pipeline.py:1150-1190` | `contentBlocks` (`type: 'code'`, `language: 'python'`) | `StructuredContentRenderer.tsx` (`CodeBlockRenderer`) | YES (`gateForensicFidelity.test.ts`) |
| **PSEUDOCODE**| **YES** (as code block) | **NO** | `gate_forensic_pipeline.py` | `contentBlocks` | `StructuredContentRenderer.tsx` | YES |
| **RELATIONAL_ALGEBRA** | **PARTIAL** | **NO** | `gate_forensic_pipeline.py:1120` | `contentBlocks` with HTML `<u>` primary keys | `StructuredContentRenderer.tsx` | YES (`gateForensicFidelity.test.ts`) |
| **MATRIX** | **YES** (LaTeX bmatrix) | **PARTIAL** (if LLM writes LaTeX) | `LatexRenderer.tsx` (KaTeX) | `questionText` | `LatexRenderer.tsx` | YES |
| **LIST** | **NO** (rendered as text) | **NO** | Not formally parsed | Flattened to string | `LatexRenderer.tsx` | NO |
| **MIXED** | **YES** | **NO** | `StructuredContentRenderer.tsx` | `blocks: ContentBlock[]` | `StructuredContentRenderer.tsx` (`MixedContentRenderer`) | YES |

---

## 5. Architectural Conclusions & Critical Deficiencies

1. **Schema Degradation on User Ingestion**:  
   The moment a user uploads a document through the Create Mock Test UI, the system forces the data into `Question` (Model 1), discarding:
   - Table headers and row arrays
   - Visual diagrams and coordinate crops
   - Code indentation and monospace blocks
   - Multi-select answers (MSQ)
   - Numerical answer ranges (NAT)
   - Marking schemes and negative marking penalties
2. **False Trust Metric Generation**:  
   The UI displays "Verified" badges and "95% Trust Score" on questions created via the 10 sources, but these numbers are static, hardcoded constants returned by `parseQuestionsJson()`:
   ```typescript
   verificationStatus: 'VERIFIED',
   trustScore: 0.95,
   verifiedAt: Date.now(),
   ```
   No actual verification or answer-key auditing takes place.
3. **Dead Citation System**:  
   `Citation` (`pageNumber`, `youtubeTimestamp`, `sourceExactText`) is declared in `web/src/types/index.ts:3-7`, but is never populated by any ingestion pipeline or LLM prompt.
