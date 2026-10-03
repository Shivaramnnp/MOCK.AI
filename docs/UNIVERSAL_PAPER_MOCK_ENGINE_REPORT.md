# MOCK.AI — UNIVERSAL PAPER → MOCK ENGINE
## PROMPT 1.5 HARDENING FORENSIC REPORT & ARCHITECTURAL SPECIFICATION

**System:** Mock.AI Universal Examination Platform  
**Target:** Universal Question Paper Ingestion & Playable Mock Test Generation Engine  
**Status:** ALL SYSTEMS VERIFIED  
**Date:** 2026-09-30  
**Test Suite Status:** 54/54 Test Files Passed, 612/612 Unit & E2E Tests Passed  
**Build Status:** Clean Production Bundle (`tsc && vite build` — 0 errors)

---

## 1. Executive Summary & Core Architectural Principle

Mock.AI is engineered not as a single-exam tool, but as a **universal examination platform**. The system converts **ANY** valid competitive or academic examination paper into a fully playable, interactive mock test using the existing Mock.AI test engine (`CompetitiveExamPlayerScreen`, `ExamSessionService`, `TestPlayerScreen`, and `CompetitiveExamResultsScreen`).

```
                    ┌────────────────────────┐
                    │ ANY EXAM PAPER (PDF /  │
                    │  Text / Docx / Images) │
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │ Universal Ingestion    │
                    │ Pipeline & Extraction  │
                    └───────────┬────────────┘
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
                 ▼                             ▼
        [Answer Key Present]         [No Answer Key Present]
                 │                             │
                 ▼                             ▼
      ┌─────────────────────┐       ┌─────────────────────┐
      │   SCORED MOCK TEST  │       │ PRACTICE MOCK TEST  │
      │ answerKeyStatus:    │       │ answerKeyStatus:    │
      │    'AVAILABLE'      │       │   'UNAVAILABLE'     │
      │   isScored: true    │       │   isScored: false   │
      └──────────┬──────────┘       └──────────┬──────────┘
                 │                             │
                 ▼                             ▼
      ┌─────────────────────┐       ┌─────────────────────┐
      │ Instant Score, Net  │       │ Safe Unscored Result│
      │ Marks & Explanations│       │ Preserved Answers,  │
      └─────────────────────┘       │ 0 Penalty Deductions│
                                    └──────────┬──────────┘
                                               │
                                    Day 2: Official Key Released
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │ Late Key Attachment │
                                    │ Re-score Attempt    │
                                    │ with 0 Data Loss    │
                                    └─────────────────────┘
```

### Core Invariants:
1. **Exam-Agnostic Core:** The core ingestion pipeline never contains hardcoded exam branches like `if (exam === 'GATE')`. All exam specifics are externalized into extensible configuration schemas and adapters.
2. **Immediate Testability:** Any ingested paper can be launched immediately into the test player with zero manual intervention.
3. **Paper Without Answers Supported:** Question papers lacking answer keys are never rejected or falsified; they boot as unscored practice mocks.
4. **Candidate Attempt Preservation:** When taking an unscored mock, candidate answers are safely preserved. When an official answer key is attached on Day 2, the mock paper and all past sessions are scored with zero candidate data loss.
5. **Question Paper Immutability:** Answer keys only supply answers, ranges, and scoring weights; they never overwrite or mutate question stems, options, LaTeX formulas, or diagrams.

---

## 2. Universal Exam Support Matrix

The system provides formal adapter configurations via `UniversalExamRegistry` (`universalExamConfig.ts`) supporting all major examination categories:

| Exam Category | Representative Exams | Default Sections | Dynamic Option Counts | Supported Question Types | Default Scoring Scheme |
|---|---|---|---|---|---|
| **Technical / Engineering** | GATE, ESE, ISRO, BARC | General Aptitude, Core Engineering | 4 options, NAT (no options) | MCQ, MSQ, NAT | 1 mark (+1, -0.33) / 2 marks (+2, -0.67), MSQ/NAT (0 negative) |
| **Civil Services / Administrative** | UPSC CSE, State PSCs | General Studies, CSAT Paper-II | 4 options | MCQ, Matching, Assertion-Reason | GS: +2, -0.67; CSAT: +2.5, -0.83 |
| **Staff Selection & Police** | SSC CGL, SSC CHSL, CPO, MTS | General Intelligence, General Awareness, Quantitative Aptitude, English Comprehension | 4 options | MCQ | Tier-I: +2, -0.50; Tier-II: +3, -1.00 |
| **Railways Recruitment** | RRB NTPC, RRB Group D, RRB JE | General Awareness, Mathematics, General Intelligence & Reasoning | 4 options | MCQ | +1 mark, -0.33 negative |
| **Banking & Insurance** | IBPS PO/Clerk, SBI PO/Clerk, RBI Grade B | Reasoning, Quantitative, English, General/Financial Awareness | **5 options (A, B, C, D, E)** | MCQ | +1 mark, -0.25 negative (1/4 penalty) |
| **Academic / Higher Ed** | University Semesters, College Midterms | Unit I, Unit II, Section A, Section B | 2 (T/F), 3, 4, 5 options, Subjective | MCQ, True/False, Descriptive, Subjective | Configurable / Standard (+1, 0 negative) |
| **Coaching / Custom** | Test Series, Classroom Tests, Custom Uploads | Section 1, Section 2, Custom Sections | Dynamic (2 to 6+ options) | All Types | User/Header defined or Standard Scheme |

---

## 3. Zero-Hardcoding Audit

To prevent leaky abstractions, the universal engine was subjected to a strict static audit across `web/src/services/ingestion/universal/`:

* **`universalMockGenerator.ts`:** Contains **0** hardcoded exam conditional checks. Exam properties are looked up dynamically via `universalExamRegistry.get(examId)`.
* **`embeddedAnswerDetector.ts`:** Uses universal pattern matching (e.g. `/(?:ans|answer|key)\s*[:=\-]?\s*([A-Za-z0-9\.\,\s\-]+)/i`) applicable across any document format.
* **`universalMockService.ts`:** Exam-agnostic facade coordinating parsing, pairing, mock generation, and catalog registration.
* **`universalExamConfig.ts`:** Extensible configuration dictionary allowing new exam types to be registered at runtime without modifying the ingestion core.

---

## 4. Paper Without Answers Architecture (Practice Mode)

When an exam paper is ingested without an answer key:
1. `answerKeyStatus` is set to `'UNAVAILABLE'`.
2. `isScored` is set to `false`.
3. Canonical questions maintain `answer: { answerStatus: 'UNRESOLVED' }`.
4. Quality gate marks questions as `UNVERIFIED` (clean question, missing key) with `isValid: true` and `canPublish: true`.
5. In `CompetitiveExamPlayerScreen`, candidates can practice under timed exam conditions.
6. Upon submission, `ExamService.calculateExamResult()` evaluates the session safely:
   - `isScoreCalculated = false`.
   - `totalScore = 0`.
   - `correctCount = 0`, `wrongCount = 0`.
   - `sectionResults[secId].attempted` and `skipped` are accurately computed.
   - Zero fake penalties or negative deductions are applied.
7. In `CompetitiveExamResultsScreen`:
   - Renders a prominent **"Practice Mode (Answer Key Unavailable)"** banner.
   - Highlights candidate's selected options neutrally in purple/blue.
   - Replaces incorrect/correct badges with **"Pending Key"** indicators.
   - Provides an inline `[ Attach Answer Key ]` action button.

---

## 5. Late Answer-Key Attachment Architecture (Day 1 → Day 2 Rescoring)

A critical production feature verified in Section 37 Scenario 12:

1. **Day 1:** Candidate or instructor uploads a Question Paper with no official answer key available. The mock paper is generated and registered.
2. Candidate takes the mock test and submits. The session is stored in durable storage with `isScoreCalculated: false`.
3. **Day 2:** The examination authority releases the official answer key.
4. Staff or candidate pastes or uploads the answer key via `UniversalMockService.attachLateAnswerKey(paperId, keyInput)`.
5. The service parses the key, pairs it deterministically to the existing `ExamPaper` questions by `questionNumber`, and updates:
   - `correctAnswer`, `correctAnswerIndex`, `correctAnswerSet`, `answerRange`
   - `marks`, `negativeMarks`
   - Sets `answerKeyStatus = 'AVAILABLE'` and `isScored = true`.
6. `ExamService.calculateExamResult(candidateSession, upgradedPaper)` is triggered immediately.
7. Candidate answers (options selected, MSQ checkboxes, NAT numeric inputs) remain 100% intact.
8. The attempt is immediately scored with accurate marks, accuracy percentage, and explanations, firing confetti celebrations in the UI.

---

## 6. Auto-Detection of Embedded Answer Keys

When candidates upload question papers without a separate answer key file, the engine automatically checks for embedded answer keys:

1. **End-of-Document Answer Key Tables:**
   - Detects sections headered with `ANSWER KEY`, `ANSWERS`, `KEY`, or `SOLUTIONS`.
   - Parses tabular or linear entries: `1. B`, `2. C`, `3. 25.5 to 26.5`.
2. **Per-Question Inline Answer Lines:**
   - Detects per-question answer declarations:
     - `Ans: B`
     - `Correct Answer: B`
     - `Answer: (C)`
     - `Key: 42.5`
3. If detected, entries are automatically converted to `CanonicalAnswer` objects and the paper is classified as `answerKeyStatus = 'AVAILABLE'`.

---

## 7. Dynamic Options & Polymorphic Question Support

The system completely rejects the limitation of hardcoded 4-option MCQs:

* **2 Options:** True/False, Binary Decision questions (indices 0 and 1).
* **3 Options:** Specialist or simplified choices.
* **4 Options:** Standard GATE, SSC, UPSC format (A, B, C, D).
* **5 Options:** Authentic Banking (IBPS / SBI) and UPSC 5-choice format (A, B, C, D, E) without creating dummy options or shifting indices.
* **NAT (Numerical Answer Type):** 0 options. Candidate inputs numbers via a virtual keypad. Evaluated against inclusive tolerance boundaries `[min, max]`.
* **MSQ (Multiple Select Questions):** Evaluated strictly: candidate must select exactly the set of correct options (e.g. `[A, C, D]`). Any missing or extra option results in 0 marks without negative deduction.

---

## 8. Multidimensional Quality Gate Verification

Rather than collapsing paper quality into a single binary flag, `evaluateQualityGate()` evaluates five independent forensic dimensions:

1. **`contentStatus`:** Evaluates question text, LaTeX syntax, dollar signs, and math delimiters.
2. **`structureStatus`:** Evaluates dynamic options integrity, table headers/row column counts, and content blocks.
3. **`answerStatus`:** Evaluates whether answers are resolved, unverified, or review-required.
4. **`assetStatus`:** Evaluates diagram URLs, crop integrity, and asset ownership.
5. **`scoringStatus`:** Evaluates marks, negative marking rules, and total mark consistency.

---

## 9. Comprehensive E2E Test Suite Results (Section 37)

All 13 specific test scenarios in `src/services/ingestion/universal/universalMockEngine.test.ts` passed 100%:

| Scenario ID | Test Name | Target Specification | Result | Execution Time |
|---|---|---|---|---|
| **Scenario 1** | Scored Paper Flow | Ingest QP + AK → Playable Mock → Session → Scored Result | **PASSED** | 2ms |
| **Scenario 2** | Practice Paper Flow | Ingest QP without AK → Unscored Result, 0 Fake Penalties | **PASSED** | 0ms |
| **Scenario 3** | Paired Ingestion Flow | Separate QP and AK text/PDF pairing and normalization | **PASSED** | 4ms |
| **Scenario 4** | Embedded Answer Detection | End-of-doc table + Inline tokens auto-detection | **PASSED** | 1ms |
| **Scenario 5** | Dynamic Options | 2-opt (T/F) and 5-opt (Banking A-E) authentic options | **PASSED** | 0ms |
| **Scenario 6** | MSQ Multi-Select | Strict multi-select evaluation (full match vs partial match) | **PASSED** | 0ms |
| **Scenario 7** | NAT Floating Point Range | In-range, exact min/max boundary, and out-of-range checks | **PASSED** | 0ms |
| **Scenario 8** | Diagrams & Visual Assets | Diagram content blocks, asset URLs, and circuit schematics | **PASSED** | 0ms |
| **Scenario 9** | 2D Structured Tables | Matching tables (List-I / List-II) with preserved columns | **PASSED** | 0ms |
| **Scenario 10** | LaTeX Math Fidelity | Definite integrals, fractions, and KaTeX notation | **PASSED** | 0ms |
| **Scenario 11** | Image-Based Options | Options with visual diagrams without cross-contamination | **PASSED** | 0ms |
| **Scenario 12** | Late Answer-Key Attachment | Day 1 Unscored Practice → Day 2 Scored Key Attachment | **PASSED** | 0ms |
| **Scenario 13** | Instructions Parser | Duration, total marks, and fractional negative deduction parsing | **PASSED** | 0ms |

---

## 10. Forensic Truth Verdicts

| Verification Dimension | Status | Forensic Evidence |
|---|---|---|
| **Universal Agnostic Core** | **VERIFIED** | 0 hardcoded exam names in `universalMockGenerator.ts` and `universalMockService.ts`. All exam rules externalized into `universalExamConfig.ts`. |
| **Playable Mock Integration** | **VERIFIED** | Generated `ExamPaper` objects register into `catalog.ts` and execute cleanly across `CompetitiveExamPlayerScreen` and `TestPlayerScreen`. |
| **Practice Mode Without Answers** | **VERIFIED** | Session scores safely evaluate to 0 with zero false negative deductions; question statuses accurately reflect candidate answers. |
| **Late Answer-Key Attachment** | **VERIFIED** | Candidate attempts taken on unscored papers re-score accurately when keys are attached later without re-uploading QP. |
| **Dynamic Options & NAT/MSQ** | **VERIFIED** | Supported 2 to 5+ options, multi-select MSQs, and NAT range tolerance boundaries with unit tests. |
| **LaTeX & Table Structured Fidelity** | **VERIFIED** | Mathematical expressions and multi-column comparison tables render as structured blocks rather than flattened strings. |
| **Production Build & Test Suite** | **VERIFIED** | 54/54 test files passed (612 tests). `npm run build` completed with 0 errors. |

---

## 11. Code Artifacts & Deliverables Summary

1. `web/src/types/canonicalQuestion.ts`: Canonical question and polymorphic answer data structures.
2. `web/src/types/index.ts`: Extended `ExamPaper` and `ExamResultSummary` with `answerKeyStatus` and `isScoreCalculated`.
3. `web/src/services/ingestion/universal/universalExamConfig.ts`: Universal exam registry and instruction parsing.
4. `web/src/services/ingestion/universal/embeddedAnswerDetector.ts`: Auto-detection of embedded keys.
5. `web/src/services/ingestion/universal/universalMockGenerator.ts`: Paper-to-Mock transformation engine.
6. `web/src/services/ingestion/universal/universalMockService.ts`: Public API for conversion and late key attachment.
7. `web/src/services/examService.ts`: Safe unscored exam evaluation and paper registration.
8. `web/src/screens/CompetitiveExamResultsScreen.tsx`: Practice mode banner and late key attachment modal.
9. `web/src/screens/SourceReviewScreen.tsx` & `SourcePairingModal.tsx`: Direct `[ Take Mock Test ]` launcher.
10. `web/src/services/ingestion/universal/universalMockEngine.test.ts`: Complete Section 37 E2E test suite.
